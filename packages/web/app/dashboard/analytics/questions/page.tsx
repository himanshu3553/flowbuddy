import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, Mic, ThumbsDown, ThumbsUp } from 'lucide-react';

import { getCurrentWorkspace } from '@/lib/session';
import {
  LOG_RANGE_OPTIONS,
  QUESTION_FILTERS,
  getQuestionLog,
  logRangeLabel,
  parseLogRange,
  parseQuestionFilter,
  parseSearch,
  type LoggedQuestion,
} from '@/lib/analytics';
import { relativeTime } from '@/lib/recordings';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { QuestionLogControls } from '@/components/dashboard/question-log-controls';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

/** Page links preserve the active search/filter/range — only `page` moves. */
function pageHref(
  params: { q: string; filter: string; range: number },
  page: number,
): string {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.filter !== 'all') qs.set('filter', params.filter);
  if (params.range !== 30) qs.set('range', String(params.range));
  if (page > 1) qs.set('page', String(page));
  const s = qs.toString();
  return s ? `/dashboard/analytics/questions?${s}` : '/dashboard/analytics/questions';
}

/** A prev/next control: a real link when there's somewhere to go, an inert disabled button when
 *  there isn't. Kept separate because `asChild` + `disabled` would put a `disabled` attribute on
 *  the `<a>` — invalid, and it wouldn't stop the navigation anyway. */
function PageLink({
  href,
  enabled,
  children,
}: {
  href: string;
  enabled: boolean;
  children: React.ReactNode;
}) {
  if (!enabled) {
    return (
      <Button variant="outline" size="sm" disabled>
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href}>{children}</Link>
    </Button>
  );
}

function QuestionRow({ q }: { q: LoggedQuestion }) {
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
      <span className="shrink-0 pt-px">
        {q.answered ? (
          <StatusBadge tone="success">Answered</StatusBadge>
        ) : (
          <StatusBadge tone="danger">Declined</StatusBadge>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] leading-snug text-secondary-foreground">
          {q.question}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-faint">
          {q.contextPath && <span className="truncate">{q.contextPath}</span>}
          {q.citations.length > 0 && (
            <>
              {q.contextPath && <span aria-hidden>·</span>}
              <span className="flex flex-wrap items-center gap-x-1.5">
                {q.citations.map((c, i) => (
                  <span key={`${c.sourceId}:${c.segmentIndex ?? '-'}:${i}`}>
                    <Link
                      href={
                        c.segmentIndex != null
                          ? `/dashboard/kb/${c.sourceId}?wf=${c.segmentIndex}`
                          : `/dashboard/kb/${c.sourceId}`
                      }
                      className="hover:text-primary hover:underline"
                      title={c.title}
                    >
                      {c.title}
                    </Link>
                    {i < q.citations.length - 1 && <span aria-hidden>,</span>}
                  </span>
                ))}
              </span>
            </>
          )}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-2 sm:pt-0.5">
        {q.feedback === 'up' && (
          <ThumbsUp
            className="h-3.5 w-3.5 text-success-dot"
            aria-label="Marked helpful"
          />
        )}
        {q.feedback === 'down' && (
          <ThumbsDown
            className="h-3.5 w-3.5 text-danger"
            aria-label="Marked unhelpful"
          />
        )}
        <span
          className="w-[68px] shrink-0 text-right font-mono text-[11px] text-faint"
          title={q.createdAt.toLocaleString()}
        >
          {relativeTime(q.createdAt)}
        </span>
      </span>
    </li>
  );
}

export default async function QuestionLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    filter?: string;
    range?: string;
    page?: string;
  }>;
}) {
  const ctx = await getCurrentWorkspace();
  if (!ctx) redirect('/signin');

  const sp = await searchParams;
  const search = parseSearch(sp.q);
  const filter = parseQuestionFilter(sp.filter);
  const range = parseLogRange(sp.range);
  const requestedPage = Math.max(1, Math.floor(Number(sp.page)) || 1);

  const log = await getQuestionLog(ctx.workspace.id, {
    days: range,
    filter,
    search,
    page: requestedPage,
  });

  const hrefParams = { q: search, filter, range };
  const filtered = Boolean(search) || filter !== 'all';

  return (
    <>
      <PageHeader
        title="Questions"
        subtitle="Every question your users asked the copilot."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/analytics">
              <ArrowLeft className="h-4 w-4" />
              Analytics
            </Link>
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:px-8">
        <QuestionLogControls
          search={search}
          filter={filter}
          range={range}
          filterOptions={QUESTION_FILTERS}
          rangeOptions={LOG_RANGE_OPTIONS}
        />

        <section className="overflow-hidden rounded-card border bg-card shadow-card">
          {log.total === 0 ? (
            <div className="px-4 py-14 text-center">
              <p className="text-sm font-medium text-secondary-foreground">
                {filtered
                  ? 'No questions match these filters.'
                  : `No questions in the ${logRangeLabel(range).toLowerCase()}.`}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                {filtered
                  ? 'Try a different search term, or widen the date range.'
                  : 'Questions appear here as soon as your customers start asking the copilot.'}
              </p>
              {filtered && (
                <Button asChild size="sm" variant="outline" className="mt-4">
                  <Link href="/dashboard/analytics/questions">Clear filters</Link>
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-[color:var(--gray-100)]">
              {log.rows.map((q) => (
                <QuestionRow key={q.id} q={q} />
              ))}
            </ul>
          )}
        </section>

        {log.total > 0 && (
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] text-faint">
              {log.from}–{log.to} of {log.total}
              {filtered && ' matching'}
            </p>
            {log.pageCount > 1 && (
              <div className="flex items-center gap-1.5">
                <PageLink
                  href={pageHref(hrefParams, log.page - 1)}
                  enabled={log.page > 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </PageLink>
                <span className="px-1 font-mono text-[11px] text-faint">
                  {log.page} / {log.pageCount}
                </span>
                <PageLink
                  href={pageHref(hrefParams, log.page + 1)}
                  enabled={log.page < log.pageCount}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </PageLink>
              </div>
            )}
          </div>
        )}

        {/* The log is a reading surface; the action it should lead to is recording the gap. */}
        {filter === 'declined' && log.total > 0 && (
          <div className="flex items-center gap-3 rounded-card border border-dashed bg-[color:var(--paper-2)] px-4 py-3">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              These are the questions your copilot has no approved workflow for.
              Recording them is what closes the gap.
            </p>
            <Button asChild variant="soft" size="sm">
              <Link href="/dashboard/recordings">
                <Mic className="h-4 w-4" />
                Record
              </Link>
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
