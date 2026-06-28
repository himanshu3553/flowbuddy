// Popup UI — a 4-state machine (idle · recording · uploading · retry) mirroring the Sync design.
// Real data: connection email, live REC timer, captured domain + step/workflow counts (from
// getState). Placeholders (no backing capability): Mask-PII toggle (always on), mic level, Pause,
// upload progress (indeterminate), and the partial "N of M" retry count.

declare const __STUDIO_URL__: string; // baked at build time (build.mjs)

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const body = document.body;

let connected = false;
let email = '';
let recStart = 0; // startTime for the live timer
let ticker: number | null = null;
let poller: number | null = null;

init();

async function init(): Promise<void> {
  const c = await send({ cmd: 'getConnection' });
  connected = Boolean(c?.connected);
  email = c?.email || '';

  const state = await send({ cmd: 'getState' });
  wire();

  if (state?.recording) {
    enterRecording(state);
    return;
  }
  if (!connected) {
    setState('disconnected');
    return;
  }
  const { lastUpload } = await chrome.storage.local.get('lastUpload');
  if (lastUpload && !lastUpload.ok && lastUpload.retryable) enterRetry(lastUpload);
  else enterIdle(lastUpload);
}

function setState(s: string): void {
  body.dataset.state = s;
  if (s !== 'recording') stopTimers();
}

function stopTimers(): void {
  if (ticker != null) { clearInterval(ticker); ticker = null; }
  if (poller != null) { clearInterval(poller); poller = null; }
}

// ---- views ----

function enterIdle(lastUpload?: { ok?: boolean; sessionId?: string }): void {
  $('connWho').textContent = email ? `✓ Connected as ${email}` : '✓ Connected to Sync';
  renderRecent(lastUpload);
  void refreshMic();
  setState('idle');
}

function renderRecent(lastUpload?: { ok?: boolean; sessionId?: string }): void {
  const recent = $('recent');
  if (lastUpload?.ok && lastUpload.sessionId) {
    recent.textContent = '';
    const row = document.createElement('div');
    row.className = 'recent-row';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = `Session ${String(lastUpload.sessionId).slice(0, 8)}…`;
    const badge = document.createElement('span');
    badge.className = 'badge-ok';
    badge.textContent = 'uploaded';
    row.append(name, badge);
    recent.appendChild(row);
  } else {
    recent.innerHTML = '<p class="empty">No recordings yet.</p>';
  }
}

interface RecState { recording?: boolean; startTime?: number; appBaseUrl?: string; steps?: number; workflows?: number }

function enterRecording(state: RecState): void {
  recStart = state.startTime || Date.now();
  $('recDomain').textContent = hostOf(state.appBaseUrl || '');
  updateRecCounts(state.steps ?? 0, state.workflows ?? 1);
  setState('recording');
  tick();
  ticker = setInterval(tick, 1000) as unknown as number;
  poller = setInterval(pollCounts, 2000) as unknown as number;
}

function updateRecCounts(steps: number, workflows: number): void {
  $('recWorkflow').textContent = `Workflow ${workflows}`;
  $('recSteps').textContent = `${steps} step${steps === 1 ? '' : 's'} captured`;
}

function tick(): void {
  $('recTimer').textContent = `REC · ${fmt(Date.now() - recStart)}`;
}

async function pollCounts(): Promise<void> {
  const s: RecState = await send({ cmd: 'getState' });
  if (!s?.recording) { stopTimers(); return; }
  updateRecCounts(s.steps ?? 0, s.workflows ?? 1);
}

function enterRetry(lastUpload: { error?: string }): void {
  $('retryDetail').textContent = lastUpload?.error ? `Last error: ${lastUpload.error}` : '';
  setState('retry');
}

// ---- handlers ----

function wire(): void {
  $('settingsGear').addEventListener('click', () => {
    chrome.tabs.create({ url: `${__STUDIO_URL__}/dashboard/settings` });
  });
  $('connectBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: `${__STUDIO_URL__}/connect` });
    window.close();
  });
  $('disconnectBtn').addEventListener('click', async () => {
    await send({ cmd: 'disconnect' });
    connected = false;
    setState('disconnected');
  });
  $('grantMic').addEventListener('click', grantMic);
  $('start').addEventListener('click', start);
  $('marker').addEventListener('click', async () => { await send({ cmd: 'marker' }); await pollCounts(); });
  $('stop').addEventListener('click', stop);
  $('retry').addEventListener('click', retry);
  $('resumeLater').addEventListener('click', () => window.close());
}

async function start(): Promise<void> {
  const { apiToken, backendUrl } = await chrome.storage.local.get(['apiToken', 'backendUrl']);
  if (!apiToken) { setState('disconnected'); return; }
  const res = await send({ cmd: 'start', backendUrl, token: apiToken });
  if (res?.ok) {
    const s = await send({ cmd: 'getState' });
    enterRecording(s || { startTime: Date.now() });
  } else {
    const micStatus = $('micStatus');
    micStatus.textContent = `⚠ ${res?.error || 'Could not start recording.'}`;
    micStatus.className = 'mic-bad';
  }
}

async function stop(): Promise<void> {
  const s: RecState = await send({ cmd: 'getState' });
  const durationMs = recStart ? Date.now() - recStart : 0;
  const workflows = s?.workflows ?? 1;
  $('upMeta').textContent = `${fmt(durationMs)} · ${workflows} workflow${workflows === 1 ? '' : 's'} · narration saved`;
  setState('uploading');
  await send({ cmd: 'stop' });
}

async function retry(): Promise<void> {
  const btn = $<HTMLButtonElement>('retry');
  btn.disabled = true;
  $('retryDetail').textContent = 'Retrying upload…';
  const res = await send({ cmd: 'retryUpload' });
  if (res?.ok) {
    const { lastUpload } = await chrome.storage.local.get('lastUpload');
    enterIdle(lastUpload);
  } else {
    $('retryDetail').textContent = `Retry failed — ${res?.error || 'unknown error'}`;
    btn.disabled = false;
  }
}

async function refreshMic(): Promise<void> {
  const micStatus = $('micStatus');
  const grant = $<HTMLButtonElement>('grantMic');
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    if (status.state === 'granted') {
      micStatus.textContent = '✓ microphone granted';
      micStatus.className = 'mic-ok';
      grant.style.display = 'none';
    } else {
      micStatus.textContent = '⚠ microphone not granted — click to enable narration';
      micStatus.className = 'mic-bad';
      grant.style.display = '';
    }
  } catch {
    micStatus.textContent = 'Click "Grant microphone" before recording.';
    micStatus.className = '';
  }
}

async function grantMic(): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
  const micStatus = $('micStatus');
  micStatus.textContent = 'A tab opened — click Allow there, then reopen this popup.';
  micStatus.className = '';
}

// ---- helpers ----

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url.replace(/^https?:\/\//, ''); }
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

function send(msg: unknown): Promise<any> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      void chrome.runtime.lastError;
      resolve(resp);
    });
  });
}
