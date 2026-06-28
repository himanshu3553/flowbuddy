import * as React from 'react';

export interface DialogProps {
  /** @default true */
  open?: boolean;
  onClose?: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Card width in px. @default 466 */
  width?: number;
  /** Body content (e.g. a list of StepItems). */
  children?: React.ReactNode;
  /** Optional footer / callout region under the body. */
  footer?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * A centered modal on a dim backdrop (the help + onboarding dialogs). Renders
 * absolutely within a positioned ancestor (the app frame). Backdrop and × close.
 */
export declare function Dialog(props: DialogProps): React.JSX.Element | null;
