// Background service worker: owns recording lifecycle, captures screenshots,
// buffers everything in IndexedDB, and uploads the assembled bundle on stop.

import { kvClear, kvEntriesByPrefix, kvGet, kvPut } from './idb.js';
import type { CapturedEvent, PortMsg } from './types.js';

interface UploadResult {
  ok: boolean;
  sessionId?: string;
  error?: string;
  retryable?: boolean; // omitted = derive from !ok; false = a hard failure (no retry screen)
}

interface Rec {
  recording: boolean;
  paused?: boolean;
  pausedAt?: number; // epoch ms the current pause began (0/undefined while running)
  pausedTotal?: number; // accumulated paused ms across completed pauses
  stopping?: boolean;
  tabId?: number; // the primary (initial) recording tab
  tabIds?: number[]; // R9 — all tabs in the session: the primary + tabs opened FROM it (Option A)
  windowId?: number;
  startTime: number;
  backendUrl: string;
  token?: string;
}

/** All tabs the session is capturing (primary + adopted child tabs). */
function recordingTabs(rec: Rec): number[] {
  if (rec.tabIds && rec.tabIds.length) return rec.tabIds;
  return rec.tabId != null ? [rec.tabId] : [];
}

/** (Re)arm a tab's content script — message it, injecting content.js first if it isn't there. */
async function armTab(tabId: number, arm: object): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, arm);
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tabId, arm);
    } catch (e) {
      console.warn('[arm] could not arm tab', tabId, e);
    }
  }
}

const idToKey = new Map<string, string>();
let captureChain: Promise<unknown> = Promise.resolve();
let lastCapture = 0;
let finalizing = false;
let finalizeFallback: ReturnType<typeof setTimeout> | null = null;

function clearFinalizeFallback(): void {
  if (finalizeFallback != null) { clearTimeout(finalizeFallback); finalizeFallback = null; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pad = (t: number) => String(Math.max(0, t)).padStart(9, '0');

async function getRec(): Promise<Rec> {
  const { rec } = await chrome.storage.session.get('rec');
  return (rec as Rec) || { recording: false, startTime: 0, backendUrl: '' };
}
async function setRec(rec: Rec): Promise<void> {
  await chrome.storage.session.set({ rec });
}

// ---- popup + offscreen messages ----

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.cmd === 'start') {
      sendResponse(await onStart(msg.backendUrl, msg.token));
    } else if (msg?.cmd === 'stop') {
      await onStop();
      sendResponse({ ok: true });
    } else if (msg?.cmd === 'pause') {
      await onPause();
      sendResponse({ ok: true });
    } else if (msg?.cmd === 'resume') {
      await onResume();
      sendResponse({ ok: true });
    } else if (msg?.cmd === 'marker') {
      await onMarker();
      sendResponse({ ok: true });
    } else if (msg?.cmd === 'retryUpload') {
      sendResponse(await onRetryUpload());
    } else if (msg?.cmd === 'discard') {
      await onDiscard();
      sendResponse({ ok: true });
    } else if (msg?.cmd === 'ackResult') {
      // The popup has shown the last upload outcome — clear it (and the toolbar badge) so it's a
      // one-time notification, not a sticky state that survives reopens/reloads.
      const rec = await getRec();
      await chrome.storage.local.remove('lastUpload');
      if (!rec.recording) await setBadge(null);
      sendResponse({ ok: true });
    } else if (msg?.cmd === 'hello') {
      // A freshly loaded page asking "is this tab mid-recording?" — the deterministic PULL-based
      // re-arm after a full-page navigation (esp. cross-origin, where the push-based re-arm raced).
      // Answered authoritatively from the sender's own tab id.
      const rec = await getRec();
      const tabId = sender.tab?.id;
      if (rec.recording && !rec.paused && tabId != null && recordingTabs(rec).includes(tabId)) {
        sendResponse({ record: true, startTime: rec.startTime, pausedTotal: rec.pausedTotal || 0 });
      } else {
        sendResponse({ record: false });
      }
    } else if (msg?.cmd === 'getState') {
      const rec = await getRec();
      // Expose tracked recording state so the popup can show a live (pause-aware) timer, the
      // captured domain, and per-workflow counts (read-only; the popup adds no new capability).
      let appBaseUrl = '';
      let steps = 0;
      let workflows = 0;
      let workflowStartedAt = 0;
      if (rec.recording) {
        const meta = await kvGet<{ app?: { baseUrl?: string }; markers?: { t: number }[] }>('meta');
        appBaseUrl = meta?.app?.baseUrl || '';
        const markers = meta?.markers || [];
        workflows = markers.length + 1; // current workflow (1-based)
        // The current workflow began at the last marker (ms since start), or at recording start.
        const lastMarkerT = markers.length ? markers[markers.length - 1].t : 0;
        workflowStartedAt = rec.startTime + lastMarkerT;
        // Steps captured in the CURRENT workflow = events at/after the last marker.
        const events = await kvEntriesByPrefix<CapturedEvent>('event:');
        steps = events.filter((e) => (e.value?.t ?? 0) >= lastMarkerT).length;
      }
      sendResponse({
        recording: rec.recording,
        paused: Boolean(rec.paused),
        pausedAt: rec.pausedAt || 0,
        pausedTotal: rec.pausedTotal || 0,
        backendUrl: rec.backendUrl,
        startTime: rec.startTime,
        workflowStartedAt,
        appBaseUrl,
        steps,
        workflows,
      });
    } else if (msg?.cmd === 'connect') {
      // From the Studio /connect page (via the content-script bridge): store the minted token
      // + API URL + workspace identity under the same keys the popup already reads.
      await chrome.storage.local.set({
        apiToken: msg.token,
        backendUrl: msg.backendUrl || 'http://localhost:8787',
        connectedEmail: msg.email || '',
        connectedOrg: msg.org || '',
      });
      sendResponse({ ok: true });
    } else if (msg?.cmd === 'getConnection') {
      const { apiToken, backendUrl, connectedEmail, connectedOrg } = await chrome.storage.local.get([
        'apiToken',
        'backendUrl',
        'connectedEmail',
        'connectedOrg',
      ]);
      sendResponse({
        connected: Boolean(apiToken),
        email: connectedEmail || '',
        org: connectedOrg || '',
        backendUrl: backendUrl || '',
      });
    } else if (msg?.cmd === 'disconnect') {
      await chrome.storage.local.remove(['apiToken', 'connectedEmail', 'connectedOrg']);
      sendResponse({ ok: true });
    } else if (msg?.type === 'audioData') {
      await kvPut('audio', { dataUrl: msg.dataUrl || null, durationMs: msg.durationMs || 0 });
      // Only finalize if we're actually stopping. (If the mic fails at START,
      // the offscreen doc reports null audio immediately — don't finalize then.)
      const rec = await getRec();
      if (rec.stopping) await finalize();
      sendResponse({ ok: true });
    }
  })();
  return true; // async sendResponse
});

// ---- capture port from content scripts ----

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'capture') return;
  // The event's own tab/window — so screenshots capture the tab the user acted in, even when the
  // session spans multiple tabs/windows (R9), not always the primary window.
  const windowId = port.sender?.tab?.windowId;
  port.onMessage.addListener((msg: PortMsg) => {
    handlePortMsg(msg, windowId).catch((e) => console.error('port msg error', e));
  });
});

// R1 — survive full-page navigations: when a recording tab finishes navigating, re-arm the
// freshly-loaded content script with the ORIGINAL startTime so the event timeline stays continuous.
// (Backup to the content script's own `hello` self-arm; the `if (recording) return` guard dedupes.)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  rearmIfRecording(tabId).catch((e) => console.warn('[rearm]', e));
});

// R9 (Option A) — follow tabs opened FROM a recording tab (Sign-in-in-a-new-tab, OAuth popups).
// Adopt into the session's tab set; the new tab self-arms via its `hello` once its page loads.
chrome.tabs.onCreated.addListener((tab) => {
  adoptTabIfChild(tab).catch((e) => console.warn('[adopt]', e));
});
chrome.tabs.onRemoved.addListener((tabId) => {
  pruneTab(tabId).catch(() => {});
});

async function adoptTabIfChild(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id == null || tab.openerTabId == null) return;
  const rec = await getRec();
  if (!rec.recording) return;
  const set = recordingTabs(rec);
  if (set.includes(tab.id) || !set.includes(tab.openerTabId)) return; // only children of a recording tab
  await setRec({ ...rec, tabIds: [...set, tab.id] });
}

async function pruneTab(tabId: number): Promise<void> {
  const rec = await getRec();
  if (!rec.recording || !rec.tabIds?.includes(tabId)) return;
  await setRec({ ...rec, tabIds: rec.tabIds.filter((id) => id !== tabId) });
}

async function rearmIfRecording(tabId: number): Promise<void> {
  const rec = await getRec();
  if (!rec.recording || rec.paused || !recordingTabs(rec).includes(tabId)) return;
  await armTab(tabId, { cmd: 'startCapture', startTime: rec.startTime, pausedTotal: rec.pausedTotal || 0 });
}

async function handlePortMsg(msg: PortMsg, windowId?: number): Promise<void> {
  const rec = await getRec();
  if (!rec.recording) return;
  const shotWindow = windowId ?? rec.windowId; // the tab/window the event came from (R9)

  if (msg.kind === 'appMeta') {
    const meta = (await kvGet<any>('meta')) || { markers: [] };
    meta.app = msg.meta;
    await kvPut('meta', meta);
    return;
  }

  if (msg.kind === 'event') {
    const ev = msg.event;
    // screenshot
    const shot = await captureShot(shotWindow);
    if (shot && ev.screenshot?.file) {
      await kvPut('shot:' + ev.screenshot.file, shot);
    } else {
      ev.screenshot = undefined;
    }
    // dom
    if (ev.domSnapshot?.file) await kvPut('dom:' + ev.domSnapshot.file, msg.domHtml);
    // event record
    const key = `event:${pad(ev.t)}:${ev.id}`;
    idToKey.set(ev.id, key);
    await kvPut(key, ev);
    return;
  }

  if (msg.kind === 'postAction') {
    const key = await findEventKey(msg.eventId);
    if (!key) return;
    const ev = await kvGet<CapturedEvent>(key);
    if (!ev) return;
    const shotFile = `shots/${msg.eventId}-post.png`;
    const domFile = `dom/${msg.eventId}-post.html`;
    const shot = await captureShot(shotWindow);
    if (shot) await kvPut('shot:' + shotFile, shot);
    await kvPut('dom:' + domFile, msg.domHtml);
    ev.postAction = {
      screenshot: shot ? { file: shotFile } : undefined,
      domSnapshot: { file: domFile },
      route: msg.route,
      settleReason: msg.settleReason,
    };
    await kvPut(key, ev);
  }
}

async function findEventKey(id: string): Promise<string | undefined> {
  const cached = idToKey.get(id);
  if (cached) return cached;
  const entries = await kvEntriesByPrefix<CapturedEvent>('event:');
  for (const e of entries) {
    if (e.value?.id === id) {
      idToKey.set(id, e.key);
      return e.key;
    }
  }
  return undefined;
}

// captureVisibleTab is rate-limited (~2/s). Serialize calls and space them out.
function captureShot(windowId?: number): Promise<string | null> {
  const p = captureChain.then(async () => {
    const wait = Math.max(0, 700 - (Date.now() - lastCapture));
    if (wait) await sleep(wait);
    lastCapture = Date.now();
    const opts = { format: 'png' as const };
    try {
      const shot =
        windowId != null
          ? await chrome.tabs.captureVisibleTab(windowId, opts)
          : await chrome.tabs.captureVisibleTab(opts);
      if (!shot) console.warn('[capture] captureVisibleTab returned empty', chrome.runtime.lastError);
      return shot || null;
    } catch (e) {
      console.warn('[capture] captureVisibleTab failed:', (e as Error)?.message || e);
      // Retry once against the current window (no explicit windowId).
      try {
        return await chrome.tabs.captureVisibleTab(opts);
      } catch (e2) {
        console.warn('[capture] retry failed:', (e2 as Error)?.message || e2);
        return null;
      }
    }
  });
  captureChain = p.catch(() => null);
  return p;
}

// ---- lifecycle ----

async function onStart(backendUrl: string, token: string): Promise<{ ok: boolean; error?: string }> {
  if (!token) {
    return { ok: false, error: 'Connect the extension to Sync Studio first.' };
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || /^(chrome|edge|about|chrome-extension):/.test(tab.url)) {
    return { ok: false, error: 'Open the app you want to record in the active tab first (not a browser/internal page).' };
  }

  await kvClear();
  idToKey.clear();
  finalizing = false;
  clearFinalizeFallback(); // cancel any pending fallback from a previous session (never finalize THIS one)
  // Clear the previous session's result + progress so the popup's upload poll can't transition on
  // stale data (the upcoming finalize writes fresh values).
  lastPct = -1;
  await chrome.storage.local.remove('lastUpload');
  await chrome.storage.local.set({ uploadProgress: 0 });
  await setBadge(null);
  const startTime = Date.now();
  await kvPut('meta', { createdAt: new Date().toISOString(), startTime, app: null, markers: [] });
  await setRec({ recording: true, tabId: tab.id, tabIds: [tab.id], windowId: tab.windowId, startTime, backendUrl, token });

  await ensureOffscreen();
  chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'startAudio' }).catch(() => {});

  // Tell the content script to start; inject it if it isn't there yet.
  try {
    await chrome.tabs.sendMessage(tab.id, { cmd: 'startCapture', startTime });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tab.id, { cmd: 'startCapture', startTime });
    } catch (e) {
      return { ok: false, error: 'Could not inject the recorder into this page. Reload the page and try again.' };
    }
  }
  await setBadge('rec'); // toolbar shows REC for the duration
  return { ok: true };
}

async function onStop(): Promise<void> {
  const rec = await getRec();
  if (!rec.recording) return;
  await setRec({ ...rec, recording: false, stopping: true });

  await setBadge('up');
  for (const id of recordingTabs(rec)) chrome.tabs.sendMessage(id, { cmd: 'stopCapture' }).catch(() => {});
  await notifyTab(rec.tabId, { cmd: 'setStatus', phase: 'uploading' });
  chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'stopAudio' }).catch(() => {});

  // Fallback: if the offscreen audio never reports back, finalize without it. Generous (R3) so
  // long recordings have time to stop/encode/flush — don't drop narration by finalizing too early.
  // Tracked + cancelled on finalize/start so a stale timer can't fire into a LATER recording.
  clearFinalizeFallback();
  finalizeFallback = setTimeout(() => { finalize().catch((e) => console.error(e)); }, 30000);
}

async function onMarker(): Promise<void> {
  const rec = await getRec();
  if (!rec.recording) return;
  const meta = (await kvGet<any>('meta')) || { markers: [] };
  meta.markers = meta.markers || [];
  // Marker time is the "active" elapsed (excludes paused spans) so per-workflow timing is honest.
  meta.markers.push({ t: Date.now() - rec.startTime - (rec.pausedTotal || 0) });
  await kvPut('meta', meta);
}

/** Pause capture: detach page listeners, pause narration, freeze the timer (record pausedAt). */
async function onPause(): Promise<void> {
  const rec = await getRec();
  if (!rec.recording || rec.paused) return;
  await setRec({ ...rec, paused: true, pausedAt: Date.now() });
  for (const id of recordingTabs(rec)) chrome.tabs.sendMessage(id, { cmd: 'stopCapture' }).catch(() => {});
  chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'pauseAudio' }).catch(() => {});
  await setBadge('pause');
}

/** Resume capture: re-arm page listeners, resume narration, bank the paused span into pausedTotal. */
async function onResume(): Promise<void> {
  const rec = await getRec();
  if (!rec.recording || !rec.paused) return;
  const pausedSpan = rec.pausedAt ? Date.now() - rec.pausedAt : 0;
  const pausedTotal = (rec.pausedTotal || 0) + pausedSpan;
  await setRec({ ...rec, paused: false, pausedAt: 0, pausedTotal });
  const arm = { cmd: 'startCapture', startTime: rec.startTime, pausedTotal };
  for (const id of recordingTabs(rec)) await armTab(id, arm);
  chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'resumeAudio' }).catch(() => {});
  await setBadge('rec');
}

// ---- finalize: assemble bundle + upload ----

async function finalize(): Promise<void> {
  if (finalizing) return;
  finalizing = true;
  clearFinalizeFallback();

  const rec = await getRec();
  // Safety net: never finalize a session that's actively recording (e.g. a stale fallback timer
  // firing into a newer recording). Bail and re-allow finalize for the real stop.
  if (rec.recording) { finalizing = false; return; }

  // Single result path: EVERY outcome (no events, upload error, exception) reports back
  // via the badge, the stored lastUpload, and the on-page indicator — never silent.
  let result: UploadResult;
  try {
    result = await assembleAndUpload(rec);
  } catch (e) {
    result = { ok: false, error: (e as Error)?.message || 'Recording failed to finalize.' };
  }

  // R2: only wipe the buffer on SUCCESS — keep it on failure so the user can Retry (don't lose a
  // recording to a transient network blip).
  if (result.ok) await kvClear();
  await chrome.storage.local.set({
    lastUpload: { ...result, retryable: result.retryable ?? !result.ok, at: Date.now() },
  });
  await setBadge(result.ok ? 'ok' : 'fail');
  await notifyTab(rec.tabId, {
    cmd: 'setStatus',
    phase: result.ok ? 'done' : 'failed',
    message: result.error,
  });
  console[result.ok ? 'log' : 'error']('[finalize]', result.ok ? `session ${result.sessionId}` : result.error);
  // Mark the session terminal so a late offscreen audioData reply can't re-trigger finalize.
  await setRec({ ...(await getRec()), stopping: false });
  await ensureClosed();
}

/** "Start fresh" from the interrupted screen: drop the unsent recording + result, clear the badge. */
async function onDiscard(): Promise<void> {
  const rec = await getRec();
  if (rec.recording) return; // never discard an in-progress capture
  finalizing = false;
  clearFinalizeFallback();
  await kvClear();
  idToKey.clear();
  lastPct = -1;
  await chrome.storage.local.remove('lastUpload');
  await chrome.storage.local.set({ uploadProgress: 0 });
  await setBadge(null);
}

/** R2 — re-attempt the upload from the buffer kept after a failed finalize (triggered from the popup). */
async function onRetryUpload(): Promise<{ ok: boolean; error?: string }> {
  const { lastUpload } = await chrome.storage.local.get('lastUpload');
  if (lastUpload?.ok) return { ok: true };
  const rec = await getRec();
  await setBadge('up');
  let result: UploadResult;
  try {
    result = await assembleAndUpload(rec);
  } catch (e) {
    result = { ok: false, error: (e as Error)?.message || 'Retry failed.' };
  }
  if (result.ok) await kvClear();
  await chrome.storage.local.set({
    lastUpload: { ...result, retryable: result.retryable ?? !result.ok, at: Date.now() },
  });
  await setBadge(result.ok ? 'ok' : 'fail');
  return { ok: result.ok, error: result.error };
}

/** Build the bundle from IndexedDB and POST it. Throws on assembly errors (caught by finalize). */
async function assembleAndUpload(rec: Rec): Promise<UploadResult> {
  const meta = (await kvGet<any>('meta')) || {};
  const eventEntries = await kvEntriesByPrefix<CapturedEvent>('event:');
  eventEntries.sort((a, b) => (a.key < b.key ? -1 : 1));
  const events = eventEntries.map((e) => e.value);

  if (events.length === 0) {
    // Retrying can't help (the buffer has no events) — surface it as a plain error, not the retry screen.
    return {
      ok: false,
      retryable: false,
      error:
        'No interaction events were captured. Click elements directly in the page (recording ignores embedded iframes) and avoid full-page reloads while recording.',
    };
  }

  const audio = await kvGet<{ dataUrl: string | null; durationMs: number }>('audio');

  const manifest = {
    id: '',
    createdAt: meta.createdAt || new Date().toISOString(),
    app: meta.app || { baseUrl: '', userAgent: navigator.userAgent, viewport: { w: 0, h: 0 }, devicePixelRatio: 1 },
    audio: audio?.dataUrl ? { file: 'audio.webm', durationMs: audio.durationMs } : undefined,
    video: null,
    markers: meta.markers || [],
    events,
  };

  const shotEntries = await kvEntriesByPrefix<string>('shot:');
  console.log(`[capture] summary: events=${events.length}, screenshots=${shotEntries.length}, audio=${audio?.dataUrl ? 'yes' : 'no'}`);

  // Each file's relative PATH rides on the field NAME (multipart strips directories from
  // filenames), matching what the API expects. `manifest` is a plain text field (no filename).
  const parts: Part[] = [{ name: 'manifest', body: JSON.stringify(manifest) }];
  if (audio?.dataUrl) {
    parts.push({ name: 'audio.webm', filename: 'audio.webm', contentType: 'audio/webm', body: await dataUrlToBlob(audio.dataUrl) });
  }
  for (const { key, value } of shotEntries) {
    const rel = key.slice('shot:'.length);
    parts.push({ name: rel, filename: rel, contentType: 'image/png', body: await dataUrlToBlob(value) });
  }
  for (const { key, value } of await kvEntriesByPrefix<string>('dom:')) {
    const rel = key.slice('dom:'.length);
    parts.push({ name: rel, filename: rel, contentType: 'text/html', body: new Blob([value], { type: 'text/html' }) });
  }

  const apiBase = (rec.backendUrl || 'http://localhost:8787').replace(/\/$/, '');
  const url = `${apiBase}/v1/sessions`;
  const authHeaders: Record<string, string> = rec.token ? { Authorization: `Bearer ${rec.token}` } : {};
  // Plain multipart POST — no upload progress (fetch(FormData) exposes none), so the popup shows an
  // indeterminate bar (-1). This is the reliable path that works on HTTP/1.1.
  const plainUpload = (): Promise<Response> => {
    void setUploadProgress(-1);
    return fetch(url, { method: 'POST', headers: authHeaders, body: partsToFormData(parts) });
  };

  await setUploadProgress(0);
  let res: Response;
  try {
    // Streamed body gives byte-progress (capped at 90% + a "finishing" tail — see streamingUpload),
    // but Chrome only allows a streaming request body over HTTP/2 (TLS); plaintext localhost is
    // HTTP/1.1, where it throws. So only stream over https.
    res = url.startsWith('https:')
      ? await streamingUpload(url, rec.token, parts, (pct) => void setUploadProgress(pct))
      : await plainUpload();
  } catch {
    // Streaming failed (e.g. the host didn't negotiate HTTP/2) — fall back to the plain POST.
    try {
      res = await plainUpload();
    } catch (e) {
      return { ok: false, error: `Could not reach the Sync API at ${apiBase} — is it running? (${(e as Error)?.message || 'network error'})` };
    }
  }

  const json = await res.json().catch(() => ({}));
  if (res.ok && json?.sessionId) {
    await setUploadProgress(100);
    return { ok: true, sessionId: json.sessionId };
  }
  return { ok: false, error: json?.error || `Upload failed (HTTP ${res.status})` };
}

/** Plain multipart body — the HTTP/1.1 fallback for streamingUpload (same field/filename shape). */
function partsToFormData(parts: Part[]): FormData {
  const fd = new FormData();
  for (const p of parts) {
    if (typeof p.body === 'string') fd.append(p.name, p.body);
    else fd.append(p.name, p.body, p.filename);
  }
  return fd;
}

/** Persist upload progress (0–100) for the popup's determinate bar; throttled to percent changes. */
let lastPct = -1;
async function setUploadProgress(pct: number): Promise<void> {
  if (pct === lastPct) return;
  lastPct = pct;
  try {
    await chrome.storage.local.set({ uploadProgress: pct });
  } catch {
    /* ignore */
  }
}

interface Part {
  name: string;
  filename?: string;
  contentType?: string;
  body: Blob | string;
}

/**
 * Stream a multipart/form-data body to the API and report progress. MV3 service workers have no
 * XMLHttpRequest, and plain `fetch(FormData)` exposes no upload events — so we hand `fetch` a
 * ReadableStream and count bytes as they're pulled. Two honesty caveats drive the mapping:
 *  - "bytes pulled" = bytes handed to the browser's send buffer, which races ahead of the wire, so
 *    we cap byte-progress at 90% (never let enqueuing alone claim "done").
 *  - after the last byte we still await the server receiving + processing the body, so we emit a
 *    FINISHING sentinel (-2) for that tail. 100% is reserved for the server's success response.
 * Needs `duplex: 'half'` (Chrome only allows a streaming request body over HTTP/2).
 */
const FINISHING = -2;
async function streamingUpload(
  url: string,
  token: string | undefined,
  parts: Part[],
  report: (pct: number) => void,
): Promise<Response> {
  const enc = new TextEncoder();
  const CRLF = '\r\n';
  const boundary = `----SyncRecorder${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;

  const segments = parts.map((p) => {
    let head = `--${boundary}${CRLF}Content-Disposition: form-data; name="${p.name}"`;
    if (p.filename) head += `; filename="${p.filename}"`;
    head += CRLF;
    if (p.contentType) head += `Content-Type: ${p.contentType}${CRLF}`;
    head += CRLF;
    const body = typeof p.body === 'string' ? enc.encode(p.body) : p.body;
    const size = body instanceof Uint8Array ? body.byteLength : body.size;
    return { header: enc.encode(head), body, size };
  });
  const closing = enc.encode(`--${boundary}--${CRLF}`);

  let total = closing.byteLength;
  for (const s of segments) total += s.header.byteLength + s.size + 2; // + trailing CRLF per part

  async function* chunks(): AsyncGenerator<Uint8Array> {
    for (const seg of segments) {
      yield seg.header;
      if (seg.body instanceof Uint8Array) {
        yield seg.body;
      } else {
        const reader = seg.body.stream().getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          yield value;
        }
      }
      yield enc.encode(CRLF);
    }
    yield closing;
  }

  let sent = 0;
  const iter = chunks();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await iter.next();
      if (done) {
        controller.close();
        report(FINISHING); // all bytes handed off — now the server receives + processes the tail
        return;
      }
      controller.enqueue(value);
      sent += value.byteLength;
      // Cap at 90%: enqueuing outruns the wire, and the server-processing tail is still ahead.
      report(total ? Math.round((sent / total) * 90) : 0);
    },
  });

  const init = {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: stream,
    duplex: 'half', // required by Chrome when streaming a request body
  };
  return fetch(url, init as RequestInit);
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return await (await fetch(dataUrl)).blob();
}

/** Toolbar badge state machine: REC while recording, II paused, ↑ uploading, ✓ done, ! failed, clear. */
type Badge = 'rec' | 'pause' | 'up' | 'ok' | 'fail';
const BADGE: Record<Badge, { text: string; color: string }> = {
  rec: { text: 'REC', color: '#d12f2f' },
  pause: { text: 'II', color: '#6b7180' },
  up: { text: '↑', color: '#b07407' },
  ok: { text: '✓', color: '#1a8a4f' },
  fail: { text: '!', color: '#c0392b' },
};

async function setBadge(state: Badge | null): Promise<void> {
  // Toolbar action icon: blink a red dot while recording, a steady dot when paused, the logo
  // otherwise — so the recording state reads from the toolbar even with the popup closed.
  if (state === 'rec') startRecBlink();
  else if (state === 'pause') { stopRecBlink(); setActionIcon('rec-on'); }
  else { stopRecBlink(); setActionIcon('logo'); }

  try {
    if (state === null) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }
    await chrome.action.setBadgeText({ text: BADGE[state].text });
    await chrome.action.setBadgeBackgroundColor({ color: BADGE[state].color });
  } catch {
    /* ignore */
  }
}

// ---- recording icon (blinking red dot) ----

let iconTimer: number | null = null;

function setActionIcon(frame: 'rec-on' | 'rec-off' | 'logo'): void {
  const path: Record<number, string> =
    frame === 'logo'
      ? { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' }
      : { 16: `icons/${frame}-16.png`, 32: `icons/${frame}-32.png`, 48: `icons/${frame}-48.png` };
  chrome.action.setIcon({ path }).catch(() => {});
}

function startRecBlink(): void {
  stopRecBlink();
  let on = true;
  setActionIcon('rec-on');
  // The content script's long-lived capture port keeps the worker alive during recording, so this
  // interval ticks; if the worker is ever evicted, the icon just freezes on a (still-red) frame.
  iconTimer = setInterval(() => {
    on = !on;
    setActionIcon(on ? 'rec-on' : 'rec-off');
  }, 650) as unknown as number;
}

function stopRecBlink(): void {
  if (iconTimer != null) { clearInterval(iconTimer); iconTimer = null; }
}

// If the worker restarts mid-recording (timers don't survive restarts), re-establish the icon.
void getRec().then((r) => {
  if (!r.recording) return;
  if (r.paused) setActionIcon('rec-on');
  else startRecBlink();
});

/** Drive the on-page indicator in the recorded tab (best-effort; the tab may be gone). */
async function notifyTab(tabId: number | undefined, msg: object): Promise<void> {
  if (tabId == null) return;
  try {
    await chrome.tabs.sendMessage(tabId, msg);
  } catch {
    /* tab closed/navigated — toolbar badge + popup still convey state */
  }
}

// ---- offscreen helpers ----

async function ensureOffscreen(): Promise<void> {
  try {
    if (chrome.offscreen.hasDocument && (await chrome.offscreen.hasDocument())) return;
  } catch { /* fall through */ }
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA' as chrome.offscreen.Reason],
      justification: 'Record narration audio for the session.',
    });
  } catch { /* already exists */ }
}

async function ensureClosed(): Promise<void> {
  try {
    await chrome.offscreen.closeDocument();
  } catch { /* none open */ }
}
