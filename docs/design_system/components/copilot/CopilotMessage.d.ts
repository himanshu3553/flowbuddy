import * as React from 'react';

export interface CopilotMessageProps {
  /** Who sent it. @default 'bot' */
  from?: 'user' | 'bot';
  /** Citation source label on a grounded answer (renders the indigo source chip). */
  citation?: React.ReactNode;
  /** Render the honest-decline chip ("gap logged"). @default false */
  decline?: boolean;
  /** Show 👍/👎 feedback controls. @default false */
  feedback?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * A chat bubble for the embeddable copilot preview. User bubbles are indigo and
 * right-aligned; bot bubbles are white/left and can carry a citation chip, an
 * honest-decline chip, and thumbs. Demonstrates grounded + declined answers.
 */
export declare function CopilotMessage(props: CopilotMessageProps): React.JSX.Element;
