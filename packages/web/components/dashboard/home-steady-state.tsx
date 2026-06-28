import Link from 'next/link';
import { Mic, ThumbsDown, ThumbsUp } from 'lucide-react';

import type { CopilotMetrics } from '@/lib/copilot-metrics';
import { resolveCoverageGap } from '@/lib/copilot-actions';
import { cn } from '@/lib/utils';
import { MetricCard } from '@/components/dashboard/metric-card';
import { MiniBarChart, ChartLegend } from '@/components/dashboard/mini-bar-chart';
import { StatusBadge } from '@/components/dashboard/status-badge';
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
        <span className="font-semibold text-ink">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[color:var(--gray-100)]">
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
    <div className="space-y-3.5">
      {/* live / ready strip */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-2.5 rounded-tile border px-3.5 py-2.5',
          isEmbedded
            ? 'border-success-border bg-success-bg'
            : 'border-brand-200 bg-brand-50',
        )}
      >
        <span
          className={cn(
            'h-2.5 w-2.5 shrink-0 rounded-full',
            isEmbedded ? 'bg-success-dot' : 'bg-primary',
          )}
        />
        <span
          className={cn(
            'text-[12.5px] font-semibold',
            isEmbedded ? 'text-success-text2' : 'text-primary',
          )}
        >
          {isEmbedded ? 'Copilot is live' : 'Copilot is ready'}
        </span>
        <span className="text-[12.5px] text-secondary-foreground">
          {isEmbedded
            ? `${metrics.answered} questions answered this week`
            : `${approved} approved workflows — add the snippet to go live`}
        </span>
        <Link
          href="/dashboard/copilot"
          className="ml-auto font-mono text-[11.5px] font-semibold text-muted-foreground hover:text-foreground"
        >
          {isEmbedded ? 'View install ▸' : 'Get snippet ▸'}
        </Link>
      </div>

      {/* metric tiles */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard value={recordings} label="Recordings" />
        <MetricCard value={workflows} label="Workflows" />
        <MetricCard value={approved} label="Approved · live" />
        <MetricCard value={metrics.window} label="Questions · 7d" />
        <MetricCard value={`${metrics.answeredPct}%`} label="Answered" />
        <MetricCard value={`${metrics.helpfulPct}%`} label="Helpful" />
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.7fr_1fr]">
        {/* main column */}
        <div className="min-w-0 space-y-3.5">
          <section className="rounded-card border bg-card p-4 shadow-card">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink">Record this next</h3>
              <StatusBadge tone="danger" dot={false}>
                {gaps.length} {gaps.length === 1 ? 'gap' : 'gaps'}
              </StatusBadge>
            </div>
            <p className="mt-0.5 text-xs text-faint">
              Questions the copilot couldn’t fully answer. Record these to close
              the gap.
            </p>
            {gaps.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No open gaps — your approved workflows are covering what’s being
                asked.
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
                        {g.reason || 'no workflow covers this yet'}
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

          <section className="rounded-card border bg-card p-4 shadow-card">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink">
                Recent copilot questions
              </h3>
              <Link
                href="/dashboard/analytics"
                className="font-mono text-[11px] font-semibold text-muted-foreground hover:text-foreground"
              >
                View all ▸
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
                    <span className="min-w-0 flex-1 truncate text-[13px] text-secondary-foreground">
                      {q.question}
                    </span>
                    {q.feedback && (
                      <span className="text-faint">
                        {q.feedback === 'up' ? (
                          <ThumbsUp className="h-3.5 w-3.5 text-success-dot" />
                        ) : (
                          <ThumbsDown className="h-3.5 w-3.5" />
                        )}
                      </span>
                    )}
                    <StatusBadge tone={q.answered ? 'success' : 'danger'} dot={false}>
                      {q.answered ? 'Answered' : 'Declined'}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* right rail */}
        <aside className="min-w-0 space-y-3.5">
          <section className="rounded-card border bg-[#fbfcff] p-4 shadow-card">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-ink">Pending approvals</h3>
              {pendingApprovals > 0 && (
                <span className="rounded-pill bg-warning-dot px-[7px] py-px font-mono text-[10px] font-bold text-white">
                  {pendingApprovals}
                </span>
              )}
            </div>
            <p className="mt-1 text-[12.5px] leading-normal text-faint">
              {pendingApprovals > 0
                ? `${pendingApprovals} new workflows are waiting to go live in the copilot.`
                : 'Everything’s approved — nothing waiting.'}
            </p>
            {pendingApprovals > 0 && (
              <Button asChild className="mt-3 w-full">
                <Link href="/dashboard/kb">Review &amp; approve</Link>
              </Button>
            )}
          </section>

          <section className="rounded-card border bg-card p-4 shadow-card">
            <h3 className="text-sm font-bold text-ink">Copilot health</h3>
            <div className="mt-3 space-y-2.5">
              <HealthBar label="Answered" pct={metrics.answeredPct} color="bg-primary" />
              <HealthBar
                label="Honest declines"
                pct={metrics.declinePct}
                color="bg-danger-ink"
              />
              <HealthBar
                label="Helpful (👍)"
                pct={metrics.helpfulPct}
                color="bg-success-dot"
              />
            </div>
          </section>

          <section className="rounded-card border bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-bold text-ink">
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
