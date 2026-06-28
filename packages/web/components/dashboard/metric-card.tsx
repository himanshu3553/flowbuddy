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
  /** `success` = the tinted (green) ROI tile — the one stat that gets a fill. */
  tone?: 'default' | 'success' | 'primary';
  className?: string;
}) {
  const success = tone === 'success';
  const primary = tone === 'primary';
  return (
    <div
      className={cn(
        'min-w-0 rounded-list border border-[color:var(--gray-150)] bg-card px-[13px] py-[11px]',
        success && 'border-success-border bg-success-bg',
        primary && 'border-brand-200 bg-brand-50',
        className,
      )}
    >
      <div
        className={cn(
          'truncate text-[21px] font-extrabold leading-tight tracking-tight text-ink',
          success && 'text-success-text2',
          primary && 'text-primary',
        )}
      >
        {value}
      </div>
      <div
        className={cn(
          'mt-0.5 text-[11px] font-medium text-muted-foreground',
          success && 'text-success-text2',
        )}
      >
        {label}
      </div>
      {sublabel && (
        <div
          className={cn(
            'mt-0.5 text-[11px] leading-snug text-faint',
            success && 'text-success-dot',
          )}
        >
          {sublabel}
        </div>
      )}
    </div>
  );
}
