import React from 'react';

/**
 * EmptyState — a centered first-run / no-data state: media (striped placeholder
 * or icon), title, description, action buttons, optional captured-layer chips
 * and a footnote. Used by Recordings, Knowledge Base and Analytics empties.
 */
export function EmptyState({ media, title, desc, actions, chips, footnote, style, ...rest }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 30, textAlign: 'center', fontFamily: 'var(--font-sans)', ...style,
    }} {...rest}>
      {media === true ? (
        <div style={{ width: 124, height: 86, borderRadius: 10, background: 'var(--media-fill)', border: '1px solid var(--media-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '10px var(--font-mono)', color: 'var(--text-faint)', marginBottom: 18 }}>recording</div>
      ) : media ? (
        <div style={{ marginBottom: 18 }}>{media}</div>
      ) : null}
      <div style={{ font: '700 17px var(--font-sans)', color: 'var(--gray-700)' }}>{title}</div>
      {desc && <div style={{ font: '13px/1.6 var(--font-sans)', color: 'var(--text-muted)', maxWidth: 430, marginTop: 6 }}>{desc}</div>}
      {actions && <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>{actions}</div>}
      {chips && chips.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 30, flexWrap: 'wrap', justifyContent: 'center' }}>
          {chips.map((c) => (
            <span key={c} style={{ font: '600 11px var(--font-mono)', color: 'var(--text-body)', background: 'var(--paper)', border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: '4px 11px' }}>{c}</span>
          ))}
        </div>
      )}
      {footnote && <div style={{ font: '11px var(--font-mono)', color: 'var(--text-faint)', marginTop: 13 }}>{footnote}</div>}
    </div>
  );
}
