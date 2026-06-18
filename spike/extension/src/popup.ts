// Popup UI: backend URL, mic permission, and start/stop/marker controls.

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const backendInput = $<HTMLInputElement>('backend');
const grantMicBtn = $<HTMLButtonElement>('grantMic');
const startBtn = $<HTMLButtonElement>('start');
const stopBtn = $<HTMLButtonElement>('stop');
const markerBtn = $<HTMLButtonElement>('marker');
const micStatus = $<HTMLDivElement>('micStatus');
const dot = $<HTMLSpanElement>('dot');
const statusText = $<HTMLSpanElement>('statusText');

const DEFAULT_BACKEND = 'http://localhost:8787';

init();

async function init(): Promise<void> {
  const { backendUrl } = await chrome.storage.local.get('backendUrl');
  backendInput.value = backendUrl || DEFAULT_BACKEND;

  await refreshMic();
  const state = await send({ cmd: 'getState' });
  setRecordingUI(Boolean(state?.recording));

  grantMicBtn.addEventListener('click', grantMic);
  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);
  markerBtn.addEventListener('click', () => send({ cmd: 'marker' }));
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
  const backendUrl = (backendInput.value || DEFAULT_BACKEND).trim();
  await chrome.storage.local.set({ backendUrl });
  const res = await send({ cmd: 'start', backendUrl });
  if (res?.ok) {
    setRecordingUI(true);
  } else {
    statusText.textContent = res?.error || 'Could not start recording.';
  }
}

async function stop(): Promise<void> {
  setRecordingUI(false);
  statusText.textContent = 'Processing… the KB tab will open when synthesis finishes.';
  dot.className = 'dot';
  await send({ cmd: 'stop' });
}

function setRecordingUI(recording: boolean): void {
  startBtn.disabled = recording;
  stopBtn.disabled = !recording;
  markerBtn.disabled = !recording;
  backendInput.disabled = recording;
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
