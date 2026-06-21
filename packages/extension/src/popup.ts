// Popup UI: connect/disconnect to Sync Studio, mic permission, and start/stop/marker controls.
// The API URL + token are no longer typed here — they arrive via the "Connect" flow.

declare const __STUDIO_URL__: string; // baked at build time (build.mjs)

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const conn = $<HTMLDivElement>('conn');
const grantMicBtn = $<HTMLButtonElement>('grantMic');
const startBtn = $<HTMLButtonElement>('start');
const stopBtn = $<HTMLButtonElement>('stop');
const markerBtn = $<HTMLButtonElement>('marker');
const micStatus = $<HTMLDivElement>('micStatus');
const statusBox = $<HTMLDivElement>('status');
const dot = $<HTMLSpanElement>('dot');
const statusText = $<HTMLSpanElement>('statusText');

let connected = false;
let recording = false;

init();

async function init(): Promise<void> {
  await refreshConnection();
  await refreshMic();
  const state = await send({ cmd: 'getState' });
  setRecordingUI(Boolean(state?.recording));
  if (!state?.recording) {
    const { lastUpload } = await chrome.storage.local.get('lastUpload');
    if (lastUpload) showLastUpload(lastUpload);
  }

  grantMicBtn.addEventListener('click', grantMic);
  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);
  markerBtn.addEventListener('click', () => send({ cmd: 'marker' }));
}

/** Render the connection row (Connected as … / Disconnect, or Connect to Sync Studio). */
async function refreshConnection(): Promise<void> {
  const c = await send({ cmd: 'getConnection' });
  connected = Boolean(c?.connected);
  conn.textContent = '';
  conn.className = connected ? 'conn on' : 'conn';

  const who = document.createElement('span');
  who.className = 'who';
  const btn = document.createElement('button');

  if (connected) {
    who.textContent = c.email ? `✓ Connected as ${c.email}` : '✓ Connected to Sync';
    btn.textContent = 'Disconnect';
    btn.className = 'ghost';
    btn.onclick = async () => { await send({ cmd: 'disconnect' }); await refreshConnection(); applyButtonState(); };
  } else {
    who.textContent = 'Not connected to Sync';
    btn.id = 'connect';
    btn.textContent = 'Connect';
    btn.onclick = () => { chrome.tabs.create({ url: `${__STUDIO_URL__}/connect` }); window.close(); };
  }
  conn.append(who, btn);
  applyButtonState();
}

function showLastUpload(u: { ok: boolean; sessionId?: string; error?: string }): void {
  if (u.ok) setStatus(`Last upload ✓ (${u.sessionId?.slice(0, 8)}…)`, 'ok');
  else setStatus(`Last upload failed — ${u.error}`, 'fail');
}

async function refreshMic(): Promise<void> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    if (status.state === 'granted') {
      micStatus.textContent = '✓ microphone granted';
      micStatus.className = 'mic-ok';
      grantMicBtn.disabled = true;
    } else {
      micStatus.textContent = '⚠ microphone not granted — click to enable narration';
      micStatus.className = 'mic-bad';
    }
  } catch {
    micStatus.textContent = 'Click "Grant microphone" before recording.';
  }
}

async function grantMic(): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
  micStatus.textContent = 'A tab opened — click Allow there, then reopen this popup.';
  micStatus.className = '';
}

async function start(): Promise<void> {
  const { apiToken, backendUrl } = await chrome.storage.local.get(['apiToken', 'backendUrl']);
  if (!apiToken) {
    setStatus('Connect to Sync Studio first.', 'fail');
    return;
  }
  const res = await send({ cmd: 'start', backendUrl, token: apiToken });
  if (res?.ok) setRecordingUI(true);
  else setStatus(res?.error || 'Could not start recording.', 'fail');
}

async function stop(): Promise<void> {
  setRecordingUI(false);
  setStatus('Uploading… watch the toolbar badge (REC → ↑ → ✓/!) or the on-page toast.', 'neutral');
  dot.className = 'dot';
  await send({ cmd: 'stop' });
}

function setRecordingUI(isRecording: boolean): void {
  recording = isRecording;
  dot.className = recording ? 'dot live' : 'dot';
  if (recording) setStatus('REC · Recording — narrate & click through your workflow.', 'rec');
  else setStatus('Idle', 'neutral');
  applyButtonState();
}

/** Start needs a connection + not already recording; stop/marker need an active recording. */
function applyButtonState(): void {
  startBtn.disabled = recording || !connected;
  stopBtn.disabled = !recording;
  markerBtn.disabled = !recording;
}

/** Set the status line text + colour (neutral / recording / green ok / red fail). */
function setStatus(text: string, kind: 'neutral' | 'rec' | 'ok' | 'fail' = 'neutral'): void {
  statusText.textContent = text;
  statusBox.className = kind === 'neutral' ? 'status' : `status ${kind}`;
}

function send(msg: unknown): Promise<any> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      void chrome.runtime.lastError;
      resolve(resp);
    });
  });
}
