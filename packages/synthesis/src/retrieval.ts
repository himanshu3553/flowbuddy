import type { CopilotKBItem, CopilotTurn } from './copilot';

/**
 * P1-M5/M6 — THE single retrieval + grounding-enforcement seam for the copilot.
 *
 * Both consumers go through here — the public answer endpoint (packages/api/src/server.ts) and
 * the in-Studio tester (packages/web/lib/copilot-preview-actions.ts) — so the no-leak guarantee
 * ("the copilot grounds ONLY on approved-KB") has exactly ONE implementation, and both surfaces
 * answer identically (the two previous copies had already drifted: the preview lacked the
 * route-boost). pgvector (P1-M3) lands here and nowhere else when a workspace outgrows keyword
 * retrieval (trigger: ~1–2k items, or decline-rate rising on covered topics).
 *
 * A workflow is approved when a `CopilotApproval` row exists for its `(sourceId, segmentIndex)` —
 * keyed by workflow, NOT item rows, because the worker delete+recreates items on every
 * (re)process. Absence of a row = not approved.
 *
 * `@sync/synthesis` stays DB-free: callers inject their Prisma client, typed structurally as the
 * tiny `RetrievalDb` subset below.
 */

/** The KnowledgeItem fields retrieval reads (a structural subset of the Prisma row). */
export interface RetrievableKBItem {
  id: string;
  sourceId: string;
  segmentIndex: number | null;
  segmentTitle: string | null;
  text: string;
  data: unknown;
}

/** The subset of the Prisma client retrieval needs — `prisma` satisfies this structurally. */
export interface RetrievalDb {
  copilotApproval: {
    findMany(args: {
      where: { workspaceId: string };
      select: { sourceId: true; segmentIndex: true };
    }): Promise<Array<{ sourceId: string; segmentIndex: number }>>;
  };
  knowledgeItem: {
    findMany(args: {
      where: { workspaceId: string; segmentIndex: { not: null } };
      select: {
        id: true;
        sourceId: true;
        segmentIndex: true;
        segmentTitle: true;
        text: true;
        data: true;
      };
      orderBy: Array<
        { sourceId: 'asc' } | { segmentIndex: 'asc' } | { orderIndex: 'asc' }
      >;
    }): Promise<RetrievableKBItem[]>;
  };
}

export interface ShortlistOpts {
  /** P1-M8 — the host-app route the end-user is on; boosts items captured on that screen. */
  contextPath?: string | null;
  limit?: number;
}

const STOP = new Set([
  'the', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'how', 'do', 'does',
  'i', 'my', 'can', 'it', 'with', 'what', 'where', 'why', 'this', 'that', 'you', 'your', 'me', 'we',
]);

/**
 * Keyword shortlist (pgvector is the P1-M3 upgrade): top `limit` items by question-term overlap,
 * with a route boost for the screen the end-user is on. Ties keep KB order; always returns up to
 * `limit` even on 0 matches so the LLM judges coverage rather than us hard-declining on a keyword
 * miss.
 */
export function shortlistItems(
  items: RetrievableKBItem[],
  question: string,
  opts: ShortlistOpts = {},
): CopilotKBItem[] {
  const limit = opts.limit ?? 24;
  const contextPath = (opts.contextPath ?? '').trim();
  const terms = [
    ...new Set(question.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t))),
  ];
  const scored = items.map((i) => {
    const hay = i.text.toLowerCase();
    let score = 0;
    for (const t of terms) if (hay.includes(t)) score++;
    // P1-M8: boost items captured on the route the end-user is currently on ("answer for this
    // screen"). Distilled steps carry `data.route`; the `event.route.path` fallback covers any
    // pre-distillation rows.
    const d = (i.data ?? {}) as { route?: string; event?: { route?: { path?: string } } };
    const route = d.route ?? d.event?.route?.path ?? '';
    if (contextPath && route && (route === contextPath || route.includes(contextPath) || contextPath.includes(route))) {
      score += 3;
    }
    return { i, score };
  });
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

/**
 * Retrieve the copilot-ELIGIBLE items for a question: approved workflows only, then keyword
 * shortlist. Returns `[]` only when the workspace has NO approved content at all — callers use
 * that to show "no approved help content yet" instead of a coverage decline.
 */
export async function retrieveApprovedKBItems(
  db: RetrievalDb,
  workspaceId: string,
  question: string,
  opts: ShortlistOpts = {},
): Promise<CopilotKBItem[]> {
  const approvals = await db.copilotApproval.findMany({
    where: { workspaceId },
    select: { sourceId: true, segmentIndex: true },
  });
  if (approvals.length === 0) return [];
  const keys = new Set(approvals.map((a) => `${a.sourceId}:${a.segmentIndex}`));

  const all = await db.knowledgeItem.findMany({
    where: { workspaceId, segmentIndex: { not: null } },
    select: { id: true, sourceId: true, segmentIndex: true, segmentTitle: true, text: true, data: true },
    orderBy: [{ sourceId: 'asc' }, { segmentIndex: 'asc' }, { orderIndex: 'asc' }],
  });
  const approved = all.filter((i) => i.segmentIndex != null && keys.has(`${i.sourceId}:${i.segmentIndex}`));
  if (approved.length === 0) return [];

  return shortlistItems(approved, question, opts);
}

/** Accept only well-formed user/assistant turns from an untrusted body (cap count + length). */
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
