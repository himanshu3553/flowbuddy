// PARKED — Phase 2 (Help Portal & Articles). Dormant for the Phase-1 copilot release; not
// reachable from the shipped product. Kept in-tree (type-checked) so Phase 2 resumes from it —
// do not delete. Inventory + re-wiring steps: docs/phase-2-portal.md → "Parked Phase 2 code".
'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@sync/db';
import type { Bbox, SessionManifest } from '@sync/shared';
import { promptToArticle, decodeStepData, type PromptItem, type PromptArtifactReader } from '@sync/synthesis';
import { getCurrentWorkspace } from '@/lib/session';
import { artifactReader, sessionObjectKey } from '@/lib/storage';
import { highlightFromBbox } from '@/lib/highlight';
import { createDraftArticle, type ScreenshotResolver } from '@/lib/article-writer';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'how', 'do', 'i', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'is', 'my',
  'me', 'you', 'your', 'what', 'can', 'with', 'this', 'that', 'it', 'create', 'make', 'get', 'set',
]);

function keywords(prompt: string): string[] {
  const words = prompt
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return [...new Set(words)];
}

export type PromptResult =
  | { ok: true; articleId: string; title: string }
  | { ok: false; reason: string; gapId: string };

/**
 * Module 3.2 — generate an article from a topic prompt, grounded in the whole-workspace KB
 * (across recordings). Keyword-shortlist KB items → LLM selects + synthesizes or declines.
 * Declines log a CoverageGap. Synchronous server action (per the locked decision).
 */
export async function generateFromPrompt(prompt: string): Promise<PromptResult> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const workspaceId = ctx.workspace.id;

  const topic = prompt.trim();
  if (!topic) throw new Error('Enter a topic.');

  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured for the web app');
  const synthModel = process.env.SYNTH_MODEL || 'gpt-4o';

  // ── Retrieve: keyword shortlist over KnowledgeItem.text across all recordings ──
  const words = keywords(topic);
  const where =
    words.length > 0
      ? { workspaceId, kind: 'step', OR: words.map((w) => ({ text: { contains: w, mode: 'insensitive' as const } })) }
      : { workspaceId, kind: 'step' };
  const rows = await prisma.knowledgeItem.findMany({
    where,
    orderBy: [{ sourceId: 'asc' }, { orderIndex: 'asc' }],
    take: 40,
  });

  const items: PromptItem[] = rows.map((r) => ({ sourceId: r.sourceId, ...decodeStepData(r.data) }));

  // Per-source viewport (for highlight rectangles) + an event→source/file index (for screenshots).
  // Steps can span recordings, so each event must resolve against the source it came from.
  const sourceIds = [...new Set(items.map((i) => i.sourceId))];
  const sources = await prisma.knowledgeSource.findMany({ where: { id: { in: sourceIds } }, select: { id: true, manifest: true } });
  const viewportBySource = new Map<string, { w: number; h: number } | undefined>();
  for (const s of sources) {
    viewportBySource.set(s.id, (s.manifest as unknown as SessionManifest).app?.viewport);
  }
  const eventIndex = new Map<string, { sourceId: string; file?: string; bbox?: Bbox }>();
  for (const it of items) {
    eventIndex.set(it.event.id, { sourceId: it.sourceId, file: it.event.screenshot?.file, bbox: it.event.target?.bbox });
  }

  const getArtifact: PromptArtifactReader = (sourceId, file) => artifactReader(workspaceId, sourceId)(file);

  // ── Synthesize or decline ──
  const result = await promptToArticle({ prompt: topic, items, getArtifact, apiKey, synthModel });

  if (!result.covered) {
    const gap = await prisma.coverageGap.create({ data: { workspaceId, prompt: topic, reason: result.reason } });
    revalidatePath('/dashboard');
    return { ok: false, reason: result.reason, gapId: gap.id };
  }

  const resolveScreenshot: ScreenshotResolver = (eventId) => {
    const idx = eventId ? eventIndex.get(eventId) : undefined;
    if (!idx) return { screenshotKey: null };
    return {
      screenshotKey: idx.file ? sessionObjectKey(workspaceId, idx.sourceId, idx.file) : null,
      highlight: highlightFromBbox(idx.bbox, viewportBySource.get(idx.sourceId)),
    };
  };

  const created = await createDraftArticle({
    workspaceId,
    sessionId: null, // prompt-grounded articles can span recordings — no single source
    source: 'prompt_grounded',
    orderIndex: 0,
    article: result.article,
    resolveScreenshot,
  });

  revalidatePath('/dashboard');
  return { ok: true, articleId: created.id, title: created.title };
}
