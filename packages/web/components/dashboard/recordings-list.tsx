'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search, Video } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

export interface RecordingRow {
  id: string;
  title: string;
  kind: string;
  date: string;
  status: string;
  workflowCount: number;
}

type Filter = 'all' | 'ready' | 'processing';

const READY = ['ready', 'done'];
const PROCESSING = ['uploaded', 'processing'];

function statusMeta(status: string, date: string) {
  if (READY.includes(status))
    return {
      label: 'Ready',
      cls: 'bg-green-100 text-green-800',
      meta: `${date} · screen·voice·DOM·events·routes · PII masked`,
      processing: false,
      failed: false,
    };
  if (PROCESSING.includes(status))
    return {
      label: 'Processing',
      cls: 'bg-amber-100 text-amber-800',
      meta: 'distilling…',
      processing: true,
      failed: false,
    };
  return {
    label: 'Failed',
    cls: 'bg-red-100 text-red-800',
    meta: `${date} · upload interrupted — narration preserved`,
    processing: false,
    failed: true,
  };
}

export function RecordingsList({ rows }: { rows: RecordingRow[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const counts = useMemo(
    () => ({
      all: rows.length,
      ready: rows.filter((r) => READY.includes(r.status)).length,
      processing: rows.filter((r) => PROCESSING.includes(r.status)).length,
    }),
    [rows],
  );

  const visible = rows.filter((r) => {
    if (filter === 'ready' && !READY.includes(r.status)) return false;
    if (filter === 'processing' && !PROCESSING.includes(r.status)) return false;
    if (q && !`${r.title} ${r.kind}`.toLowerCase().includes(q.toLowerCase()))
      return false;
    return true;
  });

  const tabs: { key: Filter; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: counts.all },
    { key: 'ready', label: 'Ready', n: counts.ready },
    { key: 'processing', label: 'Processing', n: counts.processing },
  ];

  return (
    <div className="space-y-4">
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
            placeholder="Search recordings"
            className="pl-8"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <ul className="divide-y">
          {visible.map((r) => {
            const s = statusMeta(r.status, r.date);
            return (
              <li key={r.id}>
                <Link
                  href={`/dashboard/kb/${r.id}`}
                  className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/50"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
                    <Video className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {r.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {s.meta}
                    </span>
                    {s.processing && (
                      <span className="mt-1.5 block h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-muted">
                        <span className="block h-full w-2/3 animate-pulse rounded-full bg-amber-400" />
                      </span>
                    )}
                  </span>
                  <span className="hidden w-24 shrink-0 text-xs text-muted-foreground sm:block">
                    {s.failed || s.processing
                      ? '—'
                      : `${r.workflowCount} extracted`}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase',
                      s.cls,
                    )}
                  >
                    {s.label}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
              No recordings match this filter.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
