'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { setCopilotApproval } from '@/lib/copilot-actions';
import { undoSupersede } from '@/lib/overlap-actions';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/dashboard/status-badge';

/**
 * The approve switch for ONE workflow, on the workflow's own page.
 *
 * WHY IT EXISTS HERE TOO. This page is the only surface that renders the workflow's description in
 * full — and the description is model output entering approved knowledge, which the copilot reads in
 * both answer modes. Having the prose on one page and the switch on another means the founder either
 * approves what they have read (by going somewhere else and losing it) or reads what they approve
 * (by never seeing it). Both surfaces carry both now.
 *
 * The status shown is the WHOLE state, not a boolean: a retired workflow was approved once, and
 * showing it as "Pending" would read as the founder's own decision having been lost.
 */
export function WorkflowApprovalControl({
  workflowId,
  segmentTitle,
  approved,
  inactiveReason,
  ready,
}: {
  workflowId: string;
  segmentTitle: string;
  approved: boolean;
  /** `"superseded"` = replaced by a re-recording · `"needs_review"` = a reprocess could not confirm
   *  the content is still what was approved, so it fails closed until a human looks. */
  inactiveReason: string | null;
  /** False while the recording is still building — there is nothing settled to approve yet. */
  ready: boolean;
}) {
  const [busy, start] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<unknown>, done: string, failed: string) {
    start(async () => {
      try {
        await action();
        toast.success(done);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : failed);
      }
    });
  }

  if (!ready) {
    return (
      <div className="rounded-control border border-dashed bg-[color:var(--paper-2)] px-2.5 py-2 text-[11px] text-muted-foreground">
        Still building — there is nothing to approve yet.
      </div>
    );
  }

  // Retired: nothing was ever deleted, so putting it back always works. The verb differs because the
  // two reasons are different questions — "did I mean to replace this?" vs "is this still right?".
  if (inactiveReason) {
    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <StatusBadge tone={inactiveReason === 'needs_review' ? 'pending' : 'neutral'}>
            {inactiveReason === 'needs_review' ? 'Needs re-review' : 'Replaced'}
          </StatusBadge>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(
                () => undoSupersede({ workflowId }),
                `“${segmentTitle}” restored`,
                'Failed to restore',
              )
            }
          >
            {inactiveReason === 'needs_review' ? 'Looks right' : 'Restore'}
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {inactiveReason === 'needs_review'
            ? 'This recording was re-processed and these steps changed, so it stopped answering until you confirm it.'
            : 'You replaced this with a newer recording, so it no longer answers.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <StatusBadge tone={approved ? 'live' : 'pending'}>
          {approved ? 'Approved · Live' : 'Pending'}
        </StatusBadge>
        <span className="flex shrink-0 items-center gap-2.5">
          <span className="text-[11px] text-muted-foreground">In copilot</span>
          <Switch
            checked={approved}
            disabled={busy}
            onCheckedChange={(next) =>
              run(
                () => setCopilotApproval({ workflowId, segmentTitle, approved: next }),
                next
                  ? `“${segmentTitle}” is live in the copilot`
                  : `“${segmentTitle}” removed from the copilot`,
                'Failed to update approval',
              )
            }
            aria-label={`Approve ${segmentTitle} for the copilot`}
          />
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {approved
          ? 'Your customers can be answered from this workflow — its steps and the description above.'
          : 'The copilot will not cite this workflow until you approve it. Read the description above first — the copilot answers from it too.'}
      </p>
    </div>
  );
}
