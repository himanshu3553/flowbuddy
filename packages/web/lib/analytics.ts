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
 */
export async function getTopWorkflowsByCitations(
  workspaceId: string,
  days: number,
  take = 6,
): Promise<TopWorkflow[]> {
  const rows = await prisma.queryCitation.findMany({
    where: { workspaceId, createdAt: { gte: windowStart(days) } },
    select: { sourceId: true, segmentIndex: true, segmentTitle: true },
  });

  const map = new Map<string, TopWorkflow>();
  for (const r of rows) {
    const key = `${r.sourceId}:${r.segmentIndex ?? '-'}`;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
      if (r.segmentTitle) existing.title = r.segmentTitle; // keep the most recent title
    } else {
      map.set(key, {
        sourceId: r.sourceId,
        segmentIndex: r.segmentIndex,
        title: r.segmentTitle || 'Untitled workflow',
        count: 1,
      });
    }
  }

  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, take);
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
 */
export async function getWorkflowCopilotStats(
  workspaceId: string,
  sourceId: string,
  segmentIndex: number,
): Promise<WorkflowCopilotStats> {
  const citations = await prisma.queryCitation.findMany({
    where: { workspaceId, sourceId, segmentIndex },
    select: { createdAt: true, query: { select: { feedback: true } } },
    orderBy: { createdAt: 'desc' },
  });

  let helpfulUp = 0;
  let helpfulDown = 0;
  for (const c of citations) {
    if (c.query?.feedback === 'up') helpfulUp++;
    else if (c.query?.feedback === 'down') helpfulDown++;
  }

  return {
    citedCount: citations.length,
    lastCitedAt: citations[0]?.createdAt ?? null,
    helpfulUp,
    helpfulDown,
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
