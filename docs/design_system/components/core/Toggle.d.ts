import * as React from 'react';

export interface ToggleProps {
  /** On/off state. On = indigo. @default false */
  checked?: boolean;
  /** Called with the next boolean value. */
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  /** @default 'md' (38×22). Use 'sm' (34×20) in dense settings rows. */
  size?: 'sm' | 'md';
  /** Accessible label (the row's text label, e.g. "Approve for copilot"). */
  ariaLabel?: string;
  style?: React.CSSProperties;
}

/**
 * The approval switch — the product's core trust gate ("approve for copilot").
 * Always pair with a visible text label; never rely on the track color alone.
 */
export declare function Toggle(props: ToggleProps): React.JSX.Element;
