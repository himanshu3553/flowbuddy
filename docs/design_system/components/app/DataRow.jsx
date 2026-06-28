import React from 'react';

/**
 * DataRow — a flexible list/table row: optional media thumbnail, title + meta,
 * and a trailing region for columns / status / actions. Used for recordings,
 * workflows, origins, and similar lists.
 */
export function DataRow({
  media,
  title,
  meta,
  trailing,
  highlighted = false,
  muted = false,
  onClick,
  style,
  ...rest
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '13px 15px',
        border: `1px solid ${highlighted ? 'var(--indigo-200)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        background: highlighted ? '#fff' : '#fff',
        boxShadow: highlighted ? 'var(--shadow-step)' : 'none',
        opacity: muted ? 0.78 : 1,
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: 'var(--font-sans)',
        ...style,
      }}
      {...rest}
    >
      {media === true ? (
        <div style={{ width: 56, height: 38, flex: '0 0 auto', borderRadius: 6, background: 'var(--media-fill)', border: '1px solid var(--media-border)' }} />
      ) : media ? (
        <div style={{ flex: '0 0 auto' }}>{media}</div>
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '600 13.5px var(--font-sans)', color: muted ? 'var(--text-muted)' : 'var(--ink)' }}>{title}</div>
        {meta && <div style={{ marginTop: 3 }}>{meta}</div>}
      </div>
      {trailing && <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '0 0 auto' }}>{trailing}</div>}
    </div>
  );
}
