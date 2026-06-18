import { Worker } from 'bullmq';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { SYNTHESIS_QUEUE } from '@sync/shared';
import type { CapturedEvent, SessionManifest } from '@sync/shared';
import { prisma } from '@sync/db';
import { synthesizeSession } from '@sync/synthesis';
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

    const rec = await prisma.recSession.findUnique({ where: { id: sessionId } });
    if (!rec) {
      console.warn(`[worker] session ${sessionId} not found — skipping`);
      return;
    }
    await prisma.recSession.update({ where: { id: sessionId }, data: { status: 'processing' } });

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

      const articles = await synthesizeSession({
        manifest,
        getArtifact,
        apiKey: config.openaiApiKey,
        transcribeModel: config.transcribeModel,
        synthModel: config.synthModel,
      });

      // Idempotent: replace any prior articles for this session.
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

      await prisma.recSession.update({ where: { id: sessionId }, data: { status: 'done', error: null } });
      console.log(`[worker] done ${sessionId}: ${articles.length} article(s)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.recSession.update({ where: { id: sessionId }, data: { status: 'error', error: msg } });
      console.error(`[worker] failed ${sessionId}: ${msg}`);
      throw e;
    }
  },
  { connection, concurrency: 2 },
);

worker.on('ready', () => console.log(`[worker] listening on queue "${SYNTHESIS_QUEUE}"`));
worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed:`, err?.message));
