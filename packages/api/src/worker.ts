import { Worker } from 'bullmq';
import { SYNTHESIS_QUEUE } from '@flowbuddy/shared';
import type { SessionManifest } from '@flowbuddy/shared';
import { prisma } from '@flowbuddy/db';
import {
  buildWorkflowKB,
  distilledStepText,
  embedTexts,
  matchWorkflowIdentities,
  meanVector,
  toVectorLiteral,
  type WorkflowFingerprint,
} from '@flowbuddy/synthesis';
import { createLogger } from '@flowbuddy/logger';
import { config } from './config';
import { connection } from './queue';
import { sessionArtifactReader } from './storage';

const log = createLogger('worker');

/**
 * P3-M1 — fingerprint every workflow currently stored for a recording, from the vectors already on
 * its steps. Must be read BEFORE the worker deletes those steps; afterwards the evidence is gone.
 *
 * A workflow whose steps were never embedded has no fingerprint and so cannot be matched. That is
 * the fail-closed direction on purpose: an unverifiable identity must not silently keep an approval.
 */
async function readWorkflowFingerprints(sourceId: string): Promise<WorkflowFingerprint<string>[]> {
  const rows = await prisma.$queryRaw<Array<{ workflowId: string; vec: string }>>`
    SELECT "workflowId", embedding::text AS vec
    FROM "KnowledgeItem"
    WHERE "sourceId" = ${sourceId} AND embedding IS NOT NULL
    ORDER BY "workflowId", "orderIndex"`;

  const byWorkflow = new Map<string, number[][]>();
  for (const r of rows) {
    let parsed: number[];
    try {
      parsed = JSON.parse(r.vec) as number[];
    } catch {
      continue;
    }
    byWorkflow.set(r.workflowId, [...(byWorkflow.get(r.workflowId) ?? []), parsed]);
  }

  const out: WorkflowFingerprint<string>[] = [];
  for (const [workflowId, vecs] of byWorkflow) {
    const centroid = meanVector(vecs);
    const goal = vecs[vecs.length - 1];
    if (centroid && goal) out.push({ key: workflowId, centroid, goal });
  }
  return out;
}

/** The same fingerprint shape for freshly distilled workflows, keyed by their new segment index. */
function fingerprintsFrom(
  workflows: Array<{ segmentIndex: number; steps: unknown[] }>,
  stepTexts: string[][],
  vectors: number[][],
): WorkflowFingerprint<number>[] {
  const out: WorkflowFingerprint<number>[] = [];
  let cursor = 0;
  workflows.forEach((wf, i) => {
    const count = stepTexts[i]?.length ?? 0;
    const slice = vectors.slice(cursor, cursor + count);
    cursor += count;
    const centroid = meanVector(slice);
    const goal = slice[slice.length - 1];
    if (centroid && goal) out.push({ key: wf.segmentIndex, centroid, goal });
  });
  return out;
}

const worker = new Worker(
  SYNTHESIS_QUEUE,
  async (job) => {
    const sessionId = job.data.sessionId as string;
    log.info({ sessionId, jobId: job.id }, 'processing session');

    const rec = await prisma.knowledgeSource.findUnique({ where: { id: sessionId } });
    if (!rec) {
      log.warn({ sessionId }, 'source not found — skipping');
      return;
    }
    // The row now exists from the first uploaded artifact, so it can legitimately be reached before
    // the recording was ever stopped and finalized. Nothing to synthesize until the manifest lands.
    if (!rec.manifest) {
      log.warn({ sessionId, status: rec.status }, 'no manifest yet — recording not finalized, skipping');
      return;
    }
    await prisma.knowledgeSource.update({ where: { id: sessionId }, data: { status: 'processing' } });

    try {
      const manifest = rec.manifest as unknown as SessionManifest;
      const getArtifact = sessionArtifactReader(rec.workspaceId, sessionId);

      // ── Module 2 (LIVE copilot path): capture → distilled workflow KB ──
      // transcribe → align → clean (B) → segment → distill (A). Persists clean steps grouped by
      // workflow (segmentIndex/segmentTitle); raw events are NOT stored. See docs/build/kb-step-distillation.md.
      const { transcript, workflows, warning } = await buildWorkflowKB({
        manifest,
        getArtifact,
        apiKey: config.openaiApiKey,
        transcribeModel: config.transcribeModel,
        synthModel: config.synthModel,
      });

      await prisma.knowledgeSource.update({
        where: { id: sessionId },
        data: { transcript: transcript as object },
      });

      // ── P3-M1: which of these workflows ARE the ones already here? ──────────────────────────────
      // Fingerprint what is stored RIGHT NOW, before the delete below destroys it. Identity is then
      // decided by comparing content — never by position, which is what used to walk a founder's
      // approval onto a workflow nobody had reviewed.
      const existingFingerprints = await readWorkflowFingerprints(sessionId);
      const existingWorkflowIds = (
        await prisma.workflow.findMany({ where: { sourceId: sessionId }, select: { id: true } })
      ).map((w) => w.id);

      // Embed the incoming steps BEFORE writing them: the same vectors decide identity and serve
      // hybrid retrieval, so one call does both jobs instead of two.
      const stepTexts = workflows.map((wf) => wf.steps.map((step) => distilledStepText(step)));
      const flatTexts = stepTexts.flat();
      let embedWarning: string | null = null;
      let vectors: number[][] | null = null;
      if (flatTexts.length > 0) {
        try {
          vectors = await embedTexts(flatTexts, {
            apiKey: config.openaiApiKey,
            model: config.embedModel || undefined,
            timeoutMs: 60_000, // batch path: generous but bounded (the SDK default is 600s)
            maxRetries: 2,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // On a REPROCESS this is fatal, deliberately. Without vectors we cannot tell which
          // workflow is which, and both alternatives are worse: guessing by position is the bug
          // this stage exists to kill, and detaching everything would unapprove a whole KB over a
          // transient API blip. Throwing here leaves the existing KB and every approval untouched —
          // nothing has been deleted yet.
          if (existingWorkflowIds.length > 0) {
            throw new Error(`cannot verify workflow identity — embedding failed: ${msg}`);
          }
          // A FIRST process has no identity to protect, so it degrades to keyword-only as before.
          embedWarning = `Semantic search is unavailable for this recording (embedding failed: ${msg}) — answers use keyword matching until it is re-processed.`;
          log.warn({ sessionId, err: msg }, 'embedding failed — items stay keyword-only');
        }
      }

      const matched = vectors
        ? matchWorkflowIdentities(fingerprintsFrom(workflows, stepTexts, vectors), existingFingerprints)
        : new Map<number, string>();

      // Detach every existing workflow first so positions are free: a re-split can swap two
      // workflows' indices, and updating them one at a time would collide on the unique key.
      await prisma.workflow.updateMany({
        where: { sourceId: sessionId },
        data: { segmentIndex: null },
      });

      const identified: Array<{ workflowId: string; wf: (typeof workflows)[number] }> = [];
      for (const wf of workflows) {
        const existingId = matched.get(wf.segmentIndex);
        if (existingId) {
          await prisma.workflow.update({
            where: { id: existingId },
            data: { segmentIndex: wf.segmentIndex, title: wf.title },
          });
          identified.push({ workflowId: existingId, wf });
        } else {
          // Nothing here matched it, so it is genuinely new — and born unapproved.
          const created = await prisma.workflow.create({
            data: {
              workspaceId: rec.workspaceId,
              sourceId: sessionId,
              segmentIndex: wf.segmentIndex,
              title: wf.title,
            },
            select: { id: true },
          });
          identified.push({ workflowId: created.id, wf });
        }
      }

      // A workflow that nothing matched has lost its content. Its approval was granted for
      // something that is no longer there, so it stops answering until a human looks at it.
      const keptIds = new Set(identified.map((x) => x.workflowId));
      const detachedIds = existingWorkflowIds.filter((id) => !keptIds.has(id));
      if (detachedIds.length > 0) {
        const { count } = await prisma.copilotApproval.updateMany({
          where: { workflowId: { in: detachedIds }, inactiveReason: null },
          data: { inactiveReason: 'needs_review', inactiveAt: new Date() },
        });
        log.warn(
          { sessionId, detached: detachedIds.length, approvalsSuspended: count },
          'workflows no longer present after reprocess — their approvals need re-review',
        );
      }

      // Replace the recording's KB items idempotently with the freshly distilled steps.
      await prisma.knowledgeItem.deleteMany({ where: { sourceId: sessionId } });
      const rows = identified.flatMap(({ workflowId, wf }) =>
        wf.steps.map((step, i) => ({
          sourceId: sessionId,
          workspaceId: rec.workspaceId,
          workflowId,
          kind: 'step',
          orderIndex: i, // order WITHIN the workflow (retrieval sorts by segmentIndex, then orderIndex)
          text: distilledStepText(step), // searchable: instruction + detail + narration
          segmentIndex: wf.segmentIndex,
          segmentTitle: wf.title,
          data: step as object,
        })),
      );
      if (rows.length > 0) await prisma.knowledgeItem.createMany({ data: rows });

      // P1-M3 — persist the vectors computed above. Raw SQL: Prisma cannot write
      // Unsupported("vector"), and a handful of rows makes per-row updates fine.
      if (vectors && rows.length > 0) {
        const created = await prisma.knowledgeItem.findMany({
          where: { sourceId: sessionId },
          select: { id: true, text: true },
        });
        // Matched on TEXT rather than on read-back order. The order rows come back in need not
        // mirror the order the texts were embedded in, and writing a vector onto the wrong step
        // corrupts retrieval invisibly — the failure would look like bad answers, not a bug.
        const vectorByText = new Map<string, number[]>();
        flatTexts.forEach((t, i) => {
          const v = vectors?.[i];
          if (v && !vectorByText.has(t)) vectorByText.set(t, v);
        });
        let written = 0;
        for (const row of created) {
          const vector = vectorByText.get(row.text);
          if (!vector) continue;
          await prisma.$executeRaw`UPDATE "KnowledgeItem" SET embedding = ${toVectorLiteral(vector)}::vector WHERE id = ${row.id}`;
          written += 1;
        }
        log.info({ sessionId, count: written }, 'embedded items for hybrid retrieval');
      }

      // A degraded-but-successful build (e.g. narration too long to transcribe, or an embedding
      // failure) lands `ready` with the notice in `error` — the Studio shows it as a notice, not
      // a failure.
      const notice = [warning, embedWarning].filter(Boolean).join(' · ') || null;
      await prisma.knowledgeSource.update({
        where: { id: sessionId },
        data: { status: 'ready', error: notice },
      });
      log.info(
        {
          sessionId,
          workflows: workflows.length,
          steps: rows.length,
          segments: transcript.segments.length,
          ...(warning ? { warning } : {}),
        },
        'ready',
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // BullMQ retries this job while attempts remain (attemptsMade is pre-increment inside the
      // processor — see Job.shouldRetryJob). Only the FINAL attempt marks the recording `error`;
      // earlier failures keep it `processing` so the UI doesn't flash Failed→Ready across a retry.
      const willRetry = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
      if (!willRetry) {
        await prisma.knowledgeSource.update({ where: { id: sessionId }, data: { status: 'error', error: msg } });
      }
      log.error(
        { sessionId, jobId: job.id, willRetry, err: msg },
        willRetry ? 'attempt failed (will retry)' : 'failed',
      );
      throw e;
    }
  },
  // Concurrency 1, not 2: in production this worker shares one 512 MB instance with the api that
  // serves the public copilot, and a synthesis job holds whole screenshots in memory for the vision
  // calls. Two at once is the realistic OOM path, and an OOM kills the copilot too. Throughput is
  // not the constraint here — recordings arrive one at a time, from a human pressing Stop.
  { connection, concurrency: 1 },
);

worker.on('ready', () => log.info({ queue: SYNTHESIS_QUEUE }, 'listening on queue'));
worker.on('failed', (job, err) => log.error({ jobId: job?.id, err: err?.message }, 'job failed'));
// An emitted 'error' with no listener throws and can take the process down — on the free tier the
// worker shares a process with the public API (all.ts), so a Redis hiccup must never crash it.
// Throttled like the queue handlers (one line / 30s).
let lastWorkerErrLog = 0;
worker.on('error', (err) => {
  const now = Date.now();
  if (now - lastWorkerErrLog < 30_000) return;
  lastWorkerErrLog = now;
  log.error({ err: err?.message || String(err) }, 'Redis connection error (jobs resume when it recovers)');
});

// Graceful shutdown (§3.4): worker.close() waits for the in-flight job (BullMQ default), so a
// deploy doesn't hard-kill mid-distillation when the job can finish in time. If it can't, the
// unref'd failsafe exits before the host's SIGKILL — the job then recovers via retries (attempts:3)
// or, past those, the Recordings "Stalled → Re-process" surface. Coexists with the API's handler
// in the combined all.ts process (both are `once` listeners; neither exits in the happy path).
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    log.info({ signal }, 'signal received — closing (waiting for any in-flight job)');
    setTimeout(() => process.exit(0), 25_000).unref();
    void worker
      .close()
      .then(() => prisma.$disconnect())
      .catch(() => {});
  });
}
