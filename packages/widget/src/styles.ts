/** Scoped styles for the copilot widget (injected into a shadow root — isolated from the host page).
 *  Default theme is the Sync indigo brand (matches Sync Studio). Hosts can re-brand via
 *  `data-sync-accent` (any CSS color) and reposition with `data-sync-position="left|right"` —
 *  both are applied as inline CSS variables on the shadow host (see index.ts). */
export const CSS = `
:host {
  --sc-accent: #3b50e0;
  --sc-accent-fg: #ffffff;
  --sc-fg: #14161f;
  --sc-muted-fg: #6b7180;
  --sc-border: #eceef3;
  --sc-surface: #ffffff;
  --sc-messages-bg: #fcfcfd;
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
.sc-launcher.sc-launcher-pill {
  width: auto; height: auto; border-radius: 999px; padding: 13px 20px;
  font-size: 15px; font-weight: 600; line-height: 1; white-space: nowrap;
}
.sc-launcher.sc-launcher-outline {
  background: transparent; color: var(--sc-accent); border: 2px solid var(--sc-accent);
}
.sc-panel {
  position: fixed; right: var(--sc-right); left: var(--sc-left); z-index: 2147483000;
  /* --sc-panel-bottom is only raised in Studio preview mode, where the launcher stays visible
     below the open panel; real embeds keep the 20px default (panel replaces the launcher). */
  bottom: var(--sc-panel-bottom, 20px);
  width: 370px; max-width: calc(100vw - 32px); height: 540px;
  max-height: calc(100vh - var(--sc-panel-bottom, 20px) - 20px);
  background: var(--sc-surface); border: 1px solid var(--sc-border); border-radius: 16px;
  box-shadow: 0 8px 26px rgba(40,50,90,.16);
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
.sc-bubble { padding: 9px 12px; border-radius: 13px; font-size: 14px; line-height: 1.45; white-space: pre-wrap; word-wrap: break-word; }
.sc-bubble strong { font-weight: 600; }
.sc-bubble code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; background: rgba(0,0,0,.06); padding: 1px 5px; border-radius: 5px; }
.sc-user .sc-bubble { background: var(--sc-accent); color: var(--sc-accent-fg); border-bottom-right-radius: 4px; }
.sc-assistant .sc-bubble { background: var(--sc-surface); color: var(--sc-fg); border: 1px solid var(--sc-border); border-bottom-left-radius: 4px; }
.sc-decline .sc-bubble { background: #fbf0ed; border-color: #f0ddd7; color: #9c5c4d; }
.sc-error .sc-bubble { background: #fbf0ed; border-color: #f0ddd7; color: #9c5c4d; }
.sc-typing { color: var(--sc-muted-fg); letter-spacing: 2px; }
.sc-cites { font-size: 11px; font-weight: 600; color: var(--sc-accent); padding: 0 4px; }
.sc-input { display: flex; gap: 8px; padding: 10px; border-top: 1px solid var(--sc-border); background: var(--sc-surface); }
.sc-input input { flex: 1; padding: 9px 11px; border: 1px solid var(--sc-border); border-radius: 9px; font-size: 14px; outline: none; color: var(--sc-fg); }
.sc-input input:focus { border-color: var(--sc-accent); box-shadow: 0 0 0 3px rgba(58,80,221,.12); }
.sc-send { padding: 9px 14px; background: var(--sc-accent); color: var(--sc-accent-fg); border: none; border-radius: 9px; cursor: pointer; font-size: 14px; font-weight: 600; transition: opacity .15s ease; }
.sc-send:hover:not(:disabled) { opacity: .9; }
.sc-send:disabled { opacity: .5; cursor: default; }
.sc-feedback { display: flex; gap: 6px; padding: 2px 4px; }
.sc-thumb { background: transparent; border: none; cursor: pointer; font-size: 13px; opacity: .5; padding: 2px; }
.sc-thumb:hover { opacity: 1; }
.sc-thumb-on { opacity: 1; }
.sc-thumb:disabled { cursor: default; }
`;
