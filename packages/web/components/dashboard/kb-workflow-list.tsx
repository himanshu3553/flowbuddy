'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import { setCopilotApproval, setCopilotApprovalsBulk } from '@/lib/copilot-actions';
import { toast } from '@/components/ui/toast';
import { DuplicateChip, type OverlapView } from '@/components/dashboard/duplicate-workflows';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { ClampedText } from '@/components/dashboard/clamped-text';

export interface WorkflowRow {
  /** P3-M1 — the durable identity every mutation keys on. */
  workflowId: string;
  sourceId: string;
  segmentIndex: number;
  segmentTitle: string;
  itemCount: number;
  sourceTitle: string;
  /** P3-M1 — the workflow's PLAN in prose, shown ON the row that carries the switch. It is model
   *  output entering approved knowledge (steps are anchored to captured events; this is not) and the
   *  copilot reads it in both answer modes, so approving without seeing it approves less than it
   *  looks. `null` = the narration revealed nothing beyond the steps — a real state, shown as one. */
  description?: string | null;
  copilotApproved: boolean;
  /** P3-M0/M1 — why this stopped answering, if it did. NOT the same as "never approved": it WAS
   *  approved. Showing it as Pending would look like the founder's approval had been lost.
   *  `"superseded"` = replaced by a re-recording · `"needs_review"` = a reprocess could not confirm
   *  the content is still what they approved, so it fails closed until a human looks. */
  inactiveReason?: string | null;
  supersededByTitle?: string | null;
  /** P3-M0 — the suspected-duplicate pairs this workflow belongs to. */
  duplicates?: OverlapView[];
}

type Filter = 'all' | 'approved' | 'pending' | 'replaced';

export function KbWorkflowList({ workflows }: { workflows: WorkflowRow[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const pendingRows = useMemo(
    () => workflows.filter((w) => !w.copilotApproved && !w.inactiveReason),
    [workflows],
  );

  const counts = useMemo(
    () => ({
      // "All" is everything still in play — a replaced workflow lives only under its own tab.
      all: workflows.filter((w) => !w.inactiveReason).length,
      approved: workflows.filter((w) => w.copilotApproved).length,
      // A replaced workflow is RESOLVED, not outstanding — it must never inflate the "awaiting
      // approval" nag, or the founder is chased to re-approve something they deliberately retired.
      pending: pendingRows.length,
      replaced: workflows.filter((w) => w.inactiveReason).length,
    }),
    [workflows, pendingRows],
  );

  // Server order kept on purpose: grouped by recording, in the order the steps were recorded — a
  // founder reads the list the way they made it, not re-shuffled by approval state.
  const visible = workflows.filter((w) => {
    if (filter === 'all' && w.inactiveReason) return false;
    if (filter === 'approved' && !w.copilotApproved) return false;
    if (filter === 'pending' && (w.copilotApproved || w.inactiveReason)) return false;
    if (filter === 'replaced' && !w.inactiveReason) return false;
    if (
      q &&
      !`${w.segmentTitle} ${w.sourceTitle}`.toLowerCase().includes(q.toLowerCase())
    )
      return false;
    return true;
  });

  function keyOf(w: WorkflowRow) {
    return `${w.sourceId}:${w.segmentIndex}`;
  }

  function toggle(w: WorkflowRow, next: boolean) {
    setError(null);
    setBusyKey(keyOf(w));
    start(async () => {
      try {
        await setCopilotApproval({
          workflowId: w.workflowId,
          segmentTitle: w.segmentTitle,
          approved: next,
        });
        toast.success(next ? `“${w.segmentTitle}” is live in the copilot` : `“${w.segmentTitle}” removed from the copilot`);
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to update approval';
        setError(msg);
        toast.error(msg);
      } finally {
        setBusyKey(null);
      }
    });
  }

  /** Confirmed from the review sheet, never straight off the banner button — this is the single
   *  action that can put an entire knowledge base in front of paying customers, and every workflow it
   *  approves carries model-written prose the copilot will read out. Approving all of them without
   *  seeing any of them is the failure the sheet exists to prevent. */
  function approveAll() {
    const rows = pendingRows;
    if (rows.length === 0) return;
    setError(null);
    setBusyKey('all');
    start(async () => {
      try {
        await setCopilotApprovalsBulk(
          rows.map((w) => ({ workflowId: w.workflowId, segmentTitle: w.segmentTitle })),
        );
        toast.success(
          `${rows.length} workflow${rows.length === 1 ? '' : 's'} live in the copilot`,
        );
        setConfirmAll(false);
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to approve all';
        setError(msg);
        toast.error(msg);
      } finally {
        setBusyKey(null);
      }
    });
  }

  const tabs: { key: Filter; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: counts.all },
    { key: 'approved', label: 'Approved', n: counts.approved },
    { key: 'pending', label: 'Pending', n: counts.pending },
    ...(counts.replaced > 0
      ? [{ key: 'replaced' as Filter, label: 'Replaced', n: counts.replaced }]
      : []),
  ];

  return (
    <div className="space-y-3.5">
      {counts.pending > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-tile border border-warning-border bg-warning-bg2 px-4 py-3.5">
          <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-warning-dot" />
          <p className="flex-1 text-[13px] leading-relaxed text-warning-text">
            <b className="font-semibold text-[#4a3e1e]">
              {counts.pending} workflow{counts.pending === 1 ? '' : 's'} awaiting
              approval.
            </b>{' '}
            Review and Approve each one to make live
          </p>
          <Button
            size="sm"
            onClick={() => setConfirmAll(true)}
            disabled={pending}
            className="shrink-0"
          >
            Approve All
          </Button>
        </div>
      )}

      <Dialog open={confirmAll} onOpenChange={(o) => !pending && setConfirmAll(o)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Approve {pendingRows.length} workflow{pendingRows.length === 1 ? '' : 's'}?
            </DialogTitle>
            <DialogDescription>
              This makes the workflow live in Copilot for your customers. It will answer using its
              steps and the description below, generated from your narration. Review it before
              publishing.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
            {pendingRows.map((w) => (
              <li key={keyOf(w)} className="rounded-list border bg-card px-3.5 py-3">
                <p className="text-[13px] font-semibold text-ink">{w.segmentTitle}</p>
                <p className="mt-0.5 font-mono text-[10px] text-faint">
                  {w.itemCount} steps from “{w.sourceTitle}” recording
                </p>
                <p
                  className={cn(
                    'mt-1.5 text-[12px] leading-relaxed',
                    w.description ? 'text-secondary-foreground' : 'text-faint',
                  )}
                >
                  {w.description ?? 'No description — the copilot will answer from the steps alone.'}
                </p>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAll(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={approveAll} disabled={pending}>
              {busyKey === 'all'
                ? 'Approving…'
                : `Approve ${pendingRows.length} workflow${pendingRows.length === 1 ? '' : 's'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-end justify-between gap-3 border-b">
        <div className="flex items-center gap-[18px]">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={cn(
                '-mb-px border-b-2 px-0.5 pb-2.5 text-[12.5px] font-semibold transition-colors',
                filter === t.key
                  ? 'border-primary text-ink'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}{' '}
              <span className="font-mono text-[10px] opacity-70">{t.n}</span>
            </button>
          ))}
        </div>
        <div className="relative mb-2 w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search workflows"
            className="h-8 pl-8"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-card border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          No workflows match this filter.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {visible.map((w, i) => {
            const busy = busyKey === keyOf(w) || busyKey === 'all';
            const href = `/dashboard/kb/${w.sourceId}?wf=${w.segmentIndex}`;
            const tile = w.inactiveReason
              ? 'bg-muted border-border text-muted-foreground'
              : w.copilotApproved
                ? 'bg-brand-50 border-brand-100 text-primary'
                : 'bg-warning-bg border-warning-border text-warning-dot';
            return (
              <li
                key={keyOf(w)}
                // The whole card opens the workflow. Anything interactive inside it — the recording
                // link, the switch, Restore, Show more, a duplicate chip — keeps its own job, so the
                // card only navigates when the click landed on nothing else.
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('a, button, input, [role="switch"]')) return;
                  router.push(href);
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-3.5 rounded-list border bg-card px-[15px] py-[13px] transition-colors hover:border-brand-200',
                  w.inactiveReason && 'opacity-70',
                )}
              >
                <span
                  className={cn(
                    'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border font-mono text-[10px] font-bold',
                    tile,
                  )}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <Link
                    href={href}
                    className="block truncate text-[13.5px] font-semibold text-ink hover:text-primary hover:underline"
                  >
                    {w.segmentTitle}
                  </Link>
                  <span className="mt-0.5 block truncate font-mono text-[10px] text-faint">
                    {w.itemCount} steps from “
                    <Link
                      href={`/dashboard/recordings/${w.sourceId}`}
                      className="hover:text-primary hover:underline"
                    >
                      {w.sourceTitle}
                    </Link>
                    ” recording
                    {w.inactiveReason === 'superseded' && w.supersededByTitle
                      ? ` · replaced by “${w.supersededByTitle}”`
                      : ''}
                  </span>
                  {/* The PLAN, on the row that carries the switch — in every state, so the list
                      reads the same whether a workflow is live, pending or retired. Clamped so a
                      dense list stays scannable, expandable because two lines is enough to judge
                      relevance and not enough to approve on. */}
                  {(
                    <span className="mt-1.5 block">
                      {w.description ? (
                        <ClampedText
                          text={w.description}
                          className="text-[11.5px] leading-relaxed text-secondary-foreground"
                        />
                      ) : (
                        /* Absence is a real state, not an empty slot — blank would read as "nothing
                           more to see" when it actually means the narration carried no plan. */
                        <span className="block text-[11.5px] leading-relaxed text-faint">
                          No description — the copilot will answer from the steps alone.
                        </span>
                      )}
                    </span>
                  )}
                  {/* A suspended workflow needs its reason ON the row. "It stopped answering" is
                      alarming on its own; "the recording changed, take a look" is actionable. */}
                  {w.inactiveReason === 'needs_review' && (
                    <span className="mt-1.5 block text-[11px] leading-relaxed text-warning-text">
                      This recording was re-processed and this workflow’s steps changed. It has
                      stopped answering until you confirm it.
                    </span>
                  )}
                  {/* A duplicate is shown on BOTH sides of the pair, approved or not — approving an
                      unapproved duplicate is the action that creates the problem, so the warning has
                      to be visible before the switch is touched. One chip per pair: each opens the
                      comparison for THAT pair, so a workflow duplicated twice stays resolvable. */}
                  {!w.inactiveReason &&
                    w.duplicates?.map((o) => (
                      <DuplicateChip
                        key={`${o.incumbent.sourceId}:${o.incumbent.segmentIndex}|${o.challenger.sourceId}:${o.challenger.segmentIndex}`}
                        overlap={o}
                        selfSourceId={w.sourceId}
                        selfSegmentIndex={w.segmentIndex}
                      />
                    ))}
                </span>
                {w.inactiveReason ? (
                  /* The badge only — restoring is a decision worth the workflow's own page, where
                     the reason and the steps are in front of the founder. */
                  <StatusBadge tone={w.inactiveReason === 'needs_review' ? 'pending' : 'neutral'}>
                    {w.inactiveReason === 'needs_review' ? 'Needs re-review' : 'Replaced'}
                  </StatusBadge>
                ) : (
                  <>
                    {/* The same pill the product-knowledge rows carry — one KB, one status language. */}
                    <span
                      className={cn(
                        'shrink-0 rounded-pill px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide',
                        w.copilotApproved
                          ? 'border border-brand-100 bg-brand-50 text-primary'
                          : 'border bg-secondary text-secondary-foreground',
                      )}
                    >
                      {w.copilotApproved ? 'Live' : 'Pending approval'}
                    </span>
                    <Switch
                      checked={w.copilotApproved}
                      disabled={busy}
                      onCheckedChange={(v) => toggle(w, v)}
                      aria-label={`Approve ${w.segmentTitle} for the copilot`}
                    />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
