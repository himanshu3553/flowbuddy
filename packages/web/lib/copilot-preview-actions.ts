'use server';

import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';
import { answerFromKB, retrieveApprovedKBItems, sanitizeHistory } from '@sync/synthesis';

/**
 * In-Studio copilot tester (Approach A) — answer a question through the SAME grounding engine the
 * embedded widget uses, but authenticated by the logged-in Studio SESSION instead of the public
 * embeddable key. This lets an owner test the copilot here without embedding it, and is the seam
 * a future appearance-preview builds on.
 *
 * Retrieval is the SHARED `retrieveApprovedKBItems` from @sync/synthesis — the exact function the
 * public answer endpoint runs — so the preview cannot drift from production answers (it used to:
 * a local copy here was missing the route-boost).
 *
 * Deliberately does NOT write a CopilotQuery or CoverageGap: a preview/test is not real end-user
 * traffic, so it must not pollute "Copilot activity" analytics or create false coverage gaps.
 * Answer *content* is identical to production (same approved-KB, same engine) — only auth + logging
 * differ.
 */

export interface PreviewResult {
  covered: boolean;
  answer: string | null;
  citations: { segmentTitle: string | null }[];
  reason: string | null;
  /** A system/config failure (bad key, model error) — distinct from an honest content decline. */
  error?: boolean;
}

export async function previewCopilotAnswer(
  question: string,
  history: unknown,
): Promise<PreviewResult> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');

  const q = (question ?? '').trim();
  if (!q) throw new Error('question is required');

  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) {
    // Config gap, not a content decline — surface it clearly instead of throwing a blanket 500.
    return {
      covered: false,
      answer: null,
      citations: [],
      reason: 'The copilot isn’t configured on the server yet — set OPENAI_API_KEY on the Studio service.',
      error: true,
    };
  }
  const model = process.env.SYNTH_MODEL || 'gpt-4o';

  // Empty ⇔ the workspace has no approved content at all (the shortlist otherwise always returns
  // up to `limit` items) — the tester has no host page, so no contextPath route-boost applies.
  const items = await retrieveApprovedKBItems(prisma, ctx.workspace.id, q);
  if (items.length === 0) {
    return {
      covered: false,
      answer: null,
      citations: [],
      reason: 'This copilot has no approved help content yet — approve a workflow to test it.',
    };
  }

  let result;
  try {
    result = await answerFromKB({
      question: q,
      history: sanitizeHistory(history),
      items,
      showCitations: ctx.workspace.copilotShowCitations,
      apiKey,
      model,
    });
  } catch (e) {
    console.error('[copilot-preview] answerFromKB failed:', e);
    return {
      covered: false,
      answer: null,
      citations: [],
      reason: 'The copilot ran into an error reaching the model. Check the Studio server logs.',
      error: true,
    };
  }

  if (!result.covered) {
    return { covered: false, answer: null, citations: [], reason: result.reason };
  }
  return {
    covered: true,
    answer: result.answer,
    citations: result.citations.map((c) => ({ segmentTitle: c.segmentTitle })),
    reason: null,
  };
}
