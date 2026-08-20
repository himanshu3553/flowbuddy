import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { prisma } from '@flowbuddy/db';
import { getCurrentWorkspace } from '@/lib/session';
import { signedUrl, sessionObjectKey } from '@/lib/storage';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  ReorganizeWorkflows,
  type ReorganizeGroup,
} from '@/components/dashboard/reorganize-workflows';

export const dynamic = 'force-dynamic';

/**
 * Reorganize a recording's workflows (workflow-editing arc, item 4): the founder redraws the
 * BOUNDARIES — split a workflow between two steps, merge one into its predecessor — and the
 * pipeline rebuilds everything from the recording with those boundaries as the complete list.
 * Never row surgery: identity re-matching, fail-closed approvals, text/image edits riding their
 * anchors, plan recompiles — all existing rebuild behavior, all applying unchanged.
 */
export default async function ReorganizePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCurrentWorkspace();
  if (!ctx) redirect('/signin');

  const source = await prisma.knowledgeSource.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    select: { id: true, title: true, appBaseUrl: true, status: true, boundaryOverrides: true },
  });
  if (!source) notFound();
  const ready = source.status === 'ready' || source.status === 'done';

  const [workflows, items] = await Promise.all([
    prisma.workflow.findMany({
      where: { sourceId: id, workspaceId: ctx.workspace.id, segmentIndex: { not: null } },
      orderBy: { segmentIndex: 'asc' },
      select: {
        segmentIndex: true,
        title: true,
        approval: { select: { inactiveReason: true } },
      },
    }),
    prisma.knowledgeItem.findMany({
      where: { sourceId: id, kind: 'step' },
      orderBy: [{ segmentIndex: 'asc' }, { orderIndex: 'asc' }],
      select: { id: true, segmentIndex: true, text: true, data: true },
    }),
  ]);

  const workflowBySegment = new Map(workflows.map((w) => [w.segmentIndex, w]));
  const segments = [...new Set(items.map((it) => it.segmentIndex).filter((s): s is number => s != null))].sort(
    (a, b) => a - b,
  );

  const groups: ReorganizeGroup[] = await Promise.all(
    segments.map(async (seg) => {
      const wf = workflowBySegment.get(seg);
      const rows = items.filter((it) => it.segmentIndex === seg);
      const steps = await Promise.all(
        rows.map(async (it) => {
          const d = (it.data ?? {}) as {
            instruction?: string;
            screenshotFile?: string | null;
            sourceEventIds?: string[];
            keyEventId?: string;
          };
          // The step's boundary anchor: where a workflow starting AT this step would begin on the
          // cleaned timeline. Steps without one (pre-anchor rows) can't host a cut.
          const startEventId =
            (Array.isArray(d.sourceEventIds) && typeof d.sourceEventIds[0] === 'string'
              ? d.sourceEventIds[0]
              : null) ?? (typeof d.keyEventId === 'string' ? d.keyEventId : null);
          return {
            itemId: it.id,
            instruction: d.instruction ?? it.text,
            startEventId,
            screenshotUrl: d.screenshotFile
              ? await signedUrl(sessionObjectKey(ctx.workspace.id, source.id, d.screenshotFile))
              : null,
          };
        }),
      );
      return {
        title: wf?.title ?? `Workflow ${seg + 1}`,
        approved: Boolean(wf?.approval && wf.approval.inactiveReason == null),
        steps,
      };
    }),
  );

  const recordingName = source.title || source.appBaseUrl || 'Recording';

  return (
    <>
      <PageHeader
        title="Reorganize workflows"
        subtitle={`Redraw where each workflow begins and ends — from “${recordingName}”`}
        actions={<StatusBadge status={source.status} />}
      />
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:px-8">
        <Link
          href={`/dashboard/kb/${source.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to the workflow
        </Link>

        {!ready ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              This recording is still building — reorganize its workflows once it is ready.
            </CardContent>
          </Card>
        ) : groups.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              This recording has no workflows to reorganize.
            </CardContent>
          </Card>
        ) : (
          <ReorganizeWorkflows
            sourceId={source.id}
            groups={groups}
            hasOverrides={source.boundaryOverrides != null}
          />
        )}
      </div>
    </>
  );
}
