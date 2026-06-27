'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import { setCopilotApproval } from '@/lib/copilot-actions';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

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
        for (const w of pendingRows) {
          await setCopilotApproval({
            sourceId: w.sourceId,
            segmentIndex: w.segmentIndex,
            segmentTitle: w.segmentTitle,
            approved: true,
          });
        }
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
    <div className="space-y-4">
      {counts.pending > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/[0.06] px-4 py-3.5">
          <p className="text-sm text-foreground/80">
            <span className="font-semibold text-foreground">
              {counts.pending} workflow{counts.pending === 1 ? '' : 's'} awaiting
              approval.
            </span>{' '}
            Approving puts them live in the copilot — one click each, no article
            to write.
          </p>
          <Button
            size="sm"
            onClick={approveAll}
            disabled={pending}
            className="shrink-0 bg-gradient-to-b from-[#4a63e8] to-[#3a50dd] text-white shadow-[0_2px_10px_rgba(58,80,221,0.28)] hover:opacity-95"
          >
            {busyKey === 'all' ? 'Approving…' : 'Approve all'}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                filter === t.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}{' '}
              <span className="font-mono text-[10px] opacity-70">{t.n}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search workflows"
            className="pl-8"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <ul className="divide-y">
          {visible.map((w) => {
            const busy = busyKey === keyOf(w) || busyKey === 'all';
            return (
              <li
                key={keyOf(w)}
                className="flex items-center gap-4 px-4 py-3.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-[10px] font-bold text-primary">
                  WF
                </span>
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/kb/${w.sourceId}`}
                    className="block truncate text-sm font-semibold hover:text-primary hover:underline"
                  >
                    {w.segmentTitle}
                  </Link>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {w.itemCount} steps · from “{w.sourceTitle}”
                  </span>
                </span>
                <span
                  className={cn(
                    'hidden shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase sm:inline-block',
                    w.copilotApproved
                      ? 'bg-green-100 text-green-800'
                      : 'bg-amber-100 text-amber-800',
                  )}
                >
                  {w.copilotApproved ? 'Approved · Live' : 'Pending'}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="hidden text-xs font-medium text-muted-foreground md:inline">
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
          {visible.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
              No workflows match this filter.
            </li>
          )}
        </ul>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
