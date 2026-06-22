// Sync embeddable copilot widget (P1-M7). One <script> renders a shadow-DOM chat panel that calls
// the copilot answer endpoint and shows grounded answers + citations (or an honest decline).
//
// Embed:
//   <script src=".../sync-copilot.js"
//           data-sync-api="https://api.example.com"
//           data-sync-key="<workspace key>"
//           data-sync-title="Help"></script>
// (data-sync-key is the workspace token for now; P1-M9 swaps in a public embeddable key.)

import { CSS } from './styles.js';

interface Citation { segmentTitle: string | null }
interface Msg { role: 'user' | 'assistant'; content: string; citations?: Citation[]; decline?: boolean; error?: boolean }

const script = document.currentScript as HTMLScriptElement | null;
const g = (window as unknown as { SyncCopilot?: Record<string, string> }).SyncCopilot ?? {};
const cfg = {
  apiBase: (script?.dataset.syncApi || g.apiBase || 'http://localhost:8787').replace(/\/+$/, ''),
  key: script?.dataset.syncKey || g.key || '',
  title: script?.dataset.syncTitle || g.title || 'Ask AI',
  greeting: script?.dataset.syncGreeting || g.greeting || 'Hi! Ask me anything about this product.',
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
const root = host.attachShadow({ mode: 'open' });
const styleEl = document.createElement('style');
styleEl.textContent = CSS;
root.appendChild(styleEl);

const launcher = el('button', 'sc-launcher', '💬');
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
      covered?: boolean; answer?: string | null; citations?: Citation[]; reason?: string; error?: string;
    };
    if (!res.ok) messages.push({ role: 'assistant', content: data.error || `Request failed (${res.status})`, error: true });
    else if (data.covered) messages.push({ role: 'assistant', content: data.answer ?? '', citations: data.citations ?? [] });
    else messages.push({ role: 'assistant', content: data.reason || "I don't have that in our help content yet.", decline: true });
  } catch {
    messages.push({ role: 'assistant', content: 'Could not reach the assistant. Please try again.', error: true });
  } finally {
    loading = false;
    render();
  }
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

function mount(): void { document.body.appendChild(host); render(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
