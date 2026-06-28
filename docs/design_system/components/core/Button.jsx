import React from 'react';

/**
 * Button — Sync Studio's primary control.
 * Variants: primary (indigo CTA gradient), secondary (white/hairline),
 * soft (indigo-tint), ghost. Optional Material Symbol icon or a "record" dot.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconFill = 0,
  dot = false,
  fullWidth = false,
  disabled = false,
  type = 'button',
  onClick,
  children,
  style,
  ...rest
}) {
  const sizes = {
    sm: { padding: '7px 12px', font: 600, fontSize: 12, radius: 'var(--radius-sm)', gap: 6, icon: 16 },
    md: { padding: '9px 15px', font: 700, fontSize: 12.5, radius: 'var(--radius-sm)', gap: 7, icon: 17 },
  };
  const s = sizes[size] || sizes.md;

  const variants = {
    primary: {
      background: 'var(--primary-gradient)',
      color: '#fff',
      border: '1px solid transparent',
      boxShadow: 'var(--shadow-primary)',
    },
    secondary: {
      background: '#fff',
      color: 'var(--text-body)',
      border: '1px solid var(--gray-200)',
      boxShadow: 'none',
    },
    soft: {
      background: 'var(--indigo-50)',
      color: 'var(--primary)',
      border: '1px solid var(--indigo-200)',
      boxShadow: 'none',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-secondary)',
      border: '1px solid transparent',
      boxShadow: 'none',
    },
  };
  const v = variants[variant] || variants.primary;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        width: fullWidth ? '100%' : 'auto',
        padding: s.padding,
        borderRadius: s.radius,
        font: `${s.font} ${s.fontSize}px var(--font-sans)`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        whiteSpace: 'nowrap',
        transition: 'filter var(--dur) var(--ease), background var(--dur) var(--ease)',
        ...v,
        ...style,
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.filter = 'brightness(0.96)'; }}
      onMouseUp={(e) => { e.currentTarget.style.filter = 'none'; }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
      {...rest}
    >
      {dot && (
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', opacity: 0.9, flex: '0 0 auto' }} />
      )}
      {icon && (
        <span
          style={{
            fontFamily: "'Material Symbols Outlined'",
            fontVariationSettings: `'FILL' ${iconFill}, 'opsz' 20`,
            fontSize: s.icon,
            lineHeight: 1,
            flex: '0 0 auto',
          }}
        >
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}
