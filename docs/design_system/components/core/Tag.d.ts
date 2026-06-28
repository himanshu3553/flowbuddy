import * as React from 'react';

export interface TagProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'style'> {
  /** neutral = gray meta chip · brand = indigo-tint (e.g. a route). @default 'neutral' */
  tone?: 'neutral' | 'brand';
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/**
 * A compact mono metadata chip: captured-layers (Screen · Voice · DOM), step
 * counts, and routes. Use `tone="brand"` for a route or other indigo metadata.
 */
export declare function Tag(props: TagProps): React.JSX.Element;
