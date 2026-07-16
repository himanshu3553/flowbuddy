// FlowBuddy embeddable copilot widget (P1-M7). One <script> renders a shadow-DOM chat panel that calls
// the copilot answer endpoint and shows grounded answers + citations (or an honest decline).
//
// Embed:
//   <script src=".../flowbuddy-copilot.js"
//           data-flowbuddy-api="https://api.example.com"
//           data-flowbuddy-key="<workspace key>"
//           data-flowbuddy-title="Help"            (optional — per-page override, see below)
//           data-flowbuddy-accent="#4f46e5"        (optional — brand the widget to the host)
//           data-flowbuddy-position="left"          (optional — "left" | "right", default right)
//           data-flowbuddy-preview="1"></script>    (optional — Studio tester mode, see below)
//
// data-flowbuddy-preview marks a STUDIO PREVIEW embed (the Copilot page's real-widget tester): the mount
// heartbeat is suppressed and answer calls are flagged `preview` so the API skips embed detection
// and analytics — a founder trying the widget must never read as a customer install. The panel also
// starts open AND the launcher stays visible below it (panel lifted via --fb-panel-bottom), so both
// the conversation and every launcher appearance control are on screen at once.
// (data-flowbuddy-key is the workspace's PUBLIC embeddable key — safe in client HTML, distinct from the secret recorder token; P1-M9.)
//
// APPEARANCE (2026-07-07): the widget fetches its look (accent/title/greeting/position/launcher)
// from `GET /v1/copilot/config` at mount, so Studio → Copilot → Appearance changes reach every
// embed live — customers never re-copy the snippet. Precedence per field:
//   explicit data-flowbuddy-* attr (or window.FlowBuddy) > server config > built-in default.
// Attrs stay supported as deliberate per-page overrides; the fetch is best-effort (short timeout,
// any failure falls back to attrs/defaults) so the widget always appears.
// The default theme is the FlowBuddy indigo brand (matches FlowBuddy Studio); an accent (from Studio or the attr) overrides it with the host's own brand color (text on it is white).
//
// DRAG + EXPAND (2026-07-13): the open panel drags by its header (viewport-clamped; the spot
// lasts for the page view), and a header toggle expands it vertically to near-full viewport
// height — it stays a floating draggable window and never touches the host page's layout.

import { CSS } from './styles.js';
import { log, setDebug } from './log.js';
// P2 Sense — panel-open shard fetch + ask-time read-only probe + the show-me highlight.
import { ensureShard, probeForAsk, spotlight, clearSpotlight, type SenseProbeResult, type SenseWorkflow } from './sense.js';
// P4-M0 Guided walkthrough — "Walk me through it" on positional answers (zero-acting; the user
// does everything, the widget highlights + observes). Resumes across full-page navigations.
import { walkthroughOffer, startWalkthrough, resumeWalkthrough, walkthroughActive } from './walkthrough.js';
// P2-M5 Reason — the selective diagnostic trigger + structured page-state capture (+ lazy image tier).
import { reasonTrigger, captureSnapshot, renderPageImage, type ReasonAskPayload, type ReasonTrigger } from './reason.js';

interface Citation { segmentTitle: string | null }
interface AnswerPosition { sourceId: string; segmentIndex: number; step: number }
interface Msg {
  role: 'user' | 'assistant'; content: string; citations?: Citation[]; decline?: boolean;
  error?: boolean; queryId?: string; feedback?: 'up' | 'down';
  // P4-M0 — a positional answer that maps to a walkable workflow carries the offer.
  walkOffer?: { workflow: SenseWorkflow; startStep: number };
}

const script = document.currentScript as HTMLScriptElement | null;
// The widget's own URL — the P2-M5 lazy renderer bundle is derived from it (a sibling file).
const SCRIPT_SRC = script?.src || '';
const g = (window as unknown as { FlowBuddy?: Record<string, string> }).FlowBuddy ?? {};
// Explicit host-page values (attr or window global) — recorded separately from the resolved cfg
// because an explicit value must keep winning over the server config fetched at mount.
const explicit = {
  title: script?.dataset.flowbuddyTitle || g.title || '',
  greeting: script?.dataset.flowbuddyGreeting || g.greeting || '',
  accent: script?.dataset.flowbuddyAccent || g.accent || '',
  position: (script?.dataset.flowbuddyPosition || g.position || '').toLowerCase(),
  launcher: (script?.dataset.flowbuddyLauncher || g.launcher || '').toLowerCase(),
  launcherText: script?.dataset.flowbuddyLauncherText || g.launcherText || '',
};
const cfg = {
  apiBase: (script?.dataset.flowbuddyApi || g.apiBase || 'http://localhost:8787').replace(/\/+$/, ''),
  key: script?.dataset.flowbuddyKey || g.key || '',
  title: explicit.title || 'Ask AI',
  greeting: explicit.greeting || 'How can I help you today?',
  accent: explicit.accent,
  position: explicit.position || 'right',
  // Launcher look: 'icon' (chat bubble, default), 'text' (filled pill), or 'text-outline' (bordered pill).
  launcher: explicit.launcher || 'icon',
  launcherText: explicit.launcherText || 'Ask me anything',
  preview: (script?.dataset.flowbuddyPreview || g.preview || '') === '1',
  // P2 Sense — both flags arrive from /v1/copilot/config (Studio-controlled); sense defaults ON
  // (harmless read-only probe), showMe defaults OFF (it draws on the host page).
  sense: true,
  showMe: false,
  // P4-M0 guided walkthrough — arrives from /v1/copilot/config; defaults OFF (it draws on the
  // host page and observes progression, so the founder knowingly enables it). Needs Sense.
  walkthrough: false,
  // P2-M5 Reason — all three arrive from /v1/copilot/config. reason defaults ON (structure-only,
  // masked); the image tier and value unmasking default OFF (the founder knowingly enables them).
  reason: true,
  reasonImage: false,
  reasonValues: false,
  // Opt-in diagnostics (off by default — the widget must never spam a customer's console).
  debug: /^(1|true|yes)$/i.test(script?.dataset.flowbuddyDebug || '') ||
    (window as unknown as { FlowBuddyDebug?: boolean }).FlowBuddyDebug === true,
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
// markup into the host page. Block layout is line-based: "1. …" lines render as STEP ROWS with a
// numbered chip, "- …" lines as bullet rows, everything else as paragraphs (blank lines = spacing
// via CSS margins). The prompt's shared ANSWER_FORMAT_RULES emit exactly this subset.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}
function inlineMd(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
function mdToHtml(text: string): string {
  const out: string[] = [];
  let steps: string[] = [];
  const flush = () => {
    if (steps.length === 0) return;
    out.push(`<div class="fb-steps">${steps.join('')}</div>`);
    steps = [];
  };
  for (const raw of escapeHtml(text).split('\n')) {
    const line = raw.trim();
    const ol = /^(\d{1,2})[.)]\s+(.*)$/.exec(line);
    const ul = /^[-*•]\s+(.*)$/.exec(line);
    if (ol) {
      steps.push(`<div class="fb-step"><span class="fb-step-n">${ol[1]}</span><span class="fb-step-t">${inlineMd(ol[2]!)}</span></div>`);
    } else if (ul) {
      steps.push(`<div class="fb-step"><span class="fb-step-b"></span><span class="fb-step-t">${inlineMd(ul[1]!)}</span></div>`);
    } else {
      flush();
      if (line) out.push(`<p class="fb-p">${inlineMd(line)}</p>`);
    }
  }
  flush();
  return out.join('');
}
function bubbleEl(m: Msg): HTMLDivElement {
  const b = document.createElement('div');
  b.className = 'fb-bubble';
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
  if (document.getElementById('flowbuddy-copilot-fonts')) return;
  const link = document.createElement('link');
  link.id = 'flowbuddy-copilot-fonts';
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
// Header expand toggle — lucide chevrons-up-down (grow vertically) / chevrons-down-up (restore).
const EXPAND_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>';
const COLLAPSE_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/></svg>';

const host = el('div');
host.id = 'flowbuddy-copilot-root';
// Host theming (optional) — applied as inline CSS vars that inherit into the shadow tree.
if (cfg.accent) host.style.setProperty('--fb-accent', cfg.accent);
if (cfg.position === 'left') {
  host.style.setProperty('--fb-right', 'auto');
  host.style.setProperty('--fb-left', '20px');
}
// Preview keeps the launcher visible under the open panel (so launcher style/text/position edits
// show immediately in the Studio tester) — lift the panel clear of the 56px launcher.
if (cfg.preview) host.style.setProperty('--fb-panel-bottom', '86px');
const root = host.attachShadow({ mode: 'open' });
const styleEl = document.createElement('style');
styleEl.textContent = CSS;
root.appendChild(styleEl);

const launcherIsText = cfg.launcher === 'text' || cfg.launcher === 'text-outline';
const launcher = el('button', 'fb-launcher', launcherIsText ? cfg.launcherText : '💬');
if (launcherIsText) {
  launcher.classList.add('fb-launcher-pill');
  if (cfg.launcher === 'text-outline') launcher.classList.add('fb-launcher-outline');
}
launcher.setAttribute('aria-label', 'Open help copilot');

const panel = el('div', 'fb-panel');
const header = el('div', 'fb-header');
const badge = el('span', 'fb-badge');
badge.innerHTML = BOT_SVG; // static markup, not user content
header.appendChild(badge);
const titleWrap = el('span', 'fb-titles');
const titleEl = el('span', 'fb-title', cfg.title);
titleWrap.appendChild(titleEl);
titleWrap.appendChild(el('span', 'fb-subtitle', 'grounded in your approved workflows'));
header.appendChild(titleWrap);
const expandBtn = el('button', 'fb-expand');
expandBtn.innerHTML = EXPAND_SVG; // static markup, not user content
expandBtn.setAttribute('aria-label', 'Expand panel');
header.appendChild(expandBtn);
const closeBtn = el('button', 'fb-close', '✕');
header.appendChild(closeBtn);

const list = el('div', 'fb-messages');
const form = el('form', 'fb-input');
const input = el('input');
input.type = 'text';
input.placeholder = 'Ask anything…';
input.maxLength = 400; // the API rejects oversized questions; keep honest input bounded at the source
const send = el('button', 'fb-send');
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
  if (messages.length === 0) list.appendChild(el('div', 'fb-greeting', cfg.greeting));
  for (const m of messages) {
    const row = el('div', `fb-msg fb-${m.role}${m.decline ? ' fb-decline' : ''}${m.error ? ' fb-error' : ''}`);
    row.appendChild(bubbleEl(m));
    const titles = [...new Set((m.citations ?? []).map((c) => c.segmentTitle).filter((t): t is string => !!t))];
    if (titles.length) {
      // "Source" pill (accent dot + mono label). Titles are user content — text nodes only.
      const pill = el('div', 'fb-cites');
      pill.appendChild(el('span', 'fb-dot'));
      pill.appendChild(document.createTextNode('Source: ' + titles.join(' · ')));
      row.appendChild(pill);
    }
    if (m.decline) {
      const pill = el('div', 'fb-flag');
      pill.appendChild(el('span', 'fb-dot'));
      pill.appendChild(document.createTextNode('Honest decline'));
      row.appendChild(pill);
    }
    // P4-M0 — the walkthrough offer (explicit consent = this click; nothing happens without it).
    if (m.walkOffer && !walkthroughActive()) {
      const offer = m.walkOffer;
      const btn = el('button', 'fb-walk-offer', 'Walk me through it');
      btn.addEventListener('click', () => {
        open = false; // hand the page to the user — the step card takes over from the panel
        startWalkthrough(
          root,
          { apiBase: cfg.apiBase, key: cfg.key, reason: cfg.reason },
          offer.workflow,
          offer.startStep,
          m.queryId,
          {
            onExit: () => { open = true; render(); }, // exiting the walkthrough brings the chat back
            onExplain: explainBlocker, // blocked/invalid → the Reason diagnostic path, in chat
          },
        );
        render();
      });
      row.appendChild(btn);
    }
    if (m.role === 'assistant' && !m.error && m.queryId) {
      const fb = el('div', 'fb-feedback');
      for (const v of ['up', 'down'] as const) {
        const b = el('button', `fb-thumb${m.feedback === v ? ' fb-thumb-on' : ''}`, v === 'up' ? '👍' : '👎');
        if (m.feedback) b.disabled = true;
        b.addEventListener('click', () => void sendFeedback(m, v));
        fb.appendChild(b);
      }
      row.appendChild(fb);
    }
    list.appendChild(row);
  }
  if (loading) {
    const row = el('div', 'fb-msg fb-assistant');
    row.appendChild(el('div', 'fb-bubble fb-typing', '…'));
    list.appendChild(row);
  }
  list.scrollTop = list.scrollHeight;
  send.disabled = loading;
  input.disabled = loading;
}

// P2 Sense — the probe result backing the LAST question (its resolved elements power show-me).
let lastProbe: SenseProbeResult | null = null;
const senseActive = () => Boolean(cfg.key) && !cfg.preview && cfg.sense;
// P2-M5 Reason — active on real embeds when the founder's toggle is on (structure-only by default).
const reasonActive = () => Boolean(cfg.key) && !cfg.preview && cfg.reason;

/** Capture the Reason evidence package: the structured snapshot (+ the page image where the
 *  founder enabled the tier). Null when capture fails — the question proceeds without Reason. */
async function buildReasonPayload(trigger: ReasonTrigger): Promise<ReasonAskPayload | null> {
  const snapshot = captureSnapshot(cfg.reasonValues, lastProbe);
  if (!snapshot) return null;
  const image = cfg.reasonImage ? await renderPageImage(SCRIPT_SRC, cfg.reasonValues) : null;
  log.debug('reason: captured page state', { trigger, elements: snapshot.elements.length, image: Boolean(image) });
  return { trigger, snapshot, ...(image ? { image } : {}) };
}

interface AnswerResponse {
  covered?: boolean; answer?: string | null; citations?: Citation[]; reason?: string; error?: string; queryId?: string;
  position?: AnswerPosition | null; escalate?: boolean;
}

async function postAnswer(
  question: string,
  history: Array<{ role: string; content: string }>,
  reasonPayload: ReasonAskPayload | null,
): Promise<{ ok: boolean; status: number; data: AnswerResponse }> {
  const res = await fetch(`${cfg.apiBase}/v1/copilot/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cfg.key ? { 'X-FlowBuddy-Key': cfg.key } : {}) },
    body: JSON.stringify({
      question,
      history,
      context: {
        path: location.pathname,
        title: document.title,
        ...(lastProbe && lastProbe.hypotheses.length > 0
          ? { sense: { probed: true, tie: lastProbe.tie, hypotheses: lastProbe.hypotheses } }
          : {}),
        // P2-M5 Reason — either the captured evidence, or a capability flag so the server knows a
        // fast-path decline may be escalated (it then skips logging and asks us to retry).
        ...(reasonPayload ? { reason: reasonPayload } : reasonActive() ? { reason: { available: true } } : {}),
      },
      ...(cfg.preview ? { preview: true } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as AnswerResponse;
  return { ok: res.ok, status: res.status, data };
}

async function ask(question: string): Promise<void> {
  messages.push({ role: 'user', content: question });
  loading = true;
  clearSpotlight(); // a new question retires the previous highlight
  render();
  // Prior turns (exclude the question we just pushed; it's sent separately). Only the last 10
  // ride along — the server slices to 10 anyway, so a long chat must not grow the payload.
  const history = messages.filter((m) => !m.error).slice(0, -1).slice(-10).map((m) => ({ role: m.role, content: m.content }));
  // P2 Sense — re-probe on EVERY message (the user may have advanced since the last turn). The
  // shard is normally cached from panel open; a short budget covers the cold case. null = Sense
  // has nothing to say → the context is simply omitted (the copilot behaves exactly as before).
  lastProbe = senseActive() ? await probeForAsk(cfg.apiBase, cfg.key, location.pathname, 800) : null;
  // P2-M5 Reason — the selective trigger (§5.2): diagnostic wording, or a blocked page state.
  // Clearly-diagnostic questions capture NOW and go straight to the reasoning path (no double
  // latency); everything else stays on the fast path. The user does nothing and sees nothing.
  let reasonPayload: ReasonAskPayload | null = null;
  if (reasonActive()) {
    const trigger = reasonTrigger(question, lastProbe);
    if (trigger) reasonPayload = await buildReasonPayload(trigger);
  }
  try {
    let { ok, status, data } = await postAnswer(question, history, reasonPayload);
    // The third trigger — fast-path failure: the server declined but says Reason could try. One
    // capture + one retry (never chains); the typing indicator simply stays up a little longer.
    if (ok && data.covered === false && data.escalate && reasonActive() && !reasonPayload) {
      reasonPayload = await buildReasonPayload('escalation');
      if (reasonPayload) ({ ok, status, data } = await postAnswer(question, history, reasonPayload));
    }
    if (!ok) { log.warn('answer request failed', status, data.error); messages.push({ role: 'assistant', content: data.error || `Request failed (${status})`, error: true }); }
    else if (data.covered) {
      const answered: Msg = { role: 'assistant', content: data.answer ?? '', citations: data.citations ?? [], queryId: data.queryId };
      messages.push(answered);
      // P2-M3 "show me" (config-gated): the answer positioned the user → highlight that step's
      // element, resolved by THIS question's probe (never a stale one). Fallback: the probe keeps
      // one element PER STEP, so a step-number disagreement still highlights a workflow match.
      // Suppressed while a walkthrough runs — its sticky highlight owns the page.
      if (data.position && !walkthroughActive()) {
        const key = `${data.position.sourceId}:${data.position.segmentIndex}:${data.position.step}`;
        if (!cfg.showMe) log.debug('show-me: off (enable it in Studio → Copilot → Settings, then reload this page)');
        else if (!lastProbe) log.debug('show-me: no probe result for this question');
        else {
          const prefix = `${data.position.sourceId}:${data.position.segmentIndex}:`;
          const el =
            lastProbe.elements.get(key) ??
            [...lastProbe.elements.entries()].find(([k]) => k.startsWith(prefix))?.[1];
          if (el && el.isConnected) { log.debug('show-me: highlighting', key); spotlight(root, el); }
          else log.debug('show-me: no live element for', key);
        }
      }
      // P4-M0 — offer to walk the user through the rest (config-gated; needs a position + a shard
      // workflow to walk; the shard is cached from panel open, so this is normally instant).
      if (data.position && cfg.walkthrough && senseActive() && !walkthroughActive()) {
        const workflows = await ensureShard(cfg.apiBase, cfg.key, location.pathname, 800);
        const offer = walkthroughOffer(data.position, workflows);
        if (offer) answered.walkOffer = offer;
        else log.debug('walkthrough: position has no walkable shard workflow');
      }
    }
    else messages.push({ role: 'assistant', content: data.reason || "I don't have that in our help content yet.", decline: true, queryId: data.queryId });
  } catch (e) {
    log.error('could not reach the assistant', e);
    messages.push({ role: 'assistant', content: 'Could not reach the assistant. Please try again.', error: true });
  } finally {
    loading = false;
    render();
  }
}

// P4-M0 → P2-M5 — the walkthrough's "Explain what's blocking me" escalation: open the chat and
// ask the diagnostic question on the user's behalf (their click IS the question). The wording is
// deliberately diagnostic so Reason's intent trigger fires → structured page-state capture →
// the full expected-vs-actual diagnosis, through the exact same path a typed question takes.
function explainBlocker(): void {
  open = true;
  render();
  if (!loading) void ask("Why can't I proceed with this step?");
}

async function sendFeedback(m: Msg, fb: 'up' | 'down'): Promise<void> {
  if (!m.queryId || m.feedback) return;
  m.feedback = fb;
  render();
  try {
    await fetch(`${cfg.apiBase}/v1/copilot/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cfg.key ? { 'X-FlowBuddy-Key': cfg.key } : {}) },
      body: JSON.stringify({ queryId: m.queryId, feedback: fb }),
    });
  } catch { /* best-effort */ }
}

// ---- Drag + expand ----------------------------------------------------------------------------
// The open panel drags by its header (viewport-clamped; the spot lasts for the page view — a
// reload starts back at the configured corner). The header's expand toggle grows the panel to
// near-full viewport height (the base max-height cap); it stays a floating, draggable window and
// never touches the host page's layout.
let expanded = false;
let dragPos: { left: number; top: number } | null = null;

function clampPos(left: number, top: number): { left: number; top: number } {
  return {
    left: Math.min(Math.max(8, left), Math.max(8, window.innerWidth - panel.offsetWidth - 8)),
    top: Math.min(Math.max(8, top), Math.max(8, window.innerHeight - panel.offsetHeight - 8)),
  };
}
function applyDragPos(): void {
  if (!dragPos) return;
  panel.style.left = `${dragPos.left}px`;
  panel.style.top = `${dragPos.top}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
}

function setExpanded(on: boolean): void {
  expanded = on;
  panel.classList.toggle('fb-expanded', on);
  expandBtn.innerHTML = on ? COLLAPSE_SVG : EXPAND_SVG; // static markup, not user content
  expandBtn.setAttribute('aria-label', on ? 'Collapse panel' : 'Expand panel');
  // The taller panel may not fit at the dragged spot — pull it back inside the viewport.
  if (dragPos) { dragPos = clampPos(dragPos.left, dragPos.top); applyDragPos(); }
}

let drag: { dx: number; dy: number } | null = null;
header.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || (e.target as Element).closest('button')) return;
  const r = panel.getBoundingClientRect();
  drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
  header.setPointerCapture(e.pointerId);
  panel.classList.add('fb-dragging');
  e.preventDefault(); // no text selection while dragging
});
header.addEventListener('pointermove', (e) => {
  if (!drag) return;
  dragPos = clampPos(e.clientX - drag.dx, e.clientY - drag.dy);
  applyDragPos();
});
const endDrag = (): void => { drag = null; panel.classList.remove('fb-dragging'); };
header.addEventListener('pointerup', endDrag);
header.addEventListener('pointercancel', endDrag);
expandBtn.addEventListener('click', () => setExpanded(!expanded));
window.addEventListener('resize', () => {
  if (open && dragPos) { dragPos = clampPos(dragPos.left, dragPos.top); applyDragPos(); }
});
// ------------------------------------------------------------------------------------------------

launcher.addEventListener('click', () => {
  open = true;
  render();
  // The viewport may have changed while the panel was closed — re-fit the dragged spot.
  if (dragPos) { dragPos = clampPos(dragPos.left, dragPos.top); applyDragPos(); }
  input.focus();
  // P2 Sense — prefetch this route's shard the moment the panel opens (a strong "about to ask"
  // signal), so the ask-time probe is instant. Fire-and-forget; NOTHING is fetched on page load.
  if (senseActive()) void ensureShard(cfg.apiBase, cfg.key, location.pathname, 1500);
});
closeBtn.addEventListener('click', () => { open = false; clearSpotlight(); render(); });
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
    headers: { 'content-type': 'application/json', 'X-FlowBuddy-Key': cfg.key },
    keepalive: true,
  }).catch(() => { /* best-effort */ });
}

// Server appearance config (Studio → Copilot → Appearance). Fetched before mount so the widget
// first paints already-branded (no default-theme flash). Every field an explicit attr didn't set
// falls through to the server value when it's present and valid, else the built-in default.
interface ServerConfig {
  accent?: string | null; title?: string | null; greeting?: string | null;
  position?: string | null; launcher?: string | null; launcherText?: string | null;
  sense?: boolean; showMe?: boolean; // P2 Sense — Studio-controlled flags
  walkthrough?: boolean; // P4-M0 guided walkthrough — Studio-controlled
  reason?: boolean; reasonImage?: boolean; reasonValues?: boolean; // P2-M5 Reason — Studio-controlled
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
      headers: { 'X-FlowBuddy-Key': cfg.key },
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
  // P2 Sense — no data-flowbuddy-* override for these: they're workspace policy, not page styling.
  if (s.sense === false) cfg.sense = false;
  cfg.showMe = s.showMe === true;
  cfg.walkthrough = s.walkthrough === true; // P4-M0 — workspace policy too (explicit true only)
  // P2-M5 Reason — workspace policy too; the image tier and unmasking require an explicit true.
  if (s.reason === false) cfg.reason = false;
  cfg.reasonImage = s.reasonImage === true;
  cfg.reasonValues = s.reasonValues === true;

  titleEl.textContent = cfg.title; // greeting is read from cfg at render()
  if (cfg.accent) host.style.setProperty('--fb-accent', cfg.accent);
  if (cfg.position === 'left') {
    host.style.setProperty('--fb-right', 'auto');
    host.style.setProperty('--fb-left', '20px');
  } else {
    host.style.removeProperty('--fb-right');
    host.style.removeProperty('--fb-left');
  }
  const isText = cfg.launcher === 'text' || cfg.launcher === 'text-outline';
  launcher.textContent = isText ? cfg.launcherText : '💬';
  launcher.classList.toggle('fb-launcher-pill', isText);
  launcher.classList.toggle('fb-launcher-outline', cfg.launcher === 'text-outline');
}

function mount(): void { document.body.appendChild(host); render(); pingSeen(); }
async function boot(): Promise<void> {
  ensureBrandFonts(); // kick the font download off first — it overlaps the config fetch
  const server = await fetchServerConfig();
  if (server) applyServerConfig(server);
  mount();
  // P4-M0 — pick a mid-workflow walkthrough back up after a full-page navigation. Storage-gated
  // inside (no session = no fetch, nothing runs) and best-effort like everything else at boot.
  if (cfg.walkthrough && senseActive()) {
    void resumeWalkthrough(root, { apiBase: cfg.apiBase, key: cfg.key, reason: cfg.reason }, {
      onExit: () => { open = true; render(); },
      onExplain: explainBlocker,
    });
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void boot());
else void boot();
