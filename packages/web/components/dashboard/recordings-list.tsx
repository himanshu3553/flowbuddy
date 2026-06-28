'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { StatusBadge, type StatusTone } from '@/components/dashboard/status-badge';

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
      tone: 'success' as StatusTone,
      meta: `${date} · screen·voice·DOM·events·routes · PII masked`,
      metaTone: 'muted' as const,
      processing: false,
      failed: false,
    };
  if (PROCESSING.includes(status))
    return {
      label: 'Processing',
      tone: 'pending' as StatusTone,
      meta: 'distilling…',
      metaTone: 'muted' as const,
      processing: true,
      failed: false,
    };
  return {
    label: 'Failed',
    tone: 'danger' as StatusTone,
    meta: `${date} · upload interrupted — narration preserved`,
    metaTone: 'danger' as const,
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
        <div className="flex items-center gap-[3px] rounded-control border bg-[color:var(--paper-2)] p-[3px]">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                filter === t.key
                  ? 'bg-card text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}{' '}
              <span className="font-mono text-[10px] opacity-70">{t.n}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search recordings"
            className="pl-8"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-card border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          No recordings match this filter.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {visible.map((r) => {
            const s = statusMeta(r.status, r.date);
            return (
              <li key={r.id}>
                <Link
                  href={`/dashboard/kb/${r.id}`}
                  className={cn(
                    'flex items-center gap-3.5 rounded-list border bg-card px-[15px] py-[13px] transition-shadow hover:shadow-card',
                    s.processing && 'border-brand-200 shadow-step',
                  )}
                >
                  <span className="h-[38px] w-14 shrink-0 rounded-md border border-[color:var(--media-border)] bg-media" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">
                      {r.title}
                    </span>
                    {s.processing ? (
                      <span className="mt-1.5 block h-1 w-40 max-w-full overflow-hidden rounded-full bg-[color:var(--gray-100)]">
                        <span className="block h-full w-2/3 rounded-full bg-warning-dot" />
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'mt-0.5 block truncate font-mono text-[10px]',
                          s.metaTone === 'danger' ? 'text-danger-ink' : 'text-faint',
                        )}
                      >
                        {s.meta}
                      </span>
                    )}
                  </span>
                  <span className="hidden w-[84px] shrink-0 text-[12.5px] sm:block">
                    {s.failed ? (
                      <span className="font-semibold text-primary">Retry upload</span>
                    ) : s.processing ? (
                      <span className="text-faint">distilling…</span>
                    ) : (
                      <span className="text-ink">{r.workflowCount} extracted</span>
                    )}
                  </span>
                  <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                  <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
