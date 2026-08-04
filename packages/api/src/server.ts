import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import { prisma } from '@flowbuddy/db';
import {
  parseCopilotMode,
  sessionManifestSchema,
  type CapturedEvent,
  type CopilotMode,
  type SessionManifest,
} from '@flowbuddy/shared';
import { createLogger } from '@flowbuddy/logger';
import { config } from './config';
import { authWorkspace, type AuthedWorkspace } from './auth';
import {
  ensureBucket,
  putObjectStream,
  deleteSessionPrefix,
  sessionKey,
  sessionArtifactReader,
  signPutUrl,
  UPLOAD_URL_TTL_SECONDS,
} from './storage';
import { synthesisQueue } from './queue';
// Retrieval + history sanitizing come from the SHARED @flowbuddy/synthesis seam (P1-M5 no-leak) —
// the Studio preview uses the same functions, so both surfaces answer identically.
import {
  answerAsAgent,
  answerAsFloor,
  diagnoseFromKB,
  blockerList,
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
  type AgentWorkflow,
  type CopilotCitation,
  type AnswerLoopResult,
  type TokenUsage,
} from '@flowbuddy/synthesis';
import { resolveCopilotKey, checkRateLimit, recordWidgetSeen, type ReasonFlags } from './copilot-auth';
import { getSenseShard } from './sense-plan';

// Use the shared structured logger so HTTP request logs share the app's level, JSON/pretty shape,
// and secret redaction. `app.log` / `req.log` are children of it (Fastify adds the reqId + req/res
// serializers), so the request lifecycle logs Fastify emits stay consistent with everything else.
const app = Fastify({ loggerInstance: createLogger('api') });

// CORS so the extension (chrome-extension://...) can upload.
app.addHook('onRequest', async (req, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-FlowBuddy-Key, X-FlowBuddy-Upload-Id');
  if (req.method === 'OPTIONS') return reply.code(204).send();
});

await app.register(multipart, {
  limits: { fileSize: 300 * 1024 * 1024, files: 10000, fieldSize: 100 * 1024 * 1024 },
});

app.get('/healthz', async () => ({ ok: true }));

// Total-bundle ceiling across ALL files of one upload (per-file cap is the multipart `fileSize`).
// A real session is tens of MB (JPEG shots + audio); this only stops abuse/runaway bundles.
const MAX_BUNDLE_BYTES = 500 * 1024 * 1024;

// ── Recorder upload path (idempotent) ─────────────────────────────────────────────────────────
// ONE recording = ONE `uploadId`, minted by the recorder when Record is pressed and stable across
// every retry. Both routes below resolve that id to the SAME row, so re-sending a recording can
// never create a second one. That is not a nicety: a slow upload used to time out client-side while
// the server went on to commit it, and the Retry the user was then told to click arrived with a
// fresh server-minted id — which is how one recording became two.

// Case-INSENSITIVE match, but every accepted id is lower-cased before use: the unique index that
// makes ingestion idempotent compares bytes, so 'AB…' and 'ab…' would otherwise be two recordings.
const UPLOAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalizeUploadId = (raw: string): string => raw.trim().toLowerCase();

/** Artifact paths the recorder may write. A signed URL is a write capability, so the key it
 *  authorizes is VALIDATED against this, never merely sanitized. */
const ARTIFACT_REL_RE = /^(shots\/[A-Za-z0-9._-]{1,120}\.(?:jpe?g|png)|dom\/[A-Za-z0-9._-]{1,120}\.html|audio\.webm)$/;

const MAX_SIGN_BATCH = 100;

/**
 * Statuses a recording can still be uploaded into. Past these it is being (or has been) built.
 * `error` is in the set DELIBERATELY: a failed synthesis has to stay retryable, and answering a
 * retry with "already finalized" is worse than useless — the recorder reads a 2xx as success and
 * clears its local buffer, destroying the only copy of a recording the server never built.
 */
const OPEN_STATUSES = new Set(['recording', 'uploaded', 'error']);

function artifactContentType(rel: string): string {
  if (/\.jpe?g$/i.test(rel)) return 'image/jpeg';
  if (/\.png$/i.test(rel)) return 'image/png';
  if (/\.html$/i.test(rel)) return 'text/html';
  return 'audio/webm';
}

/**
 * Resolve the recording row a recorder's `uploadId` refers to, creating it on first contact.
 * The row therefore exists from the FIRST signed artifact — which is what lets Studio show a
 * recording while it is still uploading, instead of only after the whole thing succeeds.
 */
async function resolveRecording(ws: AuthedWorkspace, uploadId: string) {
  const where = { workspaceId_uploadId: { workspaceId: ws.workspaceId, uploadId } };
  try {
    return await prisma.knowledgeSource.upsert({
      where,
      create: { workspaceId: ws.workspaceId, createdById: ws.ownerId, uploadId, status: 'recording' },
      update: {}, // still bumps updatedAt — a live recording keeps looking alive to the stalled sweep
    });
  } catch (err) {
    // Prisma compiles a compound-unique upsert to SELECT-then-INSERT, not INSERT ... ON CONFLICT,
    // so two first-contact requests for one uploadId can race and the loser gets P2002. The unique
    // index is what makes that safe: the row the winner created is the row we wanted.
    if ((err as { code?: string })?.code !== 'P2002') throw err;
    const existing = await prisma.knowledgeSource.findUnique({ where });
    if (!existing) throw err;
    return existing;
  }
}

/**
 * How long a recording may sit in `recording` — no new artifact signed — before it counts as
 * abandoned. DELIBERATELY generous: a paused capture signs nothing either, and deleting a recording
 * someone is still making would be far worse than carrying a few orphaned objects for a day.
 *
 * A false positive is also self-healing: upload markers are scoped to the row's id, so if a swept
 * recording resumes, the next signing call creates a fresh row and every artifact re-uploads from
 * the recorder's local buffer, which is never cleared until an upload actually succeeds.
 */
const ABANDONED_AFTER_MS = 12 * 60 * 60_000;
const SWEEP_BATCH = 20;

/**
 * Drop recordings that were started and never finished, with their artifacts.
 *
 * Uploading during the capture buys a fast Stop, but it means a recording that is abandoned — the
 * browser closed, the tab dropped, the founder simply walked away — has already written a row and
 * objects that nothing would otherwise ever remove. Only `recording` rows are eligible: anything
 * that reached the finalize step is the founder's to keep or delete in Studio.
 *
 * Best-effort and fire-and-forget: never allowed to fail or delay the request that triggered it.
 */
async function sweepAbandonedRecordings(workspaceId: string): Promise<void> {
  try {
    const stale = await prisma.knowledgeSource.findMany({
      where: {
        workspaceId,
        status: 'recording',
        updatedAt: { lt: new Date(Date.now() - ABANDONED_AFTER_MS) },
      },
      select: { id: true },
      take: SWEEP_BATCH,
    });
    if (stale.length === 0) return;
    for (const { id } of stale) {
      await deleteSessionPrefix(workspaceId, id); // storage first — a surviving row can be re-swept
      await prisma.knowledgeSource.delete({ where: { id } }).catch(() => {});
    }
    app.log.info({ workspaceId, count: stale.length }, 'swept abandoned recordings');
  } catch (err) {
    app.log.warn({ workspaceId, err }, 'abandoned-recording sweep failed');
  }
}

/**
 * Discard an unfinished recording and everything it has already uploaded — what the recorder calls
 * when a capture is thrown away instead of stopped. Only a recording still in `recording` can be
 * discarded this way; once finalized, deleting is Studio's job, not the recorder's.
 */
app.delete('/v1/uploads/:uploadId', async (req, reply) => {
  const ws = await authWorkspace(req.headers.authorization);
  if (!ws) return reply.code(401).send({ error: 'invalid or missing token' });

  const uploadId = normalizeUploadId(String((req.params as { uploadId?: string }).uploadId ?? ''));
  if (!UPLOAD_ID_RE.test(uploadId)) return reply.code(400).send({ error: 'uploadId must be a UUID' });

  const rec = await prisma.knowledgeSource.findUnique({
    where: { workspaceId_uploadId: { workspaceId: ws.workspaceId, uploadId } },
  });
  if (!rec) return { discarded: false, reason: 'not found' }; // nothing was ever uploaded — fine
  if (rec.status !== 'recording') {
    return reply.code(409).send({ error: `recording is already ${rec.status} — delete it in Studio` });
  }

  await deleteSessionPrefix(ws.workspaceId, rec.id);
  await prisma.knowledgeSource.delete({ where: { id: rec.id } });
  return { discarded: true };
});

/**
 * Mint short-lived PUT URLs so the recorder uploads artifacts DIRECTLY to object storage WHILE the
 * recording is still running. The API never touches these bytes; it only authorizes one exact key
 * each, inside the caller's own workspace prefix. This is what removes the all-or-nothing,
 * multi-minute bundle transfer at Stop.
 */
app.post('/v1/uploads/sign', async (req, reply) => {
  const ws = await authWorkspace(req.headers.authorization);
  if (!ws) return reply.code(401).send({ error: 'invalid or missing token' });

  const body = req.body as { uploadId?: unknown; files?: unknown } | undefined;
  const uploadId = normalizeUploadId(typeof body?.uploadId === 'string' ? body.uploadId : '');
  if (!UPLOAD_ID_RE.test(uploadId)) return reply.code(400).send({ error: 'uploadId must be a UUID' });

  const files = Array.isArray(body?.files) ? body.files : [];
  if (files.length === 0 || files.length > MAX_SIGN_BATCH) {
    return reply.code(400).send({ error: `files must hold between 1 and ${MAX_SIGN_BATCH} entries` });
  }
  const rels: string[] = [];
  for (const f of files) {
    const rel = typeof (f as { rel?: unknown })?.rel === 'string' ? (f as { rel: string }).rel : '';
    if (!ARTIFACT_REL_RE.test(rel)) {
      return reply.code(400).send({ error: `unsupported artifact path: ${rel.slice(0, 80)}` });
    }
    rels.push(rel);
  }

  const rec = await resolveRecording(ws, uploadId);
  if (!OPEN_STATUSES.has(rec.status)) {
    // A stale recorder still uploading into a recording Studio has already built.
    return reply.code(409).send({ error: `recording is already ${rec.status}` });
  }

  const urls = await Promise.all(
    rels.map(async (rel) => ({
      rel,
      url: await signPutUrl(sessionKey(ws.workspaceId, rec.id, rel), artifactContentType(rel)),
    })),
  );
  return { sessionId: rec.id, expiresIn: UPLOAD_URL_TTL_SECONDS, urls };
});

/**
 * Finalize a recording: the manifest plus whatever artifacts did NOT already upload directly.
 * Files ride their relative path on the multipart field NAME (multipart strips directories from
 * filenames); we STREAM each part to object storage (never buffering a file in RAM — this instance
 * also serves the public copilot), validate the manifest, fill in the row, and enqueue synthesis.
 *
 * Idempotent by `uploadId`: a retry overwrites the SAME object keys and updates the SAME row.
 * Note the cleanup asymmetry vs. the old all-or-nothing route — a failed finalize must NOT delete
 * the prefix, because artifacts uploaded during recording live there and are not resendable.
 */
app.post('/v1/sessions', async (req, reply) => {
  const ws = await authWorkspace(req.headers.authorization);
  if (!ws) return reply.code(401).send({ error: 'invalid or missing token' });

  const uploadId = normalizeUploadId(String(req.headers['x-flowbuddy-upload-id'] ?? ''));
  if (!UPLOAD_ID_RE.test(uploadId)) {
    return reply.code(400).send({ error: 'missing or malformed X-FlowBuddy-Upload-Id header' });
  }

  // Resolved BEFORE the body is read: the storage prefix depends on this row, and a retry has to
  // land on the same one. (The id travels as a header rather than in the manifest because parts
  // stream to storage before the manifest part has been parsed.)
  const rec = await resolveRecording(ws, uploadId);
  const sessionId = rec.id;

  // Already built, or being built. This is precisely the lost-response case: the first finalize
  // committed but its reply never reached the recorder. Drain the body so the client's write
  // completes cleanly, then report the truth instead of rebuilding anything.
  const alreadyBuilt = !OPEN_STATUSES.has(rec.status);

  let manifestRaw: unknown = null;
  let totalBytes = 0;

  for await (const part of req.parts()) {
    if (part.type === 'file') {
      if (alreadyBuilt) {
        part.file.resume(); // drain and discard — never overwrite artifacts a worker may be reading
        continue;
      }
      // Same allowlist as the signing route. `sessionKey`'s '..' strip is defeatable ('....//'),
      // so the key is validated here rather than sanitized downstream.
      const rel = part.fieldname || part.filename || '';
      if (!ARTIFACT_REL_RE.test(rel)) {
        return reply.code(400).send({ error: `unsupported artifact path: ${rel.slice(0, 80)}` });
      }
      totalBytes += await putObjectStream(
        sessionKey(ws.workspaceId, sessionId, rel),
        part.file,
        part.mimetype,
      );
      if (part.file.truncated) {
        return reply.code(413).send({ error: 'a bundle file exceeds the per-file size limit' });
      }
      if (totalBytes > MAX_BUNDLE_BYTES) {
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

  if (alreadyBuilt) return { sessionId, status: rec.status, alreadyFinalized: true };

  const parsed = sessionManifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'invalid manifest', issues: parsed.error.issues.slice(0, 5) });
  }
  const m = parsed.data;

  await prisma.knowledgeSource.update({
    where: { id: sessionId },
    data: { status: 'uploaded', appBaseUrl: m.app.baseUrl, manifest: m as object, error: null },
  });

  // NO deterministic jobId here. It would dedupe a racing retry, but BullMQ retains finished and
  // failed jobs (queue.ts removeOnComplete/removeOnFail), so a retained job with that id silently
  // swallows the re-enqueue — exactly when the recording is in `error` and the retry is the user
  // asking for another go. The worker is idempotent (it deletes and recreates the recording's
  // items), so the worst case of a double enqueue is duplicated work, not a duplicated recording.
  // Best-effort, and bounded. The recording is already safe in Postgres and object storage by this
  // point, so a sick Redis must not turn a delivered recording into a failed upload — which would
  // send the recorder back to Retry for something that actually succeeded. Studio's
  // "Stalled → Re-process" is the recovery path if this drops.
  await Promise.race([
    synthesisQueue.add('synthesize', { sessionId, workspaceId: ws.workspaceId }),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]).catch((err) => req.log.error({ sessionId, err }, 'could not enqueue synthesis — recording is stored; re-process from Studio'));

  // A finished recording is the cheapest reliable signal that this workspace is active, so it is
  // where the abandoned-recording sweep rides along. Deliberately NOT awaited: cleanup must never
  // delay — or fail — the request that delivers a recording.
  void sweepAbandonedRecordings(ws.workspaceId);

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
  mode: CopilotMode;
  reason: ReasonFlags;
  key: string;
  origin: string | undefined;
} | null> {
  const key = (req.headers['x-flowbuddy-key'] as string | undefined) ?? '';
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
  return { workspaceId: auth.workspaceId, showCitations: auth.showCitations, mode: auth.mode, reason: auth.reason, key, origin };
}

// ── P2 Sense — validate the widget's localization payload ─────────────────────────────────────
// The wire hypotheses are UNTRUSTED (any page holding the public key can send them). Every field
// is type-checked, clamped, and sliced; the workflow keys are then re-verified against
// CopilotApproval (no-leak: an unapproved key is dropped) and the TITLE comes from the approval
// snapshot — never the wire — so the only host-page text that ever reaches the prompt is the
// masked error snippet, which is delimited + de-angled here.
// Matches the widget's own cap: on a hub page many workflows tie on DOM evidence alone, and only
// the question can separate them, so the candidate list travels whole and the answer model chooses.
const MAX_SENSE_HYPOTHESES = 6;
// …but only the leaders BIAS RETRIEVAL. A candidate list is for choosing from; a boost applied to
// six workflows would flood the evidence window it exists to nudge (the eviction this same day's
// `RELEVANCE_RESERVE` had to be added to stop).
const MAX_SENSE_BOOST_KEYS = 2;
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
    where: {
      workspaceId,
      inactiveReason: null, // P3-M0/M1 — a workflow that is not live is not a valid position hypothesis
      // The widget reports a POSITION (it has no idea identities exist), so resolve through the
      // workflow rather than off the approval's own columns — the approval is keyed on identity now.
      workflow: { OR: parsed.map((h) => ({ sourceId: h.sourceId, segmentIndex: h.segmentIndex })) },
    },
    select: { segmentTitle: true, workflow: { select: { sourceId: true, segmentIndex: true } } },
  });
  const titleByKey = new Map(
    approvals.map((a) => [`${a.workflow.sourceId}:${a.workflow.segmentIndex}`, a.segmentTitle]),
  );
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

/**
 * The `QueryCitation` rows for one answer — ONE PER WORKFLOW, which is what the table has always
 * claimed to be and, until 2026-07-27, wasn't.
 *
 * The answer engine dedupes its citations by KnowledgeItem id (per STEP), because that's the right
 * granularity for grounding: an answer built from six steps of a workflow legitimately cites six
 * items. Persisting that list one-to-one, though, wrote six rows that all name the same workflow —
 * and every reader of this table counts ROWS. So "Top workflows by citations" ranked by how many
 * steps a workflow has rather than how often it was used, and a single 👍 on a six-step answer
 * counted as six helpful votes on that workflow.
 *
 * The end-user never saw it: the widget dedupes citation titles before rendering the "Source" pill,
 * which is exactly why this survived so long.
 *
 * Collapsing HERE (rather than in each reader) makes the stored shape match the schema's own
 * comment, so a future reader can't reintroduce the bug by counting rows naively.
 */
function citationRows(
  workspaceId: string,
  cites: CopilotCitation[],
): {
  workspaceId: string;
  workflowId: string;
  sourceId: string;
  segmentIndex: number | null;
  segmentTitle: string | null;
}[] {
  const rows = [];
  const seen = new Set<string>();
  for (const c of cites) {
    // P3-M1 — dedupe on the workflow's IDENTITY. The position is still logged for display, but two
    // citations of one workflow are one row however its position may have moved.
    if (seen.has(c.workflowId)) continue;
    seen.add(c.workflowId);
    rows.push({
      workspaceId,
      workflowId: c.workflowId,
      sourceId: c.sourceId,
      segmentIndex: c.segmentIndex,
      segmentTitle: c.segmentTitle,
    });
  }
  return rows;
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

// ── P5-M0 cut 2 — continuity bias: the workflows the PREVIOUS answer cited ─────────────────────
// The widget echoes back the citation keys it was given, so a follow-up ("and then what?") can
// bias retrieval toward the workflow under discussion instead of searching the KB for its own
// near-empty text. UNTRUSTED like every other context field — any page holding the public key can
// send anything — so keys are shape-checked AND re-verified against `CopilotApproval`. That second
// check is the no-leak guarantee: a forged key for an unapproved (or another workspace's) workflow
// buys nothing, because retrieval only ever scans approved rows anyway and the boost would land on
// an item that is never in the candidate set. Re-checking here keeps the invariant explicit rather
// than incidental.
const MAX_CONTINUITY_KEYS = 4; // one answer's worth of distinct cited workflows

async function resolveContinuityKeys(workspaceId: string, raw: unknown): Promise<string[]> {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const parsed: Array<{ sourceId: string; segmentIndex: number }> = [];
  const seen = new Set<string>();
  for (const entry of raw.slice(0, MAX_CONTINUITY_KEYS * 2)) {
    if (!entry || typeof entry !== 'object') continue;
    const c = entry as { sourceId?: unknown; segmentIndex?: unknown };
    const sourceId = String(c.sourceId ?? '');
    const segmentIndex = Number(c.segmentIndex);
    if (!/^[a-z0-9-]{1,40}$/i.test(sourceId)) continue; // KnowledgeSource ids are UUIDs (hyphens!)
    if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex > 999) continue;
    const key = `${sourceId}:${segmentIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push({ sourceId, segmentIndex });
    if (parsed.length >= MAX_CONTINUITY_KEYS) break;
  }
  if (parsed.length === 0) return [];

  const approvals = await prisma.copilotApproval.findMany({
    where: {
      workspaceId,
      inactiveReason: null, // P3-M0/M1 — topic memory must not resurrect a workflow that stopped answering
      workflow: { OR: parsed.map((c) => ({ sourceId: c.sourceId, segmentIndex: c.segmentIndex })) },
    },
    select: { workflow: { select: { sourceId: true, segmentIndex: true } } },
  });
  const approved = new Set(
    approvals.map((a) => `${a.workflow.sourceId}:${a.workflow.segmentIndex}`),
  );
  return parsed.map((c) => `${c.sourceId}:${c.segmentIndex}`).filter((k) => approved.has(k));
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
 * Copilot mode's `get_workflow` tool — one workflow's full ordered steps, as citable items.
 *
 * The approval check is the whole point and it happens HERE, server-side, against a key the MODEL
 * supplied: an unapproved (or another workspace's, or a made-up) key returns null, so the assistant
 * cannot reach knowledge the founder never released. This mirrors the no-leak rule retrieval
 * already enforces — the agent's reach is the approved KB, and nothing about the tool surface
 * widens it.
 */
async function loadApprovedWorkflow(workspaceId: string, key: string): Promise<AgentWorkflow | null> {
  const [sourceId, rawSegment] = key.split(':');
  const segmentIndex = Number(rawSegment);
  if (!sourceId || !/^[a-z0-9-]{1,40}$/i.test(sourceId)) return null;
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex > 999) return null;

  const approval = await prisma.copilotApproval.findFirst({
    // P3-M0/M1: the liveness test matters MORE here than anywhere else — this is the agent's
    // by-key fetch, so without it the loop could pull a retired workflow WHOLE, bypassing the
    // ranked path and its no-leak constraint entirely.
    where: { workspaceId, inactiveReason: null, workflow: { sourceId, segmentIndex } },
    select: { segmentTitle: true },
  });
  if (!approval) return null; // absent, not forbidden

  const rows = await prisma.knowledgeItem.findMany({
    where: { workspaceId, kind: 'step', sourceId, segmentIndex },
    orderBy: { orderIndex: 'asc' },
    select: { id: true, workflowId: true, sourceId: true, segmentIndex: true, text: true },
  });
  if (rows.length === 0) return null;

  return {
    title: approval.segmentTitle ?? 'this workflow',
    items: rows.map((r) => ({
      id: r.id,
      workflowId: r.workflowId,
      sourceId: r.sourceId,
      segmentIndex: r.segmentIndex,
      segmentTitle: approval.segmentTitle,
      text: r.text,
    })),
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
  // How long the END USER waited. Cost has been measured per question since 2026-08-03; time never
  // has been — which is why the answer path's model timeout had to be set to a number chosen for
  // being unreachable rather than one chosen from a distribution. Started before the gate so it
  // covers everything the user actually waits through, not just the model.
  const startedAt = Date.now();
  const gate = await copilotGate(req, reply, 'answer');
  if (!gate) return reply;
  const { workspaceId, key, origin } = gate;
  const body = (req.body ?? {}) as {
    question?: string;
    history?: unknown;
    context?: { path?: string; sense?: unknown; reason?: unknown; lastCited?: unknown };
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

  // The question is PERSISTED (CopilotQuery + CoverageGap) and read back verbatim by the founder in
  // Studio, so it gets the same P1-M12 scrub every other stored text path already gets — it was the
  // one that didn't. An end-user typing "card 4242 4242 4242 4242 declined, order #A-9931, mail
  // me@corp.com" must not put a live card number in the workspace owner's database or on their
  // screen; the order id, prices and dates survive (redactText is high-precision by design), so the
  // founder still sees a question they can act on.
  //
  // STORAGE ONLY — `question` itself is untouched, so retrieval and the model still see exactly what
  // the user typed and answer quality is unchanged. Applied once here so every write below agrees:
  // the CoverageGap dedupe matches on this text, and a mismatch would silently create a new gap row
  // per repeat of the same question.
  const storedQuestion = redactText(question);

  // P1-M8: the host page the end-user is on (sent by the widget) biases retrieval + the answer.
  // Bounded — it's untrusted input that lands in the DB and the prompt.
  const contextPath = typeof body.context?.path === 'string' ? body.context.path.slice(0, 512) : null;
  // P2 Sense — validate the probe's hypotheses (approval-checked, titles from server truth).
  // Both context resolutions hit the DB and are independent — run them together so cut 2's
  // approval re-check costs no extra serial round-trip on the path every question rides.
  const [{ sense, probed }, continuityKeys] = await Promise.all([
    // P2 Sense — validate the probe's hypotheses (approval-checked, titles from server truth).
    resolveSenseContext(workspaceId, body.context?.sense),
    // P5-M0 cut 2 — the previous answer's cited workflows, approval-re-verified. A follow-up
    // carries almost no retrievable terms of its own; this keeps it in the workflow discussed.
    resolveContinuityKeys(workspaceId, body.context?.lastCited),
  ]);
  const senseKeys = sense?.hypotheses
    .slice(0, MAX_SENSE_BOOST_KEYS)
    .map((h) => `${h.sourceId}:${h.segmentIndex}`);
  // P1-M3 — hybrid keyword+vector retrieval; the embedding config is best-effort (retrieval
  // degrades to the keyword shortlist on any vector-path failure — never errors here).
  const items = await retrieveApprovedKBItems(prisma, workspaceId, question, {
    contextPath,
    senseKeys,
    continuityKeys,
    embedding: { apiKey: config.openaiApiKey, model: config.embedModel || undefined },
  });
  if (items.length === 0) {
    // No approved content at all — an un-provisioned copilot, not a coverage gap.
    const reason = 'This copilot has no approved help content yet.';
    if (preview) return { covered: false, answer: null, citations: [], reason };
    const q = await prisma.copilotQuery.create({
      data: { workspaceId, question: storedQuestion, answered: false, contextPath, ...senseLogFields(sense, probed, null) },
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
  // WHICH ENGINE ACTUALLY ANSWERED — not which mode the workspace is configured for. The two come
  // apart in both directions: the diagnostic path preempts the agent whenever the widget shipped
  // evidence, and the safety floor answers with no tools while `gate.mode` still reads "copilot".
  // Anything that reasons about how an answer was produced (this log line today; the escalation
  // decision next) must key on this, or it will misfire on exactly the requests that already went
  // wrong once.
  let engineUsed: 'floor' | 'agent' | 'reason' = 'agent';
  // What the agent's loop DID — rounds, and every tool call including the ones that did not run.
  // A holder rather than a bare `let`: the loop reports through a callback, and TypeScript narrows
  // a `let` that is only ever assigned inside a closure to `null` at every read.
  const loop: { stats: AnswerLoopResult | null; spent: TokenUsage } = {
    stats: null,
    spent: { input: 0, cachedInput: 0, output: 0, reasoning: 0 },
  };
  // What the agent's own searches returned, in the order it asked. Filled by the `searchKb` closure
  // below — the only place that sees a search's RESULTS rather than just its query.
  const searches: Array<{ q: string; workflows: string[]; ids: string[] }> = [];
  /**
   * Every loop this question ran reports through here.
   *
   * `stats` is REPLACED and `spent` is ACCUMULATED, and the asymmetry is the point. `stats`
   * describes what the engine that finally answered did — rounds, tools — so the last one wins.
   * Cost is not like that: a question the agent loop failed and the floor caught paid for BOTH, and
   * a loop that searched twice before answering paid for all three calls. Recording only the
   * surviving engine's tokens would understate exactly the questions worth finding.
   */
  const recordLoop = (stats: AnswerLoopResult): void => {
    loop.stats = stats;
    loop.spent.input += stats.usage.input;
    loop.spent.cachedInput += stats.usage.cachedInput;
    loop.spent.output += stats.usage.output;
    loop.spent.reasoning += stats.usage.reasoning;
  };
  // THE FLOOR — one round of the agent's own prompt with no tools bound, over the items retrieval
  // has already produced. It is no longer a sellable mode (AI Chatbot was retired); it is purely
  // what answers when something above it fails, which is why nothing here consults `gate.mode`.
  //
  // It shares the agent's prompt and item rendering on purpose. As a separate engine it carried a
  // second prompt and a second renderer, and a fallback that drifts from the thing it falls back to
  // is worse than none — the founder tunes the agent, the failure path silently keeps the old
  // behaviour, and the worst answers in the product come from the path nobody is looking at.
  const answerFromFloor = () =>
    answerAsFloor({
      question,
      history: sanitizeHistory(body.history),
      items,
      context: { path: contextPath, sense: sense ?? undefined },
      onLoop: recordLoop,
      apiKey: config.openaiApiKey,
      model: config.synthModel,
    });

  if (reasonPayload) {
    // The reasoning path (docs/build/sense-and-reason.md §B4): full workflow recipe + expected-state
    // artifacts for the localized current step, then the stronger model's agentic read-tool loop.
    engineUsed = 'reason';
    const { workflow, expected } = await buildReasonEvidence(workspaceId, sense);
    req.log.info(
      {
        workspaceId,
        // The mode rides along because this branch has NO mode guard: it preempts the agent
        // whenever the widget shipped evidence. `mode: 'copilot'` here means a Copilot-mode
        // question was answered by the diagnostic engine with the KB tools never bound.
        mode: gate.mode,
        trigger: reasonPayload.trigger,
        elements: reasonPayload.snapshot.elements.length,
        image: Boolean(reasonPayload.image),
        localized: Boolean(workflow),
      },
      'reason path engaged',
    );
    try {
      result = await diagnoseFromKB({
        question,
        history: sanitizeHistory(body.history),
        items,
        sense: sense ?? undefined,
        snapshot: reasonPayload.snapshot,
        pageImage: reasonPayload.image,
        workflow,
        expected,
        onLoop: recordLoop,
        apiKey: config.openaiApiKey,
        model: config.reasonModel,
      });
    } catch (err) {
      // THE SAME FLOOR THE AGENT PATH HAS. This branch had no catch at all, so any failure here —
      // a `REASON_MODEL` that rejects a parameter, a model that isn't vision-capable being handed a
      // page image, a timeout mid-loop — escaped as an unhandled throw. Fastify then answered with
      // its DEFAULT error shape, whose `error` field is the literal string "Bad Request", and the
      // widget rendered exactly that. The end-user saw "Bad Request" where they had asked why they
      // were stuck, and the one useful part (Fastify's `message`, carrying the provider's actual
      // complaint) was never shown to anyone.
      //
      // This path is reached from the walkthrough's "Explain what's blocking me", i.e. from a user
      // who is ALREADY stuck — the worst possible moment to hand back a raw HTTP error. Retrieval
      // has already run, so degrade to the same knowledge one rung down, exactly as mode 2 does.
      req.log.error(
        { err, workspaceId, model: config.reasonModel, hadImage: Boolean(reasonPayload.image) },
        'reason path failed — falling back to the floor',
      );
      engineUsed = 'floor'; // the floor answered; downstream must not treat this as the reason path
      result = await answerFromFloor();
    }
    // A provider failure returned IN THE BODY (200 + status:'failed') never throws, so the catch
    // above cannot see it — it would sail through as an empty answer and be filed as a coverage
    // gap the founder could never fix. Route it into the same floor.
    if (loop.stats?.failed) {
      req.log.error(
        { workspaceId, model: config.reasonModel, failed: loop.stats.failed },
        'reason path returned a failed response — falling back to the floor',
      );
      engineUsed = 'floor';
      result = await answerFromFloor();
    }
  } else {
    // The agent loop — the assistant decides how to help. Round one sees exactly what the floor
    // sees (retrieval has already run), so a simple lookup costs the same and answers just as
    // fast; the extra rounds are the escalation. Both tools are approval-constrained HERE, in the
    // closures, so the model's action space is the approved KB and nothing else.
    //
    // NO MODE CHECK. Every mode runs this loop — `copilot` is the floor of the ladder now, and
    // `agent` will be this loop plus acting tools rather than a different path. The `modeUsesAgentLoop`
    // gate that used to stand here went with AI Chatbot: a gate that can only ever answer yes reads
    // like a fork still exists and invites someone to add a branch to the side of it that is dead.
    req.log.info({ workspaceId, mode: gate.mode }, 'agent path engaged');
    engineUsed = 'agent';
    try {
      result = await answerAsAgent({
        question,
        history: sanitizeHistory(body.history),
        items,
        context: { path: contextPath, sense: sense ?? undefined },
        // Recorded on the way past (see the `searched` field on the answer log line): the loop
        // reports the QUERY it asked for, and this is the only place that sees what came back.
        //
        // NO context signals here, deliberately. The first retrieval answers "what is around this
        // user?", so route/sense/continuity belong to it. `search_knowledge` answers "find me X" —
        // the agent has already read the page context and decided what it wants, in its own words,
        // and biasing that query back toward the current screen overrides the one judgment in the
        // loop that is made WITH the question in hand. Measured: on a hub page, "log out" returned
        // only on-screen items and the agent (which sees just the top 12) declined on a workflow the
        // KB plainly held. Nothing positional is lost — round one's items stay in the prompt and
        // tool results accumulate rather than replace.
        searchKb: async (query) => {
          const found = await retrieveApprovedKBItems(prisma, workspaceId, query, {
            embedding: { apiKey: config.openaiApiKey, model: config.embedModel || undefined },
          });
          searches.push({
            // The query is the MODEL's wording of the user's question, so it carries the same PII
            // risk the question does and gets the same scrub — neither a log file nor this row may
            // become a new place for a card number to land.
            q: redactText(query),
            workflows: [...new Set(found.map((i) => i.segmentTitle).filter((t): t is string => !!t))],
            // What the agent actually READS — the loop shows it only the first MAX_SEARCH_RESULTS.
            ids: found.slice(0, 12).map((i) => i.id),
          });
          return found;
        },
        loadWorkflow: (key) => loadApprovedWorkflow(workspaceId, key),
        onLoop: recordLoop,
        apiKey: config.openaiApiKey,
        model: config.synthModel,
      });
    } catch (err) {
      // THE SAFETY FLOOR, made real (2026-07-27). The loop makes several model calls and several
      // tool round-trips, so it has strictly more ways to fail than the single call beneath it —
      // and it is now what a new workspace gets by default, which makes ITS failure the DEFAULT
      // experience's failure. So degrade instead of erroring: retrieval already ran, so the
      // fallback answers from exactly the items the loop's own first round would have seen. The
      // user gets a real answer a little less cleverly; the founder gets a log line.
      //
      // Deliberately catches everything, including a timeout or a malformed tool argument. There
      // is no failure of the loop that is better served by showing the end-user an error than by
      // answering from the same knowledge one rung down.
      req.log.error({ err, workspaceId, mode: gate.mode }, 'agent path failed — falling back to the floor');
      engineUsed = 'floor'; // the floor answered; downstream must not treat this as the agent
      result = await answerFromFloor();
    }
    // As on the reason path: a body-level provider failure does not throw, so the catch above
    // cannot see it. Same floor, same reasoning.
    if (loop.stats?.failed) {
      req.log.error(
        { workspaceId, mode: gate.mode, failed: loop.stats.failed },
        'agent path returned a failed response — falling back to the floor',
      );
      engineUsed = 'floor';
      result = await answerFromFloor();
    }
  }

  // WHAT THE MODEL HAD IN FRONT OF IT — built once, and written to BOTH the log line and the row.
  // One shape, so a grepped line and a stored row can never disagree about the same question.
  // Capped here rather than at the call sites: an answer path that searched ten times must not
  // write ten times the row.
  const senseCandidates = sense
    ? sense.hypotheses.map((h) => ({
        key: `${h.sourceId}:${h.segmentIndex}`,
        title: h.title,
        step: h.step,
        conf: h.confidence,
      }))
    : null;
  const evidence = {
    ids: items.map((i) => i.id),
    // Workflow titles ride beside the ids because ids DO NOT SURVIVE A REPROCESS (the worker
    // delete+recreates items), and a row whose ids have all dangled would otherwise say nothing.
    workflows: [...new Set(items.map((i) => i.segmentTitle).filter((t): t is string => !!t))],
  };
  const searchRecord = searches.slice(0, 4);

  // WHAT THE ANSWER PATH ACTUALLY DID — one line per question, emitted before anything downstream
  // can transform, escalate, or discard the result.
  //
  // It exists because a decline used to be unreadable. Two very different failures — "answered the
  // page instead of the question" and "searched, missed, and was refused a second search" — arrive
  // at the same silent `covered:false`, and the escalation then REPLACES that decline with another
  // engine's before anything is written down. So the founder saw a page-shaped refusal, and there
  // was no record anywhere of what the agent itself had said or looked for. Tuning a prompt against
  // a sentence a different engine wrote is not debugging; it is guessing with extra steps.
  //
  // `reason` is included ONLY on a decline: that string is the model's own words to the end-user,
  // and it is the single most useful field for telling those two failures apart.
  req.log.info(
    {
      workspaceId,
      // The SCRUBBED question (never the raw one) — the same text the DB stores, so a log line and
      // a CopilotQuery row can be lined up, and a log file is not a new place PII can land.
      question: storedQuestion,
      mode: gate.mode,
      engine: engineUsed,
      covered: result.covered,
      items: items.length,
      contextPath,
      sensed: sense?.hypotheses.length ?? 0,
      // WHAT THE MODEL WAS LOOKING AT — the same three values the row stores (built above). The
      // counts say how much evidence there was; these say WHICH, and that is the whole of a
      // diagnosis. `candidates` is deliberately the entire list: a wrong winner is only diagnosable
      // when the alternatives can be seen. `searched` records what each query RETURNED — the `tools`
      // field below records only what was asked for.
      ...(senseCandidates ? { candidates: senseCandidates } : {}),
      evidence,
      ...(searchRecord.length > 0 ? { searched: searchRecord } : {}),
      // What the end user waited, end to end. The one number the answer path's timeouts must be set
      // from: `ANSWER_TIMEOUT_MS` is currently a ceiling picked to be unreachable, because there was
      // no distribution to pick it from. Read this together with `engine` — a rise in `floor` rows
      // beside a cluster near the ceiling is a timeout that has started costing real answers.
      ms: Date.now() - startedAt,
      // Spend rides the log line too: an incident is usually noticed as "why was yesterday
      // expensive?", and the per-question answer to that has to be greppable before anyone builds a
      // dashboard query for it.
      ...(loop.spent.input > 0 || loop.spent.output > 0
        ? {
            tokens: {
              in: loop.spent.input,
              cached: loop.spent.cachedInput,
              out: loop.spent.output,
              reasoning: loop.spent.reasoning,
            },
          }
        : {}),
      ...(loop.stats
        ? {
            rounds: loop.stats.rounds,
            // Present only when the model ran out of output budget. On a reasoning model that
            // budget covers thinking too, so a truncation returns empty text and reads downstream
            // as an ordinary decline — which would then be filed as a coverage gap the founder
            // could never fix by recording anything. If this field appears, the decline is OURS.
            ...(loop.stats.incomplete ? { incomplete: loop.stats.incomplete } : {}),
            // Mode 1 has no floor beneath it, so a provider failure there still declines — but it
            // must be readable as OURS, not as the KB failing to cover the question.
            ...(loop.stats.failed ? { failed: loop.stats.failed } : {}),
            // Every call the model asked for, whether or not it ran — a stream of `duplicate` or
            // `budget` skips is the loop telling you it wanted to keep looking and could not.
            tools: loop.stats.toolCalls.map((t) => ({ name: t.name, args: t.args, round: t.round, skipped: t.skipped })),
          }
        : {}),
      ...(result.covered ? {} : { reason: result.reason }),
    },
    'copilot answer',
  );

  // P2-M3 "show me" — where the answer positioned the user (null when position wasn't used).
  const position = result.covered ? result.position : null;

  // The workspace's citation trust setting is a PRESENTATION gate, applied here at the response
  // boundary rather than inside the answer engines: it hides the visible workflow TITLES from the
  // end-user while the keys still reach the widget (for P5-M0 cut 2's `lastCited` continuity) and
  // the full citation — title included — is still logged for the founder's own analytics. Nothing
  // new is exposed by the keys: `position` already returns them regardless of this setting, and
  // the widget holds approved workflow keys from its sense shard.
  const forClient = <T extends { segmentTitle: string | null }>(cites: T[]): T[] =>
    gate.showCitations === false ? cites.map((c) => ({ ...c, segmentTitle: null })) : cites;

  // P2-M5 — the fast-path-failure trigger (§5.2): the fast path declined, the founder's toggle is
  // on, and the widget declared it can capture. Ask it to retry ONCE with evidence instead of
  // logging the decline (the retry logs the real outcome; a widget that never retries costs one
  // missing decline row, not a phantom coverage gap).
  //
  // NOT WHEN THE AGENT ANSWERED (2026-07-28). This escalation was written for the SINGLE-CALL fast
  // path, where a decline means "one look, nothing found" and a second look with page evidence is a
  // genuine upgrade. Under Copilot mode it stopped being an upgrade and became a SWAP: the retry
  // arrives carrying page state, and the diagnostic branch above has no mode guard, so the agent
  // never runs the second time and its `search_knowledge`/`get_workflow` — the only tools that could
  // still have found the answer — are dropped. The user then reads a diagnosis of the screen they
  // happen to be standing on, for a question that was never about that screen.
  //
  // Keyed on WHICH ENGINE ANSWERED, not on the workspace's mode, because the two come apart exactly
  // here: when the agent loop throws, the FLOOR answers — one round, no tools — while `gate.mode`
  // still reads "copilot", and that decline SHOULD still escalate, since it really was one blind
  // look. With AI Chatbot retired the floor is the only way this line is now reached at all, which
  // makes it narrower than it used to be and still correct for exactly the case it was written for.
  //
  // Little is lost: a genuinely diagnostic question ("why can't I proceed?") never reaches this
  // line, because the widget's own trigger fires on the FIRST call and takes the diagnostic branch
  // directly. What this suppresses is the retry for questions that did NOT look diagnostic — where
  // page state was the least likely thing to help. And the agent's decline now flows on to the
  // CopilotQuery write below instead of vanishing, so the founder finally sees the copilot's own
  // words, and the coverage gap records what the AGENT said rather than the diagnostic engine's.
  if (!result.covered && engineUsed !== 'agent' && !reasonPayload && reasonAvailable && !preview) {
    return { covered: false, answer: null, citations: [], reason: result.reason, escalate: true };
  }

  // Preview answers are never persisted — return the engine's result as-is (no queryId).
  //
  // `engine` + `loop` ride along on PREVIEW ONLY (the widget's response shape is untouched, and no
  // end-user surface can see these). They exist because the diagnostic path's quality rules are
  // partly about what the model REACHED FOR, not only what it said: "look at the image before
  // concluding or hedging" and "never call the same tool twice" are invisible in the answer text,
  // so a harness that reads prose alone cannot tell a diagnosis that examined the evidence from one
  // that guessed and happened to be right. `engine` is here for the same reason it is in the log
  // line — the diagnostic branch preempts the agent and the floor answers without tools, so a fixture
  // that silently fell through to a different engine must be visibly invalid, not quietly counted.
  if (preview) {
    const previewLoop = {
      engine: engineUsed,
      ...(loop.stats
        ? {
            loop: {
              rounds: loop.stats.rounds,
              ...(loop.stats.incomplete ? { incomplete: loop.stats.incomplete } : {}),
              ...(loop.stats.failed ? { failed: loop.stats.failed } : {}),
              toolCalls: loop.stats.toolCalls.map((t) => ({ name: t.name, round: t.round, skipped: t.skipped })),
            },
          }
        : {}),
      // The machine-checkable blockers the prompt declared EXHAUSTIVE for form state ("the answer
      // MUST cover every entry"). Returned rather than recomputed harness-side so the assertion is
      // made against the very list the model was shown — the two can never drift apart.
      ...(reasonPayload ? { blockers: blockerList(reasonPayload.snapshot) } : {}),
    };
    return result.covered
      ? { covered: true, answer: result.answer, citations: forClient(result.citations), position, ...previewLoop }
      : { covered: false, answer: null, citations: [], reason: result.reason, ...previewLoop };
  }

  // P1-M10: log the Q&A (analytics + the thumbs-feedback target). On a grounded answer,
  // persist the cited workflows too (powers Analytics "Top workflows by citations").
  // P2-M4: also log the Sense localization outcome (used | ignored | none) — step-friction analytics.
  // P2-M5: and the Reason outcome (why the diagnostic path fired + whether the image rode along).
  const logged = await prisma.copilotQuery.create({
    data: {
      workspaceId,
      question: storedQuestion,
      answered: result.covered,
      contextPath,
      // How this answer was produced. `engine` is what ACTUALLY ran, which is not always what
      // `mode` would predict — the diagnostic path preempts the agent, and the safety floor
      // answers from the floor without the mode changing. Storing both makes that gap countable.
      mode: gate.mode,
      engine: engineUsed,
      ...(loop.stats ? { rounds: loop.stats.rounds, toolCalls: loop.stats.toolCalls.length } : {}),
      // What it COST — the whole question, every loop it ran (see `recordLoop`). Written only when
      // a loop actually reported usage, so a row where the provider told us nothing stays null and
      // honestly reads "unknown" rather than claiming a free question.
      ...(loop.spent.input > 0 || loop.spent.output > 0
        ? {
            inputTokens: loop.spent.input,
            cachedInputTokens: loop.spent.cachedInput,
            outputTokens: loop.spent.output,
            reasoningTokens: loop.spent.reasoning,
          }
        : {}),
      ...senseLogFields(sense, probed, position),
      // What it was LOOKING AT (2026-08-04) — the same values the log line carries, so a grepped
      // line and a stored row can never disagree. Written only when there is something to say: a
      // question with no probe stores no candidates, and `evidence` is omitted rather than stored
      // empty when retrieval found nothing at all.
      ...(senseCandidates ? { senseCandidates } : {}),
      ...(evidence.ids.length > 0 ? { evidence } : {}),
      ...(searchRecord.length > 0 ? { searches: searchRecord } : {}),
      ...(reasonPayload
        ? { reasonTrigger: reasonPayload.trigger, reasonImage: Boolean(reasonPayload.image) }
        : {}),
      ...(result.covered && result.citations.length > 0
        ? { citations: { create: citationRows(workspaceId, result.citations) } }
        : {}),
    },
    select: { id: true },
  });

  if (!result.covered) {
    // A coverage gap is a claim about the KNOWLEDGE BASE — "a real user asked this and you have not
    // recorded it" — and it is only true when an engine actually looked and found nothing.
    //
    // OUR OWN failures arrive here wearing exactly the same clothes. A reasoning model that spends
    // its whole output budget thinking returns empty text; a body-level provider failure returns 200
    // with no content. Both parse as a perfectly ordinary decline. Filing those as coverage gaps puts
    // a row the founder CANNOT FIX BY RECORDING ANYTHING into the one feed they use to decide what to
    // record next — and once written it is indistinguishable from a real gap, so the cost is an
    // afternoon re-recording a workflow that was never missing.
    //
    // Keyed on `loop.stats`, which is the FINAL engine's (recordLoop replaces it, and only `spent`
    // accumulates). That is what keeps this narrow rather than over-eager: an agent loop that failed
    // and was rescued by the floor carries the FLOOR's stats here, so its decline still files as the
    // real gap it is. Only a decline whose LAST engine was itself truncated or failed is suppressed —
    // which is also how the second-order case (the floor itself failing) is caught, with no extra
    // branch. The decline still reaches the end-user and is still logged as an unanswered question;
    // the only thing withheld is the accusation against the KB.
    if (loop.stats?.incomplete || loop.stats?.failed) {
      req.log.warn(
        {
          workspaceId,
          engine: engineUsed,
          ...(loop.stats.incomplete ? { incomplete: loop.stats.incomplete } : {}),
          ...(loop.stats.failed ? { failed: loop.stats.failed } : {}),
        },
        'decline was ours, not missing coverage — coverage gap suppressed',
      );
    } else {
      // Decline → log a coverage gap (dedupe: one open gap per distinct question).
      const existing = await prisma.coverageGap.findFirst({
        where: { workspaceId, prompt: storedQuestion, status: 'open' },
        select: { id: true },
      });
      if (!existing) {
        await prisma.coverageGap.create({ data: { workspaceId, prompt: storedQuestion, reason: result.reason, source: 'copilot' } });
      }
    }
    return { covered: false, answer: null, citations: [], reason: result.reason, queryId: logged.id };
  }

  // `position` is the only on-page signal the widget needs: what it DOES there is decided by the
  // founder's switches (D11). The answer used to also carry the assistant's own `intents`; those
  // went when the switch became the sole decider, taking their prompt section with them.
  return {
    covered: true,
    answer: result.answer,
    citations: forClient(result.citations),
    position,
    queryId: logged.id,
  };
});

/**
 * P2-M0 — the ROUTE-SHARDED sense plan (docs/build/sense-and-reason.md §2). The widget fetches this on
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
      // P3-M0/M1 — never start a guided walkthrough on a workflow that is no longer answering.
      where: {
        workspaceId: gate.workspaceId,
        inactiveReason: null,
        workflow: { sourceId, segmentIndex },
      },
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
 * `data-flowbuddy-*` attrs on the script tag still win as per-page overrides). Auth = the public key +
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
      copilotMode: true,
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
    // The operating mode (Copilot | AI Agent). The widget needs it because some of
    // the assistant's abilities run in the page; the SERVER re-checks it on every call regardless
    // — a page holding the public key must never be able to talk itself into a higher mode.
    mode: parseCopilotMode(ws.copilotMode),
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
      'FlowBuddy api listening',
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
