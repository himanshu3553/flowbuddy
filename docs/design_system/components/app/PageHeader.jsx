import React from 'react';

/**
 * PageHeader — the per-screen header bar: title (or breadcrumb) + optional
 * subtitle on the left, actions on the right. Supports an inline tab row and a
 * right-aligned live status, as used on the Copilot screen.
 */
export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  tabs,
  activeTab,
  onTab,
  status,
  children,
  style,
  ...rest
}) {
  return (
    <header style={{
      height: 'var(--header-h)', flex: '0 0 var(--header-h)',
      background: '#fff', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 20, padding: '0 24px', fontFamily: 'var(--font-sans)', ...style,
    }} {...rest}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          {breadcrumb ? (
            <div style={{ font: '600 12.5px var(--font-sans)', color: 'var(--text-faint)' }}>{breadcrumb}</div>
          ) : (
            <div style={{ font: '700 16px var(--font-sans)', color: 'var(--ink)', letterSpacing: '-0.01em' }}>{title}</div>
          )}
          {subtitle && <div style={{ font: '11.5px var(--font-sans)', color: 'var(--text-faint)', marginTop: 1 }}>{subtitle}</div>}
        </div>
        {tabs && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {tabs.map((t) => {
              const on = t === activeTab;
              return (
                <span key={t} onClick={() => onTab && onTab(t)} style={{
                  font: '600 12.5px var(--font-sans)', cursor: 'pointer',
                  color: on ? 'var(--ink)' : 'var(--text-faint)',
                  borderBottom: on ? '2px solid var(--primary)' : '2px solid transparent',
                  paddingBottom: 19, marginBottom: -1, alignSelf: 'stretch', display: 'flex', alignItems: 'center',
                }}>{t}</span>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
        {status && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success-dot)' }} />
            <span style={{ font: '600 12px var(--font-sans)', color: 'var(--success-text-2)' }}>{status}</span>
          </div>
        )}
        {children}
      </div>
    </header>
  );
}
