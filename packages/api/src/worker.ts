import { Worker } from 'bullmq';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { SYNTHESIS_QUEUE } from '@sync/shared';
import type { CapturedEvent, SessionManifest } from '@sync/shared';
import { prisma } from '@sync/db';
import { buildKB, createArticlesFromItems, type KbStepItem } from '@sync/synthesis';
import { config } from './config';
import { connection } from './queue';
import { s3, sessionKey } from './storage';

function shotKeyFor(
  eventId: string | undefined,
  events: CapturedEvent[],
  workspaceId: string,
  sessionId: string,
): string | null {
  if (!eventId) return null;
  const ev = events.find((e) => e.id === eventId);
  if (!ev?.screenshot?.file) return null;
  return sessionKey(workspaceId, sessionId, ev.screenshot.file);
}

/** The clicked element's bbox as fractions (0..1) of the viewport — for the highlight rectangle. */
function highlightFor(
  eventId: string | undefined,
  events: CapturedEvent[],
  viewport: { w: number; h: number } | undefined,
): { x: number; y: number; w: number; h: number } | undefined {
  if (!eventId || !viewport?.w || !viewport?.h) return undefined;
  const b = events.find((e) => e.id === eventId)?.target?.bbox;
  if (!b) return undefined;
  const x = Math.min(Math.max(b.x / viewport.w, 0), 1);
  const y = Math.min(Math.max(b.y / viewport.h, 0), 1);
  const w = Math.min(Math.max(b.w / viewport.w, 0), 1 - x);
  const h = Math.min(Math.max(b.h / viewport.h, 0), 1 - y);
  if (w <= 0 || h <= 0) return undefined;
  return { x, y, w, h };
}

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

      // ── Module 3.1: KB → articles (read items back from the DB; segment-at-creation, Option B) ──
      const dbItems = await prisma.knowledgeItem.findMany({
        where: { sourceId: sessionId, kind: 'step' },
        orderBy: { orderIndex: 'asc' },
      });
      const stepItems: KbStepItem[] = dbItems.map((i) => {
        const d = i.data as unknown as { event: CapturedEvent; narration: string | null };
        return { orderIndex: i.orderIndex, kind: 'step', text: i.text, event: d.event, narration: d.narration ?? null };
      });

      const { articles, segments } = await createArticlesFromItems({
        items: stepItems,
        markers: manifest.markers || [],
        getArtifact,
        apiKey: config.openaiApiKey,
        synthModel: config.synthModel,
      });

      // Tag each KB item with the workflow segment it belongs to (Path 2 — persisted grouping for the KB UI).
      const eventToItemId = new Map(
        dbItems.map((i) => [(i.data as unknown as { event: CapturedEvent }).event.id, i.id]),
      );
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

      // Idempotent: replace any prior articles for this source.
      await prisma.article.deleteMany({ where: { sessionId } });
      for (let i = 0; i < articles.length; i++) {
        const a = articles[i]!;
        await prisma.article.create({
          data: {
            workspaceId: rec.workspaceId,
            sessionId,
            title: a.title,
            intent: a.intent ?? null,
            tags: a.tags,
            routes: a.routes,
            preconditions: a.preconditions,
            source: 'recording_auto',
            type: 'workflow_backed',
            status: 'draft',
            orderIndex: i,
            steps: {
              create: a.steps.map((s, j) => ({
                orderIndex: j,
                instruction: s.instruction,
                rationale: s.rationale ?? null,
                selector: s.selector ?? null,
                route: s.route ?? null,
                expectedOutcome: s.expectedOutcome ?? null,
                uncertain: Boolean(s.uncertain),
                screenshotKey: shotKeyFor(s.screenshotEventId, manifest.events, rec.workspaceId, sessionId),
                highlight: highlightFor(s.screenshotEventId, manifest.events, manifest.app?.viewport) ?? undefined,
              })),
            },
          },
        });
      }

      await prisma.knowledgeSource.update({ where: { id: sessionId }, data: { status: 'done', error: null } });
      console.log(`[worker] done ${sessionId}: ${articles.length} article(s) from ${stepItems.length} items`);
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
