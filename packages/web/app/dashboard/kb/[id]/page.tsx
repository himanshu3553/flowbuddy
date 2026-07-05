import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CheckCircle2, ChevronLeft, ThumbsDown, ThumbsUp } from 'lucide-react';
import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';
import { signedUrl, sessionObjectKey } from '@/lib/storage';
import { relativeTime } from '@/lib/recordings';
import { getWorkflowCopilotStats } from '@/lib/analytics';
import { PageHeader } from '@/components/dashboard/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { StepScreenshot } from '@/components/dashboard/step-screenshot';

export const dynamic = 'force-dynamic';

// The distilled-step shape persisted in KnowledgeItem.data (see docs/kb-step-distillation.md).
type StepData = {
  instruction?: string;
  detail?: string;
  route?: string;
  narration?: string | null;
  screenshotFile?: string | null;
  bbox?: { x: number; y: number; w: number; h: number } | null; // clicked element rect (viewport px)
};

export default async function KbWorkflowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ wf?: string }>;
}) {
  const { id } = await params;
  const { wf } = await searchParams;
  const ctx = await getCurrentWorkspace();
  if (!ctx) redirect('/signin');

  const source = await prisma.knowledgeSource.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: {
      items: { orderBy: [{ segmentIndex: 'asc' }, { orderIndex: 'asc' }] },
    },
  });
  if (!source) notFound();

  // This page is WORKFLOW-scoped: the URL is the recording (sourceId), `?wf` selects the workflow
  // (segmentIndex) within it. Default to the recording's first workflow when `?wf` is absent/invalid.
  const segments = [
    ...new Set(
      source.items
        .map((it) => it.segmentIndex)
        .filter((s): s is number => s != null),
    ),
  ].sort((a, b) => a - b);
  const wfNum = Number(wf);
  const selected: number | null =
    Number.isInteger(wfNum) && segments.includes(wfNum)
      ? wfNum
      : segments[0] ?? null;

  const segmentItems = source.items.filter((it) => it.segmentIndex === selected);

  // Capture-time viewport (from the raw manifest) — lets the client scale each bbox into a
  // DPR-independent highlight on the screenshot. Absent on very old recordings → no highlight.
  const viewport =
    (source.manifest as { app?: { viewport?: { w: number; h: number } } } | null)?.app?.viewport ??
    null;

  const items = await Promise.all(
    segmentItems.map(async (it) => {
      const d = (it.data as unknown as StepData) ?? {};
      return {
        id: it.id,
        orderIndex: it.orderIndex,
        instruction: d.instruction ?? it.text, // distilled instruction; fall back to searchable text
        detail: d.detail ?? '',
        narration: d.narration ?? null,
        route: d.route ?? '',
        bbox: d.bbox ?? null,
        screenshotUrl: d.screenshotFile
          ? await signedUrl(sessionObjectKey(ctx.workspace.id, source.id, d.screenshotFile))
          : null,
      };
    }),
  );

  const workflowTitle =
    segmentItems.find((it) => it.segmentTitle)?.segmentTitle ??
    (selected == null ? 'Ungrouped steps' : `Workflow ${selected + 1}`);
  const recordingName = source.title || source.appBaseUrl || 'Recording';
  const ready = source.status === 'ready' || source.status === 'done';

  const stats =
    selected != null
      ? await getWorkflowCopilotStats(ctx.workspace.id, source.id, selected)
      : null;

  // Approval state (the P1-M5 trust gate) — the copilot only cites APPROVED workflows, so the
  // status box below must not claim citability without it.
  const approved =
    selected != null &&
    (await prisma.copilotApproval.findFirst({
      where: { workspaceId: ctx.workspace.id, sourceId: source.id, segmentIndex: selected },
      select: { id: true },
    })) != null;
  const shotCount = items.filter((it) => it.screenshotUrl).length;

  const feedbackValue: ReactNode =
    stats && stats.helpfulUp + stats.helpfulDown > 0 ? (
      <span className="inline-flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-success-text">
          <ThumbsUp className="h-3 w-3" />
          {stats.helpfulUp}
        </span>
        <span className="inline-flex items-center gap-1 text-danger-text">
          <ThumbsDown className="h-3 w-3" />
          {stats.helpfulDown}
        </span>
      </span>
    ) : (
      '—'
    );

  const statRows: { label: string; value: ReactNode }[] = [
    { label: 'Cited by copilot', value: stats && stats.citedCount > 0 ? `${stats.citedCount}×` : '—' },
    {
      label: 'Last cited',
      value: stats?.lastCitedAt ? relativeTime(stats.lastCitedAt) : '—',
    },
    { label: 'Helpful', value: feedbackValue },
  ];

  return (
    <>
      <PageHeader
        title={workflowTitle}
        subtitle={`${items.length} step${items.length === 1 ? '' : 's'} · from “${recordingName}”`}
        actions={<StatusBadge status={source.status} />}
      />
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8">
        <Link
          href="/dashboard/kb"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Knowledge Base
        </Link>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-5">
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                Workflow steps
              </h2>
              <p className="text-sm text-muted-foreground">
                The clean, grounded steps the copilot grounds on — screenshot,
                instruction, route and narration.
              </p>
            </div>

            {items.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  {ready
                    ? 'This workflow has no steps.'
                    : 'Knowledge Base is still building — steps appear once it is ready.'}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 font-mono text-[10px] font-bold text-primary">
                      WF
                    </span>
                    {workflowTitle}
                    <span className="font-normal text-muted-foreground">
                      · {items.length} steps
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-0 divide-y">
                  {items.map((it) => (
                    <div
                      key={it.id}
                      className="grid grid-cols-1 gap-4 py-4 first:pt-0 sm:grid-cols-[minmax(0,1fr)_180px]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-primary text-[11px] font-bold text-primary">
                            {it.orderIndex + 1}
                          </span>
                          {it.route && (
                            <span className="truncate rounded-md bg-muted px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                              {it.route}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm font-medium">{it.instruction}</p>
                        {it.detail && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {it.detail}
                          </p>
                        )}
                        {it.narration && (
                          <p className="mt-2 border-l-2 border-brand-200 pl-2.5 text-xs italic leading-relaxed text-muted-foreground">
                            {it.narration}
                          </p>
                        )}
                      </div>
                      {it.screenshotUrl && (
                        <StepScreenshot
                          url={it.screenshotUrl}
                          alt={`Step ${it.orderIndex + 1}`}
                          stepNumber={it.orderIndex + 1}
                          instruction={it.instruction}
                          bbox={it.bbox}
                          viewport={viewport}
                        />
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          <aside className="min-w-0 space-y-5 lg:sticky lg:top-20 lg:self-start">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Used by the copilot</CardTitle>
                <CardDescription className="text-xs">
                  How often this workflow has answered an end-user question.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <div className="inline-flex items-center gap-1.5 rounded-pill border border-brand-100 bg-brand-50 px-2.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span className="truncate font-mono text-[10.5px] text-primary">
                    Source: {workflowTitle}
                  </span>
                </div>
                {statRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-mono font-semibold text-ink">
                      {row.value}
                    </span>
                  </div>
                ))}
                {/* Only derivable facts here — no invented health signals (selector checks don't
                    exist yet, R13), and "citable" is only true once the trust gate approved it. */}
                {ready && approved ? (
                  <div className="flex items-center gap-2 rounded-control border border-success-border bg-success-bg px-2.5 py-2 text-[11px] text-success-text2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success-dot" />
                    Approved for the copilot · {items.length} step{items.length === 1 ? '' : 's'} ·{' '}
                    {shotCount === items.length
                      ? 'screenshots on every step'
                      : `screenshots on ${shotCount} of ${items.length} steps`}
                    .
                  </div>
                ) : ready ? (
                  <div className="rounded-control border border-dashed bg-[color:var(--paper-2)] px-2.5 py-2 text-[11px] text-muted-foreground">
                    Not approved yet — the copilot won’t cite this workflow until you approve it
                    in the Knowledge Base.
                  </div>
                ) : (
                  <div className="rounded-control border border-dashed bg-[color:var(--paper-2)] px-2.5 py-2 text-[11px] text-muted-foreground">
                    Still building — not yet citable.
                  </div>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </>
  );
}
