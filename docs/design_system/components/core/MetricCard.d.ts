import * as React from 'react';

export interface MetricCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'style'> {
  /** The headline figure, e.g. "1,284", "86%", "~340". */
  value: React.ReactNode;
  /** Caption below the value, e.g. "Questions · 7d". */
  label: React.ReactNode;
  /** `success` tints the tile green — reserve for the ROI/deflection stat. @default 'default' */
  tone?: 'default' | 'success';
  /** Optional delta chip (e.g. "+12%"). */
  delta?: React.ReactNode;
  /** Optional helper line under the label. */
  hint?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * A dashboard stat tile. Lay several in a flex row with a 9–10px gap. Use the
 * `success` tone on exactly one tile (tickets deflected) to anchor the ROI story.
 */
export declare function MetricCard(props: MetricCardProps): React.JSX.Element;
