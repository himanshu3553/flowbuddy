import React from 'react';

/**
 * Toggle — the approval switch. On = indigo track; off = gray. The knob slides
 * with the system ease. This is the product's core "approve for copilot" moment.
 */
export function Toggle({ checked = false, onChange, disabled = false, size = 'md', ariaLabel, style, ...rest }) {
  const sizes = {
    sm: { w: 34, h: 20, knob: 16 },
    md: { w: 38, h: 22, knob: 18 },
  };
  const s = sizes[size] || sizes.md;
  const pad = (s.h - s.knob) / 2;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange && onChange(!checked)}
      style={{
        position: 'relative',
        width: s.w,
        height: s.h,
        flex: '0 0 auto',
        borderRadius: 'var(--radius-pill)',
        border: 'none',
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? 'var(--primary)' : 'var(--gray-200)',
        opacity: disabled ? 0.6 : 1,
        transition: 'background var(--dur) var(--ease)',
        ...style,
      }}
      {...rest}
    >
      <span
        style={{
          position: 'absolute',
          top: pad,
          left: checked ? s.w - s.knob - pad : pad,
          width: s.knob,
          height: s.knob,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 2px rgba(16,24,40,.25)',
          transition: 'left var(--dur) var(--ease)',
        }}
      />
    </button>
  );
}
