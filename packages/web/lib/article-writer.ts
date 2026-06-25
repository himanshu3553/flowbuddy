// PARKED — Phase 2 (Help Portal & Articles). Dormant for the Phase-1 copilot release; not
// reachable from the shipped product. Kept in-tree (type-checked) so Phase 2 resumes from it —
// do not delete. Inventory + re-wiring steps: docs/phase-2-portal.md → "Parked Phase 2 code".
import { prisma } from '@sync/db';
import type { ArticleSource, Highlight } from '@sync/shared';
import type { SynthArticle } from '@sync/synthesis';

/** How a step's screenshot key + highlight are resolved from the event it references.
 *  Curated generation resolves within one recording; prompt-to-article resolves per-event
 *  source (steps can span recordings) — so each caller supplies its own resolver. */
export type ScreenshotResolver = (eventId: string | undefined) => {
  screenshotKey: string | null;
  highlight?: Highlight;
};

export interface DraftArticleInput {
  workspaceId: string;
  /** The recording this article came from, or null for prompt-grounded (may span recordings). */
  sessionId: string | null;
  source: ArticleSource;
  /** Links a curated article back to its workflow candidate (M6.1); null for prompt-grounded. */
  segmentIndex?: number | null;
  segmentTitle?: string | null;
  orderIndex: number;
  article: SynthArticle;
  resolveScreenshot: ScreenshotResolver;
}

/**
 * Persist a draft `Article` + its `Step`s in one place. Shared by curated generation (M6.1)
 * and prompt-to-article (M7) so the write shape — field mapping, draft status, per-step
 * screenshot/highlight resolution — lives in exactly one spot.
 */
export async function createDraftArticle(input: DraftArticleInput): Promise<{ id: string; title: string }> {
  const a = input.article;
  return prisma.article.create({
    data: {
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      title: a.title,
      intent: a.intent ?? null,
      tags: a.tags,
      routes: a.routes,
      preconditions: a.preconditions,
      source: input.source,
      type: 'workflow_backed',
      status: 'draft',
      orderIndex: input.orderIndex,
      segmentIndex: input.segmentIndex ?? null,
      segmentTitle: input.segmentTitle ?? null,
      steps: {
        create: a.steps.map((s, j) => {
          const { screenshotKey, highlight } = input.resolveScreenshot(s.screenshotEventId);
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
    select: { id: true, title: true },
  });
}
