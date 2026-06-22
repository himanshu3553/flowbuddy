import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { randomUUID } from 'node:crypto';
import { prisma } from '@sync/db';
import { sessionManifestSchema } from '@sync/shared';
import { config } from './config';
import { authWorkspace } from './auth';
import { ensureBucket, putObject, sessionKey } from './storage';
import { synthesisQueue } from './queue';
import { answerFromKB } from '@sync/synthesis';
import { retrieveApprovedKBItems, sanitizeHistory } from './copilot';
import { resolveCopilotKey, checkRateLimit } from './copilot-auth';

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

/**
 * Token-authenticated bundle upload.
 * Files ride their relative path on the multipart field NAME (multipart strips
 * directories from filenames); we stream each to object storage, validate the
 * manifest, persist a RecSession, and enqueue synthesis.
 */
app.post('/v1/sessions', async (req, reply) => {
  const ws = await authWorkspace(req.headers.authorization);
  if (!ws) return reply.code(401).send({ error: 'invalid or missing token' });

  const sessionId = randomUUID();
  let manifestRaw: unknown = null;

  for await (const part of req.parts()) {
    if (part.type === 'file') {
      const rel = part.fieldname || part.filename || `file-${randomUUID()}`;
      const buf = await part.toBuffer();
      await putObject(sessionKey(ws.workspaceId, sessionId, rel), buf, part.mimetype);
    } else if (part.fieldname === 'manifest') {
      try {
        manifestRaw = JSON.parse(String(part.value));
      } catch {
        manifestRaw = null;
      }
    }
  }

  const parsed = sessionManifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
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

/**
 * P1-M6 — copilot answer endpoint. Grounded ONLY in APPROVED-KB (P1-M5): retrieve approved items,
 * answer or honestly decline; on a decline, log a CoverageGap ("record this next"). Auth = the
 * workspace token for now; P1-M9 adds a public embeddable key + origin allowlist for in-app embed.
 */
app.post('/v1/copilot/answer', async (req, reply) => {
  // P1-M9: authenticate with the PUBLIC embeddable key (x-sync-key) + origin allowlist + rate limit.
  const key = req.headers['x-sync-key'] as string | undefined;
  const auth = await resolveCopilotKey(key, req.headers.origin as string | undefined);
  if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });
  if (!checkRateLimit(key ?? '')) return reply.code(429).send({ error: 'rate limit exceeded — slow down' });
  const workspaceId = auth.workspaceId;

  const body = (req.body ?? {}) as { question?: string; history?: unknown; context?: { path?: string } };
  const question = (body.question ?? '').trim();
  if (!question) return reply.code(400).send({ error: 'question is required' });
  if (!config.openaiApiKey) return reply.code(500).send({ error: 'OPENAI_API_KEY not configured' });

  // P1-M8: the host page the end-user is on (sent by the widget) biases retrieval + the answer.
  const contextPath = typeof body.context?.path === 'string' ? body.context.path : null;
  const items = await retrieveApprovedKBItems(workspaceId, question, { contextPath });
  if (items.length === 0) {
    // No approved content at all — an un-provisioned copilot, not a coverage gap.
    return { covered: false, answer: null, citations: [], reason: 'This copilot has no approved help content yet.' };
  }

  const result = await answerFromKB({
    question,
    history: sanitizeHistory(body.history),
    items,
    context: { path: contextPath },
    apiKey: config.openaiApiKey,
    model: config.synthModel,
  });

  if (!result.covered) {
    // Decline → log a coverage gap (dedupe: one open gap per distinct question).
    const existing = await prisma.coverageGap.findFirst({
      where: { workspaceId, prompt: question, status: 'open' },
      select: { id: true },
    });
    if (!existing) {
      await prisma.coverageGap.create({ data: { workspaceId, prompt: question, reason: result.reason } });
    }
    return { covered: false, answer: null, citations: [], reason: result.reason };
  }

  return { covered: true, answer: result.answer, citations: result.citations };
});

await ensureBucket();

app
  .listen({ port: config.port, host: '127.0.0.1' })
  .then(() => app.log.info(`Sync api on http://localhost:${config.port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
