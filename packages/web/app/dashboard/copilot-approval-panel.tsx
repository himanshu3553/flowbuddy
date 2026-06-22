'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setCopilotApproval } from '@/lib/copilot-actions';

export interface ApprovalCandidate {
  sourceId: string;
  segmentIndex: number;
  segmentTitle: string;
  itemCount: number;
  copilotApproved: boolean;
}

/** P1-M5 — per-workflow "approve for copilot" toggles. Only approved workflows reach end-users;
 *  toggling is reversible and reflected immediately (server action + router.refresh). */
export function CopilotApprovalPanel({ candidates }: { candidates: ApprovalCandidate[] }) {
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

  const approvedCount = candidates.filter((c) => c.copilotApproved).length;

  function toggle(c: ApprovalCandidate) {
    setError(null);
    setPendingIndex(c.segmentIndex);
    start(async () => {
      try {
        await setCopilotApproval({
          sourceId: c.sourceId,
          segmentIndex: c.segmentIndex,
          segmentTitle: c.segmentTitle,
          approved: !c.copilotApproved,
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
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        Approve the workflows the in-app copilot may answer from. <strong>Only approved workflows
        reach your end-users</strong> — nothing else is exposed. {approvedCount} of {candidates.length} approved.
      </p>
      <ul className="list">
        {candidates.map((c) => {
          const busy = pendingIndex === c.segmentIndex;
          return (
            <li key={c.segmentIndex}>
              <span className={`pill ${c.copilotApproved ? 'pill-done' : 'pill-draft'}`}>
                {c.copilotApproved ? '✓ approved' : 'not approved'}
              </span>
              <span className="grow">{c.segmentTitle}</span>
              <span className="muted">{c.itemCount} steps</span>
              <button type="button" onClick={() => toggle(c)} disabled={busy}>
                {busy ? '…' : c.copilotApproved ? 'Un-approve' : 'Approve for copilot'}
              </button>
            </li>
          );
        })}
      </ul>
      {error && <span className="rationale" style={{ color: 'crimson' }}>{error}</span>}
    </div>
  );
}
