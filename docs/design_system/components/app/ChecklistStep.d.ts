import * as React from 'react';

export interface ChecklistStepProps {
  /** done = complete (green) · active = current (indigo + action) · locked = future (dim). @default 'locked' */
  state?: 'done' | 'active' | 'locked';
  /** Step number shown in the active/locked marker. */
  index?: number;
  title: React.ReactNode;
  desc?: React.ReactNode;
  /** Trailing action node (e.g. a primary Button) — typically on the active step. */
  action?: React.ReactNode;
  /** Trailing status label (e.g. "DONE", "LOCKED") when there's no action. */
  statusLabel?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * One row of the activation checklist on Home ("Get your copilot live"). Stack
 * four with a 10px gap: one done, one active (with an Open-recorder action),
 * two locked.
 */
export declare function ChecklistStep(props: ChecklistStepProps): React.JSX.Element;
