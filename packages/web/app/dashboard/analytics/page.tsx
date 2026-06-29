import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Mic } from 'lucide-react';

import { getCurrentWorkspace } from '@/lib/session';
import { resolveCoverageGap } from '@/lib/copilot-actions';
import { getCopilotMetrics } from '@/lib/copilot-metrics';
import {
  RANGE_OPTIONS,
  parseRange,
  rangeLabel,
  getTopWorkflowsByCitations,
  getCoverageGapsRanked,
  getRecentDeclines,
} from '@/lib/analytics';
import { PageHeader } from '@/components/dashboard/page-header';
import { MetricCard } from '@/components/dashboard/metric-card';
import { MiniBarChart, ChartLegend } from '@/components/dashboard/mini-bar-chart';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { AnalyticsRange } from '@/components/dashboard/analytics-range';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const ctx = await getCurrentWorkspace();
  if (!ctx) redirect('/signin');
  const wsId = ctx.workspace.id;

  const days = parseRange((await searchParams).range);
  const label = rangeLabel(days).toLowerCase();

  const [metrics, topWorkflows, gaps, declines] = await Promise.all([
    getCopilotMetrics(wsId, days),
    getTopWorkflowsByCitations(wsId, days),
    getCoverageGapsRanked(wsId),
    getRecentDeclines(wsId),
  ]);

  const rangeControl = <AnalyticsRange value={days} options={RANGE_OPTIONS} />;

  // First-run: copilot has never been asked anything yet (F16).
  if (metrics.total === 0) {
    return (
      <>
        <PageHeader
          title="Analytics"
          subtitle="Answer quality, deflection, and what to record next."
          actions={rangeControl}
        />
        <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {['Questions', 'Answered', 'Declines', 'Helpful', 'Deflected'].map(
              (l) => (
                <MetricCard key={l} value="—" label={l} />
              ),
            )}
          </div>
          <div className="mt-6 rounded-card border bg-card p-10 text-center shadow-card">
            <h2 className="text-[17px] font-bold tracking-tight text-secondary-foreground">
              No questions yet
            </h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
              As soon as your customers start asking, you’ll see answer rate,
              deflection and coverage gaps here. Usually within the first day.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-5">
              <Link href="/dashboard/copilot">Preview the copilot</Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  const maxCitations = Math.max(1, ...topWorkflows.map((w) => w.count));

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Answer quality, deflection, and what to record next."
        actions={rangeControl}
      />
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-8">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <MetricCard value={metrics.window} label="Questions" />
          <MetricCard value={`${metrics.answeredPct}%`} label="Answered" />
          <MetricCard value={`${metrics.declinePct}%`} label="Honest declines" />
          <MetricCard value={`${metrics.helpfulPct}%`} label="Helpful 👍" />
          <MetricCard
            value={`≈${metrics.answered}`}
            label="Tickets deflected"
            sublabel="answered without a human"
            tone="success"
          />
        </div>

        <section className="rounded-card border bg-card p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13.5px] font-bold text-ink">
              Questions &amp; answer rate
            </h3>
            <ChartLegend />
          </div>
          <MiniBarChart
            data={metrics.byDay}
            height={150}
            emptyLabel={`No questions in the ${label} yet.`}
          />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0 rounded-card border bg-card p-5 shadow-card">
            <div className="flex items-center justify-between">
              <h3 className="text-[13.5px] font-bold text-ink">
                Coverage gaps — record this next
              </h3>
              <StatusBadge tone="danger" dot={false}>
                {gaps.length} open
              </StatusBadge>
            </div>
            <p className="mt-0.5 text-xs text-faint">
              Questions the copilot was asked and couldn’t answer from approved
              workflows — ranked by how often.
            </p>
            {gaps.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No open gaps right now.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {gaps.map((g) => (
                  <li
                    key={g.id}
                    className="flex items-center gap-3 rounded-control border px-3 py-2.5"
                  >
                    <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-danger-ink" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-secondary-foreground">
                        {g.prompt}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-faint">
                        asked {g.askedCount}× · {g.reason || 'no coverage'}
                      </span>
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button asChild variant="soft" size="sm">
                        <Link href="/dashboard/recordings">
                          <Mic className="h-4 w-4" />
                          Record
                        </Link>
                      </Button>
                      <form action={resolveCoverageGap.bind(null, g.id)}>
                        <Button type="submit" variant="ghost" size="sm">
                          Dismiss
                        </Button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="min-w-0 space-y-6">
            <section className="rounded-card border border-success-border bg-success-bg p-5 shadow-card">
              <h3 className="text-[13.5px] font-bold text-success-text2">
                Resolved without a human
              </h3>
              <div className="mt-1 text-[28px] font-extrabold tracking-tight text-success-text2">
                {metrics.answeredPct}%
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-success-dot">
                ≈ {metrics.answered} questions your team didn’t have to touch in
                the {label}.
              </p>
            </section>

            <section className="rounded-card border bg-card p-5 shadow-card">
              <h3 className="text-[13.5px] font-bold text-ink">
                Top workflows by citations
              </h3>
              {topWorkflows.length === 0 ? (
                <p className="mt-2 rounded-md border border-dashed bg-[color:var(--paper-2)] px-2.5 py-2 text-[11px] text-muted-foreground">
                  No grounded answers cited a workflow yet — this ranking fills
                  in as the copilot answers from your approved recordings.
                </p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {topWorkflows.map((w) => (
                    <li
                      key={`${w.sourceId}:${w.segmentIndex ?? '-'}`}
                      className="flex items-center gap-2.5"
                    >
                      <Link
                        href={`/dashboard/kb/${w.sourceId}`}
                        className="min-w-0 flex-1 truncate text-[12.5px] text-secondary-foreground hover:text-primary hover:underline"
                        title={w.title}
                      >
                        {w.title}
                      </Link>
                      <span className="h-1.5 w-[70px] shrink-0 overflow-hidden rounded-full bg-[color:var(--gray-100)]">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${(w.count / maxCitations) * 100}%` }}
                        />
                      </span>
                      <span className="w-7 shrink-0 text-right font-mono text-[11px] text-secondary-foreground">
                        {w.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-card border bg-card p-5 shadow-card">
              <h3 className="text-[13.5px] font-bold text-ink">
                Recent declines
              </h3>
              {declines.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  No declines — every question was covered.
                </p>
              ) : (
                <ul className="mt-2 space-y-px">
                  {declines.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-baseline justify-between gap-2 border-b border-[color:var(--gray-100)] py-1.5 last:border-0"
                    >
                      <span className="min-w-0 flex-1 truncate text-[13px] text-secondary-foreground">
                        {d.question}
                      </span>
                      {d.contextPath && (
                        <span className="shrink-0 font-mono text-[10px] text-faint">
                          {d.contextPath}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
