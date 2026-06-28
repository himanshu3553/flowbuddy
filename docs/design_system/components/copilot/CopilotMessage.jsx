import React from 'react';

/**
 * CopilotMessage — a chat bubble for the embeddable copilot widget. `user`
 * bubbles are indigo and right-aligned; `bot` bubbles are white/left and can
 * carry a citation chip (grounded answer), a decline chip (honest "I don't
 * know yet"), and 👍/👎 feedback.
 */
export function CopilotMessage({ from = 'bot', citation, decline = false, feedback = false, children, style, ...rest }) {
  if (from === 'user') {
    return (
      <div style={{
        alignSelf: 'flex-end', maxWidth: '78%', background: 'var(--primary)', color: '#fff',
        borderRadius: '13px 13px 4px 13px', padding: '9px 12px', font: '12px/1.45 var(--font-sans)', ...style,
      }} {...rest}>{children}</div>
    );
  }
  return (
    <div style={{
      alignSelf: 'flex-start', maxWidth: '88%', background: '#fff',
      border: `1px solid ${decline ? 'var(--danger-border)' : 'var(--border)'}`,
      borderRadius: '13px 13px 13px 4px', padding: '10px 12px', ...style,
    }} {...rest}>
      <div style={{ font: '12px/1.5 var(--font-sans)', color: 'var(--gray-700)' }}>{children}</div>
      {citation && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 9, background: 'var(--indigo-50)', border: '1px solid var(--indigo-100)', borderRadius: 'var(--radius-pill)', padding: '3px 9px' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }} />
          <span style={{ font: '10px var(--font-mono)', color: 'var(--primary)' }}>Source: {citation}</span>
        </div>
      )}
      {decline && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 9, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-pill)', padding: '3px 9px' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger-ink)' }} />
          <span style={{ font: '10px var(--font-mono)', color: 'var(--danger-text)' }}>Honest decline · gap logged</span>
        </div>
      )}
      {feedback && (
        <div style={{ display: 'flex', gap: 10, marginTop: 9 }}>
          <span style={{ font: '13px', color: 'var(--success-dot)', cursor: 'pointer' }}>▲</span>
          <span style={{ font: '13px', color: 'var(--gray-300)', cursor: 'pointer' }}>▽</span>
        </div>
      )}
    </div>
  );
}
