import { notFound, redirect } from 'next/navigation';
import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';
import { signedUrl, sessionObjectKey } from '@/lib/storage';
import { listCandidates } from '@/lib/candidates';
import { CopilotApprovalPanel } from '../../copilot-approval-panel';
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

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 md:px-8">
      <div>
        <div className="flex items-center gap-2">
          <StatusBadge status={source.status} />
          <h1 className="text-2xl font-semibold tracking-tight">
            Knowledge Base
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {source.kind} · {source.appBaseUrl || '(unknown app)'} · {items.length}{' '}
          steps · {groups.length} workflow(s)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Approve workflows for the copilot
          </CardTitle>
          <CardDescription>
            The copilot answers only from workflows you approve here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {source.status === 'ready' || source.status === 'done'
                ? 'No workflows found in this recording.'
                : 'Knowledge Base is still building — workflows appear once it is ready.'}
            </p>
          ) : (
            <CopilotApprovalPanel candidates={candidates} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transcript (narration)</CardTitle>
        </CardHeader>
        <CardContent>
          {transcript?.text ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                {transcript.segments?.length ?? 0} segments — click to expand
              </summary>
              <p className="mt-3 whitespace-pre-wrap">{transcript.text}</p>
            </details>
          ) : (
            <p className="text-sm text-muted-foreground">
              No transcript (no narration captured).
            </p>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-base font-semibold">Steps by workflow</h2>
        <p className="text-sm text-muted-foreground">
          The clean steps the copilot is grounded in, grouped by workflow. Read-only.
        </p>
      </div>

      {groups.map((group) => (
        <Card key={group.key}>
          <CardHeader>
            <CardTitle className="text-sm">
              {group.title}{' '}
              <span className="font-normal text-muted-foreground">
                · {group.items.length} steps
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {group.items.map((it) => (
              <div
                key={it.id}
                className="grid grid-cols-1 gap-4 border-t pt-4 first:border-t-0 first:pt-0 sm:grid-cols-[1fr_200px]"
              >
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      Step {it.orderIndex + 1}
                    </span>
                    {it.route && (
                      <span className="truncate text-xs text-muted-foreground">
                        {it.route}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm">{it.instruction}</p>
                  {it.detail && (
                    <p className="mt-1 text-sm text-muted-foreground">{it.detail}</p>
                  )}
                  {it.narration && (
                    <p className="mt-1 text-sm text-muted-foreground">
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
                      className="w-full rounded-md border"
                    />
                  </a>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
