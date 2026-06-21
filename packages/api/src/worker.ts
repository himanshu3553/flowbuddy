import { Worker } from 'bullmq';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { SYNTHESIS_QUEUE } from '@sync/shared';
import type { CapturedEvent, SessionManifest } from '@sync/shared';
import { prisma } from '@sync/db';
import { buildKB, segmentItems, type KbStepItem } from '@sync/synthesis';
import { config } from './config';
import { connection } from './queue';
import { s3, sessionKey } from './storage';

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

      const getArtifact = async (relPath: string): Promise<Buffer | null> => {
        try {
          const obj = await s3.send(
            new GetObjectCommand({ Bucket: config.r2.bucket, Key: sessionKey(rec.workspaceId, sessionId, relPath) }),
          );
          const bytes = await (obj.Body as any).transformToByteArray();
          return Buffer.from(bytes);
        } catch {
          return null;
        }
      };

      // ── Module 2: capture → Knowledge Base (transcribe + normalized step items) ──
      const { transcript, items } = await buildKB({
        manifest,
        getArtifact,
        apiKey: config.openaiApiKey,
        transcribeModel: config.transcribeModel,
      });
      await prisma.knowledgeSource.update({
        where: { id: sessionId },
        data: { transcript: transcript as object },
      });
      await prisma.knowledgeItem.deleteMany({ where: { sourceId: sessionId } });
      if (items.length > 0) {
        await prisma.knowledgeItem.createMany({
          data: items.map((it) => ({
            sourceId: sessionId,
            workspaceId: rec.workspaceId,
            kind: it.kind,
            orderIndex: it.orderIndex,
            text: it.text,
            data: { event: it.event, narration: it.narration } as object,
          })),
        });
      }
      console.log(`[worker] KB built: transcript(${transcript.segments.length} seg) + ${items.length} items`);

      // ── Module 2 (cont.): segment the KB into workflow candidates + tag items (Option C) ──
      // Curated flow (M6.1): we STOP here. No synthesis, no articles — the user generates
      // selected candidates later from Studio. Segmentation persists candidate titles only.
      const dbItems = await prisma.knowledgeItem.findMany({
        where: { sourceId: sessionId, kind: 'step' },
        orderBy: { orderIndex: 'asc' },
      });
      const stepItems: KbStepItem[] = dbItems.map((i) => {
        const d = i.data as unknown as { event: CapturedEvent; narration: string | null };
        return { orderIndex: i.orderIndex, kind: 'step', text: i.text, event: d.event, narration: d.narration ?? null };
      });

      const segments = await segmentItems({
        items: stepItems,
        markers: manifest.markers || [],
        apiKey: config.openaiApiKey,
        synthModel: config.synthModel,
      });

      // Tag each KB item with the workflow candidate it belongs to (these titles become the
      // candidates the Studio "Auto Generate Articles" picker lists).
      const eventToItemId = new Map(
        dbItems.map((i) => [(i.data as unknown as { event: CapturedEvent }).event.id, i.id]),
      );
      // Reset tags first so re-processing is idempotent.
      await prisma.knowledgeItem.updateMany({
        where: { sourceId: sessionId },
        data: { segmentIndex: null, segmentTitle: null },
      });
      for (let si = 0; si < segments.length; si++) {
        const seg = segments[si]!;
        const itemIds = seg.eventIds
          .map((eid) => eventToItemId.get(eid))
          .filter((x): x is string => Boolean(x));
        if (itemIds.length > 0) {
          await prisma.knowledgeItem.updateMany({
            where: { id: { in: itemIds } },
            data: { segmentIndex: si, segmentTitle: seg.title },
          });
        }
      }

      await prisma.knowledgeSource.update({ where: { id: sessionId }, data: { status: 'ready', error: null } });
      console.log(`[worker] ready ${sessionId}: ${segments.length} workflow candidate(s) from ${stepItems.length} items (no articles — curated generation)`);
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
