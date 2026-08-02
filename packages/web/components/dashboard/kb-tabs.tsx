import Link from 'next/link';

import { cn } from '@/lib/utils';

/**
 * The Knowledge Base's top-level split: **Workflows** (how things are DONE) and **Product
 * knowledge** (what the product IS).
 *
 * WHY A SEGMENTED CONTROL RATHER THAN THE UNDERLINED TABS USED ELSEWHERE. `KbWorkflowList` already
 * renders an underlined tab row of its own (all · approved · pending · replaced). Repeating that
 * treatment here would stack two identical-looking tab bars and leave the reader working out which
 * one is the outer level. A different shape for a different altitude is the point, not an
 * inconsistency — the Copilot page keeps the underlined style because nothing sits under it.
 *
 * WHY THE PENDING COUNT IS ON THE TAB. Tabs HIDE things: before this split, product pages sat below
 * the workflows and a founder scrolled past them whether or not they cared. Behind a tab, a page
 * awaiting approval is invisible to anyone who never clicks — and an unapproved page serves nobody,
 * silently. The count is what stops the split from quietly costing coverage.
 *
 * A LINK, not client state, so the choice survives a reload and the back button, and the page stays
 * a server component (the same reason Analytics drives its range through `?range=`).
 */
export interface KbTab {
  key: string;
  label: string;
  /** Everything in this tab. */
  count: number;
  /** The subset waiting on the founder — never shown as 0. */
  pending: number;
}

export function KbTabs({ tabs, active }: { tabs: KbTab[]; active: string }) {
  return (
    <div
      role="tablist"
      aria-label="Knowledge Base sections"
      className="inline-flex items-center gap-1 rounded-control border border-[color:var(--gray-200)] bg-[color:var(--paper-2)] p-1"
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={`/dashboard/kb?tab=${t.key}`}
            role="tab"
            aria-selected={on}
            scroll={false}
            className={cn(
              'flex items-center gap-2 rounded-[6px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
              on
                ? 'border border-[color:var(--gray-200)] bg-card text-ink shadow-card'
                : 'border border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            <span
              className={cn(
                'font-mono text-[10.5px] font-bold',
                on ? 'text-secondary-foreground' : 'text-faint',
              )}
            >
              {t.count}
            </span>
            {t.pending > 0 && (
              <span
                title={`${t.pending} waiting for your approval`}
                className="rounded-full border border-warning-border bg-warning-bg px-1.5 py-px font-mono text-[10px] font-bold text-warning-text"
              >
                {t.pending}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
