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
      const { transcript, workflows } = await buildWorkflowKB({
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

      await prisma.knowledgeSource.update({ where: { id: sessionId }, data: { status: 'ready', error: null } });
      console.log(
        `[worker] ready ${sessionId}: ${workflows.length} workflow(s), ${rows.length} distilled step(s) ` +
          `from transcript(${transcript.segments.length} seg)`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.knowledgeSource.update({ where: { id: sessionId }, data: { status: 'error', error: msg } });
      console.error(`[worker] failed ${sessionId}: ${msg}`);
      throw e;
    }
  },
  { connection, concurrency: 2 },
);

worker.on('ready', () => console.log(`[worker] listening on queue "${SYNTHESIS_QUEUE}"`));
worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed:`, err?.message));
