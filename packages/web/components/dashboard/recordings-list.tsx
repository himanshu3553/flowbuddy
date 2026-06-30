'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Clock, Search, Volume2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatDuration, recordingStatusBadge } from '@/lib/recordings';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { RecordingManageMenu } from '@/components/dashboard/recording-manage';

export interface RecordingRow {
  id: string;
  title: string;
  /** The founder-set title (null = none), passed to the rename dialog. */
  rawTitle: string | null;
  appUrl: string | null;
  kind: string;
  date: string;
  recordedAgo: string;
  status: string;
  error: string | null;
  workflowCount: number;
  durationMs: number;
  eventCount: number;
  screenshotCount: number;
  hasAudio: boolean;
  layers: string[];
  thumbUrl: string | null;
}

type Filter = 'all' | 'ready' | 'processing' | 'failed';

const READY = ['ready', 'done'];
const PROCESSING = ['uploaded', 'processing'];

function statusMeta(status: string) {
  const { label, tone } = recordingStatusBadge(status);
  return {
    label,
    tone,
    processing: PROCESSING.includes(status),
    failed: !READY.includes(status) && !PROCESSING.includes(status),
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
      failed: rows.filter((r) => !READY.includes(r.status) && !PROCESSING.includes(r.status))
        .length,
    }),
    [rows],
  );

  const visible = rows.filter((r) => {
    if (filter === 'ready' && !READY.includes(r.status)) return false;
    if (filter === 'processing' && !PROCESSING.includes(r.status)) return false;
    if (
      filter === 'failed' &&
      (READY.includes(r.status) || PROCESSING.includes(r.status))
    )
      return false;
    if (
      q &&
      !`${r.title} ${r.appUrl ?? ''} ${r.kind}`.toLowerCase().includes(q.toLowerCase())
    )
      return false;
    return true;
  });

  const tabs: { key: Filter; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: counts.all },
    { key: 'ready', label: 'Ready', n: counts.ready },
    { key: 'processing', label: 'Processing', n: counts.processing },
    { key: 'failed', label: 'Failed', n: counts.failed },
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
            const s = statusMeta(r.status);
            return (
              <li
                key={r.id}
                className={cn(
                  'group flex items-center gap-3.5 rounded-list border bg-card px-[15px] py-[13px] transition-shadow hover:shadow-card',
                  s.processing && 'border-brand-200 shadow-step',
                )}
              >
                {/* Thumbnail */}
                <Link
                  href={`/dashboard/recordings/${r.id}`}
                  className="relative h-[38px] w-14 shrink-0 overflow-hidden rounded-md border border-[color:var(--media-border)] bg-media"
                >
                  {r.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.thumbUrl}
                      alt=""
                      className="h-full w-full object-cover object-top"
                    />
                  ) : null}
                </Link>

                {/* Main */}
                <Link
                  href={`/dashboard/recordings/${r.id}`}
                  className="min-w-0 flex-1"
                >
                  <span className="block truncate text-[13.5px] font-semibold text-ink">
                    {r.title}
                  </span>
                  {s.processing ? (
                    <span className="mt-1.5 block h-1 w-40 max-w-full overflow-hidden rounded-full bg-[color:var(--gray-100)]">
                      <span className="block h-full w-2/3 rounded-full bg-warning-dot" />
                    </span>
                  ) : s.failed ? (
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-danger-ink">
                      {r.error
                        ? `failed — ${r.error}`
                        : 'failed — capture incomplete'}
                    </span>
                  ) : (
                    <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[10px] text-faint">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(r.durationMs)}
                      </span>
                      <span>{r.eventCount} actions</span>
                      <span>{r.screenshotCount} shots</span>
                      {r.hasAudio && (
                        <span className="inline-flex items-center gap-1">
                          <Volume2 className="h-3 w-3" />
                          voice
                        </span>
                      )}
                      <span>{r.recordedAgo}</span>
                    </span>
                  )}
                </Link>

                {/* Right rail */}
                <span className="hidden w-[92px] shrink-0 text-right text-[12.5px] sm:block">
                  {s.failed ? (
                    <span className="text-faint">—</span>
                  ) : s.processing ? (
                    <span className="text-faint">distilling…</span>
                  ) : r.workflowCount > 0 ? (
                    <span className="text-ink">
                      {r.workflowCount} workflow{r.workflowCount === 1 ? '' : 's'}
                    </span>
                  ) : (
                    <span className="text-faint">no workflows</span>
                  )}
                </span>
                <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                <RecordingManageMenu
                  id={r.id}
                  currentTitle={r.rawTitle}
                  appUrl={r.appUrl}
                  status={r.status}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
