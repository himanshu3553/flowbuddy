import { prisma } from '@sync/db';

export interface DayBucket {
  label: string;
  answered: number;
  declined: number;
}

export interface CopilotMetrics {
  /** All-time question count — used to decide first-run vs. populated states. */
  total: number;
  /** Questions in the last 7 days. */
  window: number;
  answered: number;
  declined: number;
  up: number;
  down: number;
  answeredPct: number;
  declinePct: number;
  helpfulPct: number;
  /** Last 7 days, oldest → newest. */
  byDay: DayBucket[];
}

/** Days per bucket so the chart shows a readable ~7–13 bars for any range. */
function bucketSizeFor(days: number): number {
  if (days <= 7) return 1;
  if (days <= 30) return 3;
  return 7;
}

/**
 * Copilot answer-quality metrics over the last `days` days (+ all-time total), plus a
 * bucketed answered/declined series for the chart. Shared by Home steady-state (7-day
 * default) and Analytics (selectable range) so both read identically. Server-only.
 */
export async function getCopilotMetrics(
  workspaceId: string,
  days = 7,
): Promise<CopilotMetrics> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1)); // `days` calendar days incl. today

  const [total, recent] = await Promise.all([
    prisma.copilotQuery.count({ where: { workspaceId } }),
    prisma.copilotQuery.findMany({
      where: { workspaceId, createdAt: { gte: start } },
      select: { answered: true, feedback: true, createdAt: true },
    }),
  ]);

  const bucketSize = bucketSizeFor(days);
  const bucketCount = Math.ceil(days / bucketSize);
  const byDay: DayBucket[] = Array.from({ length: bucketCount }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i * bucketSize);
    return {
      label:
        bucketSize === 1
          ? d.toLocaleDateString('en-US', { weekday: 'short' })
          : d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
      answered: 0,
      declined: 0,
    };
  });

  let answered = 0;
  let up = 0;
  let down = 0;
  for (const q of recent) {
    const d = new Date(q.createdAt);
    d.setHours(0, 0, 0, 0);
    const dayOffset = Math.round((d.getTime() - start.getTime()) / 86_400_000);
    const idx = Math.floor(dayOffset / bucketSize);
    if (q.answered) answered++;
    if (q.feedback === 'up') up++;
    else if (q.feedback === 'down') down++;
    if (idx >= 0 && idx < bucketCount) {
      if (q.answered) byDay[idx]!.answered++;
      else byDay[idx]!.declined++;
    }
  }

  const window = recent.length;
  const declined = window - answered;
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

  return {
    total,
    window,
    answered,
    declined,
    up,
    down,
    answeredPct: pct(answered, window),
    declinePct: pct(declined, window),
    helpfulPct: pct(up, up + down),
    byDay,
  };
}
