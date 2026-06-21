'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@sync/db';
import type { SessionManifest } from '@sync/shared';
import { generateArticleForSegment, decodeStepData, type KbStepItem } from '@sync/synthesis';
import { getCurrentWorkspace } from '@/lib/session';
import { artifactReader, sessionObjectKey } from '@/lib/storage';
import { highlightFromBbox } from '@/lib/highlight';
import { createDraftArticle, type ScreenshotResolver } from '@/lib/article-writer';

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

  // All steps come from this one recording, so resolve screenshots against its manifest.
  const eventById = new Map(manifest.events.map((e) => [e.id, e]));
  const resolveScreenshot: ScreenshotResolver = (eventId) => {
    const ev = eventId ? eventById.get(eventId) : undefined;
    return {
      screenshotKey: ev?.screenshot?.file ? sessionObjectKey(workspaceId, source.id, ev.screenshot.file) : null,
      highlight: highlightFromBbox(ev?.target?.bbox, manifest.app?.viewport),
    };
  };

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
    const items: KbStepItem[] = dbItems.map((i) => ({
      orderIndex: i.orderIndex,
      kind: 'step',
      text: i.text,
      ...decodeStepData(i.data),
    }));

    const article = await generateArticleForSegment({ items, title, getArtifact, apiKey, synthModel });

    const orderIndex = await prisma.article.count({ where: { workspaceId, sessionId: source.id } });
    await createDraftArticle({
      workspaceId,
      sessionId: source.id,
      source: 'recording_auto',
      segmentIndex,
      segmentTitle: title,
      orderIndex,
      article,
      resolveScreenshot,
    });
    created++;
  }

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/kb/${source.id}`);
  return { created };
}
