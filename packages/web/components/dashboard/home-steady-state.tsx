import Link from 'next/link';
import { ArrowRight, CheckCircle2, Mic, ThumbsDown, ThumbsUp } from 'lucide-react';

import type { CopilotMetrics } from '@/lib/copilot-metrics';
import { cn } from '@/lib/utils';
import { MetricCard } from '@/components/dashboard/metric-card';
import { MiniBarChart, ChartLegend } from '@/components/dashboard/mini-bar-chart';
import { Button } from '@/components/ui/button';

export interface SteadyGap {
  id: string;
  prompt: string;
  reason: string | null;
}
export interface SteadyQuestion {
  id: string;
  question: string;
  answered: boolean;
  feedback: string | null;
}

function HealthBar({
  label,
  pct,
  color,
}: {
  label: string;
  pct: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-semibold">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function HomeSteadyState({
  recordings,
  workflows,
  approved,
  pendingApprovals,
  metrics,
  gaps,
  recent,
  isEmbedded,
}: {
  recordings: number;
  workflows: number;
  approved: number;
  pendingApprovals: number;
  metrics: CopilotMetrics;
  gaps: SteadyGap[];
  recent: SteadyQuestion[];
  isEmbedded: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* live / ready strip */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-sm',
          isEmbedded
            ? 'border-green-200 bg-green-50/70'
            : 'border-primary/20 bg-primary/[0.06]',
        )}
      >
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full text-white',
            isEmbedded ? 'bg-green-600' : 'bg-primary',
          )}
        >
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold tracking-tight">
            {isEmbedded ? 'Your copilot is live' : 'Your copilot is ready'}
          </div>
          <div className="text-xs text-muted-foreground">
            {isEmbedded
              ? `${metrics.answered} questions answered in the last 7 days`
              : `${approved} approved workflows — add the snippet to go live`}
          </div>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-primary">
          <Link href="/dashboard/copilot">
            {isEmbedded ? 'View install' : 'Get snippet'}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* metric tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard value={recordings} label="Recordings" />
        <MetricCard value={workflows} label="Workflows" />
        <MetricCard value={approved} label="Approved · live" />
        <MetricCard value={metrics.window} label="Questions · 7d" />
        <MetricCard value={`${metrics.answeredPct}%`} label="Answered" />
        <MetricCard value={`${metrics.helpfulPct}%`} label="Helpful" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* main column */}
        <div className="min-w-0 space-y-6">
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight">
                Record this next
              </h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-primary">
                {gaps.length} {gaps.length === 1 ? 'gap' : 'gaps'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Questions the copilot couldn’t fully answer. Record these to close
              the gap.
            </p>
            {gaps.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No open gaps — your approved workflows are covering what’s being
                asked.
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
                        {g.reason || 'no workflow covers this yet'}
                      </span>
                    </span>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/dashboard/recordings">
                        <Mic className="h-4 w-4" />
                        Record
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight">
                Recent copilot questions
              </h3>
              <Link
                href="/dashboard/analytics"
                className="text-xs font-medium text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            {recent.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No questions yet — they’ll appear here once the copilot is live.
              </p>
            ) : (
              <ul className="mt-3 divide-y">
                {recent.map((q) => (
                  <li key={q.id} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {q.question}
                    </span>
                    {q.feedback && (
                      <span className="text-muted-foreground">
                        {q.feedback === 'up' ? (
                          <ThumbsUp className="h-3.5 w-3.5" />
                        ) : (
                          <ThumbsDown className="h-3.5 w-3.5" />
                        )}
                      </span>
                    )}
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase',
                        q.answered
                          ? 'bg-green-100 text-green-800'
                          : 'bg-amber-100 text-amber-800',
                      )}
                    >
                      {q.answered ? 'Answered' : 'Declined'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* right rail */}
        <aside className="min-w-0 space-y-6">
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight">
                Pending approvals
              </h3>
              <span className="text-2xl font-extrabold tracking-tight text-primary">
                {pendingApprovals}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {pendingApprovals > 0
                ? 'New workflows are waiting to go live in the copilot.'
                : 'Everything’s approved — nothing waiting.'}
            </p>
            {pendingApprovals > 0 && (
              <Button asChild size="sm" className="mt-3 w-full">
                <Link href="/dashboard/kb">Review &amp; approve</Link>
              </Button>
            )}
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold tracking-tight">
              Copilot health
            </h3>
            <div className="mt-3 space-y-3">
              <HealthBar label="Answered" pct={metrics.answeredPct} color="bg-primary" />
              <HealthBar
                label="Honest declines"
                pct={metrics.declinePct}
                color="bg-amber-400"
              />
              <HealthBar
                label="Helpful (👍)"
                pct={metrics.helpfulPct}
                color="bg-green-500"
              />
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight">
                Questions · this week
              </h3>
              <ChartLegend />
            </div>
            <MiniBarChart data={metrics.byDay} />
          </section>
        </aside>
      </div>
    </div>
  );
}
