import * as React from 'react';

export interface StatusBadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'style'> {
  /**
   * success = ready/answered/done/verified (green) · live = approved & live in
   * copilot (indigo) · pending = pending/processing/recording (amber) ·
   * danger = declined/failed (red) · neutral = draft (gray). @default 'neutral'
   */
  tone?: 'success' | 'live' | 'pending' | 'danger' | 'neutral';
  /** Render a leading status dot. @default false */
  dot?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/**
 * A mono status pill. Label text is required — status is never communicated by
 * color alone. Use UPPERCASE labels (APPROVED · LIVE, PENDING, DECLINED).
 */
export declare function StatusBadge(props: StatusBadgeProps): React.JSX.Element;
