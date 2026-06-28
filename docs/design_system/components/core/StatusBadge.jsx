import React from 'react';

/**
 * StatusBadge — a small mono pill that always carries a text label
 * (never color alone). Tone maps to the 3-color status system + indigo "live".
 */
export function StatusBadge({ tone = 'neutral', dot = false, children, style, ...rest }) {
  const tones = {
    success: { color: 'var(--success-text)', background: 'var(--success-bg-2)', border: 'var(--success-border)', dot: 'var(--success-dot)' },
    live:    { color: 'var(--primary)',      background: 'var(--indigo-50)',    border: 'var(--indigo-100)',     dot: 'var(--primary)' },
    pending: { color: 'var(--warning-text)', background: 'var(--warning-bg)',   border: 'var(--warning-border)', dot: 'var(--warning-dot)' },
    danger:  { color: 'var(--danger-text)',  background: 'var(--danger-bg)',    border: 'var(--danger-border)',  dot: 'var(--danger-500)' },
    neutral: { color: 'var(--text-muted)',   background: 'var(--paper)',        border: 'var(--border)',         dot: 'var(--gray-300)' },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        font: '700 9.5px var(--font-mono)',
        letterSpacing: '0.06em',
        color: t.color,
        background: t.background,
        border: `1px solid ${t.border}`,
        padding: '3px 9px',
        borderRadius: 'var(--radius-pill)',
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.dot, flex: '0 0 auto' }} />}
      {children}
    </span>
  );
}
