import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BookOpen } from 'lucide-react';

import { getCurrentWorkspace } from '@/lib/session';
import { listCandidates } from '@/lib/candidates';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { HowToRecordDialog, HowItWorksDialog } from '@/components/dashboard/home-help-dialogs';
import {
  KbWorkflowList,
  type WorkflowRow,
} from '@/components/dashboard/kb-workflow-list';

export const dynamic = 'force-dynamic';

export default async function KnowledgeBasePage() {
  const ctx = await getCurrentWorkspace();
  if (!ctx) redirect('/signin');

  const candidates = await listCandidates(ctx.workspace.id);
  const workflows: WorkflowRow[] = candidates.map((c) => ({
    sourceId: c.sourceId,
    segmentIndex: c.segmentIndex,
    segmentTitle: c.segmentTitle,
    itemCount: c.itemCount,
    sourceTitle: c.appBaseUrl || 'recording',
    copilotApproved: c.copilotApproved,
  }));

  return (
    <>
      <PageHeader
        title="Knowledge Base"
        subtitle="Approve the workflows your copilot may answer from — one click each."
      />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
        {workflows.length === 0 ? (
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
          <KbWorkflowList workflows={workflows} />
        )}
      </div>
    </>
  );
}
