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
  /* Design-system typography (tokens/typography.css) — the faces are injected document-level by
     index.ts (ensureBrandFonts); these stacks fall back to system fonts when that's blocked. */
  --sc-font: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --sc-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace;
}
:host, * { box-sizing: border-box; }
.sc-launcher {
  position: fixed; right: var(--sc-right); left: var(--sc-left); bottom: 20px; z-index: 2147483000;
  width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
  font-family: var(--sc-font);
  background: var(--sc-accent); color: var(--sc-accent-fg); font-size: 24px; line-height: 1;
  box-shadow: 0 4px 16px rgba(0,0,0,.18); display: flex; align-items: center; justify-content: center;
  transition: opacity .15s ease;
}
.sc-launcher:hover { opacity: .9; }
.sc-launcher.sc-launcher-pill {
  width: auto; height: auto; border-radius: 999px; padding: 13px 20px;
  font-size: 14px; font-weight: 600; line-height: 1; white-space: nowrap;
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
  font-family: var(--sc-font); color: var(--sc-fg);
}
.sc-header {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; background: var(--sc-accent); color: var(--sc-accent-fg);
  /* The header is the floating panel's drag handle (touch-action none = pointer-drag works on
     touch without scrolling the host page underneath). */
  cursor: grab; user-select: none; -webkit-user-select: none; touch-action: none;
}
.sc-panel.sc-dragging .sc-header { cursor: grabbing; }
.sc-badge {
  flex: none; width: 30px; height: 30px; border-radius: 9px; background: rgba(255,255,255,.16);
  display: flex; align-items: center; justify-content: center;
}
.sc-titles { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.sc-title { font-weight: 700; font-size: 15px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sc-subtitle {
  font-family: var(--sc-mono); font-size: 10px; letter-spacing: .02em;
  color: rgba(255,255,255,.72); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sc-close { flex: none; background: transparent; border: none; color: var(--sc-accent-fg); font-size: 15px; cursor: pointer; padding: 4px; opacity: .75; }
.sc-close:hover { opacity: 1; }
.sc-expand {
  flex: none; display: flex; align-items: center; justify-content: center;
  background: transparent; border: none; color: var(--sc-accent-fg); cursor: pointer;
  padding: 4px; opacity: .75;
}
.sc-expand:hover { opacity: 1; }
/* Expanded mode — grow to the base max-height cap (near-full viewport height); still a floating,
   draggable window (index.ts re-clamps a dragged spot so the taller panel stays on screen). */
.sc-panel.sc-expanded { height: calc(100vh - var(--sc-panel-bottom, 20px) - 20px); }
.sc-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: var(--sc-messages-bg); }
.sc-greeting { color: var(--sc-muted-fg); font-size: 13px; text-align: center; margin: auto 24px; }
.sc-msg { display: flex; flex-direction: column; gap: 4px; max-width: 85%; }
.sc-user { align-self: flex-end; align-items: flex-end; }
.sc-assistant { align-self: flex-start; align-items: flex-start; }
.sc-bubble { padding: 9px 12px; border-radius: 13px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
.sc-bubble strong { font-weight: 600; }
.sc-bubble code { font-family: var(--sc-mono); font-size: 11.5px; background: rgba(0,0,0,.06); padding: 1px 5px; border-radius: 5px; }
/* Assistant answers are block-rendered (paragraphs + step rows) — spacing comes from margins,
   not preserved newlines (user bubbles keep pre-wrap above). */
.sc-assistant .sc-bubble { white-space: normal; }
.sc-p { margin: 0; }
.sc-p + .sc-p, .sc-p + .sc-steps, .sc-steps + .sc-p, .sc-steps + .sc-steps { margin-top: 8px; }
.sc-steps { display: flex; flex-direction: column; gap: 7px; }
.sc-step { display: flex; align-items: flex-start; gap: 8px; }
.sc-step-n {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  min-width: 19px; height: 19px; padding: 0 5px; margin-top: 1px; border-radius: 999px;
  background: color-mix(in srgb, var(--sc-accent) 11%, transparent); color: var(--sc-accent);
  font-family: var(--sc-mono); font-size: 10.5px; font-weight: 600; line-height: 1;
}
.sc-step-b { flex: none; width: 5px; height: 5px; border-radius: 50%; background: var(--sc-accent); margin-top: 7.5px; }
.sc-step-t { min-width: 0; }
.sc-user .sc-bubble { background: var(--sc-accent); color: var(--sc-accent-fg); border-bottom-right-radius: 4px; }
.sc-assistant .sc-bubble { background: var(--sc-surface); color: var(--sc-fg); border: 1px solid var(--sc-border); border-bottom-left-radius: 4px; }
.sc-decline .sc-bubble { background: var(--sc-surface); border: 1px solid #f0ddd7; color: var(--sc-fg); }
.sc-error .sc-bubble { background: var(--sc-surface); border: 1px solid #f0ddd7; color: #9c5c4d; }
.sc-typing { color: var(--sc-muted-fg); letter-spacing: 2px; }
.sc-dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.sc-cites, .sc-flag {
  display: inline-flex; align-items: center; gap: 6px; width: fit-content;
  border: 1px solid; border-radius: 999px; padding: 3px 10px; margin: 2px 2px 0;
  font-family: var(--sc-mono); font-size: 10px; font-weight: 600;
}
.sc-cites { color: var(--sc-accent); border-color: var(--sc-accent); background: color-mix(in srgb, var(--sc-accent) 8%, transparent); }
.sc-flag { color: #9c5c4d; border-color: #f0ddd7; background: #fbf0ed; }
.sc-input { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--sc-border); background: var(--sc-surface); }
.sc-input input { flex: 1; padding: 7px 2px; border: none; background: transparent; font-family: var(--sc-font); font-size: 13.5px; outline: none; color: var(--sc-fg); }
.sc-input input::placeholder { color: var(--sc-muted-fg); opacity: .7; }
.sc-send {
  flex: none; width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;
  background: var(--sc-accent); color: var(--sc-accent-fg); border: none; border-radius: 9px; cursor: pointer;
  transition: opacity .15s ease;
}
.sc-send:hover:not(:disabled) { opacity: .9; }
.sc-send:disabled { opacity: .4; cursor: default; }
.sc-feedback { display: flex; gap: 6px; padding: 2px 4px; }
.sc-thumb { background: transparent; border: none; cursor: pointer; font-size: 13px; opacity: .5; padding: 2px; }
.sc-thumb:hover { opacity: 1; }
.sc-thumb-on { opacity: 1; }
.sc-thumb:disabled { cursor: default; }

/* P4-M0 guided walkthrough — the offer pill (in-chat) + the step card (a fixed shadow-root
   overlay docked at the launcher corner; like the panel, it NEVER touches the host layout). */
.sc-walk-offer {
  display: inline-flex; align-items: center; gap: 6px; width: fit-content;
  border: none; border-radius: 999px; padding: 6px 14px; margin: 4px 2px 0; cursor: pointer;
  background: var(--sc-accent); color: var(--sc-accent-fg);
  font-family: var(--sc-font); font-size: 12px; font-weight: 600;
  transition: opacity .15s ease;
}
.sc-walk-offer:hover { opacity: .9; }
.sc-walk-card {
  /* Below the panel (2147483000): an open chat — e.g. the Explain escalation's diagnosis — covers
     the card; closing the chat reveals it again. Above everything else on the host page. */
  position: fixed; right: var(--sc-right); left: var(--sc-left); bottom: 86px; z-index: 2147482999;
  width: 300px; max-width: calc(100vw - 32px);
  background: var(--sc-surface); border: 1px solid var(--sc-border); border-radius: 14px;
  box-shadow: 0 8px 26px rgba(40,50,90,.16); padding: 12px 14px;
  font-family: var(--sc-font); color: var(--sc-fg);
  display: flex; flex-direction: column; gap: 8px;
}
.sc-walk-head { display: flex; align-items: center; gap: 8px; }
.sc-walk-chip {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  min-width: 30px; height: 20px; padding: 0 7px; border-radius: 999px;
  background: color-mix(in srgb, var(--sc-accent) 11%, transparent); color: var(--sc-accent);
  font-family: var(--sc-mono); font-size: 10.5px; font-weight: 600; line-height: 1;
}
.sc-walk-title {
  flex: 1; min-width: 0; font-size: 12px; font-weight: 700;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sc-walk-exit { flex: none; background: transparent; border: none; color: var(--sc-muted-fg); font-size: 13px; cursor: pointer; padding: 2px; opacity: .75; }
.sc-walk-exit:hover { opacity: 1; }
.sc-walk-instr { font-size: 13px; line-height: 1.45; }
.sc-walk-status { font-family: var(--sc-mono); font-size: 10.5px; color: var(--sc-muted-fg); min-height: 14px; }
.sc-walk-status.sc-walk-stalled { color: #9c5c4d; } /* the decline terracotta — a safe-stop, not an error */
.sc-walk-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.sc-walk-btn.sc-walk-explain {
  margin-right: auto; border-color: var(--sc-accent); color: var(--sc-accent);
  background: color-mix(in srgb, var(--sc-accent) 8%, transparent);
}
.sc-walk-btn {
  border: 1px solid var(--sc-border); border-radius: 9px; padding: 6px 12px; cursor: pointer;
  background: var(--sc-surface); color: var(--sc-fg);
  font-family: var(--sc-font); font-size: 12px; font-weight: 600;
  transition: opacity .15s ease;
}
.sc-walk-btn:hover:not(:disabled) { opacity: .85; }
.sc-walk-btn:disabled { opacity: .4; cursor: default; }
.sc-walk-btn.sc-walk-next { background: var(--sc-accent); color: var(--sc-accent-fg); border-color: var(--sc-accent); }

/* P2-M3 "show me" — the config-gated single-step highlight drawn over the host page (fixed =
   viewport coords from getBoundingClientRect; pointer-events none so it never intercepts). */
.sc-spotlight {
  position: fixed; z-index: 2147483646; pointer-events: none;
  border: 2px solid var(--sc-accent); border-radius: 8px;
  box-shadow: 0 0 0 4px rgba(59, 80, 224, .16);
  animation: sc-spot-pulse 1.6s ease-in-out infinite;
}
@keyframes sc-spot-pulse {
  0%, 100% { box-shadow: 0 0 0 4px rgba(59, 80, 224, .16); }
  50% { box-shadow: 0 0 0 8px rgba(59, 80, 224, .08); }
}
`;
