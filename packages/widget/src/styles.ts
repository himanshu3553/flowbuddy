/** Scoped styles for the copilot widget (injected into a shadow root — isolated from the host page).
 *  Neutral default theme mirrors the Sync Studio shadcn/ui palette. Hosts can re-brand via
 *  `data-sync-accent` (any CSS color) and reposition with `data-sync-position="left|right"` —
 *  both are applied as inline CSS variables on the shadow host (see index.ts). */
export const CSS = `
:host {
  --sc-accent: #171717;
  --sc-accent-fg: #ffffff;
  --sc-fg: #0a0a0a;
  --sc-muted-fg: #737373;
  --sc-border: #e5e5e5;
  --sc-surface: #ffffff;
  --sc-messages-bg: #fafafa;
  --sc-right: 20px;
  --sc-left: auto;
}
:host, * { box-sizing: border-box; }
.sc-launcher {
  position: fixed; right: var(--sc-right); left: var(--sc-left); bottom: 20px; z-index: 2147483000;
  width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
  background: var(--sc-accent); color: var(--sc-accent-fg); font-size: 24px; line-height: 1;
  box-shadow: 0 4px 16px rgba(0,0,0,.18); display: flex; align-items: center; justify-content: center;
  transition: opacity .15s ease;
}
.sc-launcher:hover { opacity: .9; }
.sc-panel {
  position: fixed; right: var(--sc-right); left: var(--sc-left); bottom: 20px; z-index: 2147483000;
  width: 370px; max-width: calc(100vw - 32px); height: 540px; max-height: calc(100vh - 40px);
  background: var(--sc-surface); border: 1px solid var(--sc-border); border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0,0,0,.18);
  display: none; flex-direction: column; overflow: hidden;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: var(--sc-fg);
}
.sc-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; background: var(--sc-accent); color: var(--sc-accent-fg);
}
.sc-title { font-weight: 600; font-size: 15px; }
.sc-close { background: transparent; border: none; color: var(--sc-accent-fg); font-size: 16px; cursor: pointer; padding: 4px; opacity: .8; }
.sc-close:hover { opacity: 1; }
.sc-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: var(--sc-messages-bg); }
.sc-greeting { color: var(--sc-muted-fg); font-size: 14px; text-align: center; margin: auto 10px; }
.sc-msg { display: flex; flex-direction: column; gap: 4px; max-width: 85%; }
.sc-user { align-self: flex-end; align-items: flex-end; }
.sc-assistant { align-self: flex-start; align-items: flex-start; }
.sc-bubble { padding: 8px 12px; border-radius: 12px; font-size: 14px; line-height: 1.45; white-space: pre-wrap; word-wrap: break-word; }
.sc-user .sc-bubble { background: var(--sc-accent); color: var(--sc-accent-fg); border-bottom-right-radius: 3px; }
.sc-assistant .sc-bubble { background: var(--sc-surface); color: var(--sc-fg); border: 1px solid var(--sc-border); border-bottom-left-radius: 3px; }
.sc-decline .sc-bubble { background: #fffbeb; border-color: #fde68a; color: #92400e; }
.sc-error .sc-bubble { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
.sc-typing { color: var(--sc-muted-fg); letter-spacing: 2px; }
.sc-cites { font-size: 11px; color: var(--sc-muted-fg); padding: 0 4px; }
.sc-input { display: flex; gap: 8px; padding: 10px; border-top: 1px solid var(--sc-border); background: var(--sc-surface); }
.sc-input input { flex: 1; padding: 9px 11px; border: 1px solid var(--sc-border); border-radius: 6px; font-size: 14px; outline: none; color: var(--sc-fg); }
.sc-input input:focus { border-color: var(--sc-accent); }
.sc-send { padding: 9px 14px; background: var(--sc-accent); color: var(--sc-accent-fg); border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: opacity .15s ease; }
.sc-send:hover:not(:disabled) { opacity: .9; }
.sc-send:disabled { opacity: .5; cursor: default; }
.sc-feedback { display: flex; gap: 6px; padding: 2px 4px; }
.sc-thumb { background: transparent; border: none; cursor: pointer; font-size: 13px; opacity: .5; padding: 2px; }
.sc-thumb:hover { opacity: 1; }
.sc-thumb-on { opacity: 1; }
.sc-thumb:disabled { cursor: default; }
`;
