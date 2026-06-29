'use server';

import { listApprovedItems } from '@/lib/copilot-approvals';
import { getCurrentWorkspace } from '@/lib/session';
import { answerFromKB, type CopilotKBItem, type CopilotTurn } from '@sync/synthesis';

/**
 * In-Studio copilot tester (Approach A) — answer a question through the SAME grounding engine the
 * embedded widget uses (`listApprovedItems` → `answerFromKB`), but authenticated by the logged-in
 * Studio SESSION instead of the public embeddable key. This lets an owner test the copilot here
 * without embedding it, and is the seam a future appearance-preview builds on.
 *
 * Deliberately does NOT write a CopilotQuery or CoverageGap: a preview/test is not real end-user
 * traffic, so it must not pollute "Copilot activity" analytics or create false coverage gaps.
 * Answer *content* is identical to production (same approved-KB, same engine) — only auth + logging
 * differ. Mirrors the retrieval shortlist in packages/api/src/copilot.ts (keyword-first).
 */

const STOP = new Set([
  'the', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'how', 'do', 'does',
  'i', 'my', 'can', 'it', 'with', 'what', 'where', 'why', 'this', 'that', 'you', 'your', 'me', 'we',
]);

export interface PreviewResult {
  covered: boolean;
  answer: string | null;
  citations: { segmentTitle: string | null }[];
  reason: string | null;
  /** A system/config failure (bad key, model error) — distinct from an honest content decline. */
  error?: boolean;
}

type ApprovedRow = Awaited<ReturnType<typeof listApprovedItems>>[number];

/** Top `limit` approved items by term overlap with the question (keyword shortlist). */
function shortlist(approved: ApprovedRow[], question: string, limit = 24): CopilotKBItem[] {
  const terms = [
    ...new Set(question.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t))),
  ];
  const scored = approved.map((i) => {
    const hay = i.text.toLowerCase();
    let score = 0;
    for (const t of terms) if (hay.includes(t)) score++;
    return { i, score };
  });
  // Highest term-overlap first; ties keep KB order. Always return up to `limit` (even on 0 matches)
  // so the LLM judges coverage rather than us hard-declining on a keyword miss.
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ i }) => ({
    id: i.id,
    sourceId: i.sourceId,
    segmentIndex: i.segmentIndex,
    segmentTitle: i.segmentTitle,
    text: i.text,
    narration: ((i.data as { narration?: string | null } | null) ?? {}).narration ?? null,
  }));
}

/** Accept only well-formed user/assistant turns from the client (cap count + length). */
function sanitizeHistory(history: unknown): CopilotTurn[] {
  if (!Array.isArray(history)) return [];
  const out: CopilotTurn[] = [];
  for (const t of history.slice(-10)) {
    const role = (t as { role?: string })?.role;
    const content = (t as { content?: string })?.content;
    if ((role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim()) {
      out.push({ role, content: content.slice(0, 4000) });
    }
  }
  return out;
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

  const approved = await listApprovedItems(ctx.workspace.id);
  if (approved.length === 0) {
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
      items: shortlist(approved, q),
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
