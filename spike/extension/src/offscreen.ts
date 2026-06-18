// Offscreen document: records microphone narration (service workers can't use
// getUserMedia directly). Replies to the background with the audio as a data URL.

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let startedAt = 0;
let stream: MediaStream | null = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target !== 'offscreen') return;
  if (msg.cmd === 'startAudio') startAudio();
  else if (msg.cmd === 'stopAudio') stopAudio();
});

async function startAudio(): Promise<void> {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: pickMime() });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.start();
    startedAt = Date.now();
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
  const durationMs = Date.now() - startedAt;
  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
    const dataUrl = await blobToDataUrl(blob);
    chrome.runtime.sendMessage({ type: 'audioData', dataUrl, durationMs });
    stream?.getTracks().forEach((t) => t.stop());
    recorder = null;
    stream = null;
  };
  recorder.stop();
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
