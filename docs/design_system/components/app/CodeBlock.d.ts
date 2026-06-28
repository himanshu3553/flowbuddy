import * as React from 'react';

export interface CodeBlockProps {
  /** The code string (rendered as wrapped mono on the dark surface). */
  code: string;
  /** Called with the code when the Copy button is pressed (also writes to clipboard). */
  onCopy?: (code: string) => void;
  /** Copy button label. @default 'Copy' */
  label?: string;
  style?: React.CSSProperties;
}

/**
 * A dark code surface with a Copy button — the embed snippet and other install
 * code. The button flips to "Copied" briefly on press.
 */
export declare function CodeBlock(props: CodeBlockProps): React.JSX.Element;
