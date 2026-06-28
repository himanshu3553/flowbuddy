import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Per-page header bar: title + optional subtitle on the left, right-aligned
 * actions. Sticky to the top of the content column, matching the Studio shell
 * in the design handoff. Pages render this as their first element.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-[62px] items-center justify-between gap-5 border-b bg-card px-5 md:px-6',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-base font-bold tracking-[-0.01em] text-ink">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-[11.5px] text-faint">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
