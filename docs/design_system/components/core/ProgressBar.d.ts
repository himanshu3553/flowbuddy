import * as React from 'react';

export interface ProgressBarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'style'> {
  /** 0–100. */
  value?: number;
  /** Fill color. @default 'brand' */
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  /** Optional left-hand label (renders a label row above the track). */
  label?: React.ReactNode;
  /** Optional right-hand value (e.g. "86%"). */
  valueLabel?: React.ReactNode;
  /** Track height in px. @default 6 */
  height?: number;
  style?: React.CSSProperties;
}

/**
 * A thin progress / proportion bar. Used bare for inline progress, or with
 * label + valueLabel for the Copilot-health breakdown (answered / declines / 👍).
 */
export declare function ProgressBar(props: ProgressBarProps): React.JSX.Element;
