import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import { randomUUID } from 'node:crypto';
import { prisma } from '@sync/db';
import { sessionManifestSchema, type CapturedEvent, type SessionManifest } from '@sync/shared';
import { createLogger } from '@sync/logger';
import { config } from './config';
import { authWorkspace } from './auth';
import {
  ensureBucket,
  putObjectStream,
  deleteSessionPrefix,
  sessionKey,
  sessionArtifactReader,
} from './storage';
import { synthesisQueue } from './queue';
// Retrieval + history sanitizing come from the SHARED @sync/synthesis seam (P1-M5 no-leak) —
// the Studio preview uses the same functions, so both surfaces answer identically.
import {
  answerFromKB,
  diagnoseFromKB,
  retrieveApprovedKBItems,
  sanitizeHistory,
  redactText,
  type SenseContext,
  type SenseHypothesisContext,
  type AnswerPosition,
  type CopilotAnswer,
  type ReasonSnapshot,
  type ReasonSnapshotElement,
  type ReasonWorkflow,
  type ExpectedStepEvidence,
} from '@sync/synthesis';
import { resolveCopilotKey, checkRateLimit, recordWidgetSeen, type ReasonFlags } from './copilot-auth';
import { getSenseShard } from './sense-plan';

// Use the shared structured logger so HTTP request logs share the app's level, JSON/pretty shape,
// and secret redaction. `app.log` / `req.log` are children of it (Fastify adds the reqId + req/res
// serializers), so the request lifecycle logs Fastify emits stay consistent with everything else.
const app = Fastify({ loggerInstance: createLogger('api') });

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
  route: 'answer' | 'feedback' | 'seen' | 'config' | 'sense' | 'walkthrough',
): Promise<{
  workspaceId: string;
  showCitations: boolean;
  reason: ReasonFlags;
  key: string;
  origin: string | undefined;
} | null> {
  const key = (req.headers['x-sync-key'] as string | undefined) ?? '';
  const origin = req.headers.origin as string | undefined;
  const auth = await resolveCopilotKey(key, origin);
  if (!auth.ok) {
    // Expected traffic (misconfigured embed, scraper, or wrong key) — debug, not an error.
    req.log.debug({ route, origin, status: auth.status, reason: auth.error }, 'copilot request rejected');
    void reply.code(auth.status).send({ error: auth.error });
    return null;
  }
  if (!checkRateLimit(route === 'answer' ? key : `${route}:${key}`)) {
    req.log.warn({ route, workspaceId: auth.workspaceId, origin }, 'copilot rate limit exceeded');
    void reply.code(429).send({ error: 'rate limit exceeded — slow down' });
    return null;
  }
  return { workspaceId: auth.workspaceId, showCitations: auth.showCitations, reason: auth.reason, key, origin };
}

// ── P2 Sense — validate the widget's localization payload ─────────────────────────────────────
// The wire hypotheses are UNTRUSTED (any page holding the public key can send them). Every field
// is type-checked, clamped, and sliced; the workflow keys are then re-verified against
// CopilotApproval (no-leak: an unapproved key is dropped) and the TITLE comes from the approval
// snapshot — never the wire — so the only host-page text that ever reaches the prompt is the
// masked error snippet, which is delimited + de-angled here.
const MAX_SENSE_HYPOTHESES = 3;
const MAX_SENSE_ERROR_CHARS = 200;

interface WireSenseHypothesis {
  sourceId?: unknown;
  segmentIndex?: unknown;
  step?: unknown;
  totalSteps?: unknown;
  confidence?: unknown;
  stepsDone?: unknown;
  error?: unknown;
}

async function resolveSenseContext(
  workspaceId: string,
  raw: unknown,
): Promise<{ sense: SenseContext | null; probed: boolean }> {
  if (!raw || typeof raw !== 'object') return { sense: null, probed: false };
  const w = raw as { probed?: unknown; tie?: unknown; hypotheses?: unknown };
  const probed = w.probed === true;
  const list = Array.isArray(w.hypotheses) ? w.hypotheses.slice(0, MAX_SENSE_HYPOTHESES) : [];

  const parsed: Array<Omit<SenseHypothesisContext, 'title'>> = [];
  for (const entry of list) {
    const h = (entry ?? {}) as WireSenseHypothesis;
    const sourceId = typeof h.sourceId === 'string' ? h.sourceId.slice(0, 40) : '';
    const segmentIndex = Number(h.segmentIndex);
    const totalSteps = Number(h.totalSteps);
    const step = Number(h.step);
    if (!/^[a-z0-9-]{1,40}$/i.test(sourceId)) continue; // KnowledgeSource ids are UUIDs (hyphens!)
    if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex > 999) continue;
    if (!Number.isInteger(totalSteps) || totalSteps < 1 || totalSteps > 200) continue;
    if (!Number.isInteger(step) || step < 1 || step > totalSteps) continue;
    const confidence = Math.min(1, Math.max(0, Number(h.confidence) || 0));
    const stepsDone = (Array.isArray(h.stepsDone) ? h.stepsDone.slice(0, 50) : [])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= totalSteps);
    const error =
      typeof h.error === 'string' && h.error.trim()
        ? h.error.replace(/[<>\u0000-\u001f]/g, ' ').trim().slice(0, MAX_SENSE_ERROR_CHARS)
        : undefined;
    parsed.push({ sourceId, segmentIndex, step, totalSteps, confidence, stepsDone, ...(error ? { error } : {}) });
  }
  if (parsed.length === 0) return { sense: null, probed };

  const approvals = await prisma.copilotApproval.findMany({
    where: { workspaceId, OR: parsed.map((h) => ({ sourceId: h.sourceId, segmentIndex: h.segmentIndex })) },
    select: { sourceId: true, segmentIndex: true, segmentTitle: true },
  });
  const titleByKey = new Map(approvals.map((a) => [`${a.sourceId}:${a.segmentIndex}`, a.segmentTitle]));
  const approved = parsed.filter((h) => titleByKey.has(`${h.sourceId}:${h.segmentIndex}`));
  if (approved.length === 0) return { sense: null, probed };

  // Anchor each hypothesis on what its current step actually SAYS (server truth from the KB —
  // orderIndex is 0-based within the workflow). Without this the model reads "at step 2" as
  // "done with step 2" and skips past uncompleted steps.
  const stepItems = await prisma.knowledgeItem.findMany({
    where: {
      workspaceId,
      kind: 'step',
      OR: approved.map((h) => ({
        sourceId: h.sourceId,
        segmentIndex: h.segmentIndex,
        orderIndex: h.step - 1,
      })),
    },
    select: { sourceId: true, segmentIndex: true, orderIndex: true, data: true },
  });
  const instructionByKey = new Map(
    stepItems.map((i) => [
      `${i.sourceId}:${i.segmentIndex}:${i.orderIndex}`,
      ((i.data ?? {}) as { instruction?: string }).instruction?.slice(0, 200),
    ]),
  );

  const hypotheses: SenseHypothesisContext[] = approved.map((h) => {
    const instruction = instructionByKey.get(`${h.sourceId}:${h.segmentIndex}:${h.step - 1}`);
    return {
      ...h,
      title: titleByKey.get(`${h.sourceId}:${h.segmentIndex}`) || 'this workflow',
      ...(instruction ? { instruction } : {}),
    };
  });
  return { sense: { hypotheses, tie: w.tie === true && hypotheses.length >= 2 }, probed };
}

/** P2-M4 — the localization-outcome fields logged onto CopilotQuery (step-friction analytics). */
function senseLogFields(
  sense: SenseContext | null,
  probed: boolean,
  position: AnswerPosition | null,
): Record<string, unknown> {
  if (!probed && !sense) return {}; // no probe ran (pre-Sense widget / Sense off) — null columns
  if (!sense) return { senseUsed: 'none' }; // probed, nothing matched — a passive drift signal
  const matched = position
    ? sense.hypotheses.find((h) => h.sourceId === position.sourceId && h.segmentIndex === position.segmentIndex)
    : undefined;
  const top = matched ?? sense.hypotheses[0]!;
  return {
    senseSourceId: (position ?? top).sourceId,
    senseSegmentIndex: position ? position.segmentIndex : top.segmentIndex,
    senseStep: position ? position.step : top.step,
    senseConfidence: top.confidence,
    senseUsed: position ? 'used' : 'ignored',
  };
}

// ── P2-M5 Reason — validate the widget's diagnostic evidence package ───────────────────────────
// Like the sense hypotheses, the whole payload is UNTRUSTED (any page holding the public key can
// send it): every field is type-checked, de-angled, capped, and PII-backstopped (redactText); the
// image is accepted only when the founder's image tier is ON, values only when unmasking is ON —
// a spoofed widget can never force a capture posture the founder didn't enable.
const MAX_REASON_ELEMENTS = 60;
const MAX_REASON_TEXTS = 40;
const MAX_REASON_IMAGE_CHARS = 1_200_000; // ~900 KB binary; the route's bodyLimit backstops this
const REASON_MAX_PER_WINDOW = 6; // per-minute ceiling for the expensive path (per key)

/** Untrusted page-derived string → prompt-safe: strip angle brackets/control chars, cap, redact. */
function cleanPageString(v: unknown, cap: number): string {
  if (typeof v !== 'string') return '';
  return redactText(v.replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, cap));
}

interface ResolvedReason {
  /** The validated evidence package, or null when none/invalid/disabled. */
  payload: { trigger: 'intent' | 'blocked' | 'escalation'; snapshot: ReasonSnapshot; image: string | null } | null;
  /** The widget declared it can capture on request (drives the fast-path-failure escalation). */
  available: boolean;
}

function resolveReasonContext(raw: unknown, flags: ReasonFlags): ResolvedReason {
  if (!flags.enabled || !raw || typeof raw !== 'object') return { payload: null, available: false };
  const w = raw as { available?: unknown; trigger?: unknown; snapshot?: unknown; image?: unknown };
  const available = w.available === true;
  const trigger =
    w.trigger === 'intent' || w.trigger === 'blocked' || w.trigger === 'escalation' ? w.trigger : null;
  const snap = w.snapshot as
    | { path?: unknown; title?: unknown; viewport?: unknown; elements?: unknown; texts?: unknown }
    | null
    | undefined;
  if (!trigger || !snap || typeof snap !== 'object') return { payload: null, available };

  const elements: ReasonSnapshotElement[] = [];
  for (const entry of Array.isArray(snap.elements) ? snap.elements.slice(0, MAX_REASON_ELEMENTS) : []) {
    if (!entry || typeof entry !== 'object') continue;
    const el = entry as Record<string, unknown>;
    const tag = cleanPageString(el.tag, 20).toLowerCase();
    if (!/^[a-z][a-z0-9-]*$/.test(tag)) continue;
    const e: ReasonSnapshotElement = { tag };
    const role = cleanPageString(el.role, 32);
    if (role) e.role = role;
    const name = cleanPageString(el.name, 80);
    if (name) e.name = name;
    for (const flag of ['disabled', 'checked', 'expanded', 'required', 'filled', 'valid', 'current'] as const) {
      if (typeof el[flag] === 'boolean') e[flag] = el[flag] as boolean;
    }
    const invalidReason = cleanPageString(el.invalidReason, 30);
    if (e.valid === false && invalidReason) e.invalidReason = invalidReason;
    // Field values pass ONLY when the founder unmasked them — the server re-checks the policy.
    const value = cleanPageString(el.value, 120);
    if (flags.values && value) e.value = value;
    elements.push(e);
  }

  const texts = (Array.isArray(snap.texts) ? snap.texts.slice(0, MAX_REASON_TEXTS) : [])
    .map((t) => cleanPageString(t, 160))
    .filter((t) => t.length >= 2);

  const vp = (snap.viewport ?? {}) as { w?: unknown; h?: unknown };
  const dim = (v: unknown) => Math.min(20_000, Math.max(0, Math.round(Number(v) || 0)));

  const image =
    flags.image &&
    typeof w.image === 'string' &&
    w.image.length <= MAX_REASON_IMAGE_CHARS &&
    /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(w.image)
      ? w.image
      : null;

  return {
    payload: {
      trigger,
      snapshot: {
        path: cleanPageString(snap.path, 512),
        title: cleanPageString(snap.title, 120),
        viewport: { w: dim(vp.w), h: dim(vp.h) },
        elements,
        texts,
      },
      image,
    },
    available,
  };
}

/**
 * The founder's side of expected-vs-actual (§3 #3/#6): the FULL localized workflow recipe (every
 * step, not just the retrieval shortlist) + lazy accessors for the current step's expected-state
 * artifacts — the TRUE screenshot and the captured DOM snapshot from the approved recording, read
 * from object storage only if the reasoning loop asks for them. The workflow key comes from the
 * approval-checked TOP sense hypothesis, so no-leak holds: unapproved workflows never feed Reason.
 */
async function buildReasonEvidence(
  workspaceId: string,
  sense: SenseContext | null,
): Promise<{ workflow: ReasonWorkflow | null; expected: ExpectedStepEvidence | null }> {
  const top = sense?.hypotheses[0];
  if (!top) return { workflow: null, expected: null };

  const items = await prisma.knowledgeItem.findMany({
    where: { workspaceId, kind: 'step', sourceId: top.sourceId, segmentIndex: top.segmentIndex },
    orderBy: { orderIndex: 'asc' },
    select: { orderIndex: true, data: true },
  });
  if (items.length === 0) return { workflow: null, expected: null };

  const workflow: ReasonWorkflow = {
    title: top.title,
    steps: items.map((i) => ({
      index: i.orderIndex + 1,
      instruction: (((i.data ?? {}) as { instruction?: string }).instruction ?? '').slice(0, 200),
    })),
    currentStep: top.step,
  };

  const cur = items.find((i) => i.orderIndex === top.step - 1);
  const d = (cur?.data ?? {}) as { screenshotFile?: string | null; keyEventId?: string };
  if (!d.screenshotFile && !d.keyEventId) return { workflow, expected: null };

  // The DOM half lives on the manifest event (keyEventId, falling back to screenshot matching —
  // the same recovery rule the sense plan uses for pre-2026-07-08 rows).
  const source = await prisma.knowledgeSource.findUnique({
    where: { id: top.sourceId },
    select: { manifest: true },
  });
  const events = ((source?.manifest as unknown as SessionManifest | null)?.events ?? []) as CapturedEvent[];
  const ev =
    events.find((e) => e.id === d.keyEventId) ??
    events.find(
      (e) => e.screenshot?.file === d.screenshotFile || e.postAction?.screenshot?.file === d.screenshotFile,
    );
  const domFile = ev?.domSnapshot?.file ?? ev?.postAction?.domSnapshot?.file ?? null;

  const read = sessionArtifactReader(workspaceId, top.sourceId);
  const expected: ExpectedStepEvidence = {
    screenshot: async () => {
      if (!d.screenshotFile) return null;
      const buf = await read(d.screenshotFile);
      if (!buf) return null;
      const mime = d.screenshotFile.endsWith('.png') ? 'image/png' : 'image/jpeg';
      return `data:${mime};base64,${buf.toString('base64')}`;
    },
    dom: async () => {
      if (!domFile) return null;
      const buf = await read(domFile);
      return buf ? buf.toString('utf8') : null;
    },
  };
  return { workflow, expected };
}

/**
 * P1-M6 — copilot answer endpoint. Grounded ONLY in APPROVED-KB (P1-M5): retrieve approved items,
 * answer or honestly decline; on a decline, log a CoverageGap ("record this next"). Auth = the
 * workspace token for now; P1-M9 adds a public embeddable key + origin allowlist for in-app embed.
 * P2-M5 Reason: when the widget ships a diagnostic evidence package (structured page state ±
 * rendered image) and the founder's toggle is on, the question routes to the REASONING path —
 * a stronger model + expected-vs-actual over the founder's recording — instead of the fast path.
 * The raised bodyLimit exists for the (validated, size-capped) page image.
 */
app.post('/v1/copilot/answer', { bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
  const gate = await copilotGate(req, reply, 'answer');
  if (!gate) return reply;
  const { workspaceId, key, origin } = gate;
  const body = (req.body ?? {}) as {
    question?: string;
    history?: unknown;
    context?: { path?: string; sense?: unknown; reason?: unknown };
    preview?: unknown;
  };
  // The Studio's real-widget tester flags its calls `preview`: same key, same engine, but a founder
  // trying their own copilot is NOT a customer install — skip embed detection and every analytics
  // write (query log / citations / coverage gaps), and return no queryId (so no thumbs feedback).
  // Self-declared and harmless to spoof: the only thing the flag can do is suppress your own stats.
  const preview = body.preview === true;
  // A valid authed call from an allowed origin = the widget is live; confirm embed detection here too
  // (throttled, shared with the /seen ping) so usage alone keeps "copilot live" accurate.
  if (!preview) await recordWidgetSeen(key, workspaceId, origin);

  const question = (body.question ?? '').trim();
  if (!question) return reply.code(400).send({ error: 'question is required' });
  if (question.length > MAX_QUESTION_CHARS) {
    return reply.code(400).send({ error: `question too long (max ${MAX_QUESTION_CHARS} characters)` });
  }
  if (!config.openaiApiKey) return reply.code(500).send({ error: 'OPENAI_API_KEY not configured' });

  // P1-M8: the host page the end-user is on (sent by the widget) biases retrieval + the answer.
  // Bounded — it's untrusted input that lands in the DB and the prompt.
  const contextPath = typeof body.context?.path === 'string' ? body.context.path.slice(0, 512) : null;
  // P2 Sense — validate the probe's hypotheses (approval-checked, titles from server truth).
  const { sense, probed } = await resolveSenseContext(workspaceId, body.context?.sense);
  const senseKeys = sense?.hypotheses.map((h) => `${h.sourceId}:${h.segmentIndex}`);
  // P1-M3 — hybrid keyword+vector retrieval; the embedding config is best-effort (retrieval
  // degrades to the keyword shortlist on any vector-path failure — never errors here).
  const items = await retrieveApprovedKBItems(prisma, workspaceId, question, {
    contextPath,
    senseKeys,
    embedding: { apiKey: config.openaiApiKey, model: config.embedModel || undefined },
  });
  if (items.length === 0) {
    // No approved content at all — an un-provisioned copilot, not a coverage gap.
    const reason = 'This copilot has no approved help content yet.';
    if (preview) return { covered: false, answer: null, citations: [], reason };
    const q = await prisma.copilotQuery.create({
      data: { workspaceId, question, answered: false, contextPath, ...senseLogFields(sense, probed, null) },
      select: { id: true },
    });
    return { covered: false, answer: null, citations: [], reason, queryId: q.id };
  }

  // P2-M5 Reason — validate the diagnostic evidence package (dropped entirely when the founder's
  // toggle is off). The reasoning path gets its OWN tighter ceiling on top of the normal answer
  // bucket; over it, the question silently degrades to the fast path (never an error).
  let { payload: reasonPayload, available: reasonAvailable } = resolveReasonContext(
    body.context?.reason,
    gate.reason,
  );
  if (reasonPayload && !checkRateLimit(`reason:${key}`, Date.now(), REASON_MAX_PER_WINDOW)) {
    req.log.warn({ workspaceId }, 'reason rate limit exceeded — degrading to the fast path');
    reasonPayload = null;
  }

  let result: CopilotAnswer;
  if (reasonPayload) {
    // The reasoning path (docs/phase-2-reason.md §4): full workflow recipe + expected-state
    // artifacts for the localized current step, then the stronger model's agentic read-tool loop.
    const { workflow, expected } = await buildReasonEvidence(workspaceId, sense);
    req.log.info(
      {
        workspaceId,
        trigger: reasonPayload.trigger,
        elements: reasonPayload.snapshot.elements.length,
        image: Boolean(reasonPayload.image),
        localized: Boolean(workflow),
      },
      'reason path engaged',
    );
    result = await diagnoseFromKB({
      question,
      history: sanitizeHistory(body.history),
      items,
      sense: sense ?? undefined,
      snapshot: reasonPayload.snapshot,
      pageImage: reasonPayload.image,
      workflow,
      expected,
      showCitations: gate.showCitations,
      apiKey: config.openaiApiKey,
      model: config.reasonModel,
    });
  } else {
    result = await answerFromKB({
      question,
      history: sanitizeHistory(body.history),
      items,
      context: { path: contextPath, sense: sense ?? undefined },
      showCitations: gate.showCitations,
      apiKey: config.openaiApiKey,
      model: config.synthModel,
    });
  }
  // P2-M3 "show me" — where the answer positioned the user (null when position wasn't used).
  const position = result.covered ? result.position : null;

  // P2-M5 — the fast-path-failure trigger (§5.2): the fast path declined, the founder's toggle is
  // on, and the widget declared it can capture. Ask it to retry ONCE with evidence instead of
  // logging the decline (the retry logs the real outcome; a widget that never retries costs one
  // missing decline row, not a phantom coverage gap).
  if (!result.covered && !reasonPayload && reasonAvailable && !preview) {
    return { covered: false, answer: null, citations: [], reason: result.reason, escalate: true };
  }

  // Preview answers are never persisted — return the engine's result as-is (no queryId).
  if (preview) {
    return result.covered
      ? { covered: true, answer: result.answer, citations: result.citations, position }
      : { covered: false, answer: null, citations: [], reason: result.reason };
  }

  // P1-M10: log the Q&A (analytics + the thumbs-feedback target). On a grounded answer,
  // persist the cited workflows too (powers Analytics "Top workflows by citations").
  // P2-M4: also log the Sense localization outcome (used | ignored | none) — step-friction analytics.
  // P2-M5: and the Reason outcome (why the diagnostic path fired + whether the image rode along).
  const logged = await prisma.copilotQuery.create({
    data: {
      workspaceId,
      question,
      answered: result.covered,
      contextPath,
      ...senseLogFields(sense, probed, position),
      ...(reasonPayload
        ? { reasonTrigger: reasonPayload.trigger, reasonImage: Boolean(reasonPayload.image) }
        : {}),
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

  return { covered: true, answer: result.answer, citations: result.citations, position, queryId: logged.id };
});

/**
 * P2-M0 — the ROUTE-SHARDED sense plan (docs/phase-2-sense.md §2). The widget fetches this on
 * panel open for the page the end-user is on; each matched workflow is served WHOLE (all steps,
 * incl. other-route steps) so mid-workflow progression never refetches. Gated by the per-workspace
 * Sense toggle (off → `enabled:false` and the widget never probes). Auth = the public key +
 * origin allowlist + its own rate bucket, like every copilot route. Founder-derived data only.
 */
app.get('/v1/copilot/sense-plan', async (req, reply) => {
  const gate = await copilotGate(req, reply, 'sense');
  if (!gate) return reply;

  const ws = await prisma.workspace.findUnique({
    where: { id: gate.workspaceId },
    select: { senseEnabled: true },
  });
  reply.header('cache-control', 'no-store'); // the widget caches per route in-memory; the server caches the compile
  if (!ws?.senseEnabled) return { enabled: false, version: '', workflows: [] };

  const q = req.query as { route?: unknown };
  const route = typeof q.route === 'string' ? q.route.slice(0, 512) : '';
  const shard = await getSenseShard(gate.workspaceId, route);
  return { enabled: true, version: shard.version, workflows: shard.workflows };
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
 * P4-M0 — walkthrough run analytics. One row per guided-walkthrough RUN: `started` creates it
 * (the workflow key is verified against CopilotApproval FIRST — no-leak: unapproved keys are never
 * logged, and the stored title comes from the approval snapshot, never the wire), progress events
 * bump counters, terminal events set the outcome. Every field of the body is UNTRUSTED (any page
 * holding the public key can post here) — type-checked and clamped like the sense hypotheses.
 * Best-effort on the widget side: a 4xx here never affects the walkthrough itself.
 */
app.post('/v1/copilot/walkthrough', async (req, reply) => {
  const gate = await copilotGate(req, reply, 'walkthrough');
  if (!gate) return reply;

  const b = (req.body ?? {}) as {
    runId?: unknown; event?: unknown; sourceId?: unknown; segmentIndex?: unknown;
    step?: unknown; totalSteps?: unknown; mode?: unknown; queryId?: unknown;
  };
  const event = typeof b.event === 'string' ? b.event : '';
  if (!['started', 'step_advanced', 'completed', 'aborted', 'stalled'].includes(event)) {
    return reply.code(400).send({ error: 'unknown event' });
  }
  const sourceId = typeof b.sourceId === 'string' ? b.sourceId.slice(0, 40) : '';
  const segmentIndex = Number(b.segmentIndex);
  const totalSteps = Number(b.totalSteps);
  const step = Number(b.step);
  if (
    !/^[a-z0-9-]{1,40}$/i.test(sourceId) || // KnowledgeSource ids are UUIDs (hyphens!)
    !Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex > 999 ||
    !Number.isInteger(totalSteps) || totalSteps < 1 || totalSteps > 200 ||
    !Number.isInteger(step) || step < 1 || step > totalSteps
  ) {
    return reply.code(400).send({ error: 'invalid walkthrough payload' });
  }

  if (event === 'started') {
    // The trust gate, applied to run logging: only approved workflows are ever recorded.
    const approval = await prisma.copilotApproval.findFirst({
      where: { workspaceId: gate.workspaceId, sourceId, segmentIndex },
      select: { segmentTitle: true },
    });
    if (!approval) {
      req.log.debug({ workspaceId: gate.workspaceId }, 'walkthrough started for unapproved workflow — dropped');
      return reply.code(404).send({ error: 'workflow not available' });
    }
    // queryId is stored only if it names THIS workspace's query (a spoofed id must never create a
    // cross-tenant join for the Studio's analytics to trip over).
    let queryId: string | null = null;
    if (typeof b.queryId === 'string' && /^[a-z0-9]{1,40}$/i.test(b.queryId)) {
      const q = await prisma.copilotQuery.findFirst({
        where: { id: b.queryId, workspaceId: gate.workspaceId },
        select: { id: true },
      });
      queryId = q?.id ?? null;
    }
    const run = await prisma.copilotWalkthrough.create({
      data: {
        workspaceId: gate.workspaceId,
        sourceId,
        segmentIndex,
        segmentTitle: approval.segmentTitle, // approval snapshot — never the wire
        queryId,
        startStep: step,
        totalSteps,
        lastStep: step,
      },
      select: { id: true },
    });
    return { ok: true, runId: run.id };
  }

  const runId = typeof b.runId === 'string' ? b.runId : '';
  if (!runId) return reply.code(400).send({ error: 'runId required' });
  const mode = b.mode === 'auto' || b.mode === 'manual' ? b.mode : null;
  const data =
    event === 'step_advanced'
      ? {
          lastStep: step,
          outcome: 'active', // a stall the user advanced past is a recovery, not a terminal state
          ...(mode === 'manual' ? { manualAdvances: { increment: 1 } } : { autoAdvances: { increment: 1 } }),
        }
      : event === 'stalled'
        ? { outcome: 'stalled', stalledAtStep: step, lastStep: step }
        : { outcome: event, lastStep: step }; // completed | aborted

  // Scope the update to this workspace's runs only (same discipline as /feedback).
  const updated = await prisma.copilotWalkthrough.updateMany({
    where: { id: runId, workspaceId: gate.workspaceId },
    data,
  });
  if (updated.count === 0) return reply.code(404).send({ error: 'run not found' });
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
      senseEnabled: true,
      copilotShowMe: true,
      copilotWalkthrough: true,
      reasonEnabled: true,
      reasonImageEnabled: true,
      reasonIncludeValues: true,
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
    // P2 Sense — `sense` gates the widget's plan fetch/probe; `showMe` gates the P2-M3 highlight.
    sense: ws.senseEnabled,
    showMe: ws.copilotShowMe,
    // P4-M0 — gates the "Walk me through it" offer (the widget also requires sense to be on).
    walkthrough: ws.copilotWalkthrough,
    // P2-M5 Reason — `reason` gates the diagnostic capture; the image tier and value unmasking
    // are separate founder opt-ins (the server re-enforces all three on /answer regardless).
    reason: ws.reasonEnabled,
    reasonImage: ws.reasonImageEnabled,
    reasonValues: ws.reasonIncludeValues,
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
  .then(() =>
    app.log.info(
      { port: config.port, env: process.env.NODE_ENV || 'development' },
      'Sync api listening',
    ),
  )
  .catch((err) => {
    app.log.error({ err }, 'api failed to start');
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
