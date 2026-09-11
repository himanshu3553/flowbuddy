'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { setWorkflowOnboarding } from '@/lib/onboarding-actions';
import { toast } from '@/components/ui/toast';
import { Switch } from '@/components/ui/switch';

/**
 * User onboarding — the per-workflow switch ("start this walkthrough by itself for a new user who
 * lands on its first page?"). Sits beside the approval and acting controls for the same reason
 * they live here: the founder flags a workflow where they can read every step it will guide.
 *
 * Presupposes a live approval (the action refuses otherwise) and the workspace's master switch
 * on the Copilot page — this card names the switch when it is off rather than letting the founder
 * flag workflows into a feature that never fires.
 */
export function WorkflowOnboardingControl({
  workflowId,
  segmentTitle,
  approved,
  enabled: initial,
  firstRoute,
  workspaceEnabled,
  ready,
  title,
  description,
}: {
  workflowId: string;
  segmentTitle: string;
  approved: boolean;
  enabled: boolean;
  /** The first step's recorded page, for display — '' when unknown (the action refuses then). */
  firstRoute: string;
  workspaceEnabled: boolean;
  ready: boolean;
  title: string;
  description: string;
}) {
  const [busy, start] = useTransition();
  const [enabled, setEnabled] = useState(initial);
  const [issue, setIssue] = useState<string | null>(null);
  const router = useRouter();

  const canToggle = ready && approved;
  const header = (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold leading-none tracking-tight">{title}</h3>
        {canToggle && (
          <Switch
            checked={enabled}
            disabled={busy}
            onCheckedChange={toggle}
            aria-label={`Start ${segmentTitle} automatically for new users`}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );

  function note(text: string) {
    return (
      <div className="rounded-control border border-dashed bg-[color:var(--paper-2)] px-2.5 py-2 text-[11px] text-muted-foreground">
        {text}
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="space-y-3">
        {header}
        {note('Still building — nothing to guide yet.')}
      </div>
    );
  }
  if (!approved) {
    return (
      <div className="space-y-3">
        {header}
        {note('Approve this workflow for Copilot first. Onboarding only guides approved workflows.')}
      </div>
    );
  }

  function toggle(next: boolean) {
    setEnabled(next); // optimistic
    start(async () => {
      try {
        const result = await setWorkflowOnboarding({ workflowId, enabled: next });
        if (!result.ok) {
          setEnabled(false);
          setIssue(result.issue);
          toast.error(`“${segmentTitle}” can’t start on its own yet`);
          return;
        }
        setIssue(null);
        toast.success(
          result.enabled
            ? `“${segmentTitle}” starts by itself for new users on ${firstRoute || 'its first page'}`
            : `“${segmentTitle}” no longer starts on its own`,
        );
        router.refresh();
      } catch (e) {
        setEnabled(!next);
        toast.error(e instanceof Error ? e.message : 'Failed to update');
      }
    });
  }

  return (
    <div className="space-y-2.5">
      {header}
      {enabled && firstRoute && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Starts when a new user lands on <span className="font-medium">{firstRoute}</span>. Shown
          up to the number of times set on the Copilot page; finishing or dismissing it ends it
          sooner.
        </p>
      )}
      {enabled && !workspaceEnabled && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          User onboarding is switched off for this workspace, so this won’t fire until you turn it
          on from the Copilot page.
        </p>
      )}
      {issue && (
        <ul className="space-y-1 rounded-control border border-warning-border bg-warning-bg px-2.5 py-2 text-[11px] leading-relaxed text-warning-text">
          <li>{issue}</li>
        </ul>
      )}
    </div>
  );
}
