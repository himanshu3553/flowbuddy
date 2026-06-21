'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@sync/db';
import type { CapturedEvent, SessionManifest } from '@sync/shared';
import { generateArticleForSegment, type KbStepItem } from '@sync/synthesis';
import { getCurrentWorkspace } from '@/lib/session';
import { artifactReader, sessionObjectKey } from '@/lib/storage';

/** R2 object key of the screenshot illustrating a step (resolved from the captured event). */
function shotKeyFor(
  eventId: string | undefined,
  events: CapturedEvent[],
  workspaceId: string,
  sessionId: string,
): string | null {
  if (!eventId) return null;
  const ev = events.find((e) => e.id === eventId);
  if (!ev?.screenshot?.file) return null;
  return sessionObjectKey(workspaceId, sessionId, ev.screenshot.file);
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

/**
 * Curated generation (M6.1): synthesize the selected workflow candidates of ONE recording into
 * draft articles. Synchronous server action (per the locked decision). Skips candidates already
 * generated; idempotent on (sessionId, segmentIndex).
 */
export async function generateArticles(input: {
  sourceId: string;
  segmentIndexes: number[];
}): Promise<{ created: number }> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const workspaceId = ctx.workspace.id;

  const source = await prisma.knowledgeSource.findFirst({ where: { id: input.sourceId, workspaceId } });
  if (!source) throw new Error('Recording not found');

  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured for the web app');
  const synthModel = process.env.SYNTH_MODEL || 'gpt-4o';

  const manifest = source.manifest as unknown as SessionManifest;
  const getArtifact = artifactReader(workspaceId, source.id);

  let created = 0;
  for (const segmentIndex of input.segmentIndexes) {
    // Skip if this candidate already has an article (idempotent / no duplicates).
    const existing = await prisma.article.findFirst({
      where: { workspaceId, sessionId: source.id, segmentIndex },
      select: { id: true },
    });
    if (existing) continue;

    const dbItems = await prisma.knowledgeItem.findMany({
      where: { sourceId: source.id, kind: 'step', segmentIndex },
      orderBy: { orderIndex: 'asc' },
    });
    if (dbItems.length === 0) continue;

    const title = dbItems[0]?.segmentTitle ?? `Workflow ${segmentIndex + 1}`;
    const items: KbStepItem[] = dbItems.map((i) => {
      const d = i.data as unknown as { event: CapturedEvent; narration: string | null };
      return { orderIndex: i.orderIndex, kind: 'step', text: i.text, event: d.event, narration: d.narration ?? null };
    });

    const a = await generateArticleForSegment({ items, title, getArtifact, apiKey, synthModel });

    const orderIndex = await prisma.article.count({ where: { workspaceId, sessionId: source.id } });
    await prisma.article.create({
      data: {
        workspaceId,
        sessionId: source.id,
        title: a.title,
        intent: a.intent ?? null,
        tags: a.tags,
        routes: a.routes,
        preconditions: a.preconditions,
        source: 'recording_auto',
        type: 'workflow_backed',
        status: 'draft',
        orderIndex,
        segmentIndex,
        segmentTitle: title,
        steps: {
          create: a.steps.map((s, j) => ({
            orderIndex: j,
            instruction: s.instruction,
            rationale: s.rationale ?? null,
            selector: s.selector ?? null,
            route: s.route ?? null,
            expectedOutcome: s.expectedOutcome ?? null,
            uncertain: Boolean(s.uncertain),
            screenshotKey: shotKeyFor(s.screenshotEventId, manifest.events, workspaceId, source.id),
            highlight: highlightFor(s.screenshotEventId, manifest.events, manifest.app?.viewport) ?? undefined,
          })),
        },
      },
    });
    created++;
  }

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/kb/${source.id}`);
  return { created };
}
