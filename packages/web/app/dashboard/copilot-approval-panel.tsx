'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setCopilotApproval } from '@/lib/copilot-actions';
import { Switch } from '@/components/ui/switch';

export interface ApprovalCandidate {
  sourceId: string;
  segmentIndex: number;
  segmentTitle: string;
  itemCount: number;
  copilotApproved: boolean;
}

/** P1-M5 — per-workflow "approve for copilot" toggles. Only approved workflows reach end-users;
 *  toggling is reversible and reflected immediately (server action + router.refresh). */
export function CopilotApprovalPanel({
  candidates,
}: {
  candidates: ApprovalCandidate[];
}) {
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

  const approvedCount = candidates.filter((c) => c.copilotApproved).length;

  function toggle(c: ApprovalCandidate, next: boolean) {
    setError(null);
    setPendingIndex(c.segmentIndex);
    start(async () => {
      try {
        await setCopilotApproval({
          sourceId: c.sourceId,
          segmentIndex: c.segmentIndex,
          segmentTitle: c.segmentTitle,
          approved: next,
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to update approval');
      } finally {
        setPendingIndex(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Approve the workflows the in-app copilot may answer from.{' '}
        <span className="font-medium text-foreground">
          Only approved workflows reach your end-users
        </span>{' '}
        — nothing else is exposed. {approvedCount} of {candidates.length} approved.
      </p>
      <ul className="divide-y rounded-lg border">
        {candidates.map((c) => {
          const busy = pendingIndex === c.segmentIndex;
          return (
            <li
              key={c.segmentIndex}
              className="flex items-center gap-4 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.segmentTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {c.itemCount} steps ·{' '}
                  {c.copilotApproved ? 'approved' : 'not approved'}
                </p>
              </div>
              <Switch
                checked={c.copilotApproved}
                disabled={busy}
                onCheckedChange={(v) => toggle(c, v)}
                aria-label={`Approve ${c.segmentTitle} for the copilot`}
              />
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
