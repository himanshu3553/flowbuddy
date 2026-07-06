// R7 — on-page floating control bar. A draggable shadow-DOM bar the recorder shows on the recorded
// page so Stop / Pause / Mark and the live status (timer, step count, mic meter) are reachable without
// opening the toolbar popup. TOP FRAME ONLY. State is read from the background's `getState` (so it
// survives Pause, which tears down the per-frame capture), and the controls send the same background
// commands the popup does. Mic level is pushed in from the offscreen recorder via the background.
//
// Encapsulation note: the bar is real page DOM inside a shadow root, so its own clicks would otherwise
// be captured. content.ts calls isControlBarEvent() to drop any event originating in the bar.

let host: HTMLDivElement | null = null;
let root: ShadowRoot | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let poller: ReturnType<typeof setInterval> | null = null;
let statusPoller: ReturnType<typeof setInterval> | null = null; // post-stop pill: tracks the upload
let pillSince = 0;
let micBars: HTMLElement[] = [];

// local mirror of the recording session (refreshed from getState)
let recStart = 0;
let recPaused = false;
let recPausedAt = 0;
let recPausedTotal = 0;
let recWorkflowStart = 0;
let stopping = false; // Stop was pressed from the bar — freeze + tear down, don't reappear

/** Is this DOM event coming from the control bar? (crosses the shadow boundary via composedPath) */
export function isControlBarEvent(e: Event): boolean {
  if (!host) return false;
  const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
  return path.includes(host);
}

/** Push a fresh mic level (0..1) from the offscreen recorder into the meter. No-op if unmounted. */
export function setMicLevel(level: number): void {
  if (!host || recPaused || stopping) return;
  const pattern = [0.55, 0.8, 1, 0.8, 0.55]; // center-weighted VU shape
  const lvl = Math.max(0, Math.min(1, level));
  const active = lvl > 0.08;
  micBars.forEach((bar, i) => {
    const h = Math.max(0.15, Math.min(1, lvl * 1.5 * (pattern[i] ?? 0.7)));
    bar.style.height = `${Math.round(h * 100)}%`;
    bar.style.background = active ? '#3b50e0' : '#c3ccfb';
  });
}

/** Mount the bar (idempotent) and start its loops. Called from content.ts when the top frame arms. */
export function ensureControlBar(): void {
  if (window !== window.top) return; // one bar per tab, in the top document only
  stopping = false;
  if (host) return;
  build();
  tick();
  ticker = setInterval(tick, 1000);
  void refresh();
  poller = setInterval(() => void refresh(), 2000);
}

/** Remove the bar and stop its loops. */
export function removeControlBar(): void {
  if (ticker != null) { clearInterval(ticker); ticker = null; }
  if (poller != null) { clearInterval(poller); poller = null; }
  if (statusPoller != null) { clearInterval(statusPoller); statusPoller = null; }
  host?.remove();
  host = null;
  root = null;
  micBars = [];
}

function build(): void {
  host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483647;pointer-events:auto';
  root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host{all:initial}
      *{box-sizing:border-box}
      .bar{display:flex;align-items:center;gap:10px;
        font:500 12.5px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
        background:#ffffff;color:#3a3f4d;border:1px solid #e6e8ee;border-radius:999px;
        padding:7px 10px 7px 12px;box-shadow:0 8px 30px rgba(16,24,40,.14);user-select:none}
      .grip{cursor:grab;color:#b4b8c6;font-size:14px;letter-spacing:-1px;padding:0 2px;touch-action:none}
      .grip:active{cursor:grabbing}
      .dot{width:9px;height:9px;border-radius:50%;background:#cc4a3a;flex:none}
      .bar:not(.paused) .dot{animation:blink 1.2s ease-in-out infinite}
      @keyframes blink{50%{opacity:.3}}
      .timer{font:600 12.5px/1 "JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
        color:#14161f;letter-spacing:.02em;white-space:nowrap;min-width:82px}
      .meta{color:#6b7180;white-space:nowrap}
      .sep{width:1px;height:16px;background:#e6e8ee;flex:none}
      .mic{display:flex;align-items:flex-end;gap:2px;height:16px;width:34px;flex:none}
      .mic i{display:block;flex:1;height:15%;border-radius:2px;background:#c3ccfb;
        transition:height .09s linear,background .09s linear}
      .actions{display:flex;align-items:center;gap:6px;margin-left:2px}
      .btn{appearance:none;border:1px solid #e6e8ee;background:#f6f7f9;color:#3a3f4d;cursor:pointer;
        font:600 12px/1 inherit;padding:6px 10px;border-radius:999px;white-space:nowrap;
        transition:background .12s,border-color .12s,color .12s}
      .btn:hover{background:#eceef3}
      .btn.stop{background:#cc4a3a;border-color:#cc4a3a;color:#fff}
      .btn.stop:hover{background:#b94334}
      .paused .timer{color:#8a6d2e}
      /* post-stop status pill (D): the bar collapses into this instead of vanishing silently */
      .spin{width:12px;height:12px;border-radius:50%;border:2px solid #dfe3f5;border-top-color:#3b50e0;
        animation:cspin .9s linear infinite;flex:none}
      @keyframes cspin{to{transform:rotate(360deg)}}
      .pdot{width:9px;height:9px;border-radius:50%;flex:none}
      .pdot.ok{background:#1aa86a}
      .pdot.fail{background:#cc4a3a}
      .ptext{white-space:nowrap;color:#3a3f4d;padding:2px 2px}
    </style>
    <div class="bar">
      <span class="grip" title="Drag">⠿</span>
      <span class="dot"></span>
      <span class="timer">REC · 00:00</span>
      <span class="sep"></span>
      <span class="meta">Workflow 1 · 0 steps</span>
      <div class="mic"><i></i><i></i><i></i><i></i><i></i></div>
      <span class="sep"></span>
      <div class="actions">
        <button class="btn marker" title="Mark a new workflow">⚑ Mark</button>
        <button class="btn pause" title="Pause recording">Pause</button>
        <button class="btn stop" title="Stop &amp; upload">■ Stop</button>
      </div>
    </div>`;

  micBars = Array.from(root.querySelectorAll('.mic i')) as HTMLElement[];
  (root.querySelector('.marker') as HTMLElement).addEventListener('click', onMarker);
  (root.querySelector('.pause') as HTMLElement).addEventListener('click', onPause);
  (root.querySelector('.stop') as HTMLElement).addEventListener('click', onStop);
  wireDrag(root.querySelector('.grip') as HTMLElement);

  (document.body || document.documentElement).appendChild(host);
}

// ---- controls (reuse the popup's background commands) ----

async function onMarker(): Promise<void> {
  await sendMsg({ cmd: 'marker' });
  await refresh();
}

async function onPause(): Promise<void> {
  if (recPaused) {
    await sendMsg({ cmd: 'resume' });
  } else {
    // Optimistic freeze so the bar responds instantly; reconciled on the next refresh.
    recPaused = true;
    recPausedAt = Date.now();
    applyPausedUi();
    await sendMsg({ cmd: 'pause' });
  }
  await refresh();
}

async function onStop(): Promise<void> {
  // Don't vanish silently — collapse into the status pill right where the user clicked Stop, and
  // stay until the upload reaches an outcome ("clicked stop, nothing happened" was a real bug).
  enterStatusPill();
  await sendMsg({ cmd: 'stop' });
}

// ---- post-stop status pill (D) ----

/** Swap the controls for a compact pill that mirrors the persisted upload phase until an outcome. */
function enterStatusPill(): void {
  if (!root || !host || stopping) return;
  stopping = true;
  if (ticker != null) { clearInterval(ticker); ticker = null; }
  if (poller != null) { clearInterval(poller); poller = null; }
  const bar = root.querySelector('.bar') as HTMLElement | null;
  if (!bar) { removeControlBar(); return; }
  bar.classList.remove('paused');
  bar.innerHTML = '<span class="spin"></span><span class="ptext">Saving narration…</span>';
  pillSince = Date.now();
  statusPoller = setInterval(() => void pollStatusPill(), 500);
}

async function pollStatusPill(): Promise<void> {
  if (!root) { removeControlBar(); return; }
  // Hard cap: the background's upload watchdog guarantees an outcome well before this.
  if (Date.now() - pillSince > 300_000) { removeControlBar(); return; }
  let phase: { name?: string } | undefined;
  let lastUpload: { ok?: boolean } | undefined;
  let uploadProgress: number | undefined;
  try {
    ({ phase, lastUpload, uploadProgress } = await chrome.storage.local.get(['phase', 'lastUpload', 'uploadProgress']));
  } catch {
    removeControlBar(); // extension reloaded/invalidated under us
    return;
  }
  if (lastUpload?.ok || phase?.name === 'done') { finishPill(true); return; }
  if ((lastUpload && !lastUpload.ok) || phase?.name === 'failed') { finishPill(false); return; }
  if (phase?.name === 'idle' || phase?.name === 'recording') { removeControlBar(); return; } // outcome consumed elsewhere
  const p = root.querySelector('.ptext');
  if (!p) return;
  if (phase?.name === 'saving') p.textContent = 'Saving narration…';
  else if (uploadProgress === -2) p.textContent = 'Uploading… finishing';
  else if (typeof uploadProgress === 'number' && uploadProgress >= 1) p.textContent = `Uploading… ${uploadProgress}%`;
  else p.textContent = Date.now() - pillSince > 8000 ? 'Uploading… waking the Sync server' : 'Uploading…';
}

function finishPill(ok: boolean): void {
  if (statusPoller != null) { clearInterval(statusPoller); statusPoller = null; }
  const bar = root?.querySelector('.bar') as HTMLElement | null;
  if (!bar) { removeControlBar(); return; }
  bar.innerHTML = ok
    ? '<span class="pdot ok"></span><span class="ptext">Uploaded — Sync is processing it</span>'
    : '<span class="pdot fail"></span><span class="ptext">Upload didn’t finish — open the Sync extension to retry</span>';
  setTimeout(removeControlBar, ok ? 4000 : 8000);
}

// ---- state ----

async function refresh(): Promise<void> {
  if (stopping) return;
  const s = await sendMsg({ cmd: 'getState' });
  if (!s?.recording) {
    // Session ended elsewhere (popup Stop): if the upload pipeline is live, show the pill here too —
    // the user's attention is on the page either way.
    try {
      const { phase } = await chrome.storage.local.get('phase');
      const name = (phase as { name?: string } | undefined)?.name;
      if (name === 'saving' || name === 'uploading') { enterStatusPill(); return; }
    } catch { /* extension reloaded — fall through to removal */ }
    removeControlBar();
    return;
  }
  recStart = s.startTime || Date.now();
  recPaused = Boolean(s.paused);
  recPausedAt = s.pausedAt || 0;
  recPausedTotal = s.pausedTotal || 0;
  recWorkflowStart = s.workflowStartedAt || recStart;
  const workflows = s.workflows ?? 1;
  const steps = s.steps ?? 0;
  setText('.meta', `Workflow ${workflows} · ${steps} step${steps === 1 ? '' : 's'}`);
  applyPausedUi();
}

function applyPausedUi(): void {
  const bar = root?.querySelector('.bar');
  bar?.classList.toggle('paused', recPaused);
  setText('.pause', recPaused ? 'Resume' : 'Pause');
  if (recPaused) setBarsIdle();
}

function tick(): void {
  const end = recPaused && recPausedAt ? recPausedAt : Date.now();
  const ms = Math.max(0, end - recStart - recPausedTotal);
  setText('.timer', `${recPaused ? 'PAUSED' : 'REC'} · ${fmt(ms)}`);
}

function setBarsIdle(): void {
  for (const b of micBars) { b.style.height = '15%'; b.style.background = '#c3ccfb'; }
}

// ---- drag ----

function wireDrag(grip: HTMLElement): void {
  let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
  const onMove = (e: PointerEvent): void => {
    if (!dragging || !host) return;
    const x = Math.max(8, Math.min(window.innerWidth - host.offsetWidth - 8, ox + (e.clientX - sx)));
    const y = Math.max(8, Math.min(window.innerHeight - host.offsetHeight - 8, oy + (e.clientY - sy)));
    host.style.left = `${x}px`;
    host.style.top = `${y}px`;
    host.style.bottom = 'auto';
    host.style.transform = 'none'; // drop the centering transform once positioned explicitly
  };
  const onUp = (e: PointerEvent): void => {
    dragging = false;
    grip.releasePointerCapture?.(e.pointerId);
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
  };
  grip.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!host) return;
    dragging = true;
    const rect = host.getBoundingClientRect();
    ox = rect.left; oy = rect.top; sx = e.clientX; sy = e.clientY;
    grip.setPointerCapture?.(e.pointerId);
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    e.preventDefault();
  });
}

// ---- helpers ----

function setText(sel: string, text: string): void {
  const el = root?.querySelector(sel);
  if (el) el.textContent = text;
}

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function sendMsg(msg: unknown): Promise<any> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (resp) => { void chrome.runtime.lastError; resolve(resp); });
    } catch { resolve(null); } // extension context invalidated
  });
}
