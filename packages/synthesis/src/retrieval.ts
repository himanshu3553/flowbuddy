import { createLogger } from '@flowbuddy/logger';
import type { CopilotKBItem, CopilotTurn } from './copilot';
import { embedTexts, toVectorLiteral, type EmbedOpts } from './embeddings';

const log = createLogger('retrieval');

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
 * THE GATE (P3-M1): a workflow may answer when a `CopilotApproval` row names its durable
 * `workflowId` AND that row's `inactiveReason` is null. Keyed by the workflow's IDENTITY, not by
 * item rows (the worker delete+recreates those on every reprocess) and no longer by its POSITION in
 * a recording (a re-split moves positions, which used to walk an approval onto content nobody had
 * reviewed). Absence of a row = not approved; a non-null `inactiveReason` = approved once, retired
 * since — replaced, or unverifiable after a reprocess. Nothing is ever deleted, so this filter is
 * the only thing standing between a retired workflow and an end-user.
 *
 * NO-LEAK: the pgvector scan is itself constrained to live `workflowId`s (review hardening
 * 2026-07-07 — this also stops unapproved rows starving the top-K candidate budget), and its
 * ranking is only ever FUSED onto the approved item list, so returned items always come from the
 * approved set alone.
 *
 * Note the deliberate asymmetry: the GATE is identity-based, while the ranking SIGNALS (route,
 * sense, continuity) still match on `sourceId:segmentIndex`, because that is what the widget
 * reports about where the user is standing. Getting a signal wrong costs one mediocre answer;
 * getting the gate wrong leaks unapproved content. They are not the same kind of thing.
 *
 * `@flowbuddy/synthesis` stays DB-free: callers inject their Prisma client, typed structurally as the
 * tiny `RetrievalDb` subset below (`$queryRaw` included — PrismaClient satisfies it as-is).
 */

/** The KnowledgeItem fields retrieval reads (a structural subset of the Prisma row). */
export interface RetrievableKBItem {
  id: string;
  /** P3-M1 — the workflow's durable identity. What the approval gate is decided on. */
  workflowId: string;
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
      where: { workspaceId: string; inactiveReason: null };
      select: { workflowId: true; workflow: { select: { taskId: true; description: true } } };
    }): Promise<
      Array<{ workflowId: string; workflow: { taskId: string | null; description: string | null } }>
    >;
  };
  knowledgeItem: {
    findMany(args: {
      where: { workspaceId: string };
      select: {
        id: true;
        workflowId: true;
        sourceId: true;
        segmentIndex: true;
        segmentTitle: true;
        text: true;
        data: true;
      };
      orderBy: Array<{ workflowId: 'asc' } | { orderIndex: 'asc' }>;
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
  /**
   * P2 Sense — the localized workflows' keys (`sourceId:segmentIndex`). Items in a hypothesis
   * workflow get a soft boost — step-level context, sharper than the page-level route signal, and
   * like it a BIAS, never a filter (an unrelated question still out-ranks it).
   */
  senseKeys?: string[];
  /**
   * P5-M0 cut 2 — the workflows the PREVIOUS answer cited (`sourceId:segmentIndex`). A follow-up
   * ("and then what?") carries almost no retrievable terms of its own, so without this the KB is
   * searched for the literal words of the follow-up. The weakest of the three biases by design:
   * conversation is the softest signal — where the user IS (route) and where they're STANDING
   * (sense) are both measured now, while this only says what was being discussed a turn ago.
   * A BIAS, never a filter — an unrelated question still out-ranks it, which is what lets the
   * user change subject mid-thread.
   */
  continuityKeys?: string[];
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
// P2 Sense — "answer for this STEP" carries the same weight as the route signal (an item in the
// localized workflow usually also route-matches, so together they dominate exactly when the user
// is asking about where they stand — and stay out-rankable by the question everywhere else).
const SENSE_RRF_WEIGHT = 2;
// P5-M0 cut 2 — continuity is deliberately the WEAKEST of the three biases: half a rank-1 list, so
// it breaks ties and lifts a plausible follow-up match, but any real keyword/vector consensus (or
// either measured signal above) beats it. Conversation says what we WERE discussing; route and
// sense say where the user actually IS — measured signals win over remembered ones.
const CONTINUITY_RRF_WEIGHT = 1;
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

/**
 * P3-M1 — how "cold-start-able" a workflow is, from the route its FIRST step happens on.
 *
 * The tiebreak between two routes to one goal is "which can a user actually start from here?", and
 * the answer is in the entry route. A workflow that begins at `/dashboard` can be started by anyone;
 * one that begins at `/dashboard/projects/6a6a49ca1a22045b0b32b353` presupposes you already have that
 * project open. Deeper is more specific, and an opaque id segment is the strongest signal of all —
 * it is a thing you must already be inside.
 *
 * Computed at answer time rather than stored: the routes are already in memory, it only ever fires
 * inside a grouped task, and a stored column would be one more thing that can go stale.
 *
 * Higher = more generic.
 */
export function coldStartScore(route: string): number {
  const r = normalizePath(route);
  if (!r || r === '/') return 3; // the root: nothing more startable than this
  const segments = r.split('/').filter(Boolean);
  const hasOpaqueId = segments.some(
    (s) => /^[0-9a-f]{16,}$/i.test(s) || /^\d+$/.test(s) || /^[0-9a-f-]{32,}$/i.test(s),
  );
  if (hasOpaqueId) return 0; // you can only be here if you were already somewhere specific
  return Math.max(0, 3 - segments.length);
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

/**
 * P3-M1 — when the founder has said two workflows are two ROUTES TO ONE GOAL, answer from one of
 * them, chosen before ranking.
 *
 * WHY A PICK AND NOT A WEIGHT. Leaving both in and ranking them is what the whole duplicate problem
 * looked like: two tellings of one task splitting the candidate budget and interleaving in the
 * prompt. A bias would only reorder that; the point is that one of them should not be there.
 *
 * The order, and why:
 *  1. **The route the user is on.** If they are standing on a screen one route covers, that is the
 *     route they can actually follow.
 *  2. **The one that can be started cold.** Failure is asymmetric — hand someone a route that starts
 *     mid-flow and step one is impossible for them; hand them the general one and it merely takes
 *     longer. The tiebreak that degrades gracefully wins.
 *  3. **More steps.** A pure last resort, and only because "we know more about this one" beats a
 *     coin toss. Deliberately NOT recency: newer is not better, and it would make the copilot's
 *     answer change under the founder every time they re-recorded anything.
 *
 * Ungrouped workflows (`taskId` null) are their own task and are never dropped — this can only ever
 * choose between routes the founder explicitly said were interchangeable.
 */
export function selectOnePerTask(
  items: RetrievableKBItem[],
  taskByWorkflow: Map<string, string>,
  contextPath: string,
): RetrievableKBItem[] {
  const byWorkflow = new Map<string, RetrievableKBItem[]>();
  for (const i of items) byWorkflow.set(i.workflowId, [...(byWorkflow.get(i.workflowId) ?? []), i]);

  // Only workflows that actually share a task with another one are in play.
  const contenders = new Map<string, string[]>();
  for (const workflowId of byWorkflow.keys()) {
    const taskId = taskByWorkflow.get(workflowId);
    if (!taskId) continue;
    contenders.set(taskId, [...(contenders.get(taskId) ?? []), workflowId]);
  }

  const dropped = new Set<string>();
  for (const [, workflowIds] of contenders) {
    if (workflowIds.length < 2) continue;
    const scored = workflowIds.map((id) => {
      const steps = byWorkflow.get(id) ?? [];
      const onRoute = contextPath ? steps.some((s) => routeMatches(s, contextPath)) : false;
      const entry = steps[0];
      const entryRoute = ((entry?.data as { route?: string } | null) ?? {}).route ?? '';
      return { id, onRoute, generic: coldStartScore(entryRoute), size: steps.length };
    });
    scored.sort(
      (a, b) =>
        Number(b.onRoute) - Number(a.onRoute) || b.generic - a.generic || b.size - a.size,
    );
    for (const s of scored.slice(1)) dropped.add(s.id);
  }

  return dropped.size === 0 ? items : items.filter((i) => !dropped.has(i.workflowId));
}

function toCopilotItem(i: RetrievableKBItem, descriptions?: Map<string, string>): CopilotKBItem {
  return {
    id: i.id,
    workflowId: i.workflowId,
    workflowDescription: descriptions?.get(i.workflowId) ?? null,
    sourceId: i.sourceId,
    segmentIndex: i.segmentIndex,
    segmentTitle: i.segmentTitle,
    text: i.text,
    narration: ((i.data as { narration?: string | null } | null) ?? {}).narration ?? null,
  };
}

/** The shared top-K tail: sort by score desc (stable — ties keep input order) and map out. */
function topK(
  scored: Array<{ i: RetrievableKBItem; score: number }>,
  limit: number,
  descriptions?: Map<string, string>,
): CopilotKBItem[] {
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ i }) => toCopilotItem(i, descriptions));
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
  /** P3-M1 — workflow plans, so a vector-path failure degrades the RANKING without also losing the
   *  plan. The fallback must answer as well as the primary path can, minus the ordering. */
  descriptions?: Map<string, string>,
): CopilotKBItem[] {
  const limit = opts.limit ?? 24;
  const contextPath = (opts.contextPath ?? '').trim();
  const senseKeys = new Set(opts.senseKeys ?? []);
  const continuityKeys = new Set(opts.continuityKeys ?? []);
  const terms = questionTerms(question);
  const scored = items.map((i) => ({
    i,
    score:
      termOverlap(i.text, terms) +
      (routeMatches(i, contextPath) ? 3 : 0) +
      (senseKeys.has(`${i.sourceId}:${i.segmentIndex}`) ? 3 : 0) +
      // Below both measured signals (P5-M0 cut 2) — enough to carry a term-less follow-up, not
      // enough to hold the thread against a question that genuinely moved on.
      (continuityKeys.has(`${i.sourceId}:${i.segmentIndex}`) ? 2 : 0),
  }));
  return topK(scored, limit, descriptions);
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
    log.warn({ err: e instanceof Error ? e.message : String(e) }, 'question embed failed — keyword-only');
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
  liveWorkflowIds: string[],
): Promise<string[] | null> {
  if (!db.$queryRaw) return null;
  try {
    const vec = toVectorLiteral(queryVector);
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "KnowledgeItem"
      WHERE "workspaceId" = ${workspaceId} AND embedding IS NOT NULL
        AND "workflowId" = ANY(${liveWorkflowIds}::text[])
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${VECTOR_CANDIDATES}`;
    return rows.map((r) => r.id);
  } catch (e) {
    log.warn({ err: e instanceof Error ? e.message : String(e) }, 'vector search unavailable — keyword-only');
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
    where: { workspaceId, inactiveReason: null },
    select: { workflowId: true, workflow: { select: { taskId: true, description: true } } },
  });
  if (approvals.length === 0) return [];
  const liveWorkflowIds = new Set(approvals.map((a) => a.workflowId));
  // P3-M1 — which live workflows the founder grouped as routes to one goal.
  const taskByWorkflow = new Map<string, string>();
  const descriptionByWorkflow = new Map<string, string>();
  for (const a of approvals) {
    if (a.workflow.taskId) taskByWorkflow.set(a.workflowId, a.workflow.taskId);
    if (a.workflow.description) descriptionByWorkflow.set(a.workflowId, a.workflow.description);
  }

  const [all, vecIds] = await Promise.all([
    db.knowledgeItem.findMany({
      where: { workspaceId },
      select: {
        id: true,
        workflowId: true,
        sourceId: true,
        segmentIndex: true,
        segmentTitle: true,
        text: true,
        data: true,
      },
      orderBy: [{ workflowId: 'asc' }, { orderIndex: 'asc' }],
    }),
    queryVectorPromise.then((qv) => (qv ? vectorTopK(db, workspaceId, qv, [...liveWorkflowIds]) : null)),
  ]);
  const live = all.filter((i) => liveWorkflowIds.has(i.workflowId));
  if (live.length === 0) return [];
  // One route per goal, decided BEFORE ranking — see `selectOnePerTask`. A no-op in the usual case
  // where nothing is grouped.
  const approved = selectOnePerTask(live, taskByWorkflow, (opts.contextPath ?? '').trim());
  if (approved.length === 0) return [];

  if (!vecIds || vecIds.length === 0)
    return shortlistItems(approved, question, opts, descriptionByWorkflow);

  // ── Hybrid: reciprocal-rank fusion over three signals ─────────────────────────────────────────
  // (a) keyword rank over MATCHING items only — an item with zero term overlap isn't "ranked", it
  //     missed; including the whole corpus would let arbitrary KB order cancel the vector signal
  //     on paraphrased questions (found in verification); (b) vector rank: similarity order over
  //     the approved-only scan (defense-in-depth re-check below); (c) route, (d) sense and
  //     (e) continuity: weighted extra "lists" where every matching item ties at rank 1, in
  //     descending strength (route = sense = 2, continuity = 1 — measured beats remembered).
  //     Items in no list score 0 and fill the tail in KB order (the shortlist still always
  //     returns up to `limit`).
  const limit = opts.limit ?? 24;
  const contextPath = (opts.contextPath ?? '').trim();
  const senseKeySet = new Set(opts.senseKeys ?? []);
  const continuityKeySet = new Set(opts.continuityKeys ?? []);
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
    if (senseKeySet.has(`${i.sourceId}:${i.segmentIndex}`)) score += SENSE_RRF_WEIGHT / (RRF_K + 1);
    if (continuityKeySet.has(`${i.sourceId}:${i.segmentIndex}`)) {
      score += CONTINUITY_RRF_WEIGHT / (RRF_K + 1);
    }
    return { i, score };
  });
  return topK(fused, limit, descriptionByWorkflow);
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
