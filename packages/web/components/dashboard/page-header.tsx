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
        'sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-8',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-base font-bold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
