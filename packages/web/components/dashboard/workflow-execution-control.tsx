'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { setWorkflowExecution } from '@/lib/execution-actions';
import { toast } from '@/components/ui/toast';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/dashboard/status-badge';

/**
 * P4-M1 — the per-workflow ACTING switch ("may the AI Agent run this for your users?").
 *
 * Sits on the workflow's own page, under the approval control, for the same reason the approval
 * control lives here: enabling acting must happen where the founder can READ what they are
 * enabling — the description, every step, and (on refusal) every reason the run is impossible.
 *
 * Absence downstream is structural — a workflow without the flag has no acting tool bound for it
 * at all (agent.md §A2.3, "absence, not refusal").
 */
export function WorkflowExecutionControl({
  workflowId,
  segmentTitle,
  approved,
  executeState,
  summary,
  ready,
}: {
  workflowId: string;
  segmentTitle: string;
  /** The approval is live (`inactiveReason` null) — acting presupposes it. */
  approved: boolean;
  /** null = never enabled · "enabled" = runnable · "needs_review" = parked by a reprocess. */
  executeState: string | null;
  /** From the compiled plan, when one exists. */
  summary: { steps: number; inputs: number; destructive: number; manual: number } | null;
  ready: boolean;
}) {
  const [busy, start] = useTransition();
  const [issues, setIssues] = useState<string[]>([]);
  const router = useRouter();
  const enabled = executeState === 'enabled';

  if (!ready) {
    return (
      <div className="rounded-control border border-dashed bg-[color:var(--paper-2)] px-2.5 py-2 text-[11px] text-muted-foreground">
        Still building — nothing to run yet.
      </div>
    );
  }

  if (!approved) {
    return (
      <div className="rounded-control border border-dashed bg-[color:var(--paper-2)] px-2.5 py-2 text-[11px] text-muted-foreground">
        Approve this workflow for the copilot first — the agent only runs approved workflows.
      </div>
    );
  }

  function toggle(next: boolean) {
    start(async () => {
      try {
        const result = await setWorkflowExecution({ workflowId, enabled: next });
        if (!result.ok) {
          setIssues(result.issues);
          toast.error(`“${segmentTitle}” can’t be run as recorded`);
          return;
        }
        setIssues([]);
        if (result.enabled && result.summary) {
          const s = result.summary;
          toast.success(
            `“${segmentTitle}” is runnable — ${s.steps} step${s.steps === 1 ? '' : 's'} · ${s.inputs} input${s.inputs === 1 ? '' : 's'} · ${s.destructive} confirm-first`,
          );
        } else {
          toast.success(`“${segmentTitle}” will not be run for users`);
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to update');
      }
    });
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <StatusBadge tone={enabled ? 'live' : executeState === 'needs_review' ? 'pending' : 'neutral'}>
          {enabled ? 'Runnable' : executeState === 'needs_review' ? 'Needs re-review' : 'Not runnable'}
        </StatusBadge>
        <span className="flex shrink-0 items-center gap-2.5">
          <span className="text-[11px] text-muted-foreground">Agent may run it</span>
          <Switch
            checked={enabled}
            disabled={busy}
            onCheckedChange={toggle}
            aria-label={`Allow the AI Agent to run ${segmentTitle} for your users`}
          />
        </span>
      </div>

      {enabled && summary && (
        <p className="text-[11px] text-muted-foreground">
          {summary.steps} step{summary.steps === 1 ? '' : 's'} · {summary.inputs} user input
          {summary.inputs === 1 ? '' : 's'} asked as it runs · {summary.destructive} step
          {summary.destructive === 1 ? '' : 's'} confirmed before acting
          {summary.manual > 0
            ? ` · ${summary.manual} step${summary.manual === 1 ? '' : 's'} the user does themselves (file picking)`
            : ''}
          .
        </p>
      )}

      {executeState === 'needs_review' && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          This recording was re-processed and the steps changed, so running it is paused until you
          look. Turning the switch on re-checks the new steps and re-enables it.
        </p>
      )}

      {issues.length > 0 && (
        <ul className="space-y-1 rounded-control border border-warning-border bg-warning-bg px-2.5 py-2 text-[11px] leading-relaxed text-warning-text">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {enabled
          ? 'In AI Agent mode, FlowBuddy can complete these steps for a user — visibly, with their consent, asking them for every input. Runs appear in Analytics → Agent runs.'
          : 'Off means the agent can never run this workflow — it stays answer-and-guide only. Turn it on to make it runnable in AI Agent mode.'}
      </p>
    </div>
  );
}
