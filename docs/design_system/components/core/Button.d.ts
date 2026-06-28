import * as React from 'react';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  /** Visual style. @default 'primary' */
  variant?: 'primary' | 'secondary' | 'soft' | 'ghost';
  /** @default 'md' */
  size?: 'sm' | 'md';
  /** Material Symbols Outlined glyph name (e.g. 'help', 'fiber_manual_record'). */
  icon?: string;
  /** Icon fill axis, 0 (outline) or 1 (filled). @default 0 */
  iconFill?: 0 | 1;
  /** Show a leading "record" dot (the white pulse on Record buttons). @default false */
  dot?: boolean;
  /** Stretch to container width. @default false */
  fullWidth?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/**
 * The primary Sync Studio button. `primary` is the indigo CTA gradient; use
 * `secondary` for neutral actions, `soft` for low-emphasis brand actions,
 * `ghost` for tertiary. Pair with an `icon` (Material Symbol) or a record `dot`.
 *
 * @startingPoint section="Core" subtitle="Indigo CTA + secondary / soft / ghost" viewport="700x150"
 */
export declare function Button(props: ButtonProps): React.JSX.Element;
