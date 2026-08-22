'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  setProductPageApproval,
  setProductPageApprovalsBulk,
  acceptProductPageUpdate,
  dismissProductPageUpdate,
} from '@/lib/product-page-actions';
import type { ProductPageView } from '@/lib/product-pages';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * AIL slice 2 — the review-and-approve surface for PRODUCT PAGES (what the product IS), beside the
 * workflow list (how things are DONE) on the KB page.
 *
 * The trust rule this component exists for (AI-5): a page is model prose, so the founder must be
 * able to read the FULL text (and where it came from in their own narration) at the moment they
 * approve it. Content is expandable but never truncated away, and a parked re-derivation shows
 * both tellings before Accept/Dismiss.
 */
type Filter = 'all' | 'approved' | 'pending' | 'retired';

export function ProductKnowledgeList({ pages }: { pages: ProductPageView[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [confirmAll, setConfirmAll] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  // What "Approve All" covers: pages never approved. A parked update on a live page is ALSO
  // pending, but it needs Accept/Dismiss with both tellings in view — not a bulk switch.
  const draftPages = useMemo(() => pages.filter((p) => !p.live && !p.everApproved), [pages]);

  /**
   * Two of these deliberately OVERLAP, and the counts therefore do not sum to `all`.
   *
   * A live page whose re-derivation is parked is BOTH approved (it is serving right now) and
   * pending (it is waiting on the founder). Forcing a partition would have to drop it from one of
   * them, and dropping it from Pending is the harmful direction: a founder who filters Pending,
   * sees nothing and concludes they are done would leave an update parked forever — the same
   * silent-no-op the tab badge exists to prevent. The row itself carries an "Update waiting" chip,
   * so a page appearing under both reads as deliberate rather than as a miscount.
   */
  const counts = useMemo(
    () => ({
      all: pages.length,
      approved: pages.filter((p) => p.live).length,
      pending: pages.filter((p) => (!p.live && !p.everApproved) || p.pendingContent).length,
      // Retired is RESOLVED, not outstanding — it must never inflate the "waiting on you" count,
      // or the founder is chased to re-approve something they deliberately took out of service.
      retired: pages.filter((p) => p.everApproved && !p.live).length,
    }),
    [pages],
  );

  const visible = pages.filter((p) => {
    if (filter === 'approved' && !p.live) return false;
    if (filter === 'pending' && !((!p.live && !p.everApproved) || p.pendingContent)) return false;
    if (filter === 'retired' && !(p.everApproved && !p.live)) return false;
    // Searches the page CONTENT as well as its title. A page is prose the model wrote, so the
    // phrase a founder remembers is far more often inside it than in the heading.
    if (q && !`${p.title} ${p.content}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const tabs: { key: Filter; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: counts.all },
    { key: 'approved', label: 'Approved', n: counts.approved },
    { key: 'pending', label: 'Pending', n: counts.pending },
    ...(counts.retired > 0
      ? [{ key: 'retired' as Filter, label: 'Not answering', n: counts.retired }]
      : []),
  ];

  if (pages.length === 0) return null;

  const run = (page: ProductPageView, act: () => Promise<void>, done: string) => {
    setBusyId(page.id);
    start(async () => {
      try {
        await act();
        toast.success(done);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Something went wrong');
      } finally {
        setBusyId(null);
      }
    });
  };

  /** Confirmed from the review sheet, never straight off the banner — the same rule as workflows:
   *  every page is model prose the copilot will read out, so approving all of them unseen is the
   *  failure the sheet exists to prevent. */
  function approveAll() {
    const rows = draftPages;
    if (rows.length === 0) return;
    setBusyId('all');
    start(async () => {
      try {
        const n = await setProductPageApprovalsBulk({ pageIds: rows.map((p) => p.id) });
        toast.success(`${n} page${n === 1 ? '' : 's'} live for the copilot`);
        setConfirmAll(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to approve all');
      } finally {
        setBusyId(null);
      }
    });
  }

  const statusOf = (p: ProductPageView) =>
    p.live
      ? { label: 'Live', cls: 'border-brand-100 bg-brand-50 text-primary' }
      : p.everApproved
        ? { label: 'Retired', cls: 'border bg-secondary text-secondary-foreground' }
        : { label: 'Pending approval', cls: 'border bg-secondary text-secondary-foreground' };

  return (
    <section className="space-y-3.5">
      {draftPages.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-tile border border-warning-border bg-warning-bg2 px-4 py-3.5">
          <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-warning-dot" />
          <p className="flex-1 text-[13px] leading-relaxed text-warning-text">
            <b className="font-semibold text-[#4a3e1e]">
              {draftPages.length} page{draftPages.length === 1 ? '' : 's'} awaiting approval.
            </b>{' '}
            Review and Approve each one to make live
          </p>
          <Button size="sm" onClick={() => setConfirmAll(true)} disabled={pending} className="shrink-0">
            Approve All
          </Button>
        </div>
      )}

      <Dialog open={confirmAll} onOpenChange={(o) => !pending && setConfirmAll(o)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Approve {draftPages.length} page{draftPages.length === 1 ? '' : 's'}?
            </DialogTitle>
            <DialogDescription>
              This puts them live for the copilot. Each one is written by the model from your
              narration, so it is worth reading before it speaks for you.
            </DialogDescription>
          </DialogHeader>
          {/* Full text, never truncated — the trust rule (AI-5) applies to a bulk approval too. */}
          <ul className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
            {draftPages.map((p) => (
              <li key={p.id} className="rounded-list border bg-card px-3.5 py-3">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                  <span className="rounded-pill border bg-secondary px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-secondary-foreground">
                    {p.type}
                  </span>
                  {p.title}
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-secondary-foreground">
                  {p.content}
                </p>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAll(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={approveAll} disabled={pending}>
              {busyId === 'all'
                ? 'Approving…'
                : `Approve ${draftPages.length} page${draftPages.length === 1 ? '' : 's'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Same filter row and search as the workflow list — one KB, one way to find things in it. */}
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
              {t.label} <span className="font-mono text-[10px] opacity-70">{t.n}</span>
            </button>
          ))}
        </div>
        <div className="relative mb-2 w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search product knowledge"
            className="h-8 pl-8"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-card border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          No pages match this filter.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {visible.map((p) => {
            const st = statusOf(p);
            const open = openId === p.id;
            const busy = busyId === p.id || busyId === 'all';
            return (
              <li key={p.id} className="rounded-list border bg-card">
                <div className="flex items-center gap-3 px-[15px] py-[13px]">
                  <span className="shrink-0 rounded-pill border bg-secondary px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-secondary-foreground">
                    {p.type}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : p.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13.5px] font-semibold text-ink">{p.title}</span>
                      <ChevronDown
                        className={cn('h-3.5 w-3.5 shrink-0 text-faint transition-transform', open && 'rotate-180')}
                      />
                    </span>
                    {!open && (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {p.content}
                      </span>
                    )}
                  </button>
                  {p.pendingContent && (
                    <span className="shrink-0 rounded-pill border border-warning-border bg-warning-bg px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-warning-text">
                      Update waiting
                    </span>
                  )}
                  <span
                    className={cn(
                      'shrink-0 rounded-pill px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide',
                      st.cls,
                    )}
                  >
                    {st.label}
                  </span>
                  {p.everApproved && !p.live ? (
                    <Button
                      size="sm"
                      variant="soft"
                      disabled={busy}
                      onClick={() =>
                        run(
                          p,
                          () => setProductPageApproval({ pageId: p.id, approved: true }),
                          `“${p.title}” is live for the copilot`,
                        )
                      }
                    >
                      Re-approve
                    </Button>
                  ) : (
                    <Switch
                      checked={p.live}
                      disabled={busy}
                      onCheckedChange={(next: boolean) =>
                        run(
                          p,
                          () => setProductPageApproval({ pageId: p.id, approved: next }),
                          next
                            ? `“${p.title}” is live for the copilot`
                            : `“${p.title}” retired — the copilot stopped using it`,
                        )
                      }
                    />
                  )}
                </div>

                {open && (
                  <div className="space-y-3 border-t px-[15px] py-3.5">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{p.content}</p>

                    {p.pendingContent && (
                      <div className="rounded-card border border-warning-border bg-warning-bg px-3.5 py-3">
                        <p className="text-sm font-semibold text-warning-text">
                          A newer derivation is waiting for review.
                        </p>
                        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                          {p.pendingContent}
                        </p>
                        <p className="mt-1.5 font-mono text-[10.5px] text-warning-text">
                          Accepting replaces the text above and goes live immediately. Dismissing keeps
                          the current page.
                        </p>
                        <div className="mt-2.5 flex items-center gap-2">
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              run(
                                p,
                                () => acceptProductPageUpdate({ pageId: p.id }),
                                `“${p.title}” updated and live`,
                              )
                            }
                          >
                            Accept update
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              run(
                                p,
                                () => dismissProductPageUpdate({ pageId: p.id }),
                                `Update dismissed — “${p.title}” unchanged`,
                              )
                            }
                          >
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
