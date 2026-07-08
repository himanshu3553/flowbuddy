// Sync embeddable copilot widget (P1-M7). One <script> renders a shadow-DOM chat panel that calls
// the copilot answer endpoint and shows grounded answers + citations (or an honest decline).
//
// Embed:
//   <script src=".../sync-copilot.js"
//           data-sync-api="https://api.example.com"
//           data-sync-key="<workspace key>"
//           data-sync-title="Help"            (optional — per-page override, see below)
//           data-sync-accent="#4f46e5"        (optional — brand the widget to the host)
//           data-sync-position="left"          (optional — "left" | "right", default right)
//           data-sync-preview="1"></script>    (optional — Studio tester mode, see below)
//
// data-sync-preview marks a STUDIO PREVIEW embed (the Copilot page's real-widget tester): the mount
// heartbeat is suppressed and answer calls are flagged `preview` so the API skips embed detection
// and analytics — a founder trying the widget must never read as a customer install. The panel also
// starts open AND the launcher stays visible below it (panel lifted via --sc-panel-bottom), so both
// the conversation and every launcher appearance control are on screen at once.
// (data-sync-key is the workspace's PUBLIC embeddable key — safe in client HTML, distinct from the secret recorder token; P1-M9.)
//
// APPEARANCE (2026-07-07): the widget fetches its look (accent/title/greeting/position/launcher)
// from `GET /v1/copilot/config` at mount, so Studio → Copilot → Appearance changes reach every
// embed live — customers never re-copy the snippet. Precedence per field:
//   explicit data-sync-* attr (or window.SyncCopilot) > server config > built-in default.
// Attrs stay supported as deliberate per-page overrides; the fetch is best-effort (short timeout,
// any failure falls back to attrs/defaults) so the widget always appears.
// The default theme is the Sync indigo brand (matches Sync Studio); an accent (from Studio or the attr) overrides it with the host's own brand color (text on it is white).

import { CSS } from './styles.js';
import { log, setDebug } from './log.js';

interface Citation { segmentTitle: string | null }
interface Msg { role: 'user' | 'assistant'; content: string; citations?: Citation[]; decline?: boolean; error?: boolean; queryId?: string; feedback?: 'up' | 'down' }

const script = document.currentScript as HTMLScriptElement | null;
const g = (window as unknown as { SyncCopilot?: Record<string, string> }).SyncCopilot ?? {};
// Explicit host-page values (attr or window global) — recorded separately from the resolved cfg
// because an explicit value must keep winning over the server config fetched at mount.
const explicit = {
  title: script?.dataset.syncTitle || g.title || '',
  greeting: script?.dataset.syncGreeting || g.greeting || '',
  accent: script?.dataset.syncAccent || g.accent || '',
  position: (script?.dataset.syncPosition || g.position || '').toLowerCase(),
  launcher: (script?.dataset.syncLauncher || g.launcher || '').toLowerCase(),
  launcherText: script?.dataset.syncLauncherText || g.launcherText || '',
};
const cfg = {
  apiBase: (script?.dataset.syncApi || g.apiBase || 'http://localhost:8787').replace(/\/+$/, ''),
  key: script?.dataset.syncKey || g.key || '',
  title: explicit.title || 'Ask AI',
  greeting: explicit.greeting || 'How can I help you today?',
  accent: explicit.accent,
  position: explicit.position || 'right',
  // Launcher look: 'icon' (chat bubble, default), 'text' (filled pill), or 'text-outline' (bordered pill).
  launcher: explicit.launcher || 'icon',
  launcherText: explicit.launcherText || 'Ask me anything',
  preview: (script?.dataset.syncPreview || g.preview || '') === '1',
  // Opt-in diagnostics (off by default — the widget must never spam a customer's console).
  debug: /^(1|true|yes)$/i.test(script?.dataset.syncDebug || '') ||
    (window as unknown as { SyncCopilotDebug?: boolean }).SyncCopilotDebug === true,
};

// Enable console diagnostics before anything else runs, so early boot steps are visible when asked for.
setDebug(cfg.debug);
log.debug('booting', { apiBase: cfg.apiBase, preview: cfg.preview });

const messages: Msg[] = [];
let open = cfg.preview; // preview (Studio tester) starts open; real embeds start at the launcher
let loading = false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Render a SAFE minimal-markdown subset for assistant answers (the model returns markdown). HTML is
// escaped FIRST, then only **bold** / `code` are introduced — so nothing in the answer can inject
// markup into the host page. Line breaks are handled by CSS (`white-space: pre-wrap`).
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}
function mdToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
function bubbleEl(m: Msg): HTMLDivElement {
  const b = document.createElement('div');
  b.className = 'sc-bubble';
  if (m.role === 'assistant') b.innerHTML = mdToHtml(m.content);
  else b.textContent = m.content; // user input is never treated as markdown
  return b;
}

// Brand typography (design system: Plus Jakarta Sans + JetBrains Mono). @font-face rules are
// DOCUMENT-level — a shadow tree resolves font-family against the host document — so the widget
// injects ONE stylesheet link into the embedding page (guarded, best-effort). The system-ui
// fallback stack in styles.ts keeps the widget correct when the fonts are blocked or offline.
const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap';
function ensureBrandFonts(): void {
  if (document.getElementById('sync-copilot-fonts')) return;
  const link = document.createElement('link');
  link.id = 'sync-copilot-fonts';
  link.rel = 'stylesheet';
  link.href = FONTS_HREF;
  document.head.appendChild(link);
}

// Inline lucide icons (stroke-based, currentColor) — the shadow tree can't load icon fonts and
// design rule = no emoji in chrome. Static markup, no user content.
const BOT_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>';
const ARROW_UP_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>';

const host = el('div');
host.id = 'sync-copilot-root';
// Host theming (optional) — applied as inline CSS vars that inherit into the shadow tree.
if (cfg.accent) host.style.setProperty('--sc-accent', cfg.accent);
if (cfg.position === 'left') {
  host.style.setProperty('--sc-right', 'auto');
  host.style.setProperty('--sc-left', '20px');
}
// Preview keeps the launcher visible under the open panel (so launcher style/text/position edits
// show immediately in the Studio tester) — lift the panel clear of the 56px launcher.
if (cfg.preview) host.style.setProperty('--sc-panel-bottom', '86px');
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
const badge = el('span', 'sc-badge');
badge.innerHTML = BOT_SVG; // static markup, not user content
header.appendChild(badge);
const titleWrap = el('span', 'sc-titles');
const titleEl = el('span', 'sc-title', cfg.title);
titleWrap.appendChild(titleEl);
titleWrap.appendChild(el('span', 'sc-subtitle', 'grounded in your approved workflows'));
header.appendChild(titleWrap);
const closeBtn = el('button', 'sc-close', '✕');
header.appendChild(closeBtn);

const list = el('div', 'sc-messages');
const form = el('form', 'sc-input');
const input = el('input');
input.type = 'text';
input.placeholder = 'Ask anything…';
input.maxLength = 400; // the API rejects oversized questions; keep honest input bounded at the source
const send = el('button', 'sc-send');
send.type = 'submit';
send.setAttribute('aria-label', 'Send');
send.innerHTML = ARROW_UP_SVG; // static markup, not user content
form.appendChild(input);
form.appendChild(send);

panel.appendChild(header);
panel.appendChild(list);
panel.appendChild(form);
root.appendChild(launcher);
root.appendChild(panel);

function render(): void {
  panel.style.display = open ? 'flex' : 'none';
  // Real embeds swap launcher ↔ panel; the Studio preview shows BOTH (panel lifted above).
  launcher.style.display = open && !cfg.preview ? 'none' : 'flex';
  list.replaceChildren();
  if (messages.length === 0) list.appendChild(el('div', 'sc-greeting', cfg.greeting));
  for (const m of messages) {
    const row = el('div', `sc-msg sc-${m.role}${m.decline ? ' sc-decline' : ''}${m.error ? ' sc-error' : ''}`);
    row.appendChild(bubbleEl(m));
    const titles = [...new Set((m.citations ?? []).map((c) => c.segmentTitle).filter((t): t is string => !!t))];
    if (titles.length) {
      // "Source" pill (accent dot + mono label). Titles are user content — text nodes only.
      const pill = el('div', 'sc-cites');
      pill.appendChild(el('span', 'sc-dot'));
      pill.appendChild(document.createTextNode('Source: ' + titles.join(' · ')));
      row.appendChild(pill);
    }
    if (m.decline) {
      const pill = el('div', 'sc-flag');
      pill.appendChild(el('span', 'sc-dot'));
      pill.appendChild(document.createTextNode('Honest decline'));
      row.appendChild(pill);
    }
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
  // Prior turns (exclude the question we just pushed; it's sent separately). Only the last 10
  // ride along — the server slices to 10 anyway, so a long chat must not grow the payload.
  const history = messages.filter((m) => !m.error).slice(0, -1).slice(-10).map((m) => ({ role: m.role, content: m.content }));
  try {
    const res = await fetch(`${cfg.apiBase}/v1/copilot/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cfg.key ? { 'X-Sync-Key': cfg.key } : {}) },
      body: JSON.stringify({
        question,
        history,
        context: { path: location.pathname, title: document.title },
        ...(cfg.preview ? { preview: true } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      covered?: boolean; answer?: string | null; citations?: Citation[]; reason?: string; error?: string; queryId?: string;
    };
    if (!res.ok) { log.warn('answer request failed', res.status, data.error); messages.push({ role: 'assistant', content: data.error || `Request failed (${res.status})`, error: true }); }
    else if (data.covered) messages.push({ role: 'assistant', content: data.answer ?? '', citations: data.citations ?? [], queryId: data.queryId });
    else messages.push({ role: 'assistant', content: data.reason || "I don't have that in our help content yet.", decline: true, queryId: data.queryId });
  } catch (e) {
    log.error('could not reach the assistant', e);
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
  if (!cfg.key || cfg.preview) return; // a Studio preview must never stamp embed detection
  void fetch(`${cfg.apiBase}/v1/copilot/seen`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Sync-Key': cfg.key },
    keepalive: true,
  }).catch(() => { /* best-effort */ });
}

// Server appearance config (Studio → Copilot → Appearance). Fetched before mount so the widget
// first paints already-branded (no default-theme flash). Every field an explicit attr didn't set
// falls through to the server value when it's present and valid, else the built-in default.
interface ServerConfig {
  accent?: string | null; title?: string | null; greeting?: string | null;
  position?: string | null; launcher?: string | null; launcherText?: string | null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

async function fetchServerConfig(): Promise<ServerConfig | null> {
  // The Studio preview passes EVERY appearance field as an explicit attr (live, possibly-unsaved
  // editing state), so the server config could never apply — skip the round-trip entirely; the
  // preview iframe reloads on each appearance edit and must not burst /config calls.
  if (!cfg.key || cfg.preview) return null;
  // A tight budget: the config lookup is a single indexed read (~ms); a slow/unreachable API must
  // delay the launcher by at most this long — the widget always appears.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 1500);
  try {
    const res = await fetch(`${cfg.apiBase}/v1/copilot/config`, {
      headers: { 'X-Sync-Key': cfg.key },
      signal: ctl.signal,
    });
    if (!res.ok) { log.debug('appearance config fetch non-ok', res.status); return null; }
    return (await res.json()) as ServerConfig;
  } catch (e) {
    log.debug('appearance config fetch failed — using attrs/defaults', e);
    return null; // best-effort: attrs/defaults still render a working widget
  } finally {
    clearTimeout(timer);
  }
}

/** Fold valid server values into cfg (explicit attrs win) and re-patch the already-built DOM. */
function applyServerConfig(s: ServerConfig): void {
  if (!explicit.title && s.title?.trim()) cfg.title = s.title.trim();
  if (!explicit.greeting && s.greeting?.trim()) cfg.greeting = s.greeting.trim();
  if (!explicit.accent && s.accent && HEX.test(s.accent.trim())) cfg.accent = s.accent.trim();
  if (!explicit.position && (s.position === 'left' || s.position === 'right')) cfg.position = s.position;
  if (!explicit.launcher && (s.launcher === 'icon' || s.launcher === 'text' || s.launcher === 'text-outline')) {
    cfg.launcher = s.launcher;
  }
  if (!explicit.launcherText && s.launcherText?.trim()) cfg.launcherText = s.launcherText.trim();

  titleEl.textContent = cfg.title; // greeting is read from cfg at render()
  if (cfg.accent) host.style.setProperty('--sc-accent', cfg.accent);
  if (cfg.position === 'left') {
    host.style.setProperty('--sc-right', 'auto');
    host.style.setProperty('--sc-left', '20px');
  } else {
    host.style.removeProperty('--sc-right');
    host.style.removeProperty('--sc-left');
  }
  const isText = cfg.launcher === 'text' || cfg.launcher === 'text-outline';
  launcher.textContent = isText ? cfg.launcherText : '💬';
  launcher.classList.toggle('sc-launcher-pill', isText);
  launcher.classList.toggle('sc-launcher-outline', cfg.launcher === 'text-outline');
}

function mount(): void { document.body.appendChild(host); render(); pingSeen(); }
async function boot(): Promise<void> {
  ensureBrandFonts(); // kick the font download off first — it overlaps the config fetch
  const server = await fetchServerConfig();
  if (server) applyServerConfig(server);
  mount();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void boot());
else void boot();
