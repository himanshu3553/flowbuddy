// Content script: captures interaction events, element semantics, DOM snapshots,
// and post-action settle, streaming them to the background over a long-lived port.

import { ensureControlBar, isControlBarEvent, setMicLevel } from './controlbar.js';
import type { AppMeta, CapturedEvent, EventTarget, PortMsg, Route } from './types.js';

let recording = false;
let startTime = 0;
let pausedTotal = 0; // ms paused before the current active span (active-time base for event t)
let port: chrome.runtime.Port | null = null;
let postWatcher: { observer: MutationObserver; timer: number; hard: number } | null = null;

// R4 — service-worker-eviction resilience. In MV3 the background can be evicted after ~30s idle
// (e.g. a stretch of quiet narration with no interaction), which silently drops the capture port
// and loses every event sent afterwards. Two defenses: (1) a keepalive ping resets the idle timer
// so the worker stays warm while recording; (2) captured messages are buffered in `outbox` and the
// port reconnects on demand, so nothing is lost even if the worker is evicted anyway.
const outbox: PortMsg[] = [];
let keepAlive: ReturnType<typeof setInterval> | null = null;
const KEEPALIVE_MS = 20_000; // < the ~30s MV3 idle timeout
const OUTBOX_CAP = 2000; // bound memory if the worker stays down abnormally long (shouldn't happen)

const SETTLE_QUIET_MS = 500;
const SETTLE_MAX_MS = 3000;
const DOM_CAP = 400_000;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.cmd === 'startCapture') {
    startCapture(msg.startTime as number, (msg.pausedTotal as number) || 0);
    sendResponse?.({ ok: true });
  } else if (msg?.cmd === 'stopCapture') {
    stopCapture();
    sendResponse?.({ ok: true });
  } else if (msg?.cmd === 'setStatus') {
    // Upload outcomes are shown ONLY inside the extension popup (its bottom status bar / retry
    // screen). Nothing — success or error — is ever rendered on the recorded page.
    sendResponse?.({ ok: true });
  } else if (msg?.cmd === 'micLevel') {
    // R7 — live mic level pushed from the offscreen recorder (top-frame control bar only).
    setMicLevel(Number(msg.level) || 0);
    sendResponse?.({ ok: true });
  }
  // Respond synchronously — do NOT keep the channel open (avoids the
  // "message channel closed / bfcache" warnings on navigation).
  return false;
});

// On load (every page, any origin), ask the background whether THIS tab is mid-recording and
// self-arm if so. This is the deterministic re-arm after a full-page navigation — it doesn't rely
// on the background pushing `startCapture` at exactly the right moment, which raced on cross-origin
// hops (e.g. scribe.com → scribehow.com/signin in the same tab) and silently dropped capture.
chrome.runtime.sendMessage({ cmd: 'hello' }, (resp) => {
  void chrome.runtime.lastError; // no receiver (SW asleep mid-teardown) — harmless
  if (resp?.record) startCapture(resp.startTime as number, (resp.pausedTotal as number) || 0);
});

function startCapture(t0: number, pausedBase = 0): void {
  if (recording) return;
  recording = true;
  startTime = t0 || Date.now();
  // Active-time base: ms spent paused before this (re)arm, so event timestamps exclude paused spans
  // and stay aligned with the (also-paused) narration. 0 for an unpaused recording (identical to old).
  pausedTotal = pausedBase;
  ensurePort();
  flush(); // deliver anything left buffered from a previous span (normally empty)
  // Only the TOP frame owns the session's app metadata (origin, viewport). With all_frames capture
  // (R8), a sub-frame must NOT clobber it with the iframe's origin/size.
  if (window === window.top) {
    send({ kind: 'appMeta', meta: appMeta() });
    ensureControlBar(); // R7 — on-page Stop/Pause/Mark + live status (top frame only, idempotent)
  }
  startKeepAlive();
  patchHistory();
  addEventListener('click', onClick, true);
  addEventListener('change', onChange, true);
  addEventListener('submit', onSubmit, true);
  addEventListener('keydown', onKeydown, true);
  addEventListener('popstate', onNav, true);
  // No on-page confirmation — the recording state lives entirely on the extension (icon + popup).
}

function stopCapture(): void {
  if (!recording) return;
  recording = false;
  removeEventListener('click', onClick, true);
  removeEventListener('change', onChange, true);
  removeEventListener('submit', onSubmit, true);
  removeEventListener('keydown', onKeydown, true);
  removeEventListener('popstate', onNav, true);
  clearWatcher();
  stopKeepAlive();
  flush(); // best-effort: drain any buffered events before we drop the port
  port?.disconnect();
  port = null;
}

// ---- port lifecycle (R4: reconnect + buffer so an evicted worker never loses events) ----

/** Return a live capture port, (re)connecting if the previous one was dropped by a worker eviction. */
function ensurePort(): chrome.runtime.Port | null {
  if (port) return port;
  try {
    const p = chrome.runtime.connect({ name: 'capture' });
    p.onDisconnect.addListener(() => {
      // The worker was evicted (or the extension reloaded) — drop the dead port. The next send()
      // reconnects and flushes the outbox, so captured events queued in the gap are not lost.
      if (port === p) port = null;
    });
    port = p;
    return p;
  } catch {
    // Extension context invalidated (reload/update mid-recording) — keep buffering; a later page
    // load re-injects a fresh content script that self-arms via `hello`.
    return null;
  }
}

/**
 * Drain the outbox in order over a live port. If a post fails on a stale port (the worker was
 * evicted but `onDisconnect` hasn't fired yet), reconnect and retry within this call — so the event
 * (and the screenshot the background takes on receipt) lands now, not one interaction later. Bounded
 * so an unrecoverable context (extension reloaded) can't spin; the buffer is kept for a later flush.
 */
function flush(): void {
  let reconnects = 0;
  while (outbox.length) {
    const p = ensurePort();
    if (!p) return; // can't connect right now — keep the buffer, retry on the next send/keepalive
    try {
      p.postMessage(outbox[0]);
      outbox.shift();
    } catch {
      port = null; // stale/dead port — drop it so ensurePort() reconnects on the next iteration
      if (++reconnects > 3) return;
    }
  }
}

function send(msg: PortMsg): void {
  outbox.push(msg);
  if (outbox.length > OUTBOX_CAP) outbox.shift(); // safety valve — drop the oldest if unbounded
  flush();
}

function startKeepAlive(): void {
  stopKeepAlive();
  // One heartbeat per tab is enough — only the top frame pings (sub-frames still reconnect on send).
  if (window !== window.top) return;
  keepAlive = setInterval(() => {
    if (!recording) return;
    flush(); // deliver any buffered events + ensure the port is live
    // A periodic port message resets the MV3 idle timer so the worker isn't evicted mid-recording.
    // Best-effort (not buffered): if it fails, onDisconnect nulls the port and the next send reconnects.
    try { port?.postMessage({ kind: 'keepalive' }); } catch { port = null; }
  }, KEEPALIVE_MS);
}

function stopKeepAlive(): void {
  if (keepAlive != null) { clearInterval(keepAlive); keepAlive = null; }
}

// ---- event handlers ----

function onClick(e: Event): void {
  if (isControlBarEvent(e)) return; // R7 — never capture clicks on our own on-page control bar
  const el = resolveTarget(e.target as Element | null);
  if (!el) return;
  emit('click', el);
  schedulePostAction();
}

function onChange(e: Event): void {
  if (isControlBarEvent(e)) return;
  const el = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  if (!el || !('value' in el)) return;
  emit('input', el, maskValue(el));
}

function onSubmit(e: Event): void {
  if (isControlBarEvent(e)) return;
  const el = e.target as Element | null;
  if (!el) return;
  emit('submit', el);
  schedulePostAction();
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Enter') return;
  if (isControlBarEvent(e)) return;
  const el = e.target as Element | null;
  if (!el) return;
  emit('keydown', el, 'Enter');
  schedulePostAction();
}

function onNav(): void {
  const el = document.body || document.documentElement;
  emit('nav', el);
  schedulePostAction();
}

function emit(type: string, el: Element, value?: string): void {
  const event: CapturedEvent = {
    id: crypto.randomUUID(),
    t: Date.now() - startTime - pausedTotal,
    type,
    target: buildTarget(el),
    value,
    route: buildRoute(),
    screenshot: { file: '' }, // filled by background after captureVisibleTab
    domSnapshot: { file: '' },
  };
  event.screenshot = { file: `shots/${event.id}.png` };
  event.domSnapshot = { file: `dom/${event.id}.html` };
  send({ kind: 'event', event, domHtml: serializeDom() });
  pendingEventId = event.id;
}

// ---- post-action settle watcher ----

let pendingEventId: string | null = null;

function schedulePostAction(): void {
  const eventId = pendingEventId;
  if (!eventId) return;
  clearWatcher();

  const finish = (reason: string) => {
    if (!postWatcher) return;
    clearWatcher();
    send({ kind: 'postAction', eventId, domHtml: serializeDom(), route: buildRoute(), settleReason: reason });
  };

  const observer = new MutationObserver(() => {
    if (!postWatcher) return;
    clearTimeout(postWatcher.timer);
    postWatcher.timer = setTimeout(() => finish('mutation_quiet'), SETTLE_QUIET_MS) as unknown as number;
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

  postWatcher = {
    observer,
    timer: setTimeout(() => finish('mutation_quiet'), SETTLE_QUIET_MS) as unknown as number,
    hard: setTimeout(() => finish('timeout'), SETTLE_MAX_MS) as unknown as number,
  };
}

function clearWatcher(): void {
  if (!postWatcher) return;
  postWatcher.observer.disconnect();
  clearTimeout(postWatcher.timer);
  clearTimeout(postWatcher.hard);
  postWatcher = null;
}

// ---- helpers ----

function resolveTarget(el: Element | null): Element | null {
  if (!el) return null;
  const interactive = el.closest('a,button,[role="button"],input,select,textarea,label,[onclick],[role="link"],[role="menuitem"],[role="tab"]');
  return interactive || el;
}

// P1-M12 — redact sensitive values client-side, BEFORE anything leaves the browser.
const MASK = '••••••';
const SENSITIVE_TYPES = new Set(['password', 'email', 'tel']);
const SENSITIVE_AUTOCOMPLETE = new Set([
  'current-password', 'new-password', 'cc-number', 'cc-csc', 'cc-exp', 'cc-name', 'one-time-code',
]);
// Sensitive field patterns + an explicit `data-sync-redact` opt-in for the host app to mark fields.
const REDACT_SELECTORS = [
  '[data-sync-redact]',
  '[autocomplete*="cc-" i]',
  '[name*="card" i]', '[name*="cvv" i]', '[name*="cvc" i]', '[name*="ssn" i]',
  '[name*="secret" i]', '[name*="token" i]', '[id*="ssn" i]',
];

function isSensitive(el: Element): boolean {
  const type = ((el as HTMLInputElement).type || '').toLowerCase();
  if (SENSITIVE_TYPES.has(type)) return true;
  const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
  if (ac && SENSITIVE_AUTOCOMPLETE.has(ac)) return true;
  for (const sel of REDACT_SELECTORS) {
    try { if (el.matches(sel) || el.closest(sel)) return true; } catch { /* ignore bad selector */ }
  }
  return false;
}

function maskValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  // Passwords, emails, phones, card/SSN/secret fields, and host-marked fields never leave the browser.
  if (isSensitive(el)) return MASK;
  return String(el.value ?? '').slice(0, 200);
}

function buildTarget(el: Element): EventTarget {
  const r = el.getBoundingClientRect();
  const target: EventTarget = {
    role: el.getAttribute('role') || implicitRole(el),
    accessibleName: accessibleName(el),
    text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    tag: el.tagName.toLowerCase(),
    attributes: pickAttrs(el),
    cssPath: cssPath(el),
    xpath: xpath(el),
  };
  // R8 — translate the element bbox into TOP-document viewport coords so it lines up with the
  // full-tab screenshot. Resolvable for a same-origin frame chain; for a cross-origin frame the
  // offset is unknown, so we omit bbox (no wrong highlight) — the screenshot still shows the pixels.
  const inFrame = window !== window.top;
  const off = inFrame ? frameOffset() : { x: 0, y: 0 };
  if (off) {
    target.bbox = { x: Math.round(r.x + off.x), y: Math.round(r.y + off.y), w: Math.round(r.width), h: Math.round(r.height) };
  }
  if (inFrame) {
    try { target.framePath = location.href.slice(0, 300); } catch { /* opaque origin */ }
  }
  return target;
}

/**
 * The offset (in TOP-document viewport pixels) of THIS frame's viewport origin — sum each ancestor
 * iframe element's position up the chain. Returns null at the first cross-origin boundary, where
 * `frameElement` is inaccessible and the offset can't be resolved.
 */
function frameOffset(): { x: number; y: number } | null {
  let x = 0;
  let y = 0;
  let win: Window = window;
  while (win !== win.top) {
    let fe: Element | null;
    try {
      fe = win.frameElement;
    } catch {
      return null; // cross-origin ancestor — offset unknowable from here
    }
    if (!fe) return null;
    const rect = fe.getBoundingClientRect();
    x += rect.left;
    y += rect.top;
    win = win.parent;
  }
  return { x, y };
}

function pickAttrs(el: Element): Record<string, string> {
  const keys = ['id', 'name', 'class', 'type', 'href', 'placeholder', 'aria-label', 'data-testid'];
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = el.getAttribute(k);
    if (v) out[k] = v.slice(0, 120);
  }
  return out;
}

function implicitRole(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (tag === 'a' && el.hasAttribute('href')) return 'link';
  if (tag === 'button') return 'button';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'input') {
    const t = (el as HTMLInputElement).type;
    if (['button', 'submit', 'reset'].includes(t)) return 'button';
    if (t === 'checkbox') return 'checkbox';
    if (t === 'radio') return 'radio';
    return 'textbox';
  }
  return '';
}

function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.trim().slice(0, 120);
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const text = labelledby
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || '')
      .join(' ')
      .trim();
    if (text) return text.slice(0, 120);
  }
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length) {
    const text = Array.from(labels).map((l) => l.textContent || '').join(' ').trim();
    if (text) return text.slice(0, 120);
  }
  const attr = el.getAttribute('alt') || el.getAttribute('title') || el.getAttribute('placeholder');
  if (attr) return attr.trim().slice(0, 120);
  return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function cssPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.nodeType === 1 && parts.length < 8) {
    if (cur.id) {
      parts.unshift(`#${CSS.escape(cur.id)}`);
      break;
    }
    let sel = cur.tagName.toLowerCase();
    const parent = cur.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      if (sameTag.length > 1) sel += `:nth-of-type(${sameTag.indexOf(cur) + 1})`;
    }
    parts.unshift(sel);
    cur = cur.parentElement;
  }
  return parts.join(' > ');
}

function xpath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.nodeType === 1) {
    let idx = 1;
    let sib = cur.previousElementSibling;
    while (sib) {
      if (sib.tagName === cur.tagName) idx++;
      sib = sib.previousElementSibling;
    }
    parts.unshift(`${cur.tagName.toLowerCase()}[${idx}]`);
    cur = cur.parentElement;
  }
  return '/' + parts.join('/');
}

function buildRoute(): Route {
  return { url: location.href, path: location.pathname, hash: location.hash, title: document.title };
}

function serializeDom(): string {
  try {
    let html = document.documentElement.outerHTML;
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '<script></script>');
    html = html.replace(/<style[\s\S]*?<\/style>/gi, '<style></style>');
    return html.slice(0, DOM_CAP);
  } catch {
    return '';
  }
}

function appMeta(): AppMeta {
  return {
    baseUrl: location.origin,
    userAgent: navigator.userAgent,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

// Patch History API so SPA route changes emit nav events.
function patchHistory(): void {
  const wrap = (name: 'pushState' | 'replaceState') => {
    const orig = history[name];
    history[name] = function (this: History, ...args: unknown[]) {
      const ret = (orig as any).apply(this, args);
      if (recording) setTimeout(onNav, 0);
      return ret;
    } as History[typeof name];
  };
  wrap('pushState');
  wrap('replaceState');
}
