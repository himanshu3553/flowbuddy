import React from 'react';

/**
 * ProgressBar — a thin track + fill. tone: brand (indigo), success, warning,
 * danger. Optionally render a label row (left label + right value) above it,
 * as used in the Copilot-health panel.
 */
export function ProgressBar({ value = 0, tone = 'brand', label, valueLabel, height = 6, style, ...rest }) {
  const fills = {
    brand: 'var(--primary)',
    success: 'var(--success-dot)',
    warning: 'var(--warning-dot)',
    danger: 'var(--danger-ink)',
  };
  const fill = fills[tone] || fills.brand;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={style} {...rest}>
      {(label || valueLabel) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', font: '400 12px var(--font-sans)', color: 'var(--text-secondary)', marginBottom: 4 }}>
          <span>{label}</span>
          {valueLabel != null && <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{valueLabel}</span>}
        </div>
      )}
      <div style={{ height, background: 'var(--gray-100)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: fill, borderRadius: 'var(--radius-pill)', transition: 'width var(--dur-slow) var(--ease)' }} />
      </div>
    </div>
  );
}
