import { prisma } from '@flowbuddy/db';

/**
 * Analytics aggregations for the Studio Analytics page. These complement
 * `getCopilotMetrics` (the headline stats + chart series) with the per-workflow
 * and feedback-loop breakdowns. All server-only and workspace-scoped.
 */

/** The selectable date windows on the Analytics page. */
export const RANGE_OPTIONS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
] as const;

export type RangeDays = (typeof RANGE_OPTIONS)[number]['days'];

/** Coerce an arbitrary `?range=` value to a supported window (defaults to 7). */
export function parseRange(raw: string | string[] | undefined): RangeDays {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return (RANGE_OPTIONS.find((o) => o.days === n)?.days ?? 7) as RangeDays;
}

export function rangeLabel(days: RangeDays): string {
  return RANGE_OPTIONS.find((o) => o.days === days)?.label ?? `Last ${days} days`;
}

function windowStart(days: number): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

export interface TopWorkflow {
  sourceId: string;
  segmentIndex: number | null;
  title: string;
  count: number;
}

/**
 * Most-cited approved workflows over the window — i.e. which recordings are
 * actually carrying the copilot's answers. Grouped by (sourceId, segmentIndex)
 * from the per-answer `QueryCitation` log.
 *
 * Counts DISTINCT QUESTIONS, not citation rows. That is the metric anyone reading this card
 * actually wants ("how many questions did this workflow answer?"), and it is also what makes the
 * number correct across the 2026-07-27 writer fix: rows written before it duplicated a workflow
 * once per cited STEP, so counting rows ranked workflows by their length instead of their use.
 * Counting distinct `queryId` is right for both the old rows and the new ones, with no backfill.
 */
export async function getTopWorkflowsByCitations(
  workspaceId: string,
  days: number,
  take = 6,
): Promise<TopWorkflow[]> {
  const rows = await prisma.queryCitation.findMany({
    where: { workspaceId, createdAt: { gte: windowStart(days) } },
    select: {
      queryId: true,
      workflowId: true,
      sourceId: true,
      segmentIndex: true,
      segmentTitle: true,
    },
  });

  const map = new Map<
    string,
    { sourceId: string; segmentIndex: number | null; title: string; queries: Set<string> }
  >();
  for (const r of rows) {
    // P3-M1 — grouped on the workflow's IDENTITY. Grouping on the position used to split one
    // workflow's history in two the moment a reprocess moved it, which read as a drop in usage.
    const key = r.workflowId;
    const existing = map.get(key);
    if (existing) {
      existing.queries.add(r.queryId);
      if (r.segmentTitle) existing.title = r.segmentTitle; // keep the most recent title
    } else {
      map.set(key, {
        sourceId: r.sourceId,
        segmentIndex: r.segmentIndex,
        title: r.segmentTitle || 'Untitled workflow',
        queries: new Set([r.queryId]),
      });
    }
  }

  return [...map.values()]
    .map(({ queries, ...w }) => ({ ...w, count: queries.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, take);
}

export interface WorkflowCopilotStats {
  citedCount: number;
  lastCitedAt: Date | null;
  helpfulUp: number;
  helpfulDown: number;
}

/**
 * Per-workflow copilot usage for the (workflow-scoped) KB detail page: how often THIS workflow
 * `(sourceId, segmentIndex)` was cited in an answer, when it was last cited, and the 👍/👎 tally
 * of the end-user questions it helped answer (feedback lives on the parent CopilotQuery). All-time
 * (not windowed) — this is a per-workflow scorecard, not the dated Analytics view.
 *
 * Everything here counts DISTINCT QUESTIONS, for the same reason as `getTopWorkflowsByCitations`.
 * The feedback tally was the sharper end of that bug: one 👍 on an answer that cited six steps of
 * this workflow used to add SIX to `helpfulUp`, so a per-workflow "helpful" score could exceed the
 * number of people who had ever rated it.
 */
export async function getWorkflowCopilotStats(
  workspaceId: string,
  sourceId: string,
  segmentIndex: number,
): Promise<WorkflowCopilotStats> {
  // P3-M1 — resolve the position to its durable identity, then read the history against THAT, so a
  // workflow's scorecard survives a reprocess moving it. Callers still pass a position because that
  // is what a page URL carries.
  const workflow = await prisma.workflow.findFirst({
    where: { workspaceId, sourceId, segmentIndex },
    select: { id: true },
  });
  if (!workflow) return { citedCount: 0, lastCitedAt: null, helpfulUp: 0, helpfulDown: 0 };

  const citations = await prisma.queryCitation.findMany({
    where: { workspaceId, workflowId: workflow.id },
    select: { queryId: true, createdAt: true, query: { select: { feedback: true } } },
    orderBy: { createdAt: 'desc' },
  });

  // One entry per question this workflow helped answer, carrying that question's single verdict.
  const feedbackByQuery = new Map<string, string | null>();
  for (const c of citations) {
    if (!feedbackByQuery.has(c.queryId)) feedbackByQuery.set(c.queryId, c.query?.feedback ?? null);
  }
  const verdicts = [...feedbackByQuery.values()];

  return {
    citedCount: feedbackByQuery.size,
    lastCitedAt: citations[0]?.createdAt ?? null, // ordered desc, so row 0 is still the latest
    helpfulUp: verdicts.filter((f) => f === 'up').length,
    helpfulDown: verdicts.filter((f) => f === 'down').length,
  };
}

export interface StepFriction {
  sourceId: string;
  segmentIndex: number;
  step: number; // 1-based
  title: string;
  instruction: string | null;
  count: number;
}

/**
 * P2-M4 — WHERE users get stuck: questions whose answer USED a Sense localization, grouped by
 * (workflow, step). Only `senseUsed = 'used'` counts — a localization the answer ignored (the
 * user asked about something unrelated while standing there) is NOT step friction. The step's
 * title/instruction resolve from the live KB (orderIndex is 0-based within the workflow).
 */
export async function getStepFriction(
  workspaceId: string,
  days: number,
  take = 6,
): Promise<StepFriction[]> {
  const rows = await prisma.copilotQuery.groupBy({
    by: ['senseSourceId', 'senseSegmentIndex', 'senseStep'],
    where: {
      workspaceId,
      senseUsed: 'used',
      senseSourceId: { not: null },
      senseStep: { not: null },
      createdAt: { gte: windowStart(days) },
    },
    _count: { _all: true },
  });
  const top = rows
    .filter((r) => r.senseSourceId && r.senseSegmentIndex != null && r.senseStep != null)
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, take);
  if (top.length === 0) return [];

  const items = await prisma.knowledgeItem.findMany({
    where: {
      workspaceId,
      OR: top.map((r) => ({
        sourceId: r.senseSourceId!,
        segmentIndex: r.senseSegmentIndex!,
        orderIndex: r.senseStep! - 1,
      })),
    },
    select: { sourceId: true, segmentIndex: true, orderIndex: true, segmentTitle: true, data: true },
  });
  const byKey = new Map(items.map((i) => [`${i.sourceId}:${i.segmentIndex}:${i.orderIndex}`, i]));

  return top.map((r) => {
    const item = byKey.get(`${r.senseSourceId}:${r.senseSegmentIndex}:${r.senseStep! - 1}`);
    return {
      sourceId: r.senseSourceId!,
      segmentIndex: r.senseSegmentIndex!,
      step: r.senseStep!,
      title: item?.segmentTitle || 'Untitled workflow',
      instruction: ((item?.data ?? {}) as { instruction?: string }).instruction ?? null,
      count: r._count._all,
    };
  });
}

export interface GapWithCount {
  id: string;
  prompt: string;
  reason: string | null;
  askedCount: number;
}

/**
 * Open coverage gaps ranked by how often the copilot was actually asked that
 * question (count of matching declined queries), newest-question-text as the key.
 * Mirrors the design's "asked 14×" ranking.
 */
export async function getCoverageGapsRanked(
  workspaceId: string,
  take = 8,
): Promise<GapWithCount[]> {
  const [gaps, declines] = await Promise.all([
    prisma.coverageGap.findMany({
      where: { workspaceId, status: 'open' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.copilotQuery.groupBy({
      by: ['question'],
      where: { workspaceId, answered: false },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map(declines.map((d) => [d.question, d._count._all]));
  return gaps
    .map((g) => ({
      id: g.id,
      prompt: g.prompt,
      reason: g.reason,
      askedCount: counts.get(g.prompt) ?? 1,
    }))
    .sort((a, b) => b.askedCount - a.askedCount)
    .slice(0, take);
}

export interface RecentDecline {
  id: string;
  question: string;
  contextPath: string | null;
}

/** The most recent questions the copilot couldn't answer, with where they were asked. */
export async function getRecentDeclines(
  workspaceId: string,
  take = 5,
): Promise<RecentDecline[]> {
  const rows = await prisma.copilotQuery.findMany({
    where: { workspaceId, answered: false },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, question: true, contextPath: true },
  });
  return rows;
}

// ── The full question log ──────────────────────────────────────────────────────────────────────
// Every surface above is an AGGREGATE — counts, rankings, the latest handful. This is the raw
// list: every question ever asked, searchable and paged. It answers the question the summaries
// structurally can't ("every question mentioning 'refund' since March"), and it's a pure read —
// no new tables, no migration, just the `CopilotQuery` rows that have been accumulating all along.

/** Range options for the log. Unlike the summary page, "all time" is a first-class choice here —
 *  a log you can only see 90 days of isn't a log. `days: 0` means no date filter at all. */
export const LOG_RANGE_OPTIONS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 0, label: 'All time' },
] as const;

export type LogRangeDays = (typeof LOG_RANGE_OPTIONS)[number]['days'];

/** Coerce an arbitrary `?range=` value to a supported log window (defaults to 30). */
export function parseLogRange(raw: string | string[] | undefined): LogRangeDays {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  const found = LOG_RANGE_OPTIONS.find((o) => o.days === n);
  return (found ? found.days : 30) as LogRangeDays;
}

export function logRangeLabel(days: LogRangeDays): string {
  return LOG_RANGE_OPTIONS.find((o) => o.days === days)?.label ?? `Last ${days} days`;
}

export const QUESTION_FILTERS = [
  { value: 'all', label: 'All questions' },
  { value: 'answered', label: 'Answered' },
  { value: 'declined', label: 'Declined' },
  { value: 'up', label: 'Marked helpful 👍' },
  { value: 'down', label: 'Marked unhelpful 👎' },
] as const;

export type QuestionFilter = (typeof QUESTION_FILTERS)[number]['value'];

export function parseQuestionFilter(raw: string | string[] | undefined): QuestionFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (QUESTION_FILTERS.find((f) => f.value === v)?.value ?? 'all') as QuestionFilter;
}

/** Search terms are untrusted URL input that reaches a LIKE query — trimmed and capped. */
const MAX_SEARCH_CHARS = 100;

export function parseSearch(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (v ?? '').trim().slice(0, MAX_SEARCH_CHARS);
}

export const QUESTION_LOG_PAGE_SIZE = 25;

export interface LoggedQuestion {
  id: string;
  question: string;
  contextPath: string | null;
  answered: boolean;
  feedback: string | null;
  createdAt: Date;
  /** The workflows this answer was grounded in (empty on a decline). */
  citations: { sourceId: string; segmentIndex: number | null; title: string }[];
}

export interface QuestionLog {
  rows: LoggedQuestion[];
  /** Rows matching the current filter (not the workspace total). */
  total: number;
  /** 1-based, clamped into range — a `?page=999` lands on the last real page. */
  page: number;
  pageCount: number;
  /** 1-based display bounds for "showing 26–50 of 412" (both 0 when empty). */
  from: number;
  to: number;
}

export interface QuestionLogQuery {
  days: LogRangeDays;
  filter: QuestionFilter;
  search: string;
  page: number;
}

/** Collapse a query's citation rows to one entry per workflow, preserving first-seen order. */
function dedupeByWorkflow(
  cites: { sourceId: string; segmentIndex: number | null; segmentTitle: string | null }[],
): LoggedQuestion['citations'] {
  const out: LoggedQuestion['citations'] = [];
  const seen = new Set<string>();
  for (const c of cites) {
    const key = `${c.sourceId}:${c.segmentIndex ?? '-'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      sourceId: c.sourceId,
      segmentIndex: c.segmentIndex,
      title: c.segmentTitle || 'Untitled workflow',
    });
  }
  return out;
}

/**
 * One page of the question log, newest first. Search matches the question text OR the page path
 * the user was on (case-insensitive), so "billing" finds both "how do I change billing?" and every
 * question asked while standing on `/billing`.
 *
 * Counts first, then fetches: the page has to be clamped against the real total before an offset
 * is computed, or a stale `?page=` returns an empty screen instead of the last page.
 */
export async function getQuestionLog(
  workspaceId: string,
  { days, filter, search, page }: QuestionLogQuery,
  pageSize = QUESTION_LOG_PAGE_SIZE,
): Promise<QuestionLog> {
  const where = {
    workspaceId,
    ...(days > 0 ? { createdAt: { gte: windowStart(days) } } : {}),
    ...(filter === 'answered' ? { answered: true } : {}),
    ...(filter === 'declined' ? { answered: false } : {}),
    ...(filter === 'up' ? { feedback: 'up' } : {}),
    ...(filter === 'down' ? { feedback: 'down' } : {}),
    ...(search
      ? {
          OR: [
            { question: { contains: search, mode: 'insensitive' as const } },
            { contextPath: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const total = await prisma.copilotQuery.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);

  const rows =
    total === 0
      ? []
      : await prisma.copilotQuery.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (safePage - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            question: true,
            contextPath: true,
            answered: true,
            feedback: true,
            createdAt: true,
            citations: {
              select: { sourceId: true, segmentIndex: true, segmentTitle: true },
            },
          },
        });

  return {
    rows: rows.map((r) => ({
      id: r.id,
      question: r.question,
      contextPath: r.contextPath,
      answered: r.answered,
      feedback: r.feedback,
      createdAt: r.createdAt,
      // De-duplicated by WORKFLOW so the row reads "grounded in: Invite a user" once, not six
      // times. Rows written before the 2026-07-27 writer fix still hold one citation per cited
      // STEP; new ones don't, and this collapses both to the same display either way.
      citations: dedupeByWorkflow(r.citations),
    })),
    total,
    page: safePage,
    pageCount,
    from: total === 0 ? 0 : (safePage - 1) * pageSize + 1,
    to: total === 0 ? 0 : (safePage - 1) * pageSize + rows.length,
  };
}

// ── How the answer was produced (P1-M10 / agent.md §9 Gap 2) ───────────────────────────────────
// `CopilotQuery` has recorded `engine` · `rounds` · `toolCalls` since 2026-07-29 and nothing has
// ever read them. What changed on 2026-08-02 is what they are FOR: with AI Chatbot retired there is
// one selectable mode, so "did the setting do anything?" is no longer a question — and `floor`
// became the value that matters, because it is the only engine with no mode behind it.

/** Engine → how to describe it to a founder who has never read the source. */
export const ENGINE_LABELS: Record<string, { name: string; blurb: string }> = {
  agent: {
    name: 'Copilot',
    blurb: 'Answered from your approved knowledge, searching again when the first look missed.',
  },
  reason: {
    name: 'Diagnosis',
    blurb: "Read the user's page to work out what was blocking them.",
  },
  floor: {
    name: 'Fallback',
    blurb: 'Something above it failed, so the question got one plain answer with no tools.',
  },
};

export interface AnswerPathStats {
  /** Questions in the window that recorded an engine. */
  recorded: number;
  /** Questions with no engine recorded — asked before 2026-07-29. Surfaced so a share is never
   *  read as coverage of everything that happened. */
  unrecorded: number;
  byEngine: { engine: string; count: number }[];
  /** THE ALARM. `floor` means the agent loop or the diagnostic path failed and the fallback caught
   *  it. Since AI Chatbot was retired nothing else exercises that path, so any run of these is a
   *  reliability signal rather than a configuration one — and nothing else in the product reports it. */
  floorCount: number;
  /** Answers that took more than one model call — i.e. the loop actually escalated. Round one IS
   *  the old fast path, so this is the honest measure of how often the extra rounds earn their cost. */
  escalated: number;
  /** Answers where the assistant reached for at least one tool. */
  withTools: number;
  /** What the window COST, over the questions that recorded it. Null when none did.
   *
   *  Deliberately TOKENS, not money. Converting needs a price per model, and there are two models
   *  on this path (the answer model and the stronger diagnostic one) whose rates change without
   *  warning — a hardcoded figure would drift into confidently wrong, which is worse than a number
   *  the founder converts themselves against a rate card they can see. */
  tokens: {
    /** Questions this is averaged over — never the window total, since older rows recorded nothing. */
    questions: number;
    input: number;
    cachedInput: number;
    output: number;
    reasoning: number;
  } | null;
}

/**
 * How the copilot produced its answers over the window.
 *
 * Every count is scoped to rows that actually recorded the field, and `unrecorded` is returned
 * alongside rather than folded in: a percentage computed over a partially-instrumented history
 * would quietly understate every engine, and this is the one surface whose whole job is to be
 * trusted when it says the fallback fired.
 */
export async function getAnswerPathStats(
  workspaceId: string,
  days: number,
): Promise<AnswerPathStats> {
  const where = { workspaceId, createdAt: { gte: windowStart(days) } };

  const [engineRows, unrecorded, escalated, withTools, spend] = await Promise.all([
    prisma.copilotQuery.groupBy({
      by: ['engine'],
      where: { ...where, engine: { not: null } },
      _count: { _all: true },
    }),
    prisma.copilotQuery.count({ where: { ...where, engine: null } }),
    // `rounds > 1` rather than `>= 1`: one round is the fast path every question rides, so counting
    // it as escalation would report 100% and mean nothing.
    prisma.copilotQuery.count({ where: { ...where, rounds: { gt: 1 } } }),
    prisma.copilotQuery.count({ where: { ...where, toolCalls: { gt: 0 } } }),
    // Scoped to rows that RECORDED usage — averaging over questions asked before this existed would
    // divide a real total by an inflated count and report a cost that quietly falls over time.
    prisma.copilotQuery.aggregate({
      where: { ...where, inputTokens: { not: null } },
      _count: { _all: true },
      _sum: { inputTokens: true, cachedInputTokens: true, outputTokens: true, reasoningTokens: true },
    }),
  ]);

  // Rows written before 2026-08-02 call the same engine `chatbot` — it was a sellable mode then and
  // is the unsellable fallback now. Folded together at read time rather than back-filled: the rows
  // are not wrong, they are the old name for the same thing, and a history that spans the rename
  // should read as one line rather than two.
  const merged = new Map<string, number>();
  for (const r of engineRows) {
    const engine = r.engine === 'chatbot' ? 'floor' : (r.engine as string);
    merged.set(engine, (merged.get(engine) ?? 0) + r._count._all);
  }
  const byEngine = [...merged.entries()]
    .map(([engine, count]) => ({ engine, count }))
    .sort((a, b) => b.count - a.count);

  return {
    recorded: byEngine.reduce((n, e) => n + e.count, 0),
    unrecorded,
    byEngine,
    floorCount: merged.get('floor') ?? 0,
    escalated,
    withTools,
    tokens:
      spend._count._all === 0
        ? null
        : {
            questions: spend._count._all,
            input: spend._sum.inputTokens ?? 0,
            cachedInput: spend._sum.cachedInputTokens ?? 0,
            output: spend._sum.outputTokens ?? 0,
            reasoning: spend._sum.reasoningTokens ?? 0,
          },
  };
}
