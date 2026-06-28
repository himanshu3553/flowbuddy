import React from 'react';

/**
 * MetricCard — a stat tile (big value + label). The `success` tone tints the
 * tile green; reserve it for the ROI / deflection metric (the one stat that
 * earns emphasis). Optional delta and helper text.
 */
export function MetricCard({ value, label, tone = 'default', delta, hint, style, ...rest }) {
  const success = tone === 'success';
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        border: `1px solid ${success ? 'var(--success-border)' : 'var(--gray-150)'}`,
        background: success ? 'var(--success-bg)' : '#fff',
        borderRadius: 'var(--radius-lg)',
        padding: '11px 13px',
        ...style,
      }}
      {...rest}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div style={{ font: '700 21px var(--font-sans)', letterSpacing: '-0.02em', color: success ? 'var(--success-text-2)' : 'var(--ink)' }}>
          {value}
        </div>
        {delta != null && (
          <div style={{ font: '600 10.5px var(--font-mono)', color: 'var(--success-text-2)' }}>{delta}</div>
        )}
      </div>
      <div style={{ font: '500 11px var(--font-sans)', color: success ? 'var(--success-text-2)' : 'var(--text-muted)', marginTop: 2 }}>
        {label}
      </div>
      {hint && (
        <div style={{ font: '400 11px/1.45 var(--font-sans)', color: success ? 'var(--success-dot)' : 'var(--text-faint)', marginTop: 3 }}>
          {hint}
        </div>
      )}
    </div>
  );
}
