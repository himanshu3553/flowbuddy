import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BookOpen } from 'lucide-react';

import { getCurrentWorkspace } from '@/lib/session';
import { listCandidates } from '@/lib/candidates';
import { listProductPages } from '@/lib/product-pages';
import { ProductKnowledgeList } from '@/components/dashboard/product-knowledge-list';
import { listWorkflowOverlaps, duplicatesByWorkflow } from '@/lib/overlaps';
import { DuplicateWorkflows, type OverlapView } from '@/components/dashboard/duplicate-workflows';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { HowToRecordDialog, HowItWorksDialog } from '@/components/dashboard/home-help-dialogs';
import {
  KbWorkflowList,
  type WorkflowRow,
} from '@/components/dashboard/kb-workflow-list';
import { KbTabs, type KbTab } from '@/components/dashboard/kb-tabs';

export const dynamic = 'force-dynamic';

/** The two halves of the KB. Anything unrecognised in `?tab=` falls back to workflows. */
type Tab = 'workflows' | 'product';

export default async function KnowledgeBasePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await getCurrentWorkspace();
  if (!ctx) redirect('/signin');
  const raw = (await searchParams).tab;
  const tab: Tab = raw === 'product' ? 'product' : 'workflows';

  const [candidates, overlaps, productPages] = await Promise.all([
    listCandidates(ctx.workspace.id),
    listWorkflowOverlaps(ctx.workspace.id),
    listProductPages(ctx.workspace.id),
  ]);
  // Dates cross the server→client boundary as strings; the view only ever renders them.
  const toView = (o: (typeof overlaps)[number]): OverlapView => ({
    similarity: o.similarity,
    incumbent: { ...o.incumbent, approvedAt: o.incumbent.approvedAt?.toISOString() ?? null },
    challenger: { ...o.challenger, approvedAt: o.challenger.approvedAt?.toISOString() ?? null },
  });

  const byWorkflow = duplicatesByWorkflow(overlaps);
  const workflows: WorkflowRow[] = candidates.map((c) => ({
    workflowId: c.workflowId,
    sourceId: c.sourceId,
    segmentIndex: c.segmentIndex,
    segmentTitle: c.segmentTitle,
    itemCount: c.itemCount,
    sourceTitle: c.appBaseUrl || 'recording',
    copilotApproved: c.copilotApproved,
    inactiveReason: c.inactiveReason,
    supersededByTitle: c.supersededByTitle ?? null,
    duplicates: (byWorkflow.get(`${c.sourceId}:${c.segmentIndex}`) ?? []).map(toView),
  }));

  const overlapViews: OverlapView[] = overlaps.map(toView);

  // What is still waiting on the founder, per tab. Surfaced ON the tabs because tabbing hides the
  // half you are not looking at, and unapproved content serves nobody without saying so.
  const tabs: KbTab[] = [
    {
      key: 'workflows',
      label: 'Workflows',
      count: workflows.length,
      pending: workflows.filter((w) => !w.copilotApproved && !w.inactiveReason).length,
    },
    {
      key: 'product',
      label: 'Product knowledge',
      count: productPages.length,
      // Two different waits, one number: never reviewed, and an approved page whose re-derivation
      // disagrees with what is live (the pending-update flow).
      pending: productPages.filter((p) => (!p.live && !p.everApproved) || p.pendingContent).length,
    },
  ];

  return (
    <>
      <PageHeader
        title="Knowledge Base"
        subtitle="Approve what your copilot may use — the workflows it follows, and what your product is."
      />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
        {workflows.length === 0 && productPages.length === 0 ? (
          <div className="rounded-card border bg-card p-10 text-center shadow-card">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-tile border border-brand-100 bg-brand-50 text-primary">
              <BookOpen className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-[17px] font-bold tracking-tight text-secondary-foreground">
              Your Knowledge Base is empty
            </h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
              Record a session and FlowBuddy distils it into structured workflows
              here — each ready for a one-click approval to your copilot.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2.5">
              <HowToRecordDialog>
                <Button size="sm">
                  <span className="h-2.5 w-2.5 rounded-full bg-white" />
                  Open recorder
                </Button>
              </HowToRecordDialog>
              <HowItWorksDialog>
                <Button variant="outline" size="sm">
                  How distillation works
                </Button>
              </HowItWorksDialog>
            </div>
            <div className="mx-auto mt-8 max-w-md rounded-list border border-dashed bg-[color:var(--paper-2)] p-4 text-left opacity-70">
              <div className="flex items-center gap-3">
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-brand-100 bg-brand-50 font-mono text-[10px] font-bold text-primary">
                  WF
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block h-3 w-40 rounded bg-muted-foreground/20" />
                  <span className="mt-2 block h-2.5 w-28 rounded bg-muted-foreground/15" />
                </span>
                <span className="h-[22px] w-[38px] rounded-full bg-muted-foreground/20" />
              </div>
              <p className="mt-3 text-center font-mono text-[11px] text-faint">
                ↑ this is what an approved-ready workflow will look like
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <KbTabs tabs={tabs} active={tab} />

            {tab === 'workflows' ? (
              <div className="space-y-3.5">
                <DuplicateWorkflows overlaps={overlapViews} />
                {workflows.length > 0 ? (
                  <KbWorkflowList workflows={workflows} />
                ) : (
                  <div className="rounded-card border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
                    No workflows yet — record a session and they will be distilled here.
                  </div>
                )}
              </div>
            ) : /* AIL slice 2 — what the product IS, beside how things are DONE. */
            productPages.length > 0 ? (
              <ProductKnowledgeList pages={productPages} />
            ) : (
              <div className="rounded-card border bg-card px-4 py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No product knowledge yet.
                </p>
                <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-faint">
                  These pages are derived from what you SAY while recording, not from what you
                  click. Narrate what a thing is and who it is for, and pages appear here for you to
                  approve.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
