import * as React from 'react';

export interface CoverageGapRowProps {
  /** The uncovered question, e.g. "How do I export a report to CSV?". */
  question: React.ReactNode;
  /** Mono meta line, e.g. "asked 14× · no coverage". */
  meta?: React.ReactNode;
  /** Dot color: gap (red) · partial (amber) · decline (red). @default 'gap' */
  tone?: 'gap' | 'partial' | 'decline';
  /** Trailing Record action (renders the leading dot too). */
  action?: React.ReactNode;
  /** Trailing status node (e.g. a RECORDING StatusBadge) — use instead of action. */
  status?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * A row in the "record this next" coverage panel — the compounding feedback
 * loop. Use `action` (a Record Button) for open gaps, `status` for in-progress.
 */
export declare function CoverageGapRow(props: CoverageGapRowProps): React.JSX.Element;
