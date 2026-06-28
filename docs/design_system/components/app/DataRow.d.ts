import * as React from 'react';

export interface DataRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'style' | 'title'> {
  /** `true` renders the striped media placeholder; or pass a custom node; or omit. */
  media?: boolean | React.ReactNode;
  title: React.ReactNode;
  /** Secondary line (meta text, a progress bar, etc). */
  meta?: React.ReactNode;
  /** Right-side region: fixed columns, a StatusBadge, a Toggle, a ⋯ menu. */
  trailing?: React.ReactNode;
  /** Emphasized (active/processing) row: indigo border + soft lift. */
  highlighted?: boolean;
  /** Dimmed (draft) row. */
  muted?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/**
 * A flexible list/table row. Compose the `trailing` region from Tags, a
 * StatusBadge, a Toggle, or a ⋯ menu to build recordings, workflows, and origins.
 */
export declare function DataRow(props: DataRowProps): React.JSX.Element;
