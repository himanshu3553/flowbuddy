import React from 'react';

/**
 * Dialog — a centered modal on a dim backdrop. Header (title + subtitle + close),
 * a scrollable body, and an optional footer/callout. Backdrop and × both close.
 */
export function Dialog({ open = true, onClose, title, subtitle, width = 466, children, footer, style, ...rest }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, background: 'rgba(20,22,34,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 26, zIndex: 30, fontFamily: 'var(--font-sans)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width, maxWidth: '100%', maxHeight: '100%', overflow: 'auto',
          background: '#fff', borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-dialog)',
          ...style,
        }}
        {...rest}
      >
        <div style={{ padding: '22px 24px 6px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ font: '800 18px var(--font-sans)', color: 'var(--ink)', letterSpacing: '-0.01em' }}>{title}</div>
            {subtitle && <div style={{ font: '12.5px/1.5 var(--font-sans)', color: 'var(--text-muted)', marginTop: 3 }}>{subtitle}</div>}
          </div>
          <div onClick={onClose} style={{ font: '20px var(--font-sans)', color: 'var(--gray-300)', cursor: 'pointer', lineHeight: 1, flex: '0 0 auto', padding: '2px 4px' }}>×</div>
        </div>
        <div style={{ padding: '14px 24px 4px' }}>{children}</div>
        {footer && <div style={{ padding: '4px 24px 22px' }}>{footer}</div>}
      </div>
    </div>
  );
}
