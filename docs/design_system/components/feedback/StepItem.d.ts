import * as React from 'react';

export interface StepItemProps {
  /** Step number (rendered as "STEP n"). */
  index: number | string;
  /** Material Symbols glyph for the tile. */
  icon: string;
  title: React.ReactNode;
  desc: React.ReactNode;
  /** `danger` tints the tile red (the "record" step). @default 'brand' */
  tone?: 'brand' | 'danger';
  /** Hide the connector line on the last item. @default false */
  last?: boolean;
  style?: React.CSSProperties;
}

/**
 * One node of a vertical numbered timeline. Stack inside a Dialog body (how it
 * works / how to record) or in the core-loop strip. Set `last` on the final item.
 */
export declare function StepItem(props: StepItemProps): React.JSX.Element;
