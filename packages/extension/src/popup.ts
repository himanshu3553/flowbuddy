// Popup UI — a state machine (disconnected · idle · recording[/paused] · uploading · retry) per the
// Sync Recorder design (F10–F13). Real data throughout: workspace identity + live (pause-aware) timer,
// per-workflow counts, a live mic meter (getUserMedia analyser), and determinate upload progress.
// The only deliberate placeholder is the "Mask PII" switch — masking itself isn't built yet, so it
// stays visually ON / "always on" rather than pretending to toggle.

declare const __STUDIO_URL__: string; // baked at build time (build.mjs)

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const body = document.body;

let connected = false;
let email = '';
let org = '';

// recording-session mirror (kept in sync from getState)
let recStart = 0;
let recPaused = false;
let recPausedAt = 0;
let recPausedTotal = 0;
let recWorkflowStartedAt = 0;

// loops
let ticker: number | null = null;
let statePoller: number | null = null;
let uploadPoller: number | null = null;
let statusTimer: number | null = null; // auto-dismiss for the success notification
let sessionPoller: number | null = null; // idle view: polls the last session's processing status

// mic meter
let meterCtx: AudioContext | null = null;
let meterStream: MediaStream | null = null;
let meterRAF = 0;
let micBars: HTMLElement[] = [];

interface Upload {
  ok?: boolean;
  sessionId?: string;
  error?: string;
  retryable?: boolean;
}

/** Mirror of the background's persisted stop→upload pipeline state (storage.local `phase`). */
interface PhaseState {
  name?: string;
  at?: number;
}

/** The last successfully uploaded session — persists so "Recent" survives popup reopens. */
interface LastSession {
  id: string;
  at: number;
  status: 'uploaded' | 'processing' | 'ready' | 'error';
}

interface RecState {
  recording?: boolean;
  paused?: boolean;
  pausedAt?: number;
  pausedTotal?: number;
  startTime?: number;
  workflowStartedAt?: number;
  appBaseUrl?: string;
  steps?: number;
  workflows?: number;
}

init();

async function init(): Promise<void> {
  const c = await send({ cmd: 'getConnection' });
  connected = Boolean(c?.connected);
  email = c?.email || '';
  org = c?.org || '';
  wire();

  const state: RecState = await send({ cmd: 'getState' });
  if (state?.recording) {
    enterRecording(state);
    return;
  }
  // A stop is mid-pipeline (saving narration / uploading) — resume the uploading view instead of
  // falsely claiming idle. The persisted phase is what makes a REOPENED popup honest.
  const { phase } = await chrome.storage.local.get('phase');
  const ph = phase as PhaseState | undefined;
  if (ph?.name === 'saving' || ph?.name === 'uploading') {
    $('upMeta').textContent = 'Your recording is safe — it uploads in the background.';
    enterUploading();
    return;
  }
  if (!connected) {
    setState('disconnected');
    return;
  }
  const { lastUpload } = await chrome.storage.local.get('lastUpload');
  if (lastUpload && !lastUpload.ok && lastUpload.retryable) void enterRetry(lastUpload);
  else enterIdle(lastUpload);
}

function setState(s: string): void {
  body.dataset.state = s;
  if (s !== 'recording') body.classList.remove('is-paused');
}

function stopLoops(): void {
  if (ticker != null) { clearInterval(ticker); ticker = null; }
  if (statePoller != null) { clearInterval(statePoller); statePoller = null; }
  if (uploadPoller != null) { clearInterval(uploadPoller); uploadPoller = null; }
  if (statusTimer != null) { clearTimeout(statusTimer); statusTimer = null; }
  if (sessionPoller != null) { clearInterval(sessionPoller); sessionPoller = null; }
  stopMeter();
}

// ---- views ----

function enterIdle(lastUpload?: Upload): void {
  stopLoops();
  $('orgName').textContent = org || 'Your workspace';
  $('connEmail').textContent = email ? `Connected as ${email}` : 'Connected';
  $('orgAvatar').textContent = (org.trim()[0] || 'S').toUpperCase();
  void renderRecent();
  startSessionPoll();
  // The upload outcome is a ONE-TIME notification: show it, then clear it from storage + the toolbar
  // badge so it never persists across popup opens / extension reloads. Success auto-dismisses; the
  // "Recent" row is NOT cleared with it — that persists until the next recording replaces it.
  if (lastUpload?.ok) {
    setStatusBar('ok', 'Uploaded', 'Studio is turning it into workflows');
    acknowledgeResult();
    statusTimer = setTimeout(() => setStatusBar(null), 5000) as unknown as number;
  } else if (lastUpload && !lastUpload.ok) {
    setStatusBar('error', 'Error', lastUpload.error || 'Upload failed.');
    acknowledgeResult();
  } else {
    setStatusBar(null);
  }
  void refreshMic();
  setState('idle');
}

/** Clear the stored upload result + toolbar badge so the outcome shows once and doesn't linger. */
function acknowledgeResult(): void {
  void send({ cmd: 'ackResult' });
}

function setStatusBar(kind: 'ok' | 'error' | null, label = '', message = ''): void {
  const bar = $('statusBar');
  bar.classList.remove('is-ok', 'is-error');
  if (!kind) {
    bar.style.display = 'none';
    return;
  }
  (bar.querySelector('.sb-ico') as HTMLElement).textContent = kind === 'ok' ? '✓' : '!';
  (bar.querySelector('.sb-label') as HTMLElement).textContent = label;
  (bar.querySelector('.sb-msg') as HTMLElement).textContent = message;
  bar.classList.add(kind === 'ok' ? 'is-ok' : 'is-error');
  bar.style.display = 'flex';
}

// Per-status presentation for the Recent row: dot tone + badge copy that tracks server-side
// processing, so "what happened to my recording" is answered right here in the popup.
const SESSION_BADGE: Record<LastSession['status'], string> = {
  uploaded: 'uploaded · queued',
  processing: 'processing…',
  ready: 'ready',
  error: 'processing failed',
};

async function renderRecent(): Promise<void> {
  const recent = $('recent');
  const { lastSession } = await chrome.storage.local.get('lastSession');
  const s = lastSession as LastSession | undefined;
  if (!s?.id) {
    recent.innerHTML = '<p class="empty">No recordings yet.</p>';
    return;
  }
  recent.textContent = '';
  const row = document.createElement('div');
  row.className = 'recent-row';
  const dot = document.createElement('span');
  dot.className = `rdot s-${s.status}`;
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = `Session ${s.id.slice(0, 8)}…`;
  const badge = document.createElement('span');
  badge.className = 'rbadge';
  badge.textContent = SESSION_BADGE[s.status] ?? s.status;
  row.append(dot, name, badge);
  const link = document.createElement('a');
  link.className = 'rlink';
  link.textContent = 'View in Studio ↗';
  link.addEventListener('click', () => {
    chrome.tabs.create({ url: `${__STUDIO_URL__}/dashboard/recordings/${s.id}` });
  });
  recent.append(row, link);
}

/** Poll the last session's server-side status (uploaded → processing → ready/error) while idle. */
function startSessionPoll(): void {
  if (sessionPoller != null) return;
  void pollSession();
  sessionPoller = setInterval(() => void pollSession(), 4000) as unknown as number;
}

function stopSessionPoll(): void {
  if (sessionPoller != null) { clearInterval(sessionPoller); sessionPoller = null; }
}

async function pollSession(): Promise<void> {
  const { lastSession, apiToken, backendUrl } = await chrome.storage.local.get([
    'lastSession',
    'apiToken',
    'backendUrl',
  ]);
  const s = lastSession as LastSession | undefined;
  if (!s?.id || !apiToken || !backendUrl) { stopSessionPoll(); return; }
  if (s.status === 'ready' || s.status === 'error') { stopSessionPoll(); return; }
  try {
    const res = await fetch(`${String(backendUrl).replace(/\/$/, '')}/v1/sessions/${s.id}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (res.status === 404) {
      // The session no longer exists server-side (e.g. deleted / a wiped dev DB) — drop the row.
      await chrome.storage.local.remove('lastSession');
      stopSessionPoll();
      void renderRecent();
      return;
    }
    if (!res.ok) return; // transient (cold start, offline, auth churn) — retry next tick
    const json = (await res.json()) as { status?: string };
    // `done` is the post-ready article state (Phase 2) — from the recorder's view that's "ready".
    const status = (json.status === 'done' ? 'ready' : json.status) as LastSession['status'] | undefined;
    if (status && status !== s.status && SESSION_BADGE[status]) {
      await chrome.storage.local.set({ lastSession: { ...s, status } });
      void renderRecent();
    }
    if (status === 'ready' || status === 'error') stopSessionPoll();
  } catch {
    /* offline — retry next tick */
  }
}

function enterRecording(state: RecState): void {
  stopLoops();
  applyRecState(state);
  $('recDomain').textContent = hostOf(state.appBaseUrl || '');
  setState('recording');
  tick();
  ticker = setInterval(tick, 1000) as unknown as number;
  statePoller = setInterval(pollState, 2000) as unknown as number;
  void startMeter();
}

function applyRecState(s: RecState): void {
  recStart = s.startTime || Date.now();
  recPaused = Boolean(s.paused);
  recPausedAt = s.pausedAt || 0;
  recPausedTotal = s.pausedTotal || 0;
  recWorkflowStartedAt = s.workflowStartedAt || recStart;
  updateWorkflow(s.workflows ?? 1, s.steps ?? 0);
  body.classList.toggle('is-paused', recPaused);
  $('pause').textContent = recPaused ? 'Resume' : 'Pause';
  if (recPaused) setBarsIdle();
}

function updateWorkflow(workflows: number, steps: number): void {
  $('recWorkflow').textContent = `Workflow ${workflows}`;
  $('recMeta').textContent = `${fmtAgo(recWorkflowStartedAt)} · ${steps} step${steps === 1 ? '' : 's'} captured`;
}

function elapsedMs(): number {
  const end = recPaused && recPausedAt ? recPausedAt : Date.now();
  return Math.max(0, end - recStart - recPausedTotal);
}

function tick(): void {
  $('recTimer').textContent = `${recPaused ? 'PAUSED' : 'REC'} · ${fmt(elapsedMs())}`;
}

async function pollState(): Promise<void> {
  const s: RecState = await send({ cmd: 'getState' });
  if (!s?.recording) {
    // Recording ended outside this popup — resolve to the right terminal view instead of freezing.
    const { lastUpload } = await chrome.storage.local.get('lastUpload');
    if (lastUpload && !lastUpload.ok && lastUpload.retryable) void enterRetry(lastUpload);
    else enterIdle(lastUpload);
    return;
  }
  applyRecState(s);
}

function enterUploading(): void {
  stopLoops();
  setUploadUI(0);
  setState('uploading');
  uploadPoller = setInterval(pollUpload, 500) as unknown as number;
}

/** Render one honest pipeline stage: what is happening RIGHT NOW, not a generic spinner. */
function setUploadUI(pct: number, ph?: PhaseState): void {
  const fill = $('upFill');
  const track = fill.parentElement as HTMLElement;
  const setBar = (indeterminate: boolean, label: string, pctText: string, width: string): void => {
    track.classList.toggle('indeterminate', indeterminate);
    $('upLabel').textContent = label;
    $('upPct').textContent = pctText;
    fill.style.width = width;
  };
  if (ph?.name === 'saving') {
    // Between Stop and upload: the narration track is being stopped/encoded/flushed.
    setBar(true, 'Saving narration…', '', '');
  } else if (pct === -2) {
    // Finishing — all bytes sent; the server is receiving + processing before it responds.
    setBar(true, 'Finishing…', '', '');
  } else if (pct >= 1) {
    setBar(false, 'Uploading securely…', `${pct}%`, `${pct}%`);
  } else {
    // 0 / -1: no bytes moving yet (or an HTTP/1.1 fallback with no byte progress). If this stage
    // has been sitting a while, the honest explanation is a cold-starting server, not a hang.
    const stalled = ph?.at != null && Date.now() - ph.at > 8000;
    setBar(true, stalled ? 'Waking the Sync server — this can take a minute…' : 'Uploading securely…', pct === -1 ? '…' : '', '');
  }
}

async function pollUpload(): Promise<void> {
  const { uploadProgress, lastUpload, phase } = await chrome.storage.local.get([
    'uploadProgress',
    'lastUpload',
    'phase',
  ]);
  if (lastUpload) {
    if (uploadPoller != null) { clearInterval(uploadPoller); uploadPoller = null; }
    if (lastUpload.ok) enterIdle(lastUpload);
    else if (lastUpload.retryable) void enterRetry(lastUpload);
    else enterIdle(lastUpload); // hard failure → idle + bottom Error bar (retry wouldn't help)
    return;
  }
  const ph = phase as PhaseState | undefined;
  // Outcome consumed elsewhere (e.g. acknowledged in another popup instance) — settle to idle.
  if (ph?.name === 'idle' || ph?.name === 'done' || ph?.name === 'failed') {
    enterIdle();
    return;
  }
  if (typeof uploadProgress === 'number') setUploadUI(uploadProgress, ph);
}

async function enterRetry(lastUpload: { error?: string }): Promise<void> {
  stopLoops();
  const { uploadProgress } = await chrome.storage.local.get('uploadProgress');
  const pct = typeof uploadProgress === 'number' ? uploadProgress : 0;
  $('retryPct').textContent = `${pct}%`;
  $('retryFill').style.width = `${pct}%`;
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
    stopLoops();
    setState('disconnected');
  });
  $('grantMic').addEventListener('click', grantMic);
  $('start').addEventListener('click', start);
  $('marker').addEventListener('click', async () => {
    await send({ cmd: 'marker' });
    await pollState();
  });
  $('pause').addEventListener('click', togglePause);
  $('stop').addEventListener('click', stop);
  $('retry').addEventListener('click', retry);
  $('startFresh').addEventListener('click', startFresh);
}

async function togglePause(): Promise<void> {
  if (recPaused) {
    await send({ cmd: 'resume' });
  } else {
    // Optimistically freeze the timer/meter so the UI responds instantly; reconcile from getState.
    recPaused = true;
    recPausedAt = Date.now();
    body.classList.add('is-paused');
    $('pause').textContent = 'Resume';
    setBarsIdle();
    await send({ cmd: 'pause' });
  }
  const s: RecState = await send({ cmd: 'getState' });
  if (s?.recording) applyRecState(s);
}

async function start(): Promise<void> {
  const { apiToken, backendUrl } = await chrome.storage.local.get(['apiToken', 'backendUrl']);
  if (!apiToken) { setState('disconnected'); return; }
  const res = await send({ cmd: 'start', backendUrl, token: apiToken });
  if (res?.ok) {
    const s: RecState = await send({ cmd: 'getState' });
    enterRecording(s || { startTime: Date.now() });
  } else {
    const micStatus = $('micStatus');
    micStatus.textContent = `⚠ ${res?.error || 'Could not start recording.'}`;
    micStatus.className = 'mic-bad';
  }
}

async function stop(): Promise<void> {
  const s: RecState = await send({ cmd: 'getState' });
  const workflows = s?.workflows ?? 1;
  $('upMeta').textContent = `${fmt(elapsedMs())} · ${workflows} workflow${workflows === 1 ? '' : 's'}`;
  enterUploading();
  // Show the true first stage instantly (the poll confirms it from the persisted phase).
  setUploadUI(0, { name: 'saving', at: Date.now() });
  await send({ cmd: 'stop' });
}

async function retry(): Promise<void> {
  await chrome.storage.local.remove('lastUpload');
  enterUploading();
  $('upMeta').textContent = 'Resuming upload…';
  void send({ cmd: 'retryUpload' });
}

async function startFresh(): Promise<void> {
  // Abandon the failed recording: discard its buffer, clear the toolbar "!" badge, and drop back
  // to the ready/idle state so the user can record again from scratch.
  await send({ cmd: 'discard' });
  enterIdle();
}

// ---- mic meter (live, from a getUserMedia analyser) ----

async function startMeter(): Promise<void> {
  if (meterCtx) return;
  micBars = Array.from(document.querySelectorAll('#micBars i')) as HTMLElement[];
  try {
    meterStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    setBarsIdle(); // no mic permission — leave idle bars
    return;
  }
  meterCtx = new AudioContext();
  const src = meterCtx.createMediaStreamSource(meterStream);
  const analyser = meterCtx.createAnalyser();
  analyser.fftSize = 64;
  analyser.smoothingTimeConstant = 0.7;
  src.connect(analyser);
  const bins = analyser.frequencyBinCount; // 32
  const data = new Uint8Array(bins);
  const n = micBars.length || 7;
  const per = Math.max(1, Math.floor(bins / n));

  const loop = (): void => {
    meterRAF = requestAnimationFrame(loop);
    if (recPaused) { setBarsIdle(); return; }
    analyser.getByteFrequencyData(data);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < per; j++) sum += data[i * per + j];
      const avg = sum / per / 255; // 0..1
      const h = Math.max(0.18, Math.min(1, avg * 1.6));
      const bar = micBars[i];
      if (!bar) continue;
      bar.style.height = `${Math.round(h * 100)}%`;
      bar.style.background = avg > 0.12 ? 'var(--primary)' : 'var(--mic-idle)';
    }
  };
  loop();
}

function setBarsIdle(): void {
  for (const b of micBars) {
    b.style.height = '30%';
    b.style.background = 'var(--mic-idle)';
  }
}

function stopMeter(): void {
  if (meterRAF) { cancelAnimationFrame(meterRAF); meterRAF = 0; }
  meterStream?.getTracks().forEach((t) => t.stop());
  meterStream = null;
  if (meterCtx) { void meterCtx.close().catch(() => {}); meterCtx = null; }
}

// ---- mic permission (idle) ----

async function refreshMic(): Promise<void> {
  const micStatus = $('micStatus');
  const grant = $<HTMLButtonElement>('grantMic');
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    if (status.state === 'granted') {
      micStatus.textContent = '';
      micStatus.className = '';
      grant.style.display = 'none';
    } else {
      micStatus.textContent = '⚠ Microphone not granted — click to enable narration.';
      micStatus.className = 'mic-bad';
      grant.style.display = '';
    }
  } catch {
    micStatus.textContent = '';
    grant.style.display = '';
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

function fmtAgo(at: number): string {
  const secs = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (secs < 5) return 'just started';
  if (secs < 60) return `started ${secs}s ago`;
  const m = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, '0');
  return `started ${m}:${ss} ago`;
}

function send(msg: unknown): Promise<any> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      void chrome.runtime.lastError;
      resolve(resp);
    });
  });
}
