import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Mic } from 'lucide-react';

import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';
import { resolveCoverageGap } from '@/lib/copilot-actions';
import { getCopilotMetrics } from '@/lib/copilot-metrics';
import { PageHeader } from '@/components/dashboard/page-header';
import { MetricCard } from '@/components/dashboard/metric-card';
import { MiniBarChart, ChartLegend } from '@/components/dashboard/mini-bar-chart';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const ctx = await getCurrentWorkspace();
  if (!ctx) redirect('/signin');
  const wsId = ctx.workspace.id;

  const [metrics, gaps, declines] = await Promise.all([
    getCopilotMetrics(wsId),
    prisma.coverageGap.findMany({
      where: { workspaceId: wsId, status: 'open' },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.copilotQuery.findMany({
      where: { workspaceId: wsId, answered: false },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const dateChip = (
    <span className="rounded-full border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
      Last 7 days
    </span>
  );

  // First-run: copilot has never been asked anything yet (F16).
  if (metrics.total === 0) {
    return (
      <>
        <PageHeader
          title="Analytics"
          subtitle="Answer quality, deflection, and what to record next."
          actions={dateChip}
        />
        <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {['Questions', 'Answered', 'Declines', 'Helpful', 'Deflected'].map(
              (l) => (
                <MetricCard key={l} value="—" label={l} />
              ),
            )}
          </div>
          <div className="mt-6 rounded-2xl border bg-card p-10 text-center shadow-sm">
            <h2 className="text-lg font-bold tracking-tight">
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

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Answer quality, deflection, and what to record next."
        actions={dateChip}
      />
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MetricCard value={metrics.window} label="Questions" />
          <MetricCard value={`${metrics.answeredPct}%`} label="Answered" />
          <MetricCard value={`${metrics.declinePct}%`} label="Honest declines" />
          <MetricCard value={`${metrics.helpfulPct}%`} label="Helpful 👍" />
          <MetricCard
            value={`≈${metrics.answered}`}
            label="Tickets deflected"
            sublabel="answered without a human"
            tone="primary"
          />
        </div>

        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-tight">
              Questions &amp; answer rate
            </h3>
            <ChartLegend />
          </div>
          <MiniBarChart data={metrics.byDay} height={150} />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0 rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight">
                Coverage gaps — record this next
              </h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-primary">
                {gaps.length} open
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Questions the copilot was asked and couldn’t answer from approved
              workflows.
            </p>
            {gaps.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No open gaps right now.
              </p>
            ) : (
              <ul className="mt-3 divide-y">
                {gaps.map((g) => (
                  <li key={g.id} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {g.prompt}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {g.reason || 'no coverage'}
                      </span>
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button asChild variant="outline" size="sm">
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
            <section className="rounded-xl border border-primary/20 bg-primary/[0.05] p-5 shadow-sm">
              <h3 className="text-sm font-semibold tracking-tight">
                Resolved without a human
              </h3>
              <div className="mt-1 text-3xl font-extrabold tracking-tight text-primary">
                {metrics.answeredPct}%
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                ≈ {metrics.answered} questions your team didn’t have to touch in
                the last 7 days.
              </p>
            </section>

            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <h3 className="text-sm font-semibold tracking-tight">
                Top workflows by citations
              </h3>
              <p className="mt-2 rounded-md border border-dashed bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
                Per-workflow citation counts aren’t tracked yet — this ranking
                appears once citation logging lands.
              </p>
            </section>

            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <h3 className="text-sm font-semibold tracking-tight">
                Recent declines
              </h3>
              {declines.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  No declines — every question was covered.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {declines.map((d) => (
                    <li key={d.id} className="truncate text-sm">
                      {d.question}
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
