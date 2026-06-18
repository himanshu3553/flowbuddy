// Popup UI: API URL, workspace token, mic permission, and start/stop/marker controls.

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const backendInput = $<HTMLInputElement>('backend');
const tokenInput = $<HTMLInputElement>('token');
const grantMicBtn = $<HTMLButtonElement>('grantMic');
const startBtn = $<HTMLButtonElement>('start');
const stopBtn = $<HTMLButtonElement>('stop');
const markerBtn = $<HTMLButtonElement>('marker');
const micStatus = $<HTMLDivElement>('micStatus');
const dot = $<HTMLSpanElement>('dot');
const statusText = $<HTMLSpanElement>('statusText');

const DEFAULT_API = 'http://localhost:8787';

init();

async function init(): Promise<void> {
  const { backendUrl, apiToken, lastUpload } = await chrome.storage.local.get([
    'backendUrl',
    'apiToken',
    'lastUpload',
  ]);
  backendInput.value = backendUrl || DEFAULT_API;
  tokenInput.value = apiToken || '';

  await refreshMic();
  const state = await send({ cmd: 'getState' });
  setRecordingUI(Boolean(state?.recording));
  if (!state?.recording && lastUpload) showLastUpload(lastUpload);

  grantMicBtn.addEventListener('click', grantMic);
  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);
  markerBtn.addEventListener('click', () => send({ cmd: 'marker' }));
}

function showLastUpload(u: { ok: boolean; sessionId?: string; error?: string }): void {
  statusText.textContent = u.ok
    ? `Last upload ✓ (${u.sessionId?.slice(0, 8)}…)`
    : `Last upload failed: ${u.error}`;
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
  // Prompt from a real tab — the popup can't reliably show the mic dialog.
  await chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
  micStatus.textContent = 'A tab opened — click Allow there, then reopen this popup.';
  micStatus.className = '';
}

async function start(): Promise<void> {
  const backendUrl = (backendInput.value || DEFAULT_API).trim();
  const token = tokenInput.value.trim();
  if (!token) {
    statusText.textContent = 'Paste your workspace API token first.';
    return;
  }
  await chrome.storage.local.set({ backendUrl, apiToken: token });
  const res = await send({ cmd: 'start', backendUrl, token });
  if (res?.ok) {
    setRecordingUI(true);
  } else {
    statusText.textContent = res?.error || 'Could not start recording.';
  }
}

async function stop(): Promise<void> {
  setRecordingUI(false);
  statusText.textContent = 'Uploading… watch the toolbar badge (✓ / !).';
  dot.className = 'dot';
  await send({ cmd: 'stop' });
}

function setRecordingUI(recording: boolean): void {
  startBtn.disabled = recording;
  stopBtn.disabled = !recording;
  markerBtn.disabled = !recording;
  backendInput.disabled = recording;
  tokenInput.disabled = recording;
  dot.className = recording ? 'dot live' : 'dot';
  statusText.textContent = recording ? 'Recording…' : 'Idle';
}

function send(msg: unknown): Promise<any> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      void chrome.runtime.lastError;
      resolve(resp);
    });
  });
}
