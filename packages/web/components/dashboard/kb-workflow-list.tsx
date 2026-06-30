'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import { setCopilotApproval, setCopilotApprovalsBulk } from '@/lib/copilot-actions';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/dashboard/status-badge';

export interface WorkflowRow {
  sourceId: string;
  segmentIndex: number;
  segmentTitle: string;
  itemCount: number;
  sourceTitle: string;
  copilotApproved: boolean;
}

type Filter = 'all' | 'approved' | 'pending';

export function KbWorkflowList({ workflows }: { workflows: WorkflowRow[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const counts = useMemo(
    () => ({
      all: workflows.length,
      approved: workflows.filter((w) => w.copilotApproved).length,
      pending: workflows.filter((w) => !w.copilotApproved).length,
    }),
    [workflows],
  );

  const visible = workflows.filter((w) => {
    if (filter === 'approved' && !w.copilotApproved) return false;
    if (filter === 'pending' && w.copilotApproved) return false;
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
          sourceId: w.sourceId,
          segmentIndex: w.segmentIndex,
          segmentTitle: w.segmentTitle,
          approved: next,
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to update approval');
      } finally {
        setBusyKey(null);
      }
    });
  }

  function approveAll() {
    const pendingRows = workflows.filter((w) => !w.copilotApproved);
    if (pendingRows.length === 0) return;
    setError(null);
    setBusyKey('all');
    start(async () => {
      try {
        await setCopilotApprovalsBulk(
          pendingRows.map((w) => ({
            sourceId: w.sourceId,
            segmentIndex: w.segmentIndex,
            segmentTitle: w.segmentTitle,
          })),
        );
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to approve all');
      } finally {
        setBusyKey(null);
      }
    });
  }

  const tabs: { key: Filter; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: counts.all },
    { key: 'approved', label: 'Approved', n: counts.approved },
    { key: 'pending', label: 'Pending', n: counts.pending },
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
            Approving puts them live in the copilot — one click each, no article
            to write.
          </p>
          <Button
            size="sm"
            onClick={approveAll}
            disabled={pending}
            className="shrink-0"
          >
            {busyKey === 'all' ? 'Approving…' : 'Approve all'}
          </Button>
        </div>
      )}

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
          {visible.map((w) => {
            const busy = busyKey === keyOf(w) || busyKey === 'all';
            const tile = w.copilotApproved
              ? 'bg-brand-50 border-brand-100 text-primary'
              : 'bg-warning-bg border-warning-border text-warning-dot';
            return (
              <li
                key={keyOf(w)}
                className={cn(
                  'flex items-center gap-3.5 rounded-list border bg-card px-[15px] py-[13px]',
                  !w.copilotApproved && 'border-brand-200 shadow-step',
                )}
              >
                <span
                  className={cn(
                    'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border font-mono text-[10px] font-bold',
                    tile,
                  )}
                >
                  WF
                </span>
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/kb/${w.sourceId}?wf=${w.segmentIndex}`}
                    className="block truncate text-[13.5px] font-semibold text-ink hover:text-primary hover:underline"
                  >
                    {w.segmentTitle}
                  </Link>
                  <span className="mt-0.5 block truncate font-mono text-[10px] text-faint">
                    {w.itemCount} steps · from “{w.sourceTitle}”
                  </span>
                </span>
                <StatusBadge tone={w.copilotApproved ? 'live' : 'pending'}>
                  {w.copilotApproved ? 'Approved · Live' : 'Pending'}
                </StatusBadge>
                <span className="flex shrink-0 items-center gap-2.5">
                  <span className="hidden text-[11px] text-muted-foreground md:inline">
                    In copilot
                  </span>
                  <Switch
                    checked={w.copilotApproved}
                    disabled={busy}
                    onCheckedChange={(v) => toggle(w, v)}
                    aria-label={`Approve ${w.segmentTitle} for the copilot`}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
