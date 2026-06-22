/** Scoped styles for the copilot widget (injected into a shadow root — isolated from the host page). */
export const CSS = `
:host, * { box-sizing: border-box; }
.sc-launcher {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
  width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
  background: #1a8a4f; color: #fff; font-size: 24px; line-height: 1;
  box-shadow: 0 4px 16px rgba(0,0,0,.25); display: flex; align-items: center; justify-content: center;
}
.sc-launcher:hover { background: #157a44; }
.sc-panel {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
  width: 370px; max-width: calc(100vw - 32px); height: 540px; max-height: calc(100vh - 40px);
  background: #fff; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.28);
  display: none; flex-direction: column; overflow: hidden;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #1c1c1c;
}
.sc-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; background: #1a8a4f; color: #fff;
}
.sc-title { font-weight: 600; font-size: 15px; }
.sc-close { background: transparent; border: none; color: #fff; font-size: 16px; cursor: pointer; padding: 4px; }
.sc-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: #f7f8f7; }
.sc-greeting { color: #666; font-size: 14px; text-align: center; margin: auto 10px; }
.sc-msg { display: flex; flex-direction: column; gap: 4px; max-width: 85%; }
.sc-user { align-self: flex-end; align-items: flex-end; }
.sc-assistant { align-self: flex-start; align-items: flex-start; }
.sc-bubble { padding: 8px 12px; border-radius: 12px; font-size: 14px; line-height: 1.45; white-space: pre-wrap; word-wrap: break-word; }
.sc-user .sc-bubble { background: #1a8a4f; color: #fff; border-bottom-right-radius: 3px; }
.sc-assistant .sc-bubble { background: #fff; color: #1c1c1c; border: 1px solid #e3e3e3; border-bottom-left-radius: 3px; }
.sc-decline .sc-bubble { background: #fff7e6; border-color: #f0d8a8; color: #7a5a14; }
.sc-error .sc-bubble { background: #fdeaea; border-color: #f0caca; color: #a23; }
.sc-typing { color: #999; letter-spacing: 2px; }
.sc-cites { font-size: 11px; color: #888; padding: 0 4px; }
.sc-input { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #eee; background: #fff; }
.sc-input input { flex: 1; padding: 9px 11px; border: 1px solid #d6d6d6; border-radius: 8px; font-size: 14px; outline: none; }
.sc-input input:focus { border-color: #1a8a4f; }
.sc-send { padding: 9px 14px; background: #1a8a4f; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }
.sc-send:disabled { opacity: .5; cursor: default; }
.sc-feedback { display: flex; gap: 6px; padding: 2px 4px; }
.sc-thumb { background: transparent; border: none; cursor: pointer; font-size: 13px; opacity: .5; padding: 2px; }
.sc-thumb:hover { opacity: 1; }
.sc-thumb-on { opacity: 1; }
.sc-thumb:disabled { cursor: default; }
`;
