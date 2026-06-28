import * as React from 'react';

export interface EmptyStateProps {
  /** `true` = striped media placeholder; or a custom node (an icon); or omit. */
  media?: boolean | React.ReactNode;
  title: React.ReactNode;
  desc?: React.ReactNode;
  /** Action buttons row. */
  actions?: React.ReactNode;
  /** Captured-layer chip labels (Screen, Voice, DOM, …). */
  chips?: string[];
  /** Mono footnote, e.g. "PII masked in your browser before upload". */
  footnote?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * A centered first-run / no-data state with media, copy, actions, optional
 * captured-layer chips, and a footnote. Powers the Recordings / KB / Analytics
 * empties.
 */
export declare function EmptyState(props: EmptyStateProps): React.JSX.Element;
