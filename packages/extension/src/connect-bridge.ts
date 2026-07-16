// Content-script bridge: runs ONLY on the FlowBuddy Studio origin (see manifest matches). It relays
// the "connect" handshake between the Studio /connect page (via window.postMessage) and the
// extension background (via chrome.runtime). This avoids any token copy-paste and needs no
// knowledge of the extension ID on the web side.

const EXT = 'flowbuddy-ext'; // messages FROM the extension → page
const PAGE = 'flowbuddy-page'; // messages FROM the page → extension

function announce(): void {
  window.postMessage({ source: EXT, type: 'present' }, location.origin);
}

window.addEventListener('message', (e) => {
  // Same-window, same-origin messages from the trusted Studio page only.
  if (e.source !== window || e.origin !== location.origin) return;
  const d = e.data as { source?: string; type?: string; token?: string; apiBaseUrl?: string; email?: string; org?: string } | null;
  if (!d || d.source !== PAGE) return;

  if (d.type === 'ping') {
    announce();
  } else if (d.type === 'connect' && d.token) {
    chrome.runtime.sendMessage(
      { cmd: 'connect', token: d.token, backendUrl: d.apiBaseUrl, email: d.email, org: d.org },
      () => {
        void chrome.runtime.lastError;
        window.postMessage({ source: EXT, type: 'connected' }, location.origin);
      },
    );
  }
});

announce(); // in case the page is already listening when we load
