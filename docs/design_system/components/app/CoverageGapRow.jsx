import React from 'react';

/**
 * CoverageGapRow — one row of the "record this next" feedback loop: a question
 * the copilot couldn't fully answer, its frequency/status, and a Record action
 * (or a RECORDING state). The loop is first-class, so this is its own component.
 */
export function CoverageGapRow({ question, meta, tone = 'gap', action, status, style, ...rest }) {
  const dotColor = { gap: 'var(--danger-ink)', partial: 'var(--warning-dot)', decline: 'var(--danger-ink)' }[tone] || 'var(--danger-ink)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 11,
      padding: '10px 12px', border: '1px solid var(--gray-100)', borderRadius: 'var(--radius-sm)',
      opacity: status ? 0.85 : 1, fontFamily: 'var(--font-sans)', ...style,
    }} {...rest}>
      {action && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flex: '0 0 auto' }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '600 13px var(--font-sans)', color: 'var(--gray-700)' }}>{question}</div>
        {meta && <div style={{ font: '400 11px var(--font-mono)', color: 'var(--text-faint)', marginTop: 2 }}>{meta}</div>}
      </div>
      {action ? <div style={{ flex: '0 0 auto' }}>{action}</div> : null}
      {status ? <div style={{ flex: '0 0 auto' }}>{status}</div> : null}
    </div>
  );
}
