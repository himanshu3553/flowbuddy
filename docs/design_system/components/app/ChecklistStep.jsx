import React from 'react';

function Glyph({ name, fill = 0, color, size = 18 }) {
  return (
    <span style={{
      fontFamily: "'Material Symbols Outlined'",
      fontVariationSettings: `'FILL' ${fill}, 'opsz' ${size}`,
      fontSize: size, lineHeight: 1, color, flex: '0 0 auto',
    }}>{name}</span>
  );
}

/**
 * ChecklistStep — one row of the activation checklist (done / active / locked).
 * Done = green check + tinted row; active = indigo number + lift + action;
 * locked = gray, dimmed, lock glyph.
 */
export function ChecklistStep({ state = 'locked', index, title, desc, action, statusLabel, style, ...rest }) {
  const styles = {
    done: { border: 'var(--success-border)', bg: 'var(--success-bg)', shadow: 'none', titleColor: 'var(--ink)', opacity: 1 },
    active: { border: 'var(--indigo-200)', bg: '#fff', shadow: 'var(--shadow-step)', titleColor: 'var(--ink)', opacity: 1, borderWidth: 1.5 },
    locked: { border: 'var(--border)', bg: 'var(--paper-2)', shadow: 'none', titleColor: 'var(--text-secondary)', opacity: 0.8 },
  };
  const s = styles[state] || styles.locked;

  const marker = state === 'done'
    ? <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(150deg,#1aa86a,#15935a)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Glyph name="check" fill={1} color="#fff" /></div>
    : state === 'active'
      ? <div style={{ width: 30, height: 30, borderRadius: '50%', border: '2px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 13px var(--font-sans)', color: 'var(--primary)', flex: '0 0 auto' }}>{index}</div>
      : <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#eef0f4', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Glyph name="lock" color="var(--gray-300)" size={16} /></div>;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
      border: `${s.borderWidth || 1}px solid ${s.border}`, background: s.bg,
      borderRadius: 'var(--radius-lg)', boxShadow: s.shadow, opacity: s.opacity,
      fontFamily: 'var(--font-sans)', ...style,
    }} {...rest}>
      {marker}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '600 14px var(--font-sans)', color: s.titleColor }}>{title}</div>
        {desc && <div style={{ font: '12px var(--font-sans)', color: 'var(--text-muted)', marginTop: 1 }}>{desc}</div>}
      </div>
      {action ? <div style={{ flex: '0 0 auto' }}>{action}</div>
        : statusLabel ? <span style={{ font: '700 10px var(--font-mono)', letterSpacing: '0.04em', color: state === 'done' ? 'var(--success-text)' : 'var(--gray-300)', background: state === 'done' ? 'var(--success-bg-2)' : 'transparent', border: state === 'done' ? '1px solid var(--success-border)' : 'none', padding: state === 'done' ? '3px 9px' : 0, borderRadius: 'var(--radius-pill)' }}>{statusLabel}</span>
          : null}
    </div>
  );
}
