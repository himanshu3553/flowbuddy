// Offscreen document: records microphone narration (service workers can't use
// getUserMedia directly). Replies to the background with the audio as a data URL.

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let startedAt = 0;
let pausedAt = 0; // epoch ms the current audio pause began (0 while recording)
let pausedTotal = 0; // accumulated paused ms — excluded from the reported duration
let stream: MediaStream | null = null;

// R7 — a second consumer of the recording stream (no extra getUserMedia) that samples the mic level
// and broadcasts it for the on-page control bar's meter. Runs while recording; emits 0 while paused.
let levelCtx: AudioContext | null = null;
let levelTimer: ReturnType<typeof setInterval> | null = null;
const METER_HZ = 8; // ~8 updates/sec — a live meter without flooding the message bus

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target !== 'offscreen') return;
  if (msg.cmd === 'startAudio') startAudio();
  else if (msg.cmd === 'stopAudio') stopAudio();
  else if (msg.cmd === 'pauseAudio') pauseAudio();
  else if (msg.cmd === 'resumeAudio') resumeAudio();
});

function pauseAudio(): void {
  if (recorder?.state === 'recording') {
    recorder.pause(); // MediaRecorder omits paused spans from the encoded audio
    pausedAt = Date.now();
  }
}

function resumeAudio(): void {
  if (recorder?.state === 'paused') {
    if (pausedAt) pausedTotal += Date.now() - pausedAt;
    pausedAt = 0;
    recorder.resume();
  }
}

async function startAudio(): Promise<void> {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: pickMime() });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.start();
    startedAt = Date.now();
    pausedAt = 0;
    pausedTotal = 0;
    startLevelMeter(stream);
  } catch (e) {
    console.error('mic capture failed', e);
    // Tell the background to proceed without audio.
    chrome.runtime.sendMessage({ type: 'audioData', dataUrl: null, durationMs: 0 });
  }
}

function stopAudio(): void {
  if (!recorder) {
    chrome.runtime.sendMessage({ type: 'audioData', dataUrl: null, durationMs: 0 });
    return;
  }
  // Active duration excludes paused spans (incl. one still open if Stop is hit while paused),
  // matching the active-time event timeline so narration stays aligned.
  const openPause = pausedAt ? Date.now() - pausedAt : 0;
  const durationMs = Date.now() - startedAt - pausedTotal - openPause;
  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
    const dataUrl = await blobToDataUrl(blob);
    chrome.runtime.sendMessage({ type: 'audioData', dataUrl, durationMs });
    stream?.getTracks().forEach((t) => t.stop());
    recorder = null;
    stream = null;
  };
  stopLevelMeter();
  recorder.stop();
}

// ---- R7 mic-level meter (broadcast to the on-page control bar) ----

function startLevelMeter(src: MediaStream): void {
  stopLevelMeter();
  try {
    levelCtx = new AudioContext();
    const node = levelCtx.createMediaStreamSource(src);
    const analyser = levelCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    node.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    levelTimer = setInterval(() => {
      // Emit silence while paused so the bar's meter honestly drops (a dead mic reads as flat bars).
      if (recorder?.state !== 'recording') { broadcastLevel(0); return; }
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (const v of data) sum += v;
      broadcastLevel(Math.min(1, sum / data.length / 255 * 2.2));
    }, Math.round(1000 / METER_HZ));
  } catch { /* metering is best-effort — recording proceeds without it */ }
}

function stopLevelMeter(): void {
  if (levelTimer != null) { clearInterval(levelTimer); levelTimer = null; }
  if (levelCtx) { void levelCtx.close().catch(() => {}); levelCtx = null; }
}

function broadcastLevel(level: number): void {
  chrome.runtime.sendMessage({ type: 'micLevel', level }).catch(() => {});
}

function pickMime(): string {
  const prefs = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const m of prefs) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}
