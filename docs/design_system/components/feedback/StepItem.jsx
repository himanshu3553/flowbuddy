import React from 'react';

/**
 * StepItem — one node of a vertical numbered timeline (the "how it works" /
 * "how to record" dialogs and the core-loop). Icon tile + connector on the left,
 * STEP n + title + description on the right.
 */
export function StepItem({ index, icon, title, desc, tone = 'brand', last = false, style, ...rest }) {
  const tile = tone === 'danger'
    ? { bg: 'var(--danger-bg-2)', border: 'var(--danger-border)', color: 'var(--danger-500)', fill: 1 }
    : { bg: 'var(--indigo-50)', border: 'var(--indigo-100)', color: 'var(--primary)', fill: 0 };
  return (
    <div style={{ display: 'flex', gap: 14, fontFamily: 'var(--font-sans)', ...style }} {...rest}>
      <div style={{ flex: '0 0 36px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: 11, background: tile.bg, border: `1px solid ${tile.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <span style={{ fontFamily: "'Material Symbols Outlined'", fontVariationSettings: `'FILL' ${tile.fill}, 'opsz' 20`, fontSize: 20, color: tile.color }}>{icon}</span>
        </div>
        {!last && <div style={{ flex: 1, width: 2, background: 'var(--indigo-150)', margin: '6px 0' }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: last ? 4 : 16 }}>
        <div style={{ font: '700 9.5px var(--font-mono)', color: '#9aa0c0', letterSpacing: '0.08em' }}>STEP {index}</div>
        <div style={{ font: '600 14.5px var(--font-sans)', color: 'var(--ink)', marginTop: 3 }}>{title}</div>
        <div style={{ font: '12.5px/1.55 var(--font-sans)', color: 'var(--text-muted)', marginTop: 3 }}>{desc}</div>
      </div>
    </div>
  );
}
