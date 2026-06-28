import React from 'react';

/**
 * Tag — a compact mono chip for captured-layers, routes, step counts and
 * other metadata. tone: neutral (gray) or brand (indigo tint, e.g. a route).
 */
export function Tag({ tone = 'neutral', children, style, ...rest }) {
  const tones = {
    neutral: { color: 'var(--text-body)', background: 'var(--paper)', border: 'var(--border)' },
    brand:   { color: 'var(--primary)',   background: 'var(--indigo-50)', border: 'var(--indigo-100)' },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        font: '600 11px var(--font-mono)',
        color: t.color,
        background: t.background,
        border: `1px solid ${t.border}`,
        padding: '4px 10px',
        borderRadius: 'var(--radius-pill)',
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
