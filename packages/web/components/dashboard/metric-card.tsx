import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Stat tile: large value + label, with an optional sublabel and an indigo tint
 * for hero/ROI metrics. Used across Home steady-state and Analytics.
 */
export function MetricCard({
  value,
  label,
  sublabel,
  tone = 'default',
  className,
}: {
  value: React.ReactNode;
  label: string;
  sublabel?: string;
  tone?: 'default' | 'primary';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-xl border bg-card p-4 shadow-sm',
        tone === 'primary' && 'border-primary/20 bg-primary/[0.05]',
        className,
      )}
    >
      <div
        className={cn(
          'truncate text-2xl font-extrabold tracking-tight',
          tone === 'primary' && 'text-primary',
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs font-medium text-muted-foreground">
        {label}
      </div>
      {sublabel && (
        <div className="mt-0.5 text-[11px] text-muted-foreground/80">
          {sublabel}
        </div>
      )}
    </div>
  );
}
