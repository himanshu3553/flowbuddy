import type { CopilotKBItem, CopilotTurn } from './copilot';
import { embedTexts, toVectorLiteral, type EmbedOpts } from './embeddings';

/**
 * P1-M5/M6 — THE single retrieval + grounding-enforcement seam for the copilot.
 *
 * Every consumer goes through here via the public answer endpoint (packages/api/src/server.ts) —
 * since 2026-07-06 the in-Studio tester embeds the real widget, so it arrives through that same
 * route — and the no-leak guarantee ("the copilot grounds ONLY on approved-KB") has exactly ONE
 * implementation with ONE caller (the two pre-consolidation copies had already drifted: the old
 * preview lacked the route-boost).
 *
 * P1-M3 (2026-07-07): retrieval is HYBRID — keyword term-overlap fused with pgvector cosine
 * similarity via reciprocal-rank fusion (RRF), plus the P1-M8 route signal. The vector half is
 * strictly best-effort: no `$queryRaw` on the injected client, no `embedding` opts, no embedded
 * rows, or a failed/slow embed call (2s timeout) all degrade to the pure keyword shortlist — the
 * copilot never errors OR stalls because of the vector path. The question embed starts before the
 * DB reads and overlaps them, so its round-trip stays off the answer's critical path.
 *
 * A workflow is approved when a `CopilotApproval` row exists for its `(sourceId, segmentIndex)` —
 * keyed by workflow, NOT item rows, because the worker delete+recreates items on every
 * (re)process. Absence of a row = not approved. NO-LEAK: the pgvector scan itself is constrained
 * to the approved `(sourceId, segmentIndex)` keys (review hardening 2026-07-07 — this also stops
 * unapproved rows starving the top-K candidate budget), and its ranking is only ever FUSED onto
 * the approved item list — returned items always come from the approved set alone.
 *
 * `@sync/synthesis` stays DB-free: callers inject their Prisma client, typed structurally as the
 * tiny `RetrievalDb` subset below (`$queryRaw` included — PrismaClient satisfies it as-is).
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
  /**
   * P1-M3 — used ONLY for the pgvector top-K scan (Prisma has no native `vector` support).
   * Optional so a keyword-only caller/test double still satisfies the interface.
   */
  $queryRaw?<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

export interface ShortlistOpts {
  /** P1-M8 — the host-app route the end-user is on; boosts items captured on that screen. */
  contextPath?: string | null;
  limit?: number;
}

/** Full retrieval options: shortlist opts + the P1-M3 embedding config (absent = keyword-only). */
export interface RetrieveOpts extends ShortlistOpts {
  embedding?: EmbedOpts;
}

const STOP = new Set([
  'the', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'how', 'do', 'does',
  'i', 'my', 'can', 'it', 'with', 'what', 'where', 'why', 'this', 'that', 'you', 'your', 'me', 'we',
]);

const RRF_K = 60; // the standard reciprocal-rank-fusion constant
const VECTOR_CANDIDATES = 50; // pgvector top-K pulled per question (from APPROVED rows only)
// "Answer for this screen" is a strong product signal: worth TWO rank-1 lists in the fusion, so a
// route match outranks any single keyword/vector #1 and ties exactly a double-#1 — mirroring the
// fallback path's dominant +3 without letting one signal drown a strong keyword+vector consensus.
const ROUTE_RRF_WEIGHT = 2;
// Query-path embed budget: fail FAST — a missed vector pass costs one keyword-only answer, while a
// hanging embeddings API must never stall the user-facing answer (SDK default is 600s!).
const QUERY_EMBED_TIMEOUT_MS = 2000;
const QUERY_EMBED_RETRIES = 1;

function questionTerms(question: string): string[] {
  return [
    ...new Set(question.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t))),
  ];
}

function termOverlap(text: string, terms: string[]): number {
  const hay = text.toLowerCase();
  let score = 0;
  for (const t of terms) if (hay.includes(t)) score++;
  return score;
}

/** Trim trailing slashes; '' → '/'. */
function normalizePath(p: string): string {
  const s = p.trim().replace(/\/+$/, '');
  return s === '' ? '/' : s;
}

// P1-M8: items captured on the route the end-user is currently on ("answer for this screen").
// Distilled steps carry `data.route`; the `event.route.path` fallback covers pre-distillation rows.
// Matching is exact or segment-boundary prefix (either direction) — NOT raw substring, which made
// a root contextPath "/" match every item and turned the signal into uniform noise (review
// hardening 2026-07-07). A root path carries no screen information, so it never matches.
function routeMatches(item: RetrievableKBItem, contextPath: string): boolean {
  if (!contextPath) return false;
  const ctx = normalizePath(contextPath);
  if (ctx === '/') return false;
  const d = (item.data ?? {}) as { route?: string; event?: { route?: { path?: string } } };
  const raw = d.route ?? d.event?.route?.path ?? '';
  if (!raw) return false;
  const route = normalizePath(raw);
  if (route === '/') return false;
  return route === ctx || route.startsWith(ctx + '/') || ctx.startsWith(route + '/');
}

function toCopilotItem(i: RetrievableKBItem): CopilotKBItem {
  return {
    id: i.id,
    sourceId: i.sourceId,
    segmentIndex: i.segmentIndex,
    segmentTitle: i.segmentTitle,
    text: i.text,
    narration: ((i.data as { narration?: string | null } | null) ?? {}).narration ?? null,
  };
}

/** The shared top-K tail: sort by score desc (stable — ties keep input order) and map out. */
function topK(scored: Array<{ i: RetrievableKBItem; score: number }>, limit: number): CopilotKBItem[] {
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ i }) => toCopilotItem(i));
}

/**
 * Keyword shortlist — the P1-M3 FALLBACK path (and the pre-upgrade behavior, unchanged): top
 * `limit` items by question-term overlap, with a +3 route boost for the screen the end-user is on.
 * Ties keep KB order; always returns up to `limit` even on 0 matches so the LLM judges coverage
 * rather than us hard-declining on a keyword miss.
 */
export function shortlistItems(
  items: RetrievableKBItem[],
  question: string,
  opts: ShortlistOpts = {},
): CopilotKBItem[] {
  const limit = opts.limit ?? 24;
  const contextPath = (opts.contextPath ?? '').trim();
  const terms = questionTerms(question);
  const scored = items.map((i) => ({
    i,
    score: termOverlap(i.text, terms) + (routeMatches(i, contextPath) ? 3 : 0),
  }));
  return topK(scored, limit);
}

/**
 * P1-M3 — embed the question for the vector half. Starts BEFORE the DB reads (callers kick it off
 * first and await later) with a tight timeout, so the answer path neither waits on nor fails with
 * the embeddings API. Never throws: any failure logs once and returns null (→ keyword-only).
 */
async function embedQuestion(question: string, embedding: EmbedOpts): Promise<number[] | null> {
  if (!embedding.apiKey) return null;
  try {
    const [qv] = await embedTexts([question], {
      ...embedding,
      timeoutMs: embedding.timeoutMs ?? QUERY_EMBED_TIMEOUT_MS,
      maxRetries: embedding.maxRetries ?? QUERY_EMBED_RETRIES,
    });
    return qv ?? null;
  } catch (e) {
    console.warn('[retrieval] question embed failed — keyword-only:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * P1-M3 — pgvector top-K by cosine distance (`<=>`), constrained to the APPROVED workflow keys so
 * unapproved rows can neither leak nor starve the candidate budget. Ids return in similarity
 * order. Best-effort: any failure logs once and returns null (→ keyword-only).
 */
async function vectorTopK(
  db: RetrievalDb,
  workspaceId: string,
  queryVector: number[],
  approvedKeys: string[],
): Promise<string[] | null> {
  if (!db.$queryRaw) return null;
  try {
    const vec = toVectorLiteral(queryVector);
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "KnowledgeItem"
      WHERE "workspaceId" = ${workspaceId} AND embedding IS NOT NULL AND "segmentIndex" IS NOT NULL
        AND "sourceId" || ':' || "segmentIndex"::text = ANY(${approvedKeys}::text[])
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${VECTOR_CANDIDATES}`;
    return rows.map((r) => r.id);
  } catch (e) {
    console.warn('[retrieval] vector search unavailable — keyword-only:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Retrieve the copilot-ELIGIBLE items for a question: approved workflows only, then HYBRID ranking
 * (keyword ∪ vector via RRF, route as a third signal) when embeddings are available, else the
 * keyword shortlist. Returns `[]` only when the workspace has NO approved content at all — callers
 * use that to show "no approved help content yet" instead of a coverage decline.
 */
export async function retrieveApprovedKBItems(
  db: RetrievalDb,
  workspaceId: string,
  question: string,
  opts: RetrieveOpts = {},
): Promise<CopilotKBItem[]> {
  // Kick off the question embed first — a network round-trip that depends on nothing below, so it
  // overlaps the DB reads instead of adding serially to answer latency. embedQuestion never rejects.
  const queryVectorPromise = opts.embedding ? embedQuestion(question, opts.embedding) : Promise.resolve(null);

  const approvals = await db.copilotApproval.findMany({
    where: { workspaceId },
    select: { sourceId: true, segmentIndex: true },
  });
  if (approvals.length === 0) return [];
  const keys = new Set(approvals.map((a) => `${a.sourceId}:${a.segmentIndex}`));

  const [all, vecIds] = await Promise.all([
    db.knowledgeItem.findMany({
      where: { workspaceId, segmentIndex: { not: null } },
      select: { id: true, sourceId: true, segmentIndex: true, segmentTitle: true, text: true, data: true },
      orderBy: [{ sourceId: 'asc' }, { segmentIndex: 'asc' }, { orderIndex: 'asc' }],
    }),
    queryVectorPromise.then((qv) => (qv ? vectorTopK(db, workspaceId, qv, [...keys]) : null)),
  ]);
  const approved = all.filter((i) => i.segmentIndex != null && keys.has(`${i.sourceId}:${i.segmentIndex}`));
  if (approved.length === 0) return [];

  if (!vecIds || vecIds.length === 0) return shortlistItems(approved, question, opts);

  // ── Hybrid: reciprocal-rank fusion over three signals ─────────────────────────────────────────
  // (a) keyword rank over MATCHING items only — an item with zero term overlap isn't "ranked", it
  //     missed; including the whole corpus would let arbitrary KB order cancel the vector signal
  //     on paraphrased questions (found in verification); (b) vector rank: similarity order over
  //     the approved-only scan (defense-in-depth re-check below); (c) route: a weighted third
  //     "list" where every on-screen item ties at rank 1. Items in no list score 0 and fill the
  //     tail in KB order (the shortlist still always returns up to `limit`).
  const limit = opts.limit ?? 24;
  const contextPath = (opts.contextPath ?? '').trim();
  const terms = questionTerms(question);

  const kwScored = approved.map((i) => ({ i, score: termOverlap(i.text, terms) }));
  const kwRank = new Map(
    kwScored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s, idx) => [s.i.id, idx + 1]),
  );

  const approvedIds = new Set(approved.map((i) => i.id));
  const vecRank = new Map<string, number>();
  for (const id of vecIds) if (approvedIds.has(id)) vecRank.set(id, vecRank.size + 1);

  const fused = approved.map((i) => {
    let score = 0;
    const kr = kwRank.get(i.id);
    if (kr) score += 1 / (RRF_K + kr);
    const vr = vecRank.get(i.id);
    if (vr) score += 1 / (RRF_K + vr);
    if (routeMatches(i, contextPath)) score += ROUTE_RRF_WEIGHT / (RRF_K + 1);
    return { i, score };
  });
  return topK(fused, limit);
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
