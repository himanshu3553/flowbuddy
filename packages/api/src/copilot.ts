import { prisma } from '@sync/db';
import type { CopilotKBItem, CopilotTurn } from '@sync/synthesis';

/**
 * P1-M6 retrieval — fetch the copilot-ELIGIBLE KB items for a workspace and keyword-shortlist them
 * for a question. Eligibility = items whose (sourceId, segmentIndex) is APPROVED for the copilot
 * (P1-M5). This MUST mirror web/lib/copilot-approvals.ts `listApprovedItems` — it's the single
 * enforcement point that keeps the copilot grounded only in approved-KB ("no-leak").
 *
 * Retrieval is keyword-first (pgvector is the P1-M3 upgrade). Returns top `limit` by term overlap.
 */
const STOP = new Set([
  'the', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'how', 'do', 'does',
  'i', 'my', 'can', 'it', 'with', 'what', 'where', 'why', 'this', 'that', 'you', 'your', 'me', 'we',
]);

export async function retrieveApprovedKBItems(
  workspaceId: string,
  question: string,
  limit = 24,
): Promise<CopilotKBItem[]> {
  const approvals = await prisma.copilotApproval.findMany({
    where: { workspaceId },
    select: { sourceId: true, segmentIndex: true },
  });
  if (approvals.length === 0) return [];
  const keys = new Set(approvals.map((a) => `${a.sourceId}:${a.segmentIndex}`));

  const all = await prisma.knowledgeItem.findMany({
    where: { workspaceId, segmentIndex: { not: null } },
    select: { id: true, sourceId: true, segmentIndex: true, segmentTitle: true, text: true, data: true },
    orderBy: [{ sourceId: 'asc' }, { segmentIndex: 'asc' }, { orderIndex: 'asc' }],
  });
  const approved = all.filter((i) => i.segmentIndex != null && keys.has(`${i.sourceId}:${i.segmentIndex}`));
  if (approved.length === 0) return [];

  const terms = [...new Set(question.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t)))];
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

/** Accept only well-formed user/assistant turns from an untrusted request body (cap length). */
export function sanitizeHistory(history: unknown): CopilotTurn[] {
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
