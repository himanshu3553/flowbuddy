import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import { randomUUID } from 'node:crypto';
import { prisma } from '@sync/db';
import { sessionManifestSchema } from '@sync/shared';
import { config } from './config';
import { authWorkspace } from './auth';
import { ensureBucket, putObjectStream, deleteSessionPrefix, sessionKey } from './storage';
import { synthesisQueue } from './queue';
// Retrieval + history sanitizing come from the SHARED @sync/synthesis seam (P1-M5 no-leak) —
// the Studio preview uses the same functions, so both surfaces answer identically.
import { answerFromKB, retrieveApprovedKBItems, sanitizeHistory } from '@sync/synthesis';
import { resolveCopilotKey, checkRateLimit, recordWidgetSeen } from './copilot-auth';

const app = Fastify({ logger: true });

// CORS so the extension (chrome-extension://...) can upload.
app.addHook('onRequest', async (req, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Sync-Key');
  if (req.method === 'OPTIONS') return reply.code(204).send();
});

await app.register(multipart, {
  limits: { fileSize: 300 * 1024 * 1024, files: 10000, fieldSize: 100 * 1024 * 1024 },
});

app.get('/healthz', async () => ({ ok: true }));

// Total-bundle ceiling across ALL files of one upload (per-file cap is the multipart `fileSize`).
// A real session is tens of MB (JPEG shots + audio); this only stops abuse/runaway bundles.
const MAX_BUNDLE_BYTES = 500 * 1024 * 1024;

/**
 * Token-authenticated bundle upload.
 * Files ride their relative path on the multipart field NAME (multipart strips
 * directories from filenames); we STREAM each part to object storage (never buffering a file in
 * RAM — this instance also serves the public copilot), validate the manifest, persist a
 * RecSession, and enqueue synthesis. Any rejected/failed upload deletes what was already stored
 * so nothing is orphaned in R2.
 */
app.post('/v1/sessions', async (req, reply) => {
  const ws = await authWorkspace(req.headers.authorization);
  if (!ws) return reply.code(401).send({ error: 'invalid or missing token' });

  const sessionId = randomUUID();
  let manifestRaw: unknown = null;
  let totalBytes = 0;

  // Best-effort cleanup for every non-success exit below.
  const discardBundle = () => deleteSessionPrefix(ws.workspaceId, sessionId).catch(() => {});

  try {
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const rel = part.fieldname || part.filename || `file-${randomUUID()}`;
        totalBytes += await putObjectStream(
          sessionKey(ws.workspaceId, sessionId, rel),
          part.file,
          part.mimetype,
        );
        if (part.file.truncated) {
          // The multipart fileSize limit cut this file short — the stored object is incomplete.
          await discardBundle();
          return reply.code(413).send({ error: 'a bundle file exceeds the per-file size limit' });
        }
        if (totalBytes > MAX_BUNDLE_BYTES) {
          await discardBundle();
          return reply.code(413).send({ error: 'bundle exceeds the total size limit' });
        }
      } else if (part.fieldname === 'manifest') {
        try {
          manifestRaw = JSON.parse(String(part.value));
        } catch {
          manifestRaw = null;
        }
      }
    }
  } catch (err) {
    // Storage/stream failure mid-upload — don't leave a partial bundle behind.
    await discardBundle();
    throw err;
  }

  const parsed = sessionManifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    await discardBundle();
    return reply.code(400).send({ error: 'invalid manifest', issues: parsed.error.issues.slice(0, 5) });
  }
  const m = parsed.data;

  await prisma.knowledgeSource.create({
    data: {
      id: sessionId,
      workspaceId: ws.workspaceId,
      createdById: ws.ownerId,
      status: 'uploaded',
      appBaseUrl: m.app.baseUrl,
      manifest: m as object,
    },
  });

  await synthesisQueue.add('synthesize', { sessionId, workspaceId: ws.workspaceId });

  return { sessionId, status: 'uploaded' };
});

app.get('/v1/sessions/:id', async (req, reply) => {
  const ws = await authWorkspace(req.headers.authorization);
  if (!ws) return reply.code(401).send({ error: 'invalid or missing token' });
  const { id } = req.params as { id: string };
  const s = await prisma.knowledgeSource.findFirst({ where: { id, workspaceId: ws.workspaceId } });
  if (!s) return reply.code(404).send({ error: 'not found' });
  return { id: s.id, status: s.status, error: s.error };
});

// Question ceiling: the endpoint is public (key is in host page source) and every extra char is
// tokens the workspace owner pays for. The widget input caps at 400; 2000 leaves headroom for
// other integrations without allowing megabyte bodies.
const MAX_QUESTION_CHARS = 2000;

/**
 * Shared gate for ALL /v1/copilot/* routes (P1-M9): resolve the PUBLIC embeddable key + origin
 * allowlist, then rate-limit. Every copilot route writes to the DB, so none may skip the limiter.
 * Buckets are per-route (`/answer` keeps the bare key — its historical bucket) so a chatty host
 * page pinging /seen can't starve real questions. Sends the error reply itself; null = handled.
 */
async function copilotGate(
  req: FastifyRequest,
  reply: FastifyReply,
  route: 'answer' | 'feedback' | 'seen' | 'config',
): Promise<{ workspaceId: string; showCitations: boolean; key: string; origin: string | undefined } | null> {
  const key = (req.headers['x-sync-key'] as string | undefined) ?? '';
  const origin = req.headers.origin as string | undefined;
  const auth = await resolveCopilotKey(key, origin);
  if (!auth.ok) {
    void reply.code(auth.status).send({ error: auth.error });
    return null;
  }
  if (!checkRateLimit(route === 'answer' ? key : `${route}:${key}`)) {
    void reply.code(429).send({ error: 'rate limit exceeded — slow down' });
    return null;
  }
  return { workspaceId: auth.workspaceId, showCitations: auth.showCitations, key, origin };
}

/**
 * P1-M6 — copilot answer endpoint. Grounded ONLY in APPROVED-KB (P1-M5): retrieve approved items,
 * answer or honestly decline; on a decline, log a CoverageGap ("record this next"). Auth = the
 * workspace token for now; P1-M9 adds a public embeddable key + origin allowlist for in-app embed.
 */
app.post('/v1/copilot/answer', async (req, reply) => {
  const gate = await copilotGate(req, reply, 'answer');
  if (!gate) return reply;
  const { workspaceId, key, origin } = gate;
  // A valid authed call from an allowed origin = the widget is live; confirm embed detection here too
  // (throttled, shared with the /seen ping) so usage alone keeps "copilot live" accurate.
  await recordWidgetSeen(key, workspaceId, origin);

  const body = (req.body ?? {}) as { question?: string; history?: unknown; context?: { path?: string } };
  const question = (body.question ?? '').trim();
  if (!question) return reply.code(400).send({ error: 'question is required' });
  if (question.length > MAX_QUESTION_CHARS) {
    return reply.code(400).send({ error: `question too long (max ${MAX_QUESTION_CHARS} characters)` });
  }
  if (!config.openaiApiKey) return reply.code(500).send({ error: 'OPENAI_API_KEY not configured' });

  // P1-M8: the host page the end-user is on (sent by the widget) biases retrieval + the answer.
  // Bounded — it's untrusted input that lands in the DB and the prompt.
  const contextPath = typeof body.context?.path === 'string' ? body.context.path.slice(0, 512) : null;
  // P1-M3 — hybrid keyword+vector retrieval; the embedding config is best-effort (retrieval
  // degrades to the keyword shortlist on any vector-path failure — never errors here).
  const items = await retrieveApprovedKBItems(prisma, workspaceId, question, {
    contextPath,
    embedding: { apiKey: config.openaiApiKey, model: config.embedModel || undefined },
  });
  if (items.length === 0) {
    // No approved content at all — an un-provisioned copilot, not a coverage gap.
    const q = await prisma.copilotQuery.create({ data: { workspaceId, question, answered: false, contextPath }, select: { id: true } });
    return { covered: false, answer: null, citations: [], reason: 'This copilot has no approved help content yet.', queryId: q.id };
  }

  const result = await answerFromKB({
    question,
    history: sanitizeHistory(body.history),
    items,
    context: { path: contextPath },
    showCitations: gate.showCitations,
    apiKey: config.openaiApiKey,
    model: config.synthModel,
  });

  // P1-M10: log the Q&A (analytics + the thumbs-feedback target). On a grounded answer,
  // persist the cited workflows too (powers Analytics "Top workflows by citations").
  const logged = await prisma.copilotQuery.create({
    data: {
      workspaceId,
      question,
      answered: result.covered,
      contextPath,
      ...(result.covered && result.citations.length > 0
        ? {
            citations: {
              create: result.citations.map((c) => ({
                workspaceId,
                sourceId: c.sourceId,
                segmentIndex: c.segmentIndex,
                segmentTitle: c.segmentTitle,
              })),
            },
          }
        : {}),
    },
    select: { id: true },
  });

  if (!result.covered) {
    // Decline → log a coverage gap (dedupe: one open gap per distinct question).
    const existing = await prisma.coverageGap.findFirst({
      where: { workspaceId, prompt: question, status: 'open' },
      select: { id: true },
    });
    if (!existing) {
      await prisma.coverageGap.create({ data: { workspaceId, prompt: question, reason: result.reason, source: 'copilot' } });
    }
    return { covered: false, answer: null, citations: [], reason: result.reason, queryId: logged.id };
  }

  return { covered: true, answer: result.answer, citations: result.citations, queryId: logged.id };
});

/** P1-M10 — thumbs feedback on a copilot answer (by the queryId returned from /answer). */
app.post('/v1/copilot/feedback', async (req, reply) => {
  const gate = await copilotGate(req, reply, 'feedback');
  if (!gate) return reply;

  const body = (req.body ?? {}) as { queryId?: string; feedback?: string };
  const feedback = body.feedback === 'up' || body.feedback === 'down' ? body.feedback : null;
  if (!body.queryId || !feedback) return reply.code(400).send({ error: 'queryId and feedback (up|down) required' });

  // Scope the update to this workspace's queries only.
  const updated = await prisma.copilotQuery.updateMany({
    where: { id: body.queryId, workspaceId: gate.workspaceId },
    data: { feedback },
  });
  if (updated.count === 0) return reply.code(404).send({ error: 'query not found' });
  return { ok: true };
});

/**
 * Widget appearance config — the widget fetches this at mount so Studio Appearance changes reach
 * every embed WITHOUT customers re-copying the snippet (the DB is the source of truth; explicit
 * `data-sync-*` attrs on the script tag still win as per-page overrides). Auth = the public key +
 * origin allowlist (same as /answer). `no-store` so a Studio save is visible on the next page load.
 * Nulls mean "not customized" — the widget falls back to its built-in defaults, which keeps the
 * default look defined in exactly one place (the widget runtime).
 */
app.get('/v1/copilot/config', async (req, reply) => {
  const gate = await copilotGate(req, reply, 'config');
  if (!gate) return reply;

  const ws = await prisma.workspace.findUnique({
    where: { id: gate.workspaceId },
    select: {
      copilotAccent: true,
      copilotTitle: true,
      copilotGreeting: true,
      copilotPosition: true,
      copilotLauncherStyle: true,
      copilotLauncherText: true,
    },
  });
  if (!ws) return reply.code(404).send({ error: 'workspace not found' });

  reply.header('cache-control', 'no-store');
  return {
    accent: ws.copilotAccent,
    title: ws.copilotTitle,
    greeting: ws.copilotGreeting,
    position: ws.copilotPosition,
    launcher: ws.copilotLauncherStyle,
    launcherText: ws.copilotLauncherText,
  };
});

/**
 * Embed-detection heartbeat — the widget pings this on mount so the Studio can show real "copilot
 * detected / live" status without waiting for a question. Auth = the public key + origin allowlist
 * (same as /answer); DB writes are throttled per key so busy hosts don't hammer the workspace row.
 */
app.post('/v1/copilot/seen', async (req, reply) => {
  const gate = await copilotGate(req, reply, 'seen');
  if (!gate) return reply;

  await recordWidgetSeen(gate.key, gate.workspaceId, gate.origin);
  return { ok: true };
});

await ensureBucket();

app
  .listen({ port: config.port, host: process.env.HOST || '0.0.0.0' })
  .then(() => app.log.info(`Sync api on :${config.port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

// Graceful shutdown (§3.4): deploys send SIGTERM — finish in-flight requests, close the queue's
// Redis connection + DB pool, then let the process drain naturally. No process.exit() in the happy
// path so the worker's own handler (same process on the free tier, all.ts) isn't cut off; the
// unref'd failsafe covers anything that hangs (the host force-kills after its grace period anyway).
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info(`${signal} received — shutting down API`);
    setTimeout(() => process.exit(0), 10_000).unref();
    void Promise.allSettled([app.close(), synthesisQueue.close(), prisma.$disconnect()]);
  });
}
