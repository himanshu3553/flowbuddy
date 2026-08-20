import { createLogger } from '@flowbuddy/logger';
import { displayRoute, isIdSegment, normalizePath, routeMatchStrength } from '@flowbuddy/shared/route-pattern';
import type { CopilotKBItem, CopilotTurn } from './copilot';
import { embedTexts, toVectorLiteral, type EmbedOpts } from './embeddings';

/** P3-M2 (EC-10) — the per-workflow contract facts answers state (see `CopilotKBItem`). */
export type WorkflowFacts = { entry?: string; finish?: string[] };
/** How many finish phrases ride into an answer — the last step's recorded phrases, capped: one is
 *  usually the message itself; three covers a redesigned wording without flooding the prompt. */
const FINISH_FACT_MAX = 3;

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
  /** P3-M1 — the workflow's durable identity. What the approval gate is decided on.
   *  `''` for a product-page row (AIL slice 2) — a page belongs to no workflow. */
  workflowId: string;
  /** `'step'` (KnowledgeItem) or `'topic'` (a ProductPage adapted into the pool). */
  kind?: string;
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
      select: {
        workflowId: true;
        workflow: {
          select: { taskId: true; description: true; sourceId: true; segmentIndex: true };
        };
      };
    }): Promise<
      Array<{
        workflowId: string;
        workflow: {
          taskId: string | null;
          description: string | null;
          sourceId: string;
          segmentIndex: number | null;
        };
      }>
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
   * AIL slice 2 — the SECOND corpus: approved product-knowledge pages. This WHERE clause is the
   * page gate's one live-only reader (the page analog of `inactiveReason: null` above — a page
   * serves iff approved AND live; there is no per-page approval table to join).
   */
  productPage: {
    findMany(args: {
      where: { workspaceId: string; approvedAt: { not: null }; inactiveReason: null };
      select: { id: true; type: true; title: true; content: true; links: true };
      orderBy: Array<{ type: 'asc' } | { title: 'asc' }>;
    }): Promise<
      Array<{ id: string; type: string; title: string; content: string; links: unknown }>
    >;
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
  if (r === '/') return 3; // the root: nothing more startable than this
  const segments = r.split('/').filter(Boolean);
  // One definition of "an id segment", shared with route matching — see `route-pattern.ts`.
  if (segments.some(isIdSegment)) return 0; // you can only be here if you were already somewhere specific
  return Math.max(0, 3 - segments.length);
}

// P1-M8: items captured on the route the end-user is currently on ("answer for this screen").
// Distilled steps carry `data.route`; the `event.route.path` fallback covers pre-distillation rows.
// Matching is PATTERN-based (`route-pattern.ts`): exact or segment-boundary prefix, with record ids
// standing in for each other — never raw substring, which made a root contextPath "/" match every
// item and turned the signal into uniform noise (review hardening 2026-07-07).
function routeMatches(item: RetrievableKBItem, contextPath: string): boolean {
  if (!contextPath) return false;
  const d = (item.data ?? {}) as { route?: string; event?: { route?: { path?: string } } };
  const raw = d.route ?? d.event?.route?.path ?? '';
  return routeMatchStrength(raw, contextPath) > 0;
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

function toCopilotItem(
  i: RetrievableKBItem,
  descriptions?: Map<string, string>,
  facts?: Map<string, WorkflowFacts>,
): CopilotKBItem {
  const related = ((i.data as { related?: Array<{ title: string; key: string }> } | null) ?? {})
    .related;
  return {
    id: i.id,
    workflowId: i.workflowId,
    kind: i.kind === 'topic' ? 'topic' : 'step',
    workflowDescription: descriptions?.get(i.workflowId) ?? null,
    workflowFacts: facts?.get(i.workflowId) ?? null,
    sourceId: i.sourceId,
    segmentIndex: i.segmentIndex,
    segmentTitle: i.segmentTitle,
    text: i.text,
    // Legacy rows still carry data.narration — deliberately NOT served (retired 2026-08-21).
    ...(related && related.length > 0 ? { related } : {}),
  };
}

/**
 * P3-M2 (EC-10) — the contract facts per workflow, from rows ALREADY loaded in workflow order:
 * the first item's route is where the workflow starts (display-safe — a recorded route is the
 * founder's own URL, so ids are elided); the LAST item's stored evidence phrases are what the user
 * sees when it is done. Deliberately the last item's ONLY — an earlier step's phrases presented as
 * the finish would be wrong, so a last step without evidence means no finish line at all.
 */
function buildWorkflowFacts(
  items: Array<{ workflowId: string; data: unknown }>,
): Map<string, WorkflowFacts> {
  const facts = new Map<string, WorkflowFacts>();
  for (const i of items) {
    if (!i.workflowId) continue;
    const d = (i.data ?? {}) as { route?: string; evidence?: { appeared?: string[] } };
    let f = facts.get(i.workflowId);
    if (!f) {
      f = {};
      facts.set(i.workflowId, f);
      const entry = displayRoute(d.route ?? '');
      if (entry) f.entry = entry;
    }
    const appeared = d.evidence?.appeared;
    if (appeared && appeared.length > 0) f.finish = appeared.slice(0, FINISH_FACT_MAX);
    else delete f.finish; // items arrive in order — only the LAST item's phrases may survive
  }
  for (const [id, f] of facts) if (!f.entry && !f.finish) facts.delete(id);
  return facts;
}

/** A live ProductPage row, adapted into the retrieval pool. No route, no position, no workflow —
 *  the ranking signals that key on those simply never fire for it; keyword and vector rank it.
 *
 *  Slice 3 — the page's workflow links ride along as `data.related`, resolved to `key=` form and
 *  filtered to LIVE approvals only: a link is only ever surfaced when `get_workflow` could
 *  actually open it (absence, not refusal — a retired workflow's link simply isn't there). */
function pageToPoolItem(
  p: { id: string; title: string; content: string; links: unknown },
  liveKeyByWorkflowId: Map<string, string>,
): RetrievableKBItem {
  const related = (Array.isArray(p.links) ? p.links : [])
    .filter(
      (l): l is { kind: string; workflowId: string; title: string } =>
        !!l &&
        (l as { kind?: unknown }).kind === 'workflow' &&
        typeof (l as { workflowId?: unknown }).workflowId === 'string' &&
        typeof (l as { title?: unknown }).title === 'string',
    )
    .flatMap((l) => {
      const key = liveKeyByWorkflowId.get(l.workflowId);
      return key ? [{ title: l.title, key }] : [];
    });
  return {
    id: p.id,
    workflowId: '',
    kind: 'topic',
    sourceId: '',
    segmentIndex: null,
    segmentTitle: p.title,
    text: p.content,
    data: related.length > 0 ? { related } : {},
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
 * How many of the `limit` slots the QUESTION always keeps, whatever the context signals say.
 *
 * WHY THIS EXISTS. Route, sense and continuity are documented as biases the answer model may
 * overrule — but they are applied in RETRIEVAL, and retrieval decides what the model is ever shown.
 * A bias it cannot see past is a filter. Measured on a real workspace: standing on a hub page where
 * 23 of 46 items had been recorded, against a 24-item window, the route boost alone could evict the
 * single item that answered the question ("how do I log out" → the Sign out step, ranked #1 by
 * relevance, did not survive). The signal is not wrong; nothing bounded how many items could claim
 * it.
 *
 * WHY A RESERVE AND NOT A SMALLER BOOST. The weights are individually right — "answer for this
 * screen" SHOULD outrank a single lucky keyword, and a positional question ("what do I do next?")
 * carries no searchable terms at all, so context is the entire answer there. Capping the boost's
 * REACH instead (only lift the top N route matches) was considered and rejected: ranking on-page
 * items by relevance is meaningless for exactly those term-less positional questions, so it would
 * risk the flagship case to protect the rare one. A reserve removes nothing and adds no ordering
 * rule — it only guarantees the question's own best matches are in the room.
 *
 * 8 of 24: enough that a directly-named workflow can never be squeezed out, small enough that a
 * positional answer keeps two thirds of the window for where the user actually is.
 */
const RELEVANCE_RESERVE = 8;

/**
 * Choose `limit` items by fused score, but never at the cost of the top few by RELEVANCE alone.
 *
 * Ordering is deliberately left to the fused score — the reserve decides MEMBERSHIP, not position.
 * Promoting reserved items would put keyword noise ("Click **Next**: Add Knowledge Sources" for a
 * question containing "next") above the items a positional question actually needs.
 */
export function selectWithRelevanceReserve<T>(
  scored: Array<{ item: T; fused: number; relevance: number }>,
  limit: number,
): T[] {
  if (scored.length <= limit) return [...scored].sort((a, b) => b.fused - a.fused).map((s) => s.item);

  const byFused = [...scored].sort((a, b) => b.fused - a.fused);
  const chosen = new Set(byFused.slice(0, limit));

  // Items with NO relevance signal at all are not "the question's best matches" — a reserve made of
  // them would evict context for nothing.
  const wanted = [...scored]
    .filter((s) => s.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, Math.min(RELEVANCE_RESERVE, limit));

  // Swap out the weakest fused entries — never one that is itself reserved.
  const missing = wanted.filter((s) => !chosen.has(s));
  for (let i = byFused.length - 1, m = 0; i >= 0 && m < missing.length; i--) {
    const candidate = byFused[i]!;
    if (!chosen.has(candidate) || wanted.includes(candidate)) continue;
    chosen.delete(candidate);
    chosen.add(missing[m]!);
    m++;
  }
  return byFused.filter((s) => chosen.has(s)).map((s) => s.item);
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
  /** P3-M2 — same rule for the contract facts: the fallback path states them too. */
  facts?: Map<string, WorkflowFacts>,
): CopilotKBItem[] {
  const limit = opts.limit ?? 24;
  const contextPath = (opts.contextPath ?? '').trim();
  const senseKeys = new Set(opts.senseKeys ?? []);
  const continuityKeys = new Set(opts.continuityKeys ?? []);
  const terms = questionTerms(question);
  const scored = items.map((i) => {
    const relevance = termOverlap(i.text, terms);
    return {
      item: i,
      relevance,
      fused:
        relevance +
        (routeMatches(i, contextPath) ? 3 : 0) +
        (senseKeys.has(`${i.sourceId}:${i.segmentIndex}`) ? 3 : 0) +
        // Below both measured signals (P5-M0 cut 2) — enough to carry a term-less follow-up, not
        // enough to hold the thread against a question that genuinely moved on.
        (continuityKeys.has(`${i.sourceId}:${i.segmentIndex}`) ? 2 : 0),
    };
  });
  // The same reserve as the hybrid path — this fallback runs whenever the vector half fails, which
  // is exactly when a paraphrased question most needs its keyword matches to survive.
  return selectWithRelevanceReserve(scored, limit).map((i) => toCopilotItem(i, descriptions, facts));
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
 *
 * AIL slice 2 — the scan is a UNION over BOTH corpora: step items (gated by live workflow ids) and
 * product pages (gated by their own liveness columns, right here in the WHERE — same no-leak
 * property, page-sized: an unapproved or retired page is not in the scan at all).
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
      SELECT id FROM (
        SELECT id, embedding <=> ${vec}::vector AS d FROM "KnowledgeItem"
        WHERE "workspaceId" = ${workspaceId} AND embedding IS NOT NULL
          AND "workflowId" = ANY(${liveWorkflowIds}::text[])
        UNION ALL
        SELECT id, embedding <=> ${vec}::vector AS d FROM "ProductPage"
        WHERE "workspaceId" = ${workspaceId} AND embedding IS NOT NULL
          AND "approvedAt" IS NOT NULL AND "inactiveReason" IS NULL
      ) u
      ORDER BY d
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
    select: {
      workflowId: true,
      workflow: { select: { taskId: true, description: true, sourceId: true, segmentIndex: true } },
    },
  });
  const liveWorkflowIds = new Set(approvals.map((a) => a.workflowId));
  // P3-M1 — which live workflows the founder grouped as routes to one goal.
  const taskByWorkflow = new Map<string, string>();
  const descriptionByWorkflow = new Map<string, string>();
  // Slice 3 — the `key=` a page link resolves to, for LIVE workflows with a position (a detached
  // workflow has no key `get_workflow` could take, so its links stay silent).
  const liveKeyByWorkflowId = new Map<string, string>();
  for (const a of approvals) {
    if (a.workflow.taskId) taskByWorkflow.set(a.workflowId, a.workflow.taskId);
    if (a.workflow.description) descriptionByWorkflow.set(a.workflowId, a.workflow.description);
    if (a.workflow.segmentIndex !== null) {
      liveKeyByWorkflowId.set(a.workflowId, `${a.workflow.sourceId}:${a.workflow.segmentIndex}`);
    }
  }

  const [all, livePages, vecIds] = await Promise.all([
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
    // AIL slice 2 — the second corpus. Live pages only: this WHERE is the page gate.
    db.productPage.findMany({
      where: { workspaceId, approvedAt: { not: null }, inactiveReason: null },
      select: { id: true, type: true, title: true, content: true, links: true },
      orderBy: [{ type: 'asc' }, { title: 'asc' }],
    }),
    queryVectorPromise.then((qv) => (qv ? vectorTopK(db, workspaceId, qv, [...liveWorkflowIds]) : null)),
  ]);
  const live = all.filter((i) => liveWorkflowIds.has(i.workflowId));
  // P3-M2 — contract facts from the rows already in hand (ordered by workflow, then step order).
  const factsByWorkflow = buildWorkflowFacts(live);
  const pageItems = livePages.map((p) => pageToPoolItem(p, liveKeyByWorkflowId));
  // "No approved content at all" now means no live workflows AND no live pages — a workspace whose
  // only approved knowledge is pages (e.g. an overview approved before any workflow) still answers.
  if (live.length === 0 && pageItems.length === 0) return [];
  // One route per goal, decided BEFORE ranking — see `selectOnePerTask`. A no-op in the usual case
  // where nothing is grouped. Pages join AFTER: they belong to no task and are never grouped.
  const approved = selectOnePerTask(live, taskByWorkflow, (opts.contextPath ?? '').trim());
  const pool = [...approved, ...pageItems];

  if (!vecIds || vecIds.length === 0)
    return shortlistItems(pool, question, opts, descriptionByWorkflow, factsByWorkflow);

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

  const kwScored = pool.map((i) => ({ i, score: termOverlap(i.text, terms) }));
  const kwRank = new Map(
    kwScored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s, idx) => [s.i.id, idx + 1]),
  );

  const poolIds = new Set(pool.map((i) => i.id));
  const vecRank = new Map<string, number>();
  for (const id of vecIds) if (poolIds.has(id)) vecRank.set(id, vecRank.size + 1);

  const fused = pool.map((i) => {
    // Relevance = what the QUESTION found, before any context signal. Kept separate so the reserve
    // below can guarantee it a share of the window.
    let relevance = 0;
    const kr = kwRank.get(i.id);
    if (kr) relevance += 1 / (RRF_K + kr);
    const vr = vecRank.get(i.id);
    if (vr) relevance += 1 / (RRF_K + vr);
    let score = relevance;
    if (routeMatches(i, contextPath)) score += ROUTE_RRF_WEIGHT / (RRF_K + 1);
    if (senseKeySet.has(`${i.sourceId}:${i.segmentIndex}`)) score += SENSE_RRF_WEIGHT / (RRF_K + 1);
    if (continuityKeySet.has(`${i.sourceId}:${i.segmentIndex}`)) {
      score += CONTINUITY_RRF_WEIGHT / (RRF_K + 1);
    }
    return { item: i, fused: score, relevance };
  });
  return selectWithRelevanceReserve(fused, limit).map((i) =>
    toCopilotItem(i, descriptionByWorkflow, factsByWorkflow),
  );
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
