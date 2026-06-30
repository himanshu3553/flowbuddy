import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Check, Lock } from 'lucide-react';

import { auth } from '@/auth';
import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';
import { resolveCoverageGap } from '@/lib/copilot-actions';
import { listCandidates } from '@/lib/candidates';
import { getCopilotMetrics } from '@/lib/copilot-metrics';
import { getEmbedStatus } from '@/lib/embed-status';
import { PageHeader } from '@/components/dashboard/page-header';
import { ProgressRing } from '@/components/dashboard/progress-ring';
import { HomeHelpDialogs } from '@/components/dashboard/home-help-dialogs';
import { HomeSteadyState } from '@/components/dashboard/home-steady-state';
import { StatusBadge } from '@/components/dashboard/status-badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  const ctx = await getCurrentWorkspace();
  if (!session?.user || !ctx) redirect('/signin');
  const wsId = ctx.workspace.id;
  const isEmbedded = getEmbedStatus(ctx.workspace).detected;

  const [
    tokenCount,
    readyCount,
    approvalCount,
    queryCount,
    openGaps,
    sourceCount,
    candidates,
    metrics,
    recentQueries,
  ] = await Promise.all([
    prisma.apiToken.count({ where: { workspaceId: wsId } }),
    prisma.knowledgeSource.count({
      where: { workspaceId: wsId, status: { in: ['ready', 'done'] } },
    }),
    prisma.copilotApproval.count({ where: { workspaceId: wsId } }),
    prisma.copilotQuery.count({ where: { workspaceId: wsId } }),
    prisma.coverageGap.findMany({
      where: { workspaceId: wsId, status: 'open' },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
    prisma.knowledgeSource.count({ where: { workspaceId: wsId } }),
    listCandidates(wsId),
    getCopilotMetrics(wsId),
    prisma.copilotQuery.findMany({
      where: { workspaceId: wsId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  // Chrome Web Store listing for the Sync Recorder. When set, the install CTA
  // opens the store ("Add to Chrome"); until the extension is published it
  // falls back to Settings (where the token + load-unpacked steps live).
  const extensionStoreUrl = process.env.SYNC_EXTENSION_URL?.trim();

  const steps = [
    {
      done: tokenCount > 0,
      title: 'Install the Sync Recorder',
      desc: 'Chrome extension · one-click “Connect with Sync”',
      cta: {
        label: 'Install Chrome Extension',
        href: extensionStoreUrl || '/dashboard/settings',
        external: Boolean(extensionStoreUrl),
      },
    },
    {
      done: readyCount > 0,
      title: 'Record your product',
      desc: 'Narrate a real workflow — “reset a password… now upgrade a plan…”',
      cta: { label: 'Open recorder', href: '/dashboard/recordings', external: false },
    },
    {
      done: approvalCount > 0,
      title: 'Approve workflows for the copilot',
      desc: 'One click each — the copilot answers only from what you approve',
      cta: { label: 'Review & approve', href: '/dashboard/recordings', external: false },
    },
    {
      done: isEmbedded,
      title: 'Embed the copilot',
      desc: 'Paste one snippet into your product — go live for your customers',
      cta: { label: 'Get snippet', href: '/dashboard/copilot', external: false },
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const activeIndex = steps.findIndex((s) => !s.done);

  const showSteady = queryCount > 0 || approvalCount > 0 || isEmbedded;
  const pendingApprovals = candidates.filter((c) => !c.copilotApproved).length;

  if (showSteady) {
    return (
      <>
        <PageHeader
          title="Home"
          subtitle="Your copilot at a glance."
          actions={<HomeHelpDialogs />}
        />
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
          <HomeSteadyState
            recordings={sourceCount}
            workflows={candidates.length}
            approved={approvalCount}
            pendingApprovals={pendingApprovals}
            metrics={metrics}
            gaps={openGaps.slice(0, 5).map((g) => ({
              id: g.id,
              prompt: g.prompt,
              reason: g.reason,
            }))}
            recent={recentQueries.map((r) => ({
              id: r.id,
              question: r.question,
              answered: r.answered,
              feedback: r.feedback,
            }))}
            isEmbedded={isEmbedded}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Home"
        subtitle="Let’s get your copilot live."
        actions={<HomeHelpDialogs />}
      />
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 md:px-8">
        <section className="rounded-card border bg-card p-6 shadow-card">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.1em] text-faint">
            Get started
          </div>
          <div className="mt-3 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[21px] font-extrabold tracking-tight">
                Get your copilot live
              </h2>
              <p className="mt-1 max-w-[480px] text-[13px] leading-relaxed text-muted-foreground">
                Record once, approve the workflows it may use, paste one snippet.
                Your customers get grounded in-app answers in about half an hour.
              </p>
            </div>
            <ProgressRing value={doneCount} total={steps.length} />
          </div>

          <ol className="mt-5 space-y-2.5">
            {steps.map((s, i) => {
              const active = i === activeIndex;
              const locked = !s.done && !active;
              return (
                <li
                  key={i}
                  className={cn(
                    'flex items-center gap-3.5 rounded-list border p-3.5',
                    s.done && 'border-success-border bg-success-bg',
                    active && 'border-brand-200 bg-card shadow-step',
                    locked && 'border-border bg-[color:var(--paper-2)] opacity-80',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
                      s.done && 'bg-gradient-to-br from-[#1aa86a] to-[#15935a] text-white',
                      active && 'border-2 border-primary text-primary',
                      locked && 'bg-secondary text-faint',
                    )}
                  >
                    {s.done ? (
                      <Check className="h-4 w-4" />
                    ) : locked ? (
                      <Lock className="h-3.5 w-3.5" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        'text-sm font-semibold',
                        locked && 'text-muted-foreground',
                      )}
                    >
                      {s.title}
                    </div>
                    <div
                      className={cn(
                        'mt-0.5 text-xs',
                        locked
                          ? 'text-muted-foreground/70'
                          : 'text-muted-foreground',
                      )}
                    >
                      {s.desc}
                    </div>
                  </div>
                  {s.done && (
                    <StatusBadge tone="success" dot={false} className="shrink-0">
                      Done
                    </StatusBadge>
                  )}
                  {active && (
                    <Button asChild size="sm" className="shrink-0">
                      {s.cta.external ? (
                        <a
                          href={s.cta.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {s.cta.label}
                        </a>
                      ) : (
                        <Link href={s.cta.href}>{s.cta.label}</Link>
                      )}
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        {openGaps.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Record this next — coverage gaps
              </CardTitle>
              <CardDescription>
                Questions your copilot couldn’t answer from approved workflows.
                Record (and approve) these to close the gap.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {openGaps.map((g) => (
                  <li key={g.id} className="flex items-center gap-3 py-3">
                    <Badge variant="secondary" className="capitalize">
                      {g.source}
                    </Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {g.prompt}
                      </span>
                      {g.reason && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {g.reason}
                        </span>
                      )}
                    </span>
                    <form action={resolveCoverageGap.bind(null, g.id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        Dismiss
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
