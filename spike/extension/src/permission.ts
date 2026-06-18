// Opened in a normal tab so the mic permission prompt has focus (the popup
// can't reliably prompt — the dialog closes it). Granting here persists for the
// whole extension origin, so the offscreen recorder can then capture audio.

const statusEl = document.getElementById('status') as HTMLDivElement;
const retryBtn = document.getElementById('retry') as HTMLButtonElement;

async function run(): Promise<void> {
  statusEl.textContent = 'Requesting microphone…';
  statusEl.className = '';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    statusEl.textContent = '✓ Microphone granted. Close this tab and click Start in the popup.';
    statusEl.className = 'ok';
  } catch (e) {
    const err = e as Error;
    statusEl.innerHTML = `✗ ${err.name}: ${err.message}<br><br>
      If this is <b>NotAllowedError</b> on macOS, the cause is almost always the OS:
      open <b>System Settings → Privacy &amp; Security → Microphone</b> and enable <b>Google Chrome</b>,
      then fully quit & reopen Chrome and click Retry.`;
    statusEl.className = 'bad';
  }
}

retryBtn.addEventListener('click', run);
run();
