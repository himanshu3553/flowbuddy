/** Scoped styles for the copilot widget (injected into a shadow root — isolated from the host page).
 *  Default theme is the FlowBuddy indigo brand (matches FlowBuddy Studio). Hosts can re-brand via
 *  `data-flowbuddy-accent` (any CSS color) and reposition with `data-flowbuddy-position="left|right"` —
 *  both are applied as inline CSS variables on the shadow host (see index.ts). */
export const CSS = `
:host {
  --fb-accent: #3b50e0;
  --fb-accent-fg: #ffffff;
  --fb-fg: #14161f;
  --fb-muted-fg: #6b7180;
  --fb-border: #eceef3;
  --fb-surface: #ffffff;
  --fb-messages-bg: #fcfcfd;
  --fb-right: 20px;
  --fb-left: auto;
  /* Design-system typography (tokens/typography.css) — the faces are injected document-level by
     index.ts (ensureBrandFonts); these stacks fall back to system fonts when that's blocked. */
  --fb-font: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --fb-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace;
}
:host, * { box-sizing: border-box; }
.fb-launcher {
  position: fixed; right: var(--fb-right); left: var(--fb-left); bottom: 20px; z-index: 2147483000;
  width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
  font-family: var(--fb-font);
  background: var(--fb-accent); color: var(--fb-accent-fg); font-size: 24px; line-height: 1;
  box-shadow: 0 4px 16px rgba(0,0,0,.18); display: flex; align-items: center; justify-content: center;
  transition: opacity .15s ease;
}
.fb-launcher:hover { opacity: .9; }
.fb-launcher.fb-launcher-pill {
  width: auto; height: auto; border-radius: 999px; padding: 13px 20px;
  font-size: 14px; font-weight: 600; line-height: 1; white-space: nowrap;
}
.fb-launcher.fb-launcher-outline {
  background: transparent; color: var(--fb-accent); border: 2px solid var(--fb-accent);
}
.fb-panel {
  position: fixed; right: var(--fb-right); left: var(--fb-left); z-index: 2147483000;
  /* --fb-panel-bottom is only raised in Studio preview mode, where the launcher stays visible
     below the open panel; real embeds keep the 20px default (panel replaces the launcher). */
  bottom: var(--fb-panel-bottom, 20px);
  width: 370px; max-width: calc(100vw - 32px); height: 540px;
  max-height: calc(100vh - var(--fb-panel-bottom, 20px) - 20px);
  background: var(--fb-surface); border: 1px solid var(--fb-border); border-radius: 16px;
  box-shadow: 0 8px 26px rgba(40,50,90,.16);
  display: none; flex-direction: column; overflow: hidden;
  font-family: var(--fb-font); color: var(--fb-fg);
}
.fb-header {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; background: var(--fb-accent); color: var(--fb-accent-fg);
  /* The header is the floating panel's drag handle (touch-action none = pointer-drag works on
     touch without scrolling the host page underneath). */
  cursor: grab; user-select: none; -webkit-user-select: none; touch-action: none;
}
.fb-panel.fb-dragging .fb-header { cursor: grabbing; }
.fb-badge {
  flex: none; width: 30px; height: 30px; border-radius: 9px; background: rgba(255,255,255,.16);
  display: flex; align-items: center; justify-content: center;
}
.fb-titles { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.fb-title { font-weight: 700; font-size: 15px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fb-subtitle {
  font-family: var(--fb-mono); font-size: 10px; letter-spacing: .02em;
  color: rgba(255,255,255,.72); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.fb-close { flex: none; background: transparent; border: none; color: var(--fb-accent-fg); font-size: 15px; cursor: pointer; padding: 4px; opacity: .75; }
.fb-close:hover { opacity: 1; }
.fb-expand {
  flex: none; display: flex; align-items: center; justify-content: center;
  background: transparent; border: none; color: var(--fb-accent-fg); cursor: pointer;
  padding: 4px; opacity: .75;
}
.fb-expand:hover { opacity: 1; }
/* Expanded mode — grow to the base max-height cap (near-full viewport height); still a floating,
   draggable window (index.ts re-clamps a dragged spot so the taller panel stays on screen). */
.fb-panel.fb-expanded { height: calc(100vh - var(--fb-panel-bottom, 20px) - 20px); }
.fb-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: var(--fb-messages-bg); }
.fb-greeting { color: var(--fb-muted-fg); font-size: 13px; text-align: center; margin: auto 24px; }
.fb-msg { display: flex; flex-direction: column; gap: 4px; max-width: 85%; }
.fb-user { align-self: flex-end; align-items: flex-end; }
.fb-assistant { align-self: flex-start; align-items: flex-start; }
.fb-bubble { padding: 9px 12px; border-radius: 13px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
.fb-bubble strong { font-weight: 600; }
.fb-bubble code { font-family: var(--fb-mono); font-size: 11.5px; background: rgba(0,0,0,.06); padding: 1px 5px; border-radius: 5px; }
/* Assistant answers are block-rendered (paragraphs + step rows) — spacing comes from margins,
   not preserved newlines (user bubbles keep pre-wrap above). */
.fb-assistant .fb-bubble { white-space: normal; }
.fb-p { margin: 0; }
.fb-p + .fb-p, .fb-p + .fb-steps, .fb-steps + .fb-p, .fb-steps + .fb-steps { margin-top: 8px; }
.fb-steps { display: flex; flex-direction: column; gap: 7px; }
.fb-step { display: flex; align-items: flex-start; gap: 8px; }
.fb-step-n {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  min-width: 19px; height: 19px; padding: 0 5px; margin-top: 1px; border-radius: 999px;
  background: color-mix(in srgb, var(--fb-accent) 11%, transparent); color: var(--fb-accent);
  font-family: var(--fb-mono); font-size: 10.5px; font-weight: 600; line-height: 1;
}
.fb-step-b { flex: none; width: 5px; height: 5px; border-radius: 50%; background: var(--fb-accent); margin-top: 7.5px; }
.fb-step-t { min-width: 0; }
.fb-user .fb-bubble { background: var(--fb-accent); color: var(--fb-accent-fg); border-bottom-right-radius: 4px; }
.fb-assistant .fb-bubble { background: var(--fb-surface); color: var(--fb-fg); border: 1px solid var(--fb-border); border-bottom-left-radius: 4px; }
.fb-decline .fb-bubble { background: var(--fb-surface); border: 1px solid #f0ddd7; color: var(--fb-fg); }
.fb-error .fb-bubble { background: var(--fb-surface); border: 1px solid #f0ddd7; color: #9c5c4d; }
.fb-typing { color: var(--fb-muted-fg); letter-spacing: 2px; }
.fb-dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.fb-cites, .fb-flag {
  display: inline-flex; align-items: center; gap: 6px; width: fit-content;
  border: 1px solid; border-radius: 999px; padding: 3px 10px; margin: 2px 2px 0;
  font-family: var(--fb-mono); font-size: 10px; font-weight: 600;
}
.fb-cites { color: var(--fb-accent); border-color: var(--fb-accent); background: color-mix(in srgb, var(--fb-accent) 8%, transparent); }
.fb-flag { color: #9c5c4d; border-color: #f0ddd7; background: #fbf0ed; }
.fb-input { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--fb-border); background: var(--fb-surface); }
.fb-input input { flex: 1; padding: 7px 2px; border: none; background: transparent; font-family: var(--fb-font); font-size: 13.5px; outline: none; color: var(--fb-fg); }
.fb-input input::placeholder { color: var(--fb-muted-fg); opacity: .7; }
.fb-send {
  flex: none; width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;
  background: var(--fb-accent); color: var(--fb-accent-fg); border: none; border-radius: 9px; cursor: pointer;
  transition: opacity .15s ease;
}
.fb-send:hover:not(:disabled) { opacity: .9; }
.fb-send:disabled { opacity: .4; cursor: default; }
.fb-feedback { display: flex; gap: 6px; padding: 2px 4px; }
.fb-thumb { background: transparent; border: none; cursor: pointer; font-size: 13px; opacity: .5; padding: 2px; }
.fb-thumb:hover { opacity: 1; }
.fb-thumb-on { opacity: 1; }
.fb-thumb:disabled { cursor: default; }

/* P4-M0 guided walkthrough — the offer pill (in-chat) + the step card (a fixed shadow-root
   overlay docked at the launcher corner; like the panel, it NEVER touches the host layout). */
.fb-walk-offer {
  display: inline-flex; align-items: center; gap: 6px; width: fit-content;
  border: none; border-radius: 999px; padding: 6px 14px; margin: 4px 2px 0; cursor: pointer;
  background: var(--fb-accent); color: var(--fb-accent-fg);
  font-family: var(--fb-font); font-size: 12px; font-weight: 600;
  transition: opacity .15s ease;
}
.fb-walk-offer:hover { opacity: .9; }

/* P4 slice 4 — the run-offer consent sheet (the typed affordance; "Run it" IS the consent). */
.fb-run-consent {
  margin-top: 8px; padding: 10px 12px; border: 1px solid #e3e6f0; border-radius: 10px;
  background: #fafbff; font-size: 12px; line-height: 1.55; color: #344054;
}
.fb-run-consent-title { font-weight: 600; margin-bottom: 3px; color: #1d2433; }
.fb-run-consent-meta { color: #667085; }
.fb-run-consent-val { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #1d2433; }
.fb-run-consent-actions { display: flex; gap: 8px; margin-top: 9px; }
/* Slice 6 — the docked run strip: the run's control surface while the chat panel is open.
   Docked at the BOTTOM, above the composer — beside where the user replies. */
.fb-run-strip {
  flex-shrink: 0; margin: 6px 12px; padding: 8px 10px; border: 1px solid #dfe3f2;
  border-radius: 10px; background: #f6f7fe; font-size: 12px; color: #344054;
}
.fb-run-strip-top { display: flex; align-items: center; gap: 8px; }
.fb-run-strip-chip {
  flex-shrink: 0; padding: 1px 7px; border-radius: 999px; background: var(--fb-accent, #3b50e0);
  color: #fff; font-size: 10.5px; font-weight: 700; font-variant-numeric: tabular-nums;
}
.fb-run-strip-instr { flex: 1; min-width: 0; font-weight: 600; color: #1d2433; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fb-run-strip-x { border: none; background: none; cursor: pointer; color: #667085; font-size: 12px; padding: 0 2px; }
.fb-run-strip-x:hover { color: #1d2433; }
.fb-run-strip-status { margin-top: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #667085; }
.fb-run-strip-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
/* .fb-walk-* — the ACTING RUN's on-page card + the shared button/status looks (consent sheet, run
   strip). Historically the walkthrough's; the guided card moved to .fb-tour-* when it became the
   traveling accent card (2026-08-11) — the run card deliberately keeps this neutral surface. */
.fb-walk-card {
  /* Below the panel (2147483000): an open chat — e.g. the Explain escalation's diagnosis — covers
     the card; closing the chat reveals it again. Above everything else on the host page. */
  position: fixed; right: var(--fb-right); left: var(--fb-left); bottom: 86px; z-index: 2147482999;
  width: 300px; max-width: calc(100vw - 32px);
  background: var(--fb-surface); border: 1px solid var(--fb-border); border-radius: 14px;
  box-shadow: 0 8px 26px rgba(40,50,90,.16); padding: 12px 14px;
  font-family: var(--fb-font); color: var(--fb-fg);
  display: flex; flex-direction: column; gap: 8px;
}
.fb-walk-head { display: flex; align-items: center; gap: 8px; }
.fb-walk-chip {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  min-width: 30px; height: 20px; padding: 0 7px; border-radius: 999px;
  background: color-mix(in srgb, var(--fb-accent) 11%, transparent); color: var(--fb-accent);
  font-family: var(--fb-mono); font-size: 10.5px; font-weight: 600; line-height: 1;
}
.fb-walk-title {
  flex: 1; min-width: 0; font-size: 12px; font-weight: 700;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.fb-walk-exit { flex: none; background: transparent; border: none; color: var(--fb-muted-fg); font-size: 13px; cursor: pointer; padding: 2px; opacity: .75; }
.fb-walk-exit:hover { opacity: 1; }
.fb-walk-instr { font-size: 13px; line-height: 1.45; }
.fb-walk-status { font-family: var(--fb-mono); font-size: 10.5px; color: var(--fb-muted-fg); min-height: 14px; }
.fb-walk-status.fb-walk-stalled { color: #9c5c4d; } /* the decline terracotta — a safe-stop, not an error */
.fb-walk-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.fb-walk-btn {
  border: 1px solid var(--fb-border); border-radius: 9px; padding: 6px 12px; cursor: pointer;
  background: var(--fb-surface); color: var(--fb-fg);
  font-family: var(--fb-font); font-size: 12px; font-weight: 600;
  transition: opacity .15s ease;
}
.fb-walk-btn:hover:not(:disabled) { opacity: .85; }
.fb-walk-btn:disabled { opacity: .4; cursor: default; }
.fb-walk-btn.fb-walk-next { background: var(--fb-accent); color: var(--fb-accent-fg); border-color: var(--fb-accent); }

/* .fb-tour-* — P4-M0 guided walkthrough's TRAVELING card (redesign 2026-08-11, the industry tour
   pattern): one step per card on the brand accent, anchored beside the highlighted element
   (placement math: card-anchor.ts) with a beacon dot in the gap; without a target it docks to the
   fixed corner and the workflow title returns. Text is --fb-accent-fg (white) throughout — the
   accent is the surface, so every state color must stay readable on an ARBITRARY host accent. */
.fb-tour-card {
  /* Same layer as the run card: below the panel (2147483000), above the host page. */
  position: fixed; z-index: 2147482999;
  width: 300px; max-width: calc(100vw - 32px);
  background: var(--fb-accent); color: var(--fb-accent-fg);
  border-radius: 16px; box-shadow: 0 12px 32px rgba(15, 20, 55, .28);
  padding: 14px 16px 12px; font-family: var(--fb-font);
  display: flex; flex-direction: column; gap: 8px;
  animation: fb-tour-in .18s ease;
}
.fb-tour-card:not(.fb-tour-anchored) { right: var(--fb-right); left: var(--fb-left); bottom: 86px; }
@keyframes fb-tour-in { from { opacity: 0; transform: translateY(4px) scale(.98); } to { opacity: 1; transform: none; } }
.fb-tour-exit {
  position: absolute; top: 8px; right: 10px; background: transparent; border: none;
  color: var(--fb-accent-fg); font-size: 13px; cursor: pointer; padding: 2px; opacity: .7;
}
.fb-tour-exit:hover { opacity: 1; }
.fb-tour-title {
  font-size: 12px; font-weight: 700; opacity: .85; padding-right: 18px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.fb-tour-anchored .fb-tour-title { display: none; } /* anchored = instruction only (founder call) */
.fb-tour-instr { font-size: 13.5px; font-weight: 500; line-height: 1.5; padding-right: 18px; }
.fb-tour-status {
  font-family: var(--fb-mono); font-size: 10.5px; min-height: 14px;
  color: color-mix(in srgb, var(--fb-accent-fg) 75%, transparent);
}
.fb-tour-status.fb-tour-stalled, .fb-tour-status.fb-tour-alert {
  /* Safe-stop + gate-block emphasis that works on ANY accent: full-strength text on a dark
     scrim — the neutral card's terracotta would vanish on a warm brand color. */
  color: var(--fb-accent-fg); background: rgba(0, 0, 0, .16); border-radius: 7px; padding: 4px 7px;
}
.fb-tour-extra { display: flex; flex-wrap: wrap; gap: 8px; }
.fb-tour-btn, .fb-tour-arrow {
  border: none; cursor: pointer; font-family: var(--fb-font); font-weight: 600;
  color: var(--fb-accent-fg); background: color-mix(in srgb, #fff 18%, transparent);
  transition: background .15s ease;
}
.fb-tour-btn:hover:not(:disabled), .fb-tour-arrow:hover:not(:disabled) { background: color-mix(in srgb, #fff 30%, transparent); }
.fb-tour-btn:disabled, .fb-tour-arrow:disabled { opacity: .4; cursor: default; }
.fb-tour-btn { border-radius: 999px; padding: 5px 11px; font-size: 11.5px; }
.fb-tour-foot { display: flex; align-items: center; gap: 8px; }
.fb-tour-progress {
  margin-right: auto; font-size: 12px; font-weight: 600; opacity: .92;
  font-variant-numeric: tabular-nums;
}
.fb-tour-arrow { min-width: 34px; height: 30px; padding: 0 10px; border-radius: 10px; font-size: 14px; line-height: 1; }
/* The beacon: a ringed dot + breathing halo at the anchor point, centered on its coordinate via
   negative margins (no transform — the pulse animation must own nothing but the shadow). */
.fb-tour-beacon {
  position: fixed; z-index: 2147482998; width: 10px; height: 10px; margin: -5px 0 0 -5px;
  border-radius: 50%; background: var(--fb-accent); border: 2px solid var(--fb-accent-fg);
  pointer-events: none;
  animation: fb-tour-beacon-pulse 1.6s ease-in-out infinite;
}
@keyframes fb-tour-beacon-pulse {
  0%, 100% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--fb-accent) 35%, transparent); }
  50% { box-shadow: 0 0 0 9px color-mix(in srgb, var(--fb-accent) 15%, transparent); }
}

/* P2-M3 "show me" — the config-gated single-step highlight drawn over the host page (fixed =
   viewport coords from getBoundingClientRect; pointer-events none so it never intercepts). */
.fb-spotlight {
  position: fixed; z-index: 2147483646; pointer-events: none;
  border: 2px solid var(--fb-accent); border-radius: 8px;
  box-shadow: 0 0 0 4px rgba(59, 80, 224, .16);
  animation: fb-spot-pulse 1.6s ease-in-out infinite;
}
@keyframes fb-spot-pulse {
  0%, 100% { box-shadow: 0 0 0 4px rgba(59, 80, 224, .16); }
  50% { box-shadow: 0 0 0 8px rgba(59, 80, 224, .08); }
}
`;
