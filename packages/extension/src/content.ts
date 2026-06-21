// Content script: captures interaction events, element semantics, DOM snapshots,
// and post-action settle, streaming them to the background over a long-lived port.

import type { AppMeta, CapturedEvent, EventTarget, PortMsg, Route } from './types.js';
import { showToast } from './indicator.js';

let recording = false;
let startTime = 0;
let port: chrome.runtime.Port | null = null;
let postWatcher: { observer: MutationObserver; timer: number; hard: number } | null = null;

const SETTLE_QUIET_MS = 500;
const SETTLE_MAX_MS = 3000;
const DOM_CAP = 400_000;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.cmd === 'startCapture') {
    startCapture(msg.startTime as number);
    sendResponse?.({ ok: true });
  } else if (msg?.cmd === 'stopCapture') {
    stopCapture();
    sendResponse?.({ ok: true });
  } else if (msg?.cmd === 'setStatus') {
    // Brief, non-blocking toast for the upload outcome. The "uploading" interim state is shown
    // on the extension (badge + popup), so we only toast the terminal result here.
    if (msg.phase === 'done') showToast('✓ Uploaded — processing in Sync', 'done', 3000);
    else if (msg.phase === 'failed') showToast(`✗ ${msg.message || 'Recording failed'}`, 'fail', 7000);
    sendResponse?.({ ok: true });
  }
  // Respond synchronously — do NOT keep the channel open (avoids the
  // "message channel closed / bfcache" warnings on navigation).
  return false;
});

function startCapture(t0: number): void {
  if (recording) return;
  recording = true;
  startTime = t0 || Date.now();
  port = chrome.runtime.connect({ name: 'capture' });
  send({ kind: 'appMeta', meta: appMeta() });
  patchHistory();
  addEventListener('click', onClick, true);
  addEventListener('change', onChange, true);
  addEventListener('submit', onSubmit, true);
  addEventListener('keydown', onKeydown, true);
  addEventListener('popstate', onNav, true);
  // Brief, non-blocking confirmation; the persistent REC state is shown on the extension itself.
  showToast('● Recording started', 'rec', 2000);
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
  port?.disconnect();
  port = null;
}

function send(msg: PortMsg): void {
  try {
    port?.postMessage(msg);
  } catch {
    /* port closed */
  }
}

// ---- event handlers ----

function onClick(e: Event): void {
  const el = resolveTarget(e.target as Element | null);
  if (!el) return;
  emit('click', el);
  schedulePostAction();
}

function onChange(e: Event): void {
  const el = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  if (!el || !('value' in el)) return;
  emit('input', el, maskValue(el));
}

function onSubmit(e: Event): void {
  const el = e.target as Element | null;
  if (!el) return;
  emit('submit', el);
  schedulePostAction();
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Enter') return;
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
    t: Date.now() - startTime,
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

function maskValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  const type = (el as HTMLInputElement).type;
  if (type === 'password') return '••••••';
  return String(el.value ?? '').slice(0, 200);
}

function buildTarget(el: Element): EventTarget {
  const r = el.getBoundingClientRect();
  return {
    role: el.getAttribute('role') || implicitRole(el),
    accessibleName: accessibleName(el),
    text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    tag: el.tagName.toLowerCase(),
    attributes: pickAttrs(el),
    cssPath: cssPath(el),
    xpath: xpath(el),
    bbox: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
  };
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
