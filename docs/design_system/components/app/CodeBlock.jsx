import React from 'react';

/**
 * CodeBlock — a dark code surface with a Copy button. Used for the embed
 * snippet and other copy-paste install code.
 */
export function CodeBlock({ code, onCopy, label = 'Copy', style, ...rest }) {
  const [copied, setCopied] = React.useState(false);
  const handle = () => {
    if (onCopy) onCopy(code);
    try { navigator.clipboard && navigator.clipboard.writeText(code); } catch (e) {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div style={{ position: 'relative', background: 'var(--code-bg)', borderRadius: 'var(--radius-md)', padding: '13px 14px', ...style }} {...rest}>
      <pre style={{
        margin: 0, font: '400 11.5px/1.7 var(--font-mono)', color: 'var(--code-fg)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      }}>{code}</pre>
      <button
        onClick={handle}
        style={{
          position: 'absolute', top: 11, right: 11,
          background: 'var(--code-chip)', color: 'var(--code-fg)',
          border: '1px solid var(--code-border)', borderRadius: 'var(--radius-xs)',
          padding: '5px 11px', font: '600 11px var(--font-mono)', cursor: 'pointer',
        }}
      >{copied ? 'Copied' : label}</button>
    </div>
  );
}
