import React from 'react';

export const defaultNavItems = [
  { icon: 'home', label: 'Home', route: '/dashboard' },
  { icon: 'videocam', label: 'Recordings', route: '/dashboard/recordings' },
  { icon: 'menu_book', label: 'Knowledge Base', route: '/dashboard/kb', badge: 5 },
  { icon: 'smart_toy', label: 'Copilot', route: '/dashboard/copilot' },
  { icon: 'bar_chart', label: 'Analytics', route: '/dashboard/analytics' },
];

function Glyph({ name, fill, color, size = 20 }) {
  return (
    <span style={{
      fontFamily: "'Material Symbols Outlined'",
      fontVariationSettings: `'FILL' ${fill}, 'opsz' ${size}`,
      fontSize: size, lineHeight: 1, color, flex: '0 0 auto',
    }}>{name}</span>
  );
}

/**
 * Sidebar — the Studio app shell navigation (logo · workspace · nav · settings ·
 * user). Active item gets the indigo-50 fill, filled glyph and indigo label.
 */
export function Sidebar({
  items = defaultNavItems,
  active = 'Home',
  workspace = { name: 'Acme Inc.' },
  user = { name: 'Fiona', role: 'Owner', initial: 'F' },
  onNavigate,
  style,
  ...rest
}) {
  const isActive = (it) => active === it.label || active === it.route;
  const navItem = (it, pinned) => {
    const on = isActive(it);
    return (
      <div
        key={it.label}
        onClick={() => onNavigate && onNavigate(it.route, it.label)}
        style={{
          display: 'flex', alignItems: 'center', gap: 11,
          padding: '9px 11px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          background: on ? 'var(--indigo-50)' : 'transparent',
          marginTop: pinned ? 'auto' : 0,
          transition: 'background var(--dur) var(--ease)',
        }}
        onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--paper)'; }}
        onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
      >
        <Glyph name={it.icon} fill={on ? 1 : 0} color={on ? 'var(--primary)' : 'var(--text-secondary)'} />
        <div style={{ font: `${on ? 600 : 500} 13px var(--font-sans)`, color: on ? 'var(--primary)' : 'var(--text-secondary)' }}>{it.label}</div>
        {it.badge != null && (
          <div style={{ marginLeft: 'auto', font: '700 9.5px var(--font-mono)', color: '#fff', background: 'var(--warning-dot)', borderRadius: 'var(--radius-pill)', padding: '1px 6px' }}>{it.badge}</div>
        )}
      </div>
    );
  };

  return (
    <aside style={{
      width: 'var(--sidebar-w)', flex: '0 0 var(--sidebar-w)',
      background: '#fff', borderRight: '1px solid var(--border)',
      padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 4,
      fontFamily: 'var(--font-sans)', ...style,
    }} {...rest}>
      {/* logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 16px' }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--primary-gradient-logo)', boxShadow: '0 2px 8px rgba(58,80,221,.35)' }} />
        <div style={{ font: '800 16px var(--font-sans)', color: 'var(--ink)', letterSpacing: '-0.02em' }}>FlowBuddy</div>
      </div>
      {/* workspace switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 10, background: 'var(--paper-2)', cursor: 'pointer' }}>
        <div style={{ width: 20, height: 20, borderRadius: 6, background: 'linear-gradient(150deg,#e6a23c,#d98a2b)' }} />
        <div style={{ font: '600 12.5px var(--font-sans)', color: 'var(--gray-700)' }}>{workspace.name}</div>
        <div style={{ marginLeft: 'auto', font: '10px var(--font-sans)', color: 'var(--gray-300)' }}>▾</div>
      </div>
      {/* nav */}
      {items.map((it) => navItem(it, false))}
      {/* settings pinned */}
      {navItem({ icon: 'settings', label: 'Settings', route: '/dashboard/settings' }, true)}
      {/* user */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 8px 2px', borderTop: '1px solid var(--gray-100)', marginTop: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(150deg,#8b93b4,#6b7390)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 11px var(--font-sans)', color: '#fff' }}>{user.initial}</div>
        <div>
          <div style={{ font: '600 12px var(--font-sans)', color: 'var(--gray-700)' }}>{user.name}</div>
          <div style={{ font: '10.5px var(--font-sans)', color: 'var(--text-faint)' }}>{user.role}</div>
        </div>
      </div>
    </aside>
  );
}
