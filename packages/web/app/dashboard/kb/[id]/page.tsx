import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';
import { signedUrl, sessionObjectKey } from '@/lib/storage';
import { listCandidates } from '@/lib/candidates';
import { CopilotApprovalPanel } from '../../copilot-approval-panel';
import { PageHeader } from '@/components/dashboard/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { StatusBadge } from '@/components/dashboard/status-badge';

export const dynamic = 'force-dynamic';

// The distilled-step shape persisted in KnowledgeItem.data (see docs/kb-step-distillation.md).
type StepData = {
  instruction?: string;
  detail?: string;
  route?: string;
  narration?: string | null;
  screenshotFile?: string | null;
};

export default async function KbSourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getCurrentWorkspace();
  if (!ctx) redirect('/signin');

  const source = await prisma.knowledgeSource.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: {
      items: { orderBy: [{ segmentIndex: 'asc' }, { orderIndex: 'asc' }] },
    },
  });
  if (!source) notFound();

  const candidates = await listCandidates(ctx.workspace.id, source.id);
  const transcript =
    (source.transcript as { text?: string; segments?: unknown[] } | null) ??
    null;

  const items = await Promise.all(
    source.items.map(async (it) => {
      const d = (it.data as unknown as StepData) ?? {};
      return {
        id: it.id,
        orderIndex: it.orderIndex,
        segmentIndex: it.segmentIndex,
        segmentTitle: it.segmentTitle,
        instruction: d.instruction ?? it.text, // distilled instruction; fall back to searchable text
        detail: d.detail ?? '',
        narration: d.narration ?? null,
        route: d.route ?? '',
        screenshotUrl: d.screenshotFile
          ? await signedUrl(sessionObjectKey(ctx.workspace.id, source.id, d.screenshotFile))
          : null,
      };
    }),
  );

  // Group items by the workflow segment they belong to (Path 2 — persisted grouping).
  const groups: { key: string; title: string; items: typeof items }[] = [];
  for (const it of items) {
    const key = it.segmentIndex == null ? 'ungrouped' : String(it.segmentIndex);
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = {
        key,
        title:
          it.segmentTitle ??
          (it.segmentIndex == null
            ? 'Other / ungrouped'
            : `Workflow ${it.segmentIndex + 1}`),
        items: [],
      };
      groups.push(g);
    }
    g.items.push(it);
  }

  const ready = source.status === 'ready' || source.status === 'done';

  return (
    <>
      <PageHeader
        title={source.appBaseUrl || 'Recording'}
        subtitle={`${source.kind} · ${items.length} steps · ${groups.length} workflow(s)`}
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Approve workflows for the copilot
            </CardTitle>
            <CardDescription>
              Approval is one click on a workflow — not authoring an article. The
              copilot answers only from what you approve here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {ready
                  ? 'No workflows found in this recording.'
                  : 'Knowledge Base is still building — workflows appear once it is ready.'}
              </p>
            ) : (
              <CopilotApprovalPanel candidates={candidates} />
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-5">
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                Steps by workflow
              </h2>
              <p className="text-sm text-muted-foreground">
                The clean, grounded steps — screenshot, instruction, route and
                narration — grouped by workflow.
              </p>
            </div>

            {groups.map((group) => (
              <Card key={group.key}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 font-mono text-[10px] font-bold text-primary">
                      WF
                    </span>
                    {group.title}
                    <span className="font-normal text-muted-foreground">
                      · {group.items.length} steps
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-0 divide-y">
                  {group.items.map((it) => (
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
                        <p className="mt-2 text-sm font-medium">
                          {it.instruction}
                        </p>
                        {it.detail && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {it.detail}
                          </p>
                        )}
                        {it.narration && (
                          <p className="mt-1.5 text-xs italic text-muted-foreground">
                            🗣 {it.narration}
                          </p>
                        )}
                      </div>
                      {it.screenshotUrl && (
                        <a
                          href={it.screenshotUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={it.screenshotUrl}
                            alt={`Step ${it.orderIndex + 1}`}
                            className="w-full rounded-lg border"
                          />
                        </a>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          <aside className="min-w-0 space-y-5 lg:sticky lg:top-20 lg:self-start">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Used by the copilot</CardTitle>
                <CardDescription className="text-xs">
                  Citation stats appear once your copilot is live and answering.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {[
                  ['Cited by copilot', '—'],
                  ['Last cited', '—'],
                  ['Helpful', '—'],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-mono font-semibold">{v}</span>
                  </div>
                ))}
                <div className="rounded-md border border-dashed bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
                  {ready
                    ? 'Selectors healthy · grounded and ready to cite.'
                    : 'Still building — not yet citable.'}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Transcript</CardTitle>
              </CardHeader>
              <CardContent>
                {transcript?.text ? (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      {transcript.segments?.length ?? 0} segments — expand
                    </summary>
                    <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed">
                      {transcript.text}
                    </p>
                  </details>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No transcript (no narration captured).
                  </p>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </>
  );
}
