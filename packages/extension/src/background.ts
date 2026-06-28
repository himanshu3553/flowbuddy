// Background service worker: owns recording lifecycle, captures screenshots,
// buffers everything in IndexedDB, and uploads the assembled bundle on stop.

import { kvClear, kvCountByPrefix, kvEntriesByPrefix, kvGet, kvPut } from './idb.js';
import type { CapturedEvent, PortMsg } from './types.js';

interface Rec {
  recording: boolean;
  stopping?: boolean;
  tabId?: number;
  windowId?: number;
  startTime: number;
  backendUrl: string;
  token?: string;
}

const idToKey = new Map<string, string>();
let captureChain: Promise<unknown> = Promise.resolve();
let lastCapture = 0;
let finalizing = false;

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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.cmd === 'start') {
      sendResponse(await onStart(msg.backendUrl, msg.token));
    } else if (msg?.cmd === 'stop') {
      await onStop();
      sendResponse({ ok: true });
    } else if (msg?.cmd === 'marker') {
      await onMarker();
      sendResponse({ ok: true });
    } else if (msg?.cmd === 'retryUpload') {
      sendResponse(await onRetryUpload());
    } else if (msg?.cmd === 'getState') {
      const rec = await getRec();
      // Expose already-tracked recording state so the popup can show a live timer,
      // the captured domain, and step/workflow counts (read-only; no new capability).
      let appBaseUrl = '';
      let steps = 0;
      let workflows = 0;
      if (rec.recording) {
        const meta = await kvGet<{ app?: { baseUrl?: string }; markers?: unknown[] }>('meta');
        appBaseUrl = meta?.app?.baseUrl || '';
        workflows = (meta?.markers?.length || 0) + 1; // current workflow (1-based)
        steps = await kvCountByPrefix('event:');
      }
      sendResponse({
        recording: rec.recording,
        backendUrl: rec.backendUrl,
        startTime: rec.startTime,
        appBaseUrl,
        steps,
        workflows,
      });
    } else if (msg?.cmd === 'connect') {
      // From the Studio /connect page (via the content-script bridge): store the minted token
      // + API URL under the same keys the popup already reads.
      await chrome.storage.local.set({
        apiToken: msg.token,
        backendUrl: msg.backendUrl || 'http://localhost:8787',
        connectedEmail: msg.email || '',
      });
      sendResponse({ ok: true });
    } else if (msg?.cmd === 'getConnection') {
      const { apiToken, backendUrl, connectedEmail } = await chrome.storage.local.get([
        'apiToken',
        'backendUrl',
        'connectedEmail',
      ]);
      sendResponse({ connected: Boolean(apiToken), email: connectedEmail || '', backendUrl: backendUrl || '' });
    } else if (msg?.cmd === 'disconnect') {
      await chrome.storage.local.remove(['apiToken', 'connectedEmail']);
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
  port.onMessage.addListener((msg: PortMsg) => {
    handlePortMsg(msg).catch((e) => console.error('port msg error', e));
  });
});

// R1 — survive full-page navigations: when the recording tab finishes navigating, re-arm the
// freshly-loaded content script with the ORIGINAL startTime so the event timeline stays continuous
// (a hard nav destroys the old content script, which would otherwise silently stop capture).
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  rearmIfRecording(tabId).catch((e) => console.warn('[rearm]', e));
});

async function rearmIfRecording(tabId: number): Promise<void> {
  const rec = await getRec();
  if (!rec.recording || rec.tabId !== tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, { cmd: 'startCapture', startTime: rec.startTime });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tabId, { cmd: 'startCapture', startTime: rec.startTime });
    } catch (e) {
      console.warn('[rearm] could not re-arm after navigation', e);
    }
  }
}

async function handlePortMsg(msg: PortMsg): Promise<void> {
  const rec = await getRec();
  if (!rec.recording) return;

  if (msg.kind === 'appMeta') {
    const meta = (await kvGet<any>('meta')) || { markers: [] };
    meta.app = msg.meta;
    await kvPut('meta', meta);
    return;
  }

  if (msg.kind === 'event') {
    const ev = msg.event;
    // screenshot
    const shot = await captureShot(rec.windowId);
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
    const shot = await captureShot(rec.windowId);
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
  await setBadge(null);
  const startTime = Date.now();
  await kvPut('meta', { createdAt: new Date().toISOString(), startTime, app: null, markers: [] });
  await setRec({ recording: true, tabId: tab.id, windowId: tab.windowId, startTime, backendUrl, token });

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
  if (rec.tabId) {
    chrome.tabs.sendMessage(rec.tabId, { cmd: 'stopCapture' }).catch(() => {});
    await notifyTab(rec.tabId, { cmd: 'setStatus', phase: 'uploading' });
  }
  chrome.runtime.sendMessage({ target: 'offscreen', cmd: 'stopAudio' }).catch(() => {});

  // Fallback: if the offscreen audio never reports back, finalize without it. Generous (R3) so
  // long recordings have time to stop/encode/flush — don't drop narration by finalizing too early.
  setTimeout(() => { finalize().catch((e) => console.error(e)); }, 30000);
}

async function onMarker(): Promise<void> {
  const rec = await getRec();
  if (!rec.recording) return;
  const meta = (await kvGet<any>('meta')) || { markers: [] };
  meta.markers = meta.markers || [];
  meta.markers.push({ t: Date.now() - rec.startTime });
  await kvPut('meta', meta);
}

// ---- finalize: assemble bundle + upload ----

async function finalize(): Promise<void> {
  if (finalizing) return;
  finalizing = true;

  const rec = await getRec();
  // Single result path: EVERY outcome (no events, upload error, exception) reports back
  // via the badge, the stored lastUpload, and the on-page indicator — never silent.
  let result: { ok: boolean; sessionId?: string; error?: string };
  try {
    result = await assembleAndUpload(rec);
  } catch (e) {
    result = { ok: false, error: (e as Error)?.message || 'Recording failed to finalize.' };
  }

  // R2: only wipe the buffer on SUCCESS — keep it on failure so the user can Retry (don't lose a
  // recording to a transient network blip).
  if (result.ok) await kvClear();
  await chrome.storage.local.set({ lastUpload: { ...result, retryable: !result.ok, at: Date.now() } });
  await setBadge(result.ok ? 'ok' : 'fail');
  await notifyTab(rec.tabId, {
    cmd: 'setStatus',
    phase: result.ok ? 'done' : 'failed',
    message: result.error,
  });
  console[result.ok ? 'log' : 'error']('[finalize]', result.ok ? `session ${result.sessionId}` : result.error);
  await ensureClosed();
}

/** R2 — re-attempt the upload from the buffer kept after a failed finalize (triggered from the popup). */
async function onRetryUpload(): Promise<{ ok: boolean; error?: string }> {
  const { lastUpload } = await chrome.storage.local.get('lastUpload');
  if (lastUpload?.ok) return { ok: true };
  const rec = await getRec();
  await setBadge('up');
  let result: { ok: boolean; sessionId?: string; error?: string };
  try {
    result = await assembleAndUpload(rec);
  } catch (e) {
    result = { ok: false, error: (e as Error)?.message || 'Retry failed.' };
  }
  if (result.ok) await kvClear();
  await chrome.storage.local.set({ lastUpload: { ...result, retryable: !result.ok, at: Date.now() } });
  await setBadge(result.ok ? 'ok' : 'fail');
  return { ok: result.ok, error: result.error };
}

/** Build the bundle from IndexedDB and POST it. Throws on assembly errors (caught by finalize). */
async function assembleAndUpload(rec: Rec): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
  const meta = (await kvGet<any>('meta')) || {};
  const eventEntries = await kvEntriesByPrefix<CapturedEvent>('event:');
  eventEntries.sort((a, b) => (a.key < b.key ? -1 : 1));
  const events = eventEntries.map((e) => e.value);

  if (events.length === 0) {
    return {
      ok: false,
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

  // Send each file's relative path as the FIELD NAME (multipart strips directories
  // from the filename, so the path must ride on the field name).
  const fd = new FormData();
  fd.append('manifest', JSON.stringify(manifest));
  if (audio?.dataUrl) fd.append('audio.webm', await dataUrlToBlob(audio.dataUrl), 'audio.webm');

  for (const { key, value } of shotEntries) {
    const rel = key.slice('shot:'.length);
    fd.append(rel, await dataUrlToBlob(value), rel);
  }
  for (const { key, value } of await kvEntriesByPrefix<string>('dom:')) {
    const rel = key.slice('dom:'.length);
    fd.append(rel, new Blob([value], { type: 'text/html' }), rel);
  }

  const apiBase = (rec.backendUrl || 'http://localhost:8787').replace(/\/$/, '');
  try {
    const res = await fetch(`${apiBase}/v1/sessions`, {
      method: 'POST',
      headers: rec.token ? { Authorization: `Bearer ${rec.token}` } : {},
      body: fd,
    });
    const json = await res.json().catch(() => ({}));
    return res.ok && json?.sessionId
      ? { ok: true, sessionId: json.sessionId }
      : { ok: false, error: json?.error || `Upload failed (HTTP ${res.status})` };
  } catch (e) {
    return { ok: false, error: `Could not reach the Sync API at ${apiBase} — is it running? (${(e as Error)?.message || 'network error'})` };
  }
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return await (await fetch(dataUrl)).blob();
}

/** Toolbar badge state machine: REC while recording, ↑ uploading, ✓ done, ! failed, clear. */
type Badge = 'rec' | 'up' | 'ok' | 'fail';
const BADGE: Record<Badge, { text: string; color: string }> = {
  rec: { text: 'REC', color: '#d12f2f' },
  up: { text: '↑', color: '#b07407' },
  ok: { text: '✓', color: '#1a8a4f' },
  fail: { text: '!', color: '#c0392b' },
};

async function setBadge(state: Badge | null): Promise<void> {
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
