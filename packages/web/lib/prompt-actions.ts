'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@sync/db';
import type { CapturedEvent, SessionManifest } from '@sync/shared';
import { promptToArticle, type PromptItem, type PromptArtifactReader } from '@sync/synthesis';
import { getCurrentWorkspace } from '@/lib/session';
import { artifactReader, sessionObjectKey } from '@/lib/storage';

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

function highlightFor(
  bbox: { x: number; y: number; w: number; h: number } | undefined,
  viewport: { w: number; h: number } | undefined,
): { x: number; y: number; w: number; h: number } | undefined {
  if (!bbox || !viewport?.w || !viewport?.h) return undefined;
  const x = Math.min(Math.max(bbox.x / viewport.w, 0), 1);
  const y = Math.min(Math.max(bbox.y / viewport.h, 0), 1);
  const w = Math.min(Math.max(bbox.w / viewport.w, 0), 1 - x);
  const h = Math.min(Math.max(bbox.h / viewport.h, 0), 1 - y);
  if (w <= 0 || h <= 0) return undefined;
  return { x, y, w, h };
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

  const items: PromptItem[] = rows.map((r) => {
    const d = r.data as unknown as { event: CapturedEvent; narration: string | null };
    return { sourceId: r.sourceId, event: d.event, narration: d.narration ?? null };
  });

  // Per-source viewport (for highlight rectangles) + an event→source/file index (for screenshots).
  const sourceIds = [...new Set(items.map((i) => i.sourceId))];
  const sources = await prisma.knowledgeSource.findMany({ where: { id: { in: sourceIds } }, select: { id: true, manifest: true } });
  const viewportBySource = new Map<string, { w: number; h: number } | undefined>();
  for (const s of sources) {
    const m = s.manifest as unknown as SessionManifest;
    viewportBySource.set(s.id, m.app?.viewport);
  }
  const eventIndex = new Map<string, { sourceId: string; file?: string; bbox?: { x: number; y: number; w: number; h: number } }>();
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

  const a = result.article;
  const created = await prisma.article.create({
    data: {
      workspaceId,
      sessionId: null, // prompt-grounded articles can span recordings — no single source
      title: a.title,
      intent: a.intent ?? null,
      tags: a.tags,
      routes: a.routes,
      preconditions: a.preconditions,
      source: 'prompt_grounded',
      type: 'workflow_backed',
      status: 'draft',
      orderIndex: 0,
      steps: {
        create: a.steps.map((s, j) => {
          const idx = s.screenshotEventId ? eventIndex.get(s.screenshotEventId) : undefined;
          const screenshotKey = idx?.file ? sessionObjectKey(workspaceId, idx.sourceId, idx.file) : null;
          const highlight = idx ? highlightFor(idx.bbox, viewportBySource.get(idx.sourceId)) : undefined;
          return {
            orderIndex: j,
            instruction: s.instruction,
            rationale: s.rationale ?? null,
            selector: s.selector ?? null,
            route: s.route ?? null,
            expectedOutcome: s.expectedOutcome ?? null,
            uncertain: Boolean(s.uncertain),
            screenshotKey,
            highlight: highlight ?? undefined,
          };
        }),
      },
    },
  });

  revalidatePath('/dashboard');
  return { ok: true, articleId: created.id, title: created.title };
}

export async function resolveCoverageGap(gapId: string): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const gap = await prisma.coverageGap.findUnique({ where: { id: gapId } });
  if (!gap || gap.workspaceId !== ctx.workspace.id) throw new Error('Not found');
  await prisma.coverageGap.update({ where: { id: gapId }, data: { status: 'resolved' } });
  revalidatePath('/dashboard');
}
