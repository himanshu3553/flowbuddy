import { Worker } from 'bullmq';
import { SYNTHESIS_QUEUE } from '@sync/shared';
import type { SessionManifest } from '@sync/shared';
import { prisma } from '@sync/db';
import { buildWorkflowKB, distilledStepText, embedTexts, toVectorLiteral } from '@sync/synthesis';
import { createLogger } from '@sync/logger';
import { config } from './config';
import { connection } from './queue';
import { sessionArtifactReader } from './storage';

const log = createLogger('worker');

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
    await prisma.knowledgeSource.update({ where: { id: sessionId }, data: { status: 'processing' } });

    try {
      const manifest = rec.manifest as unknown as SessionManifest;
      const getArtifact = sessionArtifactReader(rec.workspaceId, sessionId);

      // ── Module 2 (LIVE copilot path): capture → distilled workflow KB ──
      // transcribe → align → clean (B) → segment → distill (A). Persists clean steps grouped by
      // workflow (segmentIndex/segmentTitle); raw events are NOT stored. See docs/kb-step-distillation.md.
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

      // Replace the recording's KB items idempotently with the freshly distilled steps.
      await prisma.knowledgeItem.deleteMany({ where: { sourceId: sessionId } });
      const rows = workflows.flatMap((wf) =>
        wf.steps.map((step, i) => ({
          sourceId: sessionId,
          workspaceId: rec.workspaceId,
          kind: 'step',
          orderIndex: i, // order WITHIN the workflow (retrieval sorts by segmentIndex, then orderIndex)
          text: distilledStepText(step), // searchable: instruction + detail + narration
          segmentIndex: wf.segmentIndex,
          segmentTitle: wf.title,
          data: step as object,
        })),
      );
      if (rows.length > 0) await prisma.knowledgeItem.createMany({ data: rows });

      // P1-M3 — embed the fresh items for hybrid retrieval (delete+recreate above means a
      // re-process re-embeds automatically). STRICTLY best-effort: an embedding failure never
      // fails the KB build — the items simply stay keyword-only until the next (re)process — but
      // it must not be invisible either (review hardening 2026-07-07): the failure surfaces as a
      // degraded-build notice on the recording (the §3.3 mechanism), not just a log line.
      let embedWarning: string | null = null;
      if (rows.length > 0) {
        try {
          const created = await prisma.knowledgeItem.findMany({
            where: { sourceId: sessionId },
            select: { id: true, text: true },
          });
          const vectors = await embedTexts(created.map((r) => r.text), {
            apiKey: config.openaiApiKey,
            model: config.embedModel || undefined,
            timeoutMs: 60_000, // batch path: generous but bounded (the SDK default is 600s)
            maxRetries: 2,
          });
          // Raw SQL — Prisma can't write Unsupported("vector"); a handful of rows, so per-row is fine.
          for (const [i, row] of created.entries()) {
            const vector = vectors[i];
            if (!vector) continue; // unreachable (embedTexts enforces 1:1 + dims) — never write a wrong row
            await prisma.$executeRaw`UPDATE "KnowledgeItem" SET embedding = ${toVectorLiteral(vector)}::vector WHERE id = ${row.id}`;
          }
          log.info({ sessionId, count: created.length }, 'embedded items for hybrid retrieval');
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          embedWarning = `Semantic search is unavailable for this recording (embedding failed: ${msg}) — answers use keyword matching until it is re-processed.`;
          log.warn({ sessionId, err: msg }, 'embedding failed — items stay keyword-only');
        }
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
  { connection, concurrency: 2 },
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
