import { Worker } from 'bullmq';
import { SYNTHESIS_QUEUE } from '@sync/shared';
import type { SessionManifest } from '@sync/shared';
import { prisma } from '@sync/db';
import { buildWorkflowKB, distilledStepText } from '@sync/synthesis';
import { config } from './config';
import { connection } from './queue';
import { sessionArtifactReader } from './storage';

const worker = new Worker(
  SYNTHESIS_QUEUE,
  async (job) => {
    const sessionId = job.data.sessionId as string;
    console.log(`[worker] processing session ${sessionId}`);

    const rec = await prisma.knowledgeSource.findUnique({ where: { id: sessionId } });
    if (!rec) {
      console.warn(`[worker] source ${sessionId} not found — skipping`);
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

      // A degraded-but-successful build (e.g. narration too long to transcribe) lands `ready`
      // with the warning in `error` — the Studio shows it as a notice, not a failure.
      await prisma.knowledgeSource.update({
        where: { id: sessionId },
        data: { status: 'ready', error: warning ?? null },
      });
      console.log(
        `[worker] ready ${sessionId}: ${workflows.length} workflow(s), ${rows.length} distilled step(s) ` +
          `from transcript(${transcript.segments.length} seg)${warning ? ` — WARNING: ${warning}` : ''}`,
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
      console.error(`[worker] ${willRetry ? 'attempt failed (will retry)' : 'failed'} ${sessionId}: ${msg}`);
      throw e;
    }
  },
  { connection, concurrency: 2 },
);

worker.on('ready', () => console.log(`[worker] listening on queue "${SYNTHESIS_QUEUE}"`));
worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed:`, err?.message));
// An emitted 'error' with no listener throws and can take the process down — on the free tier the
// worker shares a process with the public API (all.ts), so a Redis hiccup must never crash it.
// Throttled like the queue handlers (one line / 30s).
let lastWorkerErrLog = 0;
worker.on('error', (err) => {
  const now = Date.now();
  if (now - lastWorkerErrLog < 30_000) return;
  lastWorkerErrLog = now;
  console.error('[worker] Redis connection error (jobs resume when it recovers):', err?.message || err);
});

// Graceful shutdown (§3.4): worker.close() waits for the in-flight job (BullMQ default), so a
// deploy doesn't hard-kill mid-distillation when the job can finish in time. If it can't, the
// unref'd failsafe exits before the host's SIGKILL — the job then recovers via retries (attempts:3)
// or, past those, the Recordings "Stalled → Re-process" surface. Coexists with the API's handler
// in the combined all.ts process (both are `once` listeners; neither exits in the happy path).
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    console.log(`[worker] ${signal} received — closing (waiting for any in-flight job)`);
    setTimeout(() => process.exit(0), 25_000).unref();
    void worker
      .close()
      .then(() => prisma.$disconnect())
      .catch(() => {});
  });
}
