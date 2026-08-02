'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  setProductPageApproval,
  acceptProductPageUpdate,
  dismissProductPageUpdate,
} from '@/lib/product-page-actions';
import type { ProductPageView } from '@/lib/product-pages';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

/**
 * AIL slice 2 — the review-and-approve surface for PRODUCT PAGES (what the product IS), beside the
 * workflow list (how things are DONE) on the KB page.
 *
 * The trust rule this component exists for (AI-5): a page is model prose, so the founder must be
 * able to read the FULL text (and where it came from in their own narration) at the moment they
 * approve it. Content is expandable but never truncated away, and a parked re-derivation shows
 * both tellings before Accept/Dismiss.
 */
export function ProductKnowledgeList({ pages }: { pages: ProductPageView[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

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

  const statusOf = (p: ProductPageView) =>
    p.live
      ? { label: 'Live', cls: 'border-brand-100 bg-brand-50 text-primary' }
      : p.everApproved
        ? { label: 'Retired', cls: 'border bg-secondary text-secondary-foreground' }
        : { label: 'Pending approval', cls: 'border bg-secondary text-secondary-foreground' };

  return (
    <section className="space-y-2.5">
      <div>
        <h2 className="text-base font-semibold tracking-tight">Product knowledge</h2>
        <p className="text-sm text-muted-foreground">
          What your product <em>is</em> — pages derived from your narration. Approved pages let the
          copilot orient, explain and compare; workflows keep owning the how-to.
        </p>
      </div>
      <ul className="space-y-2.5">
        {pages.map((p) => {
          const st = statusOf(p);
          const open = openId === p.id;
          const busy = busyId === p.id;
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
                  {p.provenance.length > 0 && (
                    <div className="space-y-1">
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-faint">
                        From your narration
                      </p>
                      {p.provenance.map((e, i) => (
                        <p key={i} className="text-xs leading-relaxed text-muted-foreground">
                          “{e.quote}” <span className="text-faint">— {e.recordingTitle}</span>
                        </p>
                      ))}
                    </div>
                  )}
                  {p.relatedWorkflows.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-faint">
                        Points to
                      </span>
                      {p.relatedWorkflows.map((t) => (
                        <span
                          key={t}
                          className="rounded-pill border bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground"
                        >
                          → {t}
                        </span>
                      ))}
                    </div>
                  )}

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
    </section>
  );
}
