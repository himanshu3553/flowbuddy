/* Sync Studio UI-kit primitives — globals (loaded via text/babel), inline-styled
   on the shared tokens. These mirror the production /components API so the kit
   renders standalone (no compiler bundle needed). React is global (UMD). */

function Glyph({ name, fill = 0, color = 'var(--text-secondary)', size = 20, style }) {
  return (
    <span style={{ fontFamily: "'Material Symbols Outlined'", fontVariationSettings: `'FILL' ${fill}, 'opsz' ${size}`, fontSize: size, lineHeight: 1, color, flex: '0 0 auto', ...style }}>{name}</span>
  );
}

function Btn({ variant = 'primary', size = 'md', icon, iconFill = 0, dot, fullWidth, disabled, onClick, children, style }) {
  const sz = size === 'sm'
    ? { padding: '7px 12px', font: 600, fs: 12, gap: 6, ic: 16 }
    : { padding: '9px 15px', font: 700, fs: 12.5, gap: 7, ic: 17 };
  const v = {
    primary: { background: 'var(--primary-gradient)', color: '#fff', border: '1px solid transparent', boxShadow: 'var(--shadow-primary)' },
    secondary: { background: '#fff', color: 'var(--text-body)', border: '1px solid var(--gray-200)' },
    soft: { background: 'var(--indigo-50)', color: 'var(--primary)', border: '1px solid var(--indigo-200)' },
    ghost: { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid transparent' },
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: sz.gap, width: fullWidth ? '100%' : 'auto', padding: sz.padding, borderRadius: 'var(--radius-sm)', font: `${sz.font} ${sz.fs}px var(--font-sans)`, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, whiteSpace: 'nowrap', transition: 'filter var(--dur) var(--ease)', ...v, ...style }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.filter = 'brightness(0.97)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}>
      {dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', opacity: 0.9 }} />}
      {icon && <Glyph name={icon} fill={iconFill} color="currentColor" size={sz.ic} />}
      {children}
    </button>
  );
}

function Badge({ tone = 'neutral', dot, children, style }) {
  const t = {
    success: ['var(--success-text)', 'var(--success-bg-2)', 'var(--success-border)', 'var(--success-dot)'],
    live: ['var(--primary)', 'var(--indigo-50)', 'var(--indigo-100)', 'var(--primary)'],
    pending: ['var(--warning-text)', 'var(--warning-bg)', 'var(--warning-border)', 'var(--warning-dot)'],
    danger: ['var(--danger-text)', 'var(--danger-bg)', 'var(--danger-border)', 'var(--danger-500)'],
    neutral: ['var(--text-muted)', 'var(--paper)', 'var(--border)', 'var(--gray-300)'],
  }[tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '700 9.5px var(--font-mono)', letterSpacing: '.06em', color: t[0], background: t[1], border: `1px solid ${t[2]}`, padding: '3px 9px', borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap', ...style }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: t[3] }} />}{children}
    </span>
  );
}

function Chip({ tone = 'neutral', children, style }) {
  const t = tone === 'brand' ? ['var(--primary)', 'var(--indigo-50)', 'var(--indigo-100)'] : ['var(--text-body)', 'var(--paper)', 'var(--border)'];
  return <span style={{ display: 'inline-flex', alignItems: 'center', font: '600 11px var(--font-mono)', color: t[0], background: t[1], border: `1px solid ${t[2]}`, padding: '4px 10px', borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap', ...style }}>{children}</span>;
}

function Switch({ checked, onChange, size = 'md', disabled }) {
  const s = size === 'sm' ? { w: 34, h: 20, k: 16 } : { w: 38, h: 22, k: 18 };
  const pad = (s.h - s.k) / 2;
  return (
    <button role="switch" aria-checked={!!checked} disabled={disabled} onClick={() => !disabled && onChange && onChange(!checked)} style={{ position: 'relative', width: s.w, height: s.h, flex: '0 0 auto', borderRadius: 'var(--radius-pill)', border: 'none', padding: 0, cursor: disabled ? 'not-allowed' : 'pointer', background: checked ? 'var(--primary)' : 'var(--gray-200)', transition: 'background var(--dur) var(--ease)' }}>
      <span style={{ position: 'absolute', top: pad, left: checked ? s.w - s.k - pad : pad, width: s.k, height: s.k, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(16,24,40,.25)', transition: 'left var(--dur) var(--ease)' }} />
    </button>
  );
}

function Metric({ value, label, tone = 'default', hint, style }) {
  const ok = tone === 'success';
  return (
    <div style={{ flex: 1, minWidth: 0, border: `1px solid ${ok ? 'var(--success-border)' : 'var(--gray-150)'}`, background: ok ? 'var(--success-bg)' : '#fff', borderRadius: 'var(--radius-lg)', padding: '11px 13px', ...style }}>
      <div style={{ font: '700 21px var(--font-sans)', letterSpacing: '-.02em', color: ok ? 'var(--success-text-2)' : 'var(--ink)' }}>{value}</div>
      <div style={{ font: '500 11px var(--font-sans)', color: ok ? 'var(--success-text-2)' : 'var(--text-muted)', marginTop: 2 }}>{label}</div>
      {hint && <div style={{ font: '400 11px/1.45 var(--font-sans)', color: ok ? 'var(--success-dot)' : 'var(--text-faint)', marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function Bar({ value = 0, tone = 'brand', label, valueLabel, height = 6, style }) {
  const fill = { brand: 'var(--primary)', success: 'var(--success-dot)', warning: 'var(--warning-dot)', danger: 'var(--danger-ink)' }[tone];
  return (
    <div style={style}>
      {(label || valueLabel) && <div style={{ display: 'flex', justifyContent: 'space-between', font: '400 12px var(--font-sans)', color: 'var(--text-secondary)', marginBottom: 4 }}><span>{label}</span>{valueLabel != null && <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{valueLabel}</span>}</div>}
      <div style={{ height, background: 'var(--gray-100)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}><div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', background: fill, borderRadius: 'var(--radius-pill)', transition: 'width var(--dur-slow) var(--ease)' }} /></div>
    </div>
  );
}

const NAV = [
  { icon: 'home', label: 'Home' },
  { icon: 'videocam', label: 'Recordings' },
  { icon: 'menu_book', label: 'Knowledge Base', badge: 5 },
  { icon: 'smart_toy', label: 'Copilot' },
  { icon: 'bar_chart', label: 'Analytics' },
];

function Sidebar({ active = 'Home', onNavigate }) {
  const item = (it, pinned) => {
    const on = active === it.label;
    return (
      <div key={it.label} onClick={() => onNavigate && onNavigate(it.label)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: on ? 'var(--indigo-50)' : 'transparent', marginTop: pinned ? 'auto' : 0, transition: 'background var(--dur) var(--ease)' }}
        onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--paper)'; }} onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}>
        <Glyph name={it.icon} fill={on ? 1 : 0} color={on ? 'var(--primary)' : 'var(--text-secondary)'} />
        <div style={{ font: `${on ? 600 : 500} 13px var(--font-sans)`, color: on ? 'var(--primary)' : 'var(--text-secondary)' }}>{it.label}</div>
        {it.badge != null && <div style={{ marginLeft: 'auto', font: '700 9.5px var(--font-mono)', color: '#fff', background: 'var(--warning-dot)', borderRadius: 'var(--radius-pill)', padding: '1px 6px' }}>{it.badge}</div>}
      </div>
    );
  };
  return (
    <aside style={{ width: 'var(--sidebar-w)', flex: '0 0 var(--sidebar-w)', background: '#fff', borderRight: '1px solid var(--border)', padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 16px' }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--primary-gradient-logo)', boxShadow: '0 2px 8px rgba(58,80,221,.35)' }} />
        <div style={{ font: '800 16px var(--font-sans)', color: 'var(--ink)', letterSpacing: '-.02em' }}>Sync</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 10, background: 'var(--paper-2)', cursor: 'pointer' }}>
        <div style={{ width: 20, height: 20, borderRadius: 6, background: 'linear-gradient(150deg,#e6a23c,#d98a2b)' }} />
        <div style={{ font: '600 12.5px var(--font-sans)', color: 'var(--gray-700)' }}>Acme Inc.</div>
        <div style={{ marginLeft: 'auto', font: '10px', color: 'var(--gray-300)' }}>▾</div>
      </div>
      {NAV.map((it) => item(it, false))}
      {item({ icon: 'settings', label: 'Settings' }, true)}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 8px 2px', borderTop: '1px solid var(--gray-100)', marginTop: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(150deg,#8b93b4,#6b7390)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 11px var(--font-sans)', color: '#fff' }}>F</div>
        <div><div style={{ font: '600 12px var(--font-sans)', color: 'var(--gray-700)' }}>Fiona</div><div style={{ font: '10.5px var(--font-sans)', color: 'var(--text-faint)' }}>Owner</div></div>
      </div>
    </aside>
  );
}

function Header({ title, subtitle, breadcrumb, tabs, activeTab, onTab, status, children }) {
  return (
    <header style={{ height: 'var(--header-h)', flex: '0 0 var(--header-h)', background: '#fff', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '0 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          {breadcrumb ? <div style={{ font: '600 12.5px var(--font-sans)', color: 'var(--text-faint)' }}>{breadcrumb}</div>
            : <div style={{ font: '700 16px var(--font-sans)', color: 'var(--ink)', letterSpacing: '-.01em' }}>{title}</div>}
          {subtitle && <div style={{ font: '11.5px var(--font-sans)', color: 'var(--text-faint)', marginTop: 1 }}>{subtitle}</div>}
        </div>
        {tabs && <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>{tabs.map((t) => {
          const on = t === activeTab;
          return <span key={t} onClick={() => onTab && onTab(t)} style={{ font: '600 12.5px var(--font-sans)', cursor: 'pointer', color: on ? 'var(--ink)' : 'var(--text-faint)', borderBottom: on ? '2px solid var(--primary)' : '2px solid transparent', paddingBottom: 19, marginBottom: -1, alignSelf: 'stretch', display: 'flex', alignItems: 'center' }}>{t}</span>;
        })}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
        {status && <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success-dot)' }} /><span style={{ font: '600 12px var(--font-sans)', color: 'var(--success-text-2)' }}>{status}</span></div>}
        {children}
      </div>
    </header>
  );
}

function Row({ media, title, meta, trailing, highlighted, muted, onClick, style }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 15px', border: `1px solid ${highlighted ? 'var(--indigo-200)' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', background: '#fff', boxShadow: highlighted ? 'var(--shadow-step)' : 'none', opacity: muted ? 0.78 : 1, cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow var(--dur) var(--ease)', ...style }}>
      {media === true ? <div style={{ width: 56, height: 38, flex: '0 0 auto', borderRadius: 6, background: 'var(--media-fill)', border: '1px solid var(--media-border)' }} /> : media ? <div style={{ flex: '0 0 auto' }}>{media}</div> : null}
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ font: '600 13.5px var(--font-sans)', color: muted ? 'var(--text-muted)' : 'var(--ink)' }}>{title}</div>{meta && <div style={{ marginTop: 3 }}>{meta}</div>}</div>
      {trailing && <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '0 0 auto' }}>{trailing}</div>}
    </div>
  );
}

function Step({ state = 'locked', index, title, desc, action, statusLabel }) {
  const cfg = { done: ['var(--success-border)', 'var(--success-bg)', 'none', 'var(--ink)', 1, 1], active: ['var(--indigo-200)', '#fff', 'var(--shadow-step)', 'var(--ink)', 1, 1.5], locked: ['var(--border)', 'var(--paper-2)', 'none', 'var(--text-secondary)', 0.8, 1] }[state];
  const marker = state === 'done'
    ? <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(150deg,#1aa86a,#15935a)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Glyph name="check" fill={1} color="#fff" size={18} /></div>
    : state === 'active'
      ? <div style={{ width: 30, height: 30, borderRadius: '50%', border: '2px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 13px var(--font-sans)', color: 'var(--primary)', flex: '0 0 auto' }}>{index}</div>
      : <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#eef0f4', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Glyph name="lock" color="var(--gray-300)" size={16} /></div>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', border: `${cfg[5]}px solid ${cfg[0]}`, background: cfg[1], borderRadius: 'var(--radius-lg)', boxShadow: cfg[2], opacity: cfg[4] }}>
      {marker}
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ font: '600 14px var(--font-sans)', color: cfg[3] }}>{title}</div>{desc && <div style={{ font: '12px var(--font-sans)', color: 'var(--text-muted)', marginTop: 1 }}>{desc}</div>}</div>
      {action ? action : statusLabel ? <span style={{ font: '700 10px var(--font-mono)', letterSpacing: '.04em', color: state === 'done' ? 'var(--success-text)' : 'var(--gray-300)', background: state === 'done' ? 'var(--success-bg-2)' : 'transparent', border: state === 'done' ? '1px solid var(--success-border)' : 'none', padding: state === 'done' ? '3px 9px' : 0, borderRadius: 'var(--radius-pill)' }}>{statusLabel}</span> : null}
    </div>
  );
}

function Code({ code }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div style={{ position: 'relative', background: 'var(--code-bg)', borderRadius: 'var(--radius-md)', padding: '13px 14px' }}>
      <pre style={{ margin: 0, font: '400 11.5px/1.7 var(--font-mono)', color: 'var(--code-fg)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{code}</pre>
      <button onClick={() => { try { navigator.clipboard && navigator.clipboard.writeText(code); } catch (e) {} setCopied(true); setTimeout(() => setCopied(false), 1400); }} style={{ position: 'absolute', top: 11, right: 11, background: 'var(--code-chip)', color: 'var(--code-fg)', border: '1px solid var(--code-border)', borderRadius: 'var(--radius-xs)', padding: '5px 11px', font: '600 11px var(--font-mono)', cursor: 'pointer' }}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
  );
}

function Gap({ question, meta, tone = 'gap', action, status }) {
  const dot = { gap: 'var(--danger-ink)', partial: 'var(--warning-dot)', decline: 'var(--danger-ink)' }[tone];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', border: '1px solid var(--gray-100)', borderRadius: 'var(--radius-sm)', opacity: status ? 0.85 : 1 }}>
      {action && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flex: '0 0 auto' }} />}
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ font: '600 13px var(--font-sans)', color: 'var(--gray-700)' }}>{question}</div>{meta && <div style={{ font: '400 11px var(--font-mono)', color: 'var(--text-faint)', marginTop: 2 }}>{meta}</div>}</div>
      {action || status || null}
    </div>
  );
}

function Dialog({ title, subtitle, width = 466, children, footer, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(20,22,34,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26, zIndex: 30 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width, maxWidth: '100%', maxHeight: '100%', overflow: 'auto', background: '#fff', borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-dialog)' }}>
        <div style={{ padding: '22px 24px 6px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div><div style={{ font: '800 18px var(--font-sans)', color: 'var(--ink)', letterSpacing: '-.01em' }}>{title}</div>{subtitle && <div style={{ font: '12.5px/1.5 var(--font-sans)', color: 'var(--text-muted)', marginTop: 3 }}>{subtitle}</div>}</div>
          <div onClick={onClose} style={{ font: '20px', color: 'var(--gray-300)', cursor: 'pointer', lineHeight: 1, padding: '2px 4px' }}>×</div>
        </div>
        <div style={{ padding: '14px 24px 4px' }}>{children}</div>
        {footer && <div style={{ padding: '4px 24px 22px' }}>{footer}</div>}
      </div>
    </div>
  );
}

function StepItem({ index, icon, title, desc, tone = 'brand', last }) {
  const tile = tone === 'danger' ? ['var(--danger-bg-2)', 'var(--danger-border)', 'var(--danger-500)', 1] : ['var(--indigo-50)', 'var(--indigo-100)', 'var(--primary)', 0];
  return (
    <div style={{ display: 'flex', gap: 14 }}>
      <div style={{ flex: '0 0 36px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: 11, background: tile[0], border: `1px solid ${tile[1]}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Glyph name={icon} fill={tile[3]} color={tile[2]} size={20} /></div>
        {!last && <div style={{ flex: 1, width: 2, background: 'var(--indigo-150)', margin: '6px 0' }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: last ? 4 : 16 }}>
        <div style={{ font: '700 9.5px var(--font-mono)', color: '#9aa0c0', letterSpacing: '.08em' }}>STEP {index}</div>
        <div style={{ font: '600 14.5px var(--font-sans)', color: 'var(--ink)', marginTop: 3 }}>{title}</div>
        <div style={{ font: '12.5px/1.55 var(--font-sans)', color: 'var(--text-muted)', marginTop: 3 }}>{desc}</div>
      </div>
    </div>
  );
}

function Empty({ media, title, desc, actions, chips, footnote }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 30, textAlign: 'center' }}>
      {media === true ? <div style={{ width: 124, height: 86, borderRadius: 10, background: 'var(--media-fill)', border: '1px solid var(--media-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '10px var(--font-mono)', color: 'var(--text-faint)', marginBottom: 18 }}>recording</div> : media ? <div style={{ marginBottom: 18 }}>{media}</div> : null}
      <div style={{ font: '700 17px var(--font-sans)', color: 'var(--gray-700)' }}>{title}</div>
      {desc && <div style={{ font: '13px/1.6 var(--font-sans)', color: 'var(--text-muted)', maxWidth: 430, marginTop: 6 }}>{desc}</div>}
      {actions && <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>{actions}</div>}
      {chips && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 30, flexWrap: 'wrap', justifyContent: 'center' }}>{chips.map((c) => <Chip key={c}>{c}</Chip>)}</div>}
      {footnote && <div style={{ font: '11px var(--font-mono)', color: 'var(--text-faint)', marginTop: 13 }}>{footnote}</div>}
    </div>
  );
}

function Msg({ from = 'bot', citation, decline, feedback, children }) {
  if (from === 'user') return <div style={{ alignSelf: 'flex-end', maxWidth: '78%', background: 'var(--primary)', color: '#fff', borderRadius: '13px 13px 4px 13px', padding: '9px 12px', font: '12px/1.45 var(--font-sans)' }}>{children}</div>;
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '88%', background: '#fff', border: `1px solid ${decline ? 'var(--danger-border)' : 'var(--border)'}`, borderRadius: '13px 13px 13px 4px', padding: '10px 12px' }}>
      <div style={{ font: '12px/1.5 var(--font-sans)', color: 'var(--gray-700)' }}>{children}</div>
      {citation && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 9, background: 'var(--indigo-50)', border: '1px solid var(--indigo-100)', borderRadius: 'var(--radius-pill)', padding: '3px 9px' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }} /><span style={{ font: '10px var(--font-mono)', color: 'var(--primary)' }}>Source: {citation}</span></div>}
      {decline && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 9, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-pill)', padding: '3px 9px' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger-ink)' }} /><span style={{ font: '10px var(--font-mono)', color: 'var(--danger-text)' }}>Honest decline · gap logged</span></div>}
      {feedback && <div style={{ display: 'flex', gap: 10, marginTop: 9 }}><span style={{ font: '13px', color: 'var(--success-dot)', cursor: 'pointer' }}>▲</span><span style={{ font: '13px', color: 'var(--gray-300)', cursor: 'pointer' }}>▽</span></div>}
    </div>
  );
}

/* Reusable card shell */
function Card({ children, style, pad = '15px 16px' }) {
  return <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-card)', padding: pad, ...style }}>{children}</div>;
}
function Eyebrow({ children, style }) {
  return <div style={{ font: '700 10.5px var(--font-mono)', letterSpacing: '.1em', color: 'var(--text-faint)', textTransform: 'uppercase', ...style }}>{children}</div>;
}
