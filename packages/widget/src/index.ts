// Sync embeddable copilot widget (P1-M7). One <script> renders a shadow-DOM chat panel that calls
// the copilot answer endpoint and shows grounded answers + citations (or an honest decline).
//
// Embed:
//   <script src=".../sync-copilot.js"
//           data-sync-api="https://api.example.com"
//           data-sync-key="<workspace key>"
//           data-sync-title="Help"
//           data-sync-accent="#4f46e5"        (optional — brand the widget to the host)
//           data-sync-position="left"></script> (optional — "left" | "right", default right)
// (data-sync-key is the workspace's PUBLIC embeddable key — safe in client HTML, distinct from the secret recorder token; P1-M9.)
// The default theme is the Sync indigo brand (matches Sync Studio); data-sync-accent overrides it with the host's own brand color (text on it is white).

import { CSS } from './styles.js';

interface Citation { segmentTitle: string | null }
interface Msg { role: 'user' | 'assistant'; content: string; citations?: Citation[]; decline?: boolean; error?: boolean; queryId?: string; feedback?: 'up' | 'down' }

const script = document.currentScript as HTMLScriptElement | null;
const g = (window as unknown as { SyncCopilot?: Record<string, string> }).SyncCopilot ?? {};
const cfg = {
  apiBase: (script?.dataset.syncApi || g.apiBase || 'http://localhost:8787').replace(/\/+$/, ''),
  key: script?.dataset.syncKey || g.key || '',
  title: script?.dataset.syncTitle || g.title || 'Ask AI',
  greeting: script?.dataset.syncGreeting || g.greeting || 'How can I help you today?',
  accent: script?.dataset.syncAccent || g.accent || '',
  position: (script?.dataset.syncPosition || g.position || 'right').toLowerCase(),
  // Launcher look: 'icon' (chat bubble, default), 'text' (filled pill), or 'text-outline' (bordered pill).
  launcher: (script?.dataset.syncLauncher || g.launcher || 'icon').toLowerCase(),
  launcherText: script?.dataset.syncLauncherText || g.launcherText || 'Ask me anything',
};

const messages: Msg[] = [];
let open = false;
let loading = false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const host = el('div');
host.id = 'sync-copilot-root';
// Host theming (optional) — applied as inline CSS vars that inherit into the shadow tree.
if (cfg.accent) host.style.setProperty('--sc-accent', cfg.accent);
if (cfg.position === 'left') {
  host.style.setProperty('--sc-right', 'auto');
  host.style.setProperty('--sc-left', '20px');
}
const root = host.attachShadow({ mode: 'open' });
const styleEl = document.createElement('style');
styleEl.textContent = CSS;
root.appendChild(styleEl);

const launcherIsText = cfg.launcher === 'text' || cfg.launcher === 'text-outline';
const launcher = el('button', 'sc-launcher', launcherIsText ? cfg.launcherText : '💬');
if (launcherIsText) {
  launcher.classList.add('sc-launcher-pill');
  if (cfg.launcher === 'text-outline') launcher.classList.add('sc-launcher-outline');
}
launcher.setAttribute('aria-label', 'Open help copilot');

const panel = el('div', 'sc-panel');
const header = el('div', 'sc-header');
header.appendChild(el('span', 'sc-title', cfg.title));
const closeBtn = el('button', 'sc-close', '✕');
header.appendChild(closeBtn);

const list = el('div', 'sc-messages');
const form = el('form', 'sc-input');
const input = el('input');
input.type = 'text';
input.placeholder = 'Ask a question…';
const send = el('button', 'sc-send', 'Send');
send.type = 'submit';
form.appendChild(input);
form.appendChild(send);

panel.appendChild(header);
panel.appendChild(list);
panel.appendChild(form);
root.appendChild(launcher);
root.appendChild(panel);

function render(): void {
  panel.style.display = open ? 'flex' : 'none';
  launcher.style.display = open ? 'none' : 'flex';
  list.replaceChildren();
  if (messages.length === 0) list.appendChild(el('div', 'sc-greeting', cfg.greeting));
  for (const m of messages) {
    const row = el('div', `sc-msg sc-${m.role}${m.decline ? ' sc-decline' : ''}${m.error ? ' sc-error' : ''}`);
    row.appendChild(el('div', 'sc-bubble', m.content));
    const titles = [...new Set((m.citations ?? []).map((c) => c.segmentTitle).filter((t): t is string => !!t))];
    if (titles.length) row.appendChild(el('div', 'sc-cites', 'From: ' + titles.join(' · ')));
    if (m.role === 'assistant' && !m.error && m.queryId) {
      const fb = el('div', 'sc-feedback');
      for (const v of ['up', 'down'] as const) {
        const b = el('button', `sc-thumb${m.feedback === v ? ' sc-thumb-on' : ''}`, v === 'up' ? '👍' : '👎');
        if (m.feedback) b.disabled = true;
        b.addEventListener('click', () => void sendFeedback(m, v));
        fb.appendChild(b);
      }
      row.appendChild(fb);
    }
    list.appendChild(row);
  }
  if (loading) {
    const row = el('div', 'sc-msg sc-assistant');
    row.appendChild(el('div', 'sc-bubble sc-typing', '…'));
    list.appendChild(row);
  }
  list.scrollTop = list.scrollHeight;
  send.disabled = loading;
  input.disabled = loading;
}

async function ask(question: string): Promise<void> {
  messages.push({ role: 'user', content: question });
  loading = true;
  render();
  // Prior turns (exclude the question we just pushed; it's sent separately).
  const history = messages.filter((m) => !m.error).slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
  try {
    const res = await fetch(`${cfg.apiBase}/v1/copilot/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cfg.key ? { 'X-Sync-Key': cfg.key } : {}) },
      body: JSON.stringify({ question, history, context: { path: location.pathname, title: document.title } }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      covered?: boolean; answer?: string | null; citations?: Citation[]; reason?: string; error?: string; queryId?: string;
    };
    if (!res.ok) messages.push({ role: 'assistant', content: data.error || `Request failed (${res.status})`, error: true });
    else if (data.covered) messages.push({ role: 'assistant', content: data.answer ?? '', citations: data.citations ?? [], queryId: data.queryId });
    else messages.push({ role: 'assistant', content: data.reason || "I don't have that in our help content yet.", decline: true, queryId: data.queryId });
  } catch {
    messages.push({ role: 'assistant', content: 'Could not reach the assistant. Please try again.', error: true });
  } finally {
    loading = false;
    render();
  }
}

async function sendFeedback(m: Msg, fb: 'up' | 'down'): Promise<void> {
  if (!m.queryId || m.feedback) return;
  m.feedback = fb;
  render();
  try {
    await fetch(`${cfg.apiBase}/v1/copilot/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cfg.key ? { 'X-Sync-Key': cfg.key } : {}) },
      body: JSON.stringify({ queryId: m.queryId, feedback: fb }),
    });
  } catch { /* best-effort */ }
}

launcher.addEventListener('click', () => { open = true; render(); input.focus(); });
closeBtn.addEventListener('click', () => { open = false; render(); });
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q || loading) return;
  input.value = '';
  void ask(q);
});

// Embed-detection heartbeat: tell the API the snippet loaded so the Studio shows real "live"
// status (best-effort, fire-and-forget — never blocks or surfaces errors to the host page).
function pingSeen(): void {
  if (!cfg.key) return;
  void fetch(`${cfg.apiBase}/v1/copilot/seen`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Sync-Key': cfg.key },
    keepalive: true,
  }).catch(() => { /* best-effort */ });
}

function mount(): void { document.body.appendChild(host); render(); pingSeen(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
