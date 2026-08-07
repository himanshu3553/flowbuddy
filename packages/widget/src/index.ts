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
import { walkthroughOffer, startWalkthrough, resumeWalkthrough, walkthroughActive, walkthroughPending } from './walkthrough.js';
import {
  agentRunActive,
  agentRunPending,
  cancelRunValue,
  pressRunContinue,
  provideRunValue,
  registerAgentRunDevTrigger,
  resumeAgentRun,
  runAwaitingValue,
  runCardState,
  setRunPanelOpen,
  startConsentedRun,
  stopRun,
  takeoverRun,
  toggleRunPause,
} from './agent-run.js';
// P2-M5 Reason — the selective diagnostic trigger + structured page-state capture (+ lazy image tier).
import { reasonTrigger, captureSnapshot, renderPageImage, type ReasonAskPayload, type ReasonTrigger } from './reason.js';
// P5-M0 cut 1 — the conversation survives full-page navigations (see the chat-persistence section).
import { clearSession, readSession, writeSession, type SessionSpec } from './session.js';

/** The server sends `{itemId, sourceId, segmentIndex, segmentTitle}`; the widget renders the title
 *  and — since P5-M0 cut 2 — echoes the workflow key back as `context.lastCited` so a follow-up
 *  biases retrieval toward the workflow being discussed. `itemId` stays deliberately unread. */
interface Citation { segmentTitle: string | null; sourceId?: string; segmentIndex?: number }
interface AnswerPosition { sourceId: string; segmentIndex: number; step: number }

/**
 * What a message IS — an open vocabulary, and the axis persistence decides on (P5-M0 cut 1).
 *
 * Later modes append their own kinds rather than reshaping the message: 'assistant.narration' for
 * a run commentary, 'agent.tool_call', and critically D3's 'user.value' for a value the user typed
 * into the chat for the agent to use. What survives a navigation is decided by the PERSISTED_KINDS
 * allowlist — never by the message shape — so excluding chat-supplied sensitive values later means
 * declining to add one string to a set. No storage migration, no retrofit (docs/build/agent.md §6).
 */
// `user.value` is D3's chat-supplied run input (agent.md §6): deliberately NEVER added to
// PERSISTED_KINDS — the value exists for one fill and is gone on navigation, by the allowlist
// that was designed for exactly this — and it never rides /answer or any log.
type MsgKind = 'user.question' | 'assistant.answer' | 'assistant.decline' | 'assistant.error' | 'assistant.narration' | 'user.value';

/** P4 slice 4 — the acting offer riding a covered answer (AI Agent workspaces only; the server
 *  attaches it and is the authority). `prefills` are conversation-supplied values the CONSENT SHEET
 *  shows for confirmation — never sensitive ones (the server refuses those slots). */
interface RunOfferWire {
  key: string;
  title: string;
  planHash: string;
  steps: number;
  inputs: Array<{ index: number; label: string; sensitive: boolean }>;
  destructive: number;
  /** Steps only the user can do (file pickers) — the run pauses for each. */
  manual?: number;
  /** Where the workflow starts, display-safe (Part 2) — the consent sheet's "Starts on…" line. */
  entryRoute?: string;
  /** The founder's narrated "what this does / what has to happen first", scrubbed + capped. */
  about?: string | null;
  prefills: Record<string, string>;
}

interface Msg {
  role: 'user' | 'assistant'; kind: MsgKind; content: string; citations?: Citation[];
  queryId?: string; feedback?: 'up' | 'down';
  // P4-M0 — a positional answer that maps to a walkable workflow carries the offer.
  walkOffer?: { workflow: SenseWorkflow; startStep: number };
  // P4 slice 4 — the acting offer + the consent sheet's open/closed state (transient, never persisted).
  runOffer?: RunOfferWire;
  consentOpen?: boolean;
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
  // The workspace's operating mode, from /v1/copilot/config: 'copilot' (the assistant decides how
  // to help, read-only — the default and the fail-closed value) · 'agent' (adds acting; not built).
  // The widget needs it because some abilities run in the page — but the SERVER re-checks on every
  // call, so nothing here can grant capability.
  mode: 'copilot' as 'copilot' | 'agent',
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
// P4 slice 6 — the DOCKED run strip: while the chat is open it is the run's control surface
// (step counter · status · Continue/Confirm · Pause · Take over · Stop) and the floating card
// stays hidden. Docked at the BOTTOM, right above the composer (user feedback 2026-08-05): the
// run's controls sit where the user's attention already is — beside where they reply.
const runStrip = el('div', 'fb-run-strip');
runStrip.style.display = 'none';
panel.appendChild(runStrip);
// P4 slice 6 — the "answering the agent" chip: shown while a run awaits a value in the chat, so
// the composer's changed job is visible and cancellable (✕ = type it into the page instead).
const valueChip = el('div', 'fb-value-chip');
valueChip.style.display = 'none';
panel.appendChild(valueChip);
panel.appendChild(form);
root.appendChild(launcher);
root.appendChild(panel);

/** The docked run strip — rebuilt from the run's card model. Called on every run-state change and
 *  every render; deliberately NOT part of the message-list rebuild, so 400ms status ticks repaint
 *  a few spans instead of the whole thread. */
function renderRunStrip(): void {
  const showInPanel = open && agentRunActive();
  setRunPanelOpen(showInPanel); // open panel ⇒ hide the floating card; closed ⇒ bring it back
  const rc = showInPanel ? runCardState() : null;
  runStrip.style.display = rc ? '' : 'none';
  if (!rc) return;
  runStrip.replaceChildren();
  const top = el('div', 'fb-run-strip-top');
  top.appendChild(el('span', 'fb-run-strip-chip', rc.chip));
  top.appendChild(el('span', 'fb-run-strip-instr', rc.instr));
  const x = el('button', 'fb-run-strip-x', '✕');
  x.type = 'button';
  x.setAttribute('aria-label', 'Stop the run');
  x.addEventListener('click', () => stopRun());
  top.appendChild(x);
  runStrip.appendChild(top);
  if (rc.status) {
    runStrip.appendChild(el('div', `fb-run-strip-status${rc.stall ? ' fb-walk-stalled' : ''}`, rc.status));
  }
  const row = el('div', 'fb-run-strip-actions');
  if (rc.cont) {
    const b = el('button', 'fb-walk-btn fb-walk-next', rc.cont);
    b.type = 'button';
    b.addEventListener('click', () => pressRunContinue());
    row.appendChild(b);
  }
  const p = el('button', 'fb-walk-btn', rc.paused ? 'Resume' : 'Pause');
  p.type = 'button';
  p.addEventListener('click', () => toggleRunPause());
  row.appendChild(p);
  const t = el('button', 'fb-walk-btn', "I'll take it from here");
  t.type = 'button';
  t.addEventListener('click', () => takeoverRun());
  row.appendChild(t);
  runStrip.appendChild(row);
}

function render(): void {
  panel.style.display = open ? 'flex' : 'none';
  // Real embeds swap launcher ↔ panel; the Studio preview shows BOTH (panel lifted above).
  launcher.style.display = open && !cfg.preview ? 'none' : 'flex';
  renderRunStrip();
  // P4 slice 6 — while the run awaits a value, the composer's job changes and must SAY so. Truth
  // is read live from the run (never cached): the run ending or moving on instantly restores the
  // normal composer, whatever this module thought was pending.
  const awaitingValue = runAwaitingValue();
  input.placeholder = awaitingValue ? `${awaitingValue.label} — type just the value…` : 'Ask anything…';
  valueChip.style.display = awaitingValue ? '' : 'none';
  if (awaitingValue) {
    valueChip.replaceChildren();
    valueChip.appendChild(el('span', 'fb-value-chip-label', `Answering: ${awaitingValue.label}`));
    const x = el('button', 'fb-value-chip-x', '✕');
    x.type = 'button';
    x.setAttribute('aria-label', 'Cancel — type it into the page instead');
    x.addEventListener('click', () => {
      cancelRunValue();
      render();
    });
    valueChip.appendChild(x);
  }
  list.replaceChildren();
  if (messages.length === 0) list.appendChild(el('div', 'fb-greeting', cfg.greeting));
  for (const m of messages) {
    const row = el('div', `fb-msg fb-${m.role}${m.kind === 'assistant.decline' ? ' fb-decline' : ''}${m.kind === 'assistant.error' ? ' fb-error' : ''}`);
    row.appendChild(bubbleEl(m));
    const titles = [...new Set((m.citations ?? []).map((c) => c.segmentTitle).filter((t): t is string => !!t))];
    if (titles.length) {
      // "Source" pill (accent dot + mono label). Titles are user content — text nodes only.
      const pill = el('div', 'fb-cites');
      pill.appendChild(el('span', 'fb-dot'));
      pill.appendChild(document.createTextNode('Source: ' + titles.join(' · ')));
      row.appendChild(pill);
    }
    if (m.kind === 'assistant.decline') {
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
            // Exiting the walkthrough brings the chat back — persisted so a later navigation
            // restores the panel in the state the user last left it in.
            onExit: () => { open = true; render(); persistChat(); },
            onExplain: explainBlocker, // blocked/invalid → the Reason diagnostic path, in chat
          },
        );
        render();
        persistChat(); // the panel closed for the run — remember that across the steps that navigate
      });
      row.appendChild(btn);
    }
    // P4 slice 4 — the acting offer (server-attached; AI Agent workspaces only). The pill opens
    // the consent sheet; the sheet's "Run it" click is the consent (D8: typed, never words).
    if (m.runOffer && !agentRunActive()) {
      if (m.consentOpen) {
        row.appendChild(consentSheet(m, m.runOffer));
      } else {
        const offerBtn = el('button', 'fb-walk-offer', 'Run it for me');
        offerBtn.addEventListener('click', () => {
          m.consentOpen = true;
          render();
        });
        row.appendChild(offerBtn);
      }
    }
    if (m.role === 'assistant' && m.kind !== 'assistant.error' && m.queryId) {
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
  // Fastify's DEFAULT error shape is { statusCode, error: 'Bad Request', message }. `error` is only
  // the HTTP status NAME — the useful half is `message`. Typed so it can be logged, never rendered.
  message?: string;
  position?: AnswerPosition | null; escalate?: boolean;
  runOffer?: RunOfferWire; // P4 slice 4 — only ever sent to AI Agent workspaces
}

/**
 * P5-M0 cut 2 — the workflow keys the most recent ANSWER cited, for `context.lastCited`.
 *
 * Scans back to the last `assistant.answer`, so an intervening decline is transparent rather than
 * resetting the thread — a decline contributed no topic, and dropping the bias because of one
 * would strand the very follow-up ("ok, and then what?") this exists to serve. Bounded by the
 * 20-message cap, and the server re-verifies every key against `CopilotApproval` regardless.
 */
function lastCitedKeys(): Array<{ sourceId: string; segmentIndex: number }> {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.kind !== 'assistant.answer') continue;
    const out: Array<{ sourceId: string; segmentIndex: number }> = [];
    const seen = new Set<string>();
    for (const c of m.citations ?? []) {
      const { sourceId, segmentIndex } = c;
      if (typeof sourceId !== 'string' || !sourceId) continue;
      if (typeof segmentIndex !== 'number' || !Number.isInteger(segmentIndex)) continue;
      const key = `${sourceId}:${segmentIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ sourceId, segmentIndex });
      if (out.length >= 4) break; // the server caps too; keep the payload small
    }
    return out;
  }
  return [];
}

async function postAnswer(
  question: string,
  history: Array<{ role: string; content: string }>,
  reasonPayload: ReasonAskPayload | null,
): Promise<{ ok: boolean; status: number; data: AnswerResponse }> {
  const lastCited = lastCitedKeys();
  const context = {
    path: location.pathname,
    title: document.title,
    // P5-M0 cut 2 — what the previous answer cited (omitted entirely when there is nothing to
    // say, so a first question is byte-identical to today's payload).
    ...(lastCited.length > 0 ? { lastCited } : {}),
    ...(lastProbe && lastProbe.hypotheses.length > 0
      ? { sense: { probed: true, tie: lastProbe.tie, hypotheses: lastProbe.hypotheses } }
      : {}),
    // P2-M5 Reason — either the captured evidence, or a capability flag so the server knows a
    // fast-path decline may be escalated (it then skips logging and asks us to retry).
    ...(reasonPayload ? { reason: reasonPayload } : reasonActive() ? { reason: { available: true } } : {}),
  };
  captureForFixture(question, context);
  const res = await fetch(`${cfg.apiBase}/v1/copilot/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cfg.key ? { 'X-FlowBuddy-Key': cfg.key } : {}) },
    body: JSON.stringify({ question, history, context, ...(cfg.preview ? { preview: true } : {}) }),
  });
  const data = (await res.json().catch(() => ({}))) as AnswerResponse;
  return { ok: res.ok, status: res.status, data };
}

/**
 * FIXTURE CAPTURE — debug builds only (`data-flowbuddy-debug="true"`), so a customer's page is
 * untouched and nothing is emitted on a normal embed.
 *
 * The diagnostic path's test fixtures are LIFTED from a real page, never hand-written. `filled`,
 * `valid` and `invalidReason` come from the live constraint-validation API, and `reason.ts`
 * deliberately OMITS `valid` where a control carries no machine-checkable constraint — so a
 * hand-authored snapshot encodes what we IMAGINE a page reports, which is the one thing a
 * regression fixture must not do.
 *
 * Sense is stashed alongside the snapshot because a snapshot alone measures a crippled engine: the
 * server attaches the founder's expected-state artifacts off the top SENSE hypothesis, so without
 * it `get_expected_screenshot` / `get_expected_dom` are never bound and a third of the diagnostic
 * path goes unexercised. Both halves must come from the SAME moment on the SAME page.
 *
 * Capture recipe + how to turn this into a fixture file: docs/ops/e2e-testing.md.
 */
function captureForFixture(question: string, context: Record<string, unknown>): void {
  if (!cfg.debug) return;
  const g = window as unknown as { FlowBuddyLastAsk?: unknown };
  // `path` and `title` ride along: the replay harness sends them as the host-page context, and a
  // fixture captured on the wrong route would otherwise be indistinguishable from a good one.
  g.FlowBuddyLastAsk = { question, context };
  log.debug('fixture capture: window.FlowBuddyLastAsk updated', {
    reason: 'reason' in context,
    sense: 'sense' in context,
  });
}

async function ask(question: string): Promise<void> {
  messages.push({ role: 'user', kind: 'user.question', content: question });
  loading = true;
  clearSpotlight(); // a new question retires the previous highlight
  render();
  // Persist the question NOW, not just with its answer: a walkthrough step that navigates while
  // the request is in flight must not lose what the user just asked.
  persistChat();
  // Prior turns (exclude the question we just pushed; it's sent separately). Only the last 10
  // ride along — the server slices to 10 anyway, so a long chat must not grow the payload.
  // Since P5-M0 cut 1 this history can SPAN NAVIGATIONS — that is the point, and it is the one
  // behavioral change the cut makes to the answer path.
  const history = messages.filter((m) => m.kind !== 'assistant.error').slice(0, -1).slice(-10).map((m) => ({ role: m.role, content: m.content }));
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
    if (!ok) {
      // Log BOTH halves: on an unhandled server throw `error` is the bare status name ("Bad
      // Request") and `message` carries what actually went wrong. Losing `message` here once cost
      // a real debugging session.
      log.warn('answer request failed', status, data.error, data.message);
      // Never show the end-user a raw HTTP status name — it reads as gibberish mid-task. A handled
      // error carries a written-for-humans `error`; anything else gets a plain sentence.
      const humane = data.error && data.error !== 'Bad Request' && data.error !== 'Internal Server Error';
      messages.push({
        role: 'assistant',
        kind: 'assistant.error',
        content: humane ? data.error! : "Something went wrong on my side — try asking again.",
      });
    }
    else if (data.covered) {
      const answered: Msg = { role: 'assistant', kind: 'assistant.answer', content: data.answer ?? '', citations: data.citations ?? [], queryId: data.queryId };
      messages.push(answered);
      // P2-M3 "show me" (config-gated): the answer positioned the user → highlight that step's
      // element, resolved by THIS question's probe (never a stale one). Fallback: the probe keeps
      // one element PER STEP, so a step-number disagreement still highlights a workflow match.
      // Suppressed while a walkthrough runs — its sticky highlight owns the page.
      //
      // THE FOUNDER'S SWITCH IS THE ONLY DECIDER — this and the walkthrough offer below both fire on
      // EVERY positional answer when their switch is on. **This amends D8** (founder decision
      // 2026-08-02), which had made each offer the assistant's judgment per message.
      //
      // Why the rule won. A "maybe" is a bad control: under judgment a founder cannot tell a switch
      // that is OFF from one that is ON and being declined, which leaves the feature undemonstrable,
      // undiscoverable to end-users and unsupportable. As a rule the switch means yes or no, and OFF
      // is the escape hatch. The judgment it replaces was never measured — the risk of the agent
      // UNDER-offering was flagged when mode 2 shipped and nobody watched it — so this trades an
      // unmeasured judgment for a predictable rule. Reversal is cheap and explicit: re-add the
      // prompt section and the two schema fields the answer used to carry — both were removed with
      // the judgment, because a preference nobody obeys is prompt real estate spent on nothing.
      //
      // And the noise D8 feared is mostly structural anyway. Four gates already stand here: the
      // answer must be POSITIONAL (a general question never reaches this code); a clarifying question
      // sets `usedPosition` false, so "interrupting someone you just asked a question" cannot happen;
      // the highlight needs an element THIS probe resolved; and `walkthroughOffer` returns null on
      // the last step, so the offer cannot fire with nothing left to walk. What remains is a user
      // mid-workflow seeing one ring and one pill, which is the intended behaviour.
      //
      // Given up: the assistant can no longer stay quiet at a moment only it can see is wrong.
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
      // P4 slice 4 — the acting offer (server-decided: only an AI Agent workspace with a runnable
      // workflow ever receives one). The pill renders with the answer; its click opens the consent
      // sheet, and the sheet's "Run it" click is the consent.
      if (data.runOffer) answered.runOffer = data.runOffer as RunOfferWire;
    }
    else messages.push({ role: 'assistant', kind: 'assistant.decline', content: data.reason || "I don't have that in our help content yet.", queryId: data.queryId });
  } catch (e) {
    log.error('could not reach the assistant', e);
    messages.push({ role: 'assistant', kind: 'assistant.error', content: 'Could not reach the assistant. Please try again.' });
  } finally {
    loading = false;
    render();
    persistChat();
  }
}

// ── P4 slice 4 — the acting run's chat plumbing ─────────────────────────────────────────────────
// One hooks bundle for every way a run starts or resumes: exits re-open the panel, and narration
// lands in the thread as its own message kind (persisted, so it survives the navigations the run
// itself causes).
const onOverlayExit = (): void => { open = true; render(); persistChat(); };
function pushNarration(text: string): void {
  messages.push({ role: 'assistant', kind: 'assistant.narration', content: text });
  render();
  persistChat();
}
const runHooks = () => ({
  onExit: onOverlayExit,
  onNarrate: pushNarration,
  // Slice 6 — the run asks for a value IN the thread; the composer's routing follows the run's
  // live state (render reads `runAwaitingValue()`), so this only renders the ask and repaints.
  onNeedValue: (req: { ask: string }) => {
    open = true; // the conversation is the run's surface — make sure it is on screen for the ask
    pushNarration(req.ask);
  },
  // The run's control surface changed (step advanced, status line, pause) — repaint the strip only.
  onState: renderRunStrip,
});
const runCfg = () => ({ apiBase: cfg.apiBase, key: cfg.key, reason: cfg.reason });

/** The consent sheet's "Run it" click — the consent itself (D8: a typed affordance, never words). */
async function startOfferedRun(offer: RunOfferWire, queryId: string | undefined): Promise<void> {
  const outcome = await startConsentedRun(
    root,
    runCfg(),
    runHooks(),
    { key: offer.key, title: offer.title, planHash: offer.planHash, prefills: offer.prefills },
    queryId,
  );
  if (outcome === 'started') {
    // Slice 6: the panel STAYS OPEN — the conversation is the run's primary surface (narration
    // streams in, value asks land here), with the card as the compact progress HUD beside it.
    render();
    persistChat();
    return;
  }
  pushNarration(
    outcome === 'changed'
      ? 'That workflow just changed on the other side — ask me again and I’ll offer the current version.'
      : 'I can’t run that right now — you can still do it yourself and I’ll guide you.',
  );
}

/** The consent sheet: what will run, the values it will use, what it will ask for, what gets a
 *  confirm — read before the one click that means "go". */
function consentSheet(m: Msg, offer: RunOfferWire): HTMLElement {
  const sheet = el('div', 'fb-run-consent');
  sheet.appendChild(el('div', 'fb-run-consent-title', `Run “${offer.title}” — ${offer.steps} steps`));
  // Part 2 — the "before" made visible: what this does (the founder's own words, where "what has
  // to happen first" lives) and where it starts.
  if (offer.about) sheet.appendChild(el('div', 'fb-run-consent-meta', offer.about));
  if (offer.entryRoute) {
    sheet.appendChild(
      el('div', 'fb-run-consent-meta', `Starts on ${offer.entryRoute} — I’ll head there if needed.`),
    );
  }
  const prefillKeys = Object.keys(offer.prefills);
  for (const k of prefillKeys) {
    const label = offer.inputs.find((s) => s.index === Number(k))?.label ?? `step ${k}`;
    const line = el('div', 'fb-run-consent-meta');
    line.appendChild(document.createTextNode(`Using from our chat: ${label} = `));
    const val = el('span', 'fb-run-consent-val', `“${offer.prefills[k]}”`);
    line.appendChild(val);
    sheet.appendChild(line);
  }
  const typed = offer.inputs.filter((s) => !(String(s.index) in offer.prefills)).length;
  if (typed > 0) {
    sheet.appendChild(
      el('div', 'fb-run-consent-meta', `I’ll pause for ${typed} field${typed === 1 ? '' : 's'} you type directly into the app.`),
    );
  }
  if (offer.destructive > 0) {
    sheet.appendChild(
      el('div', 'fb-run-consent-meta', `${offer.destructive} step${offer.destructive === 1 ? '' : 's'} will ask you to confirm before it happens.`),
    );
  }
  if ((offer.manual ?? 0) > 0) {
    sheet.appendChild(
      el('div', 'fb-run-consent-meta', `${offer.manual} step${offer.manual === 1 ? '' : 's'} you’ll do yourself (like choosing a file) — I’ll pause and wait.`),
    );
  }
  const actions = el('div', 'fb-run-consent-actions');
  const go = el('button', 'fb-walk-btn fb-walk-next', 'Run it');
  const cancel = el('button', 'fb-walk-btn', 'Cancel');
  go.addEventListener('click', () => {
    go.disabled = true;
    cancel.disabled = true;
    m.consentOpen = false;
    void startOfferedRun(offer, m.queryId);
  });
  cancel.addEventListener('click', () => {
    m.consentOpen = false;
    render();
  });
  actions.appendChild(go);
  actions.appendChild(cancel);
  sheet.appendChild(actions);
  return sheet;
}

// P4-M0 → P2-M5 — the walkthrough's "Explain what's blocking me" escalation: open the chat and
// ask the diagnostic question on the user's behalf (their click IS the question). The wording is
// deliberately diagnostic so Reason's intent trigger fires → structured page-state capture →
// the full expected-vs-actual diagnosis, through the exact same path a typed question takes.
function explainBlocker(): void {
  open = true;
  render();
  persistChat(); // ask() persists too, but the panel state must stick even if a request is in flight
  if (!loading) void ask("Why can't I proceed with this step?");
}

async function sendFeedback(m: Msg, fb: 'up' | 'down'): Promise<void> {
  if (!m.queryId || m.feedback) return;
  m.feedback = fb;
  render();
  persistChat(); // a rated answer stays rated after a navigation
  try {
    await fetch(`${cfg.apiBase}/v1/copilot/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cfg.key ? { 'X-FlowBuddy-Key': cfg.key } : {}) },
      body: JSON.stringify({ queryId: m.queryId, feedback: fb }),
    });
  } catch { /* best-effort */ }
}

// ---- P5-M0 cut 1 · chat persistence -----------------------------------------------------------
// The thread survives full-page navigations. The walkthrough already did this for its own run
// state; the chat never did — so following the copilot's own advice, or a walkthrough step that
// navigates, wiped the conversation the user was in the middle of. The sharpest case was the
// walkthrough's own "Explain what's blocking me" escalation landing in an empty panel.
//
// MODE-NEUTRAL BY CONSTRUCTION: mode 1 (today's copilot) and mode 2 (the unified agent loop) are
// the same conversation, so this is the substrate for both — docs/build/agent.md §8 step 1 ships
// it to mode 1 as hygiene, not as an agent feature.
//
// Everything read back is untrusted (the host page shares this origin and can write these keys):
// kinds are re-filtered through the allowlist, fields are copied one by one, sizes are capped.
// Restoring can only ever repopulate the transcript — never a highlight, never a walkthrough
// offer, never a position; Sense re-measures those every message, by design.

/** What survives a navigation. Absence is the mechanism: a kind not listed here is dropped on the
 *  way in AND on the way out, so D3's 'user.value' is excluded by never being added. */
const PERSISTED_KINDS: ReadonlySet<MsgKind> = new Set<MsgKind>([
  'user.question', 'assistant.answer', 'assistant.decline',
  // The run's commentary is part of the conversation — it must survive the very navigations the
  // run itself causes, or the thread reads as if nothing happened (P4 slice 4).
  'assistant.narration',
]);
// 'assistant.error' is deliberately absent — a transport failure is about a moment, not about the
// conversation, and restoring "Request failed (503)" onto a fresh page is noise. The answer
// history already excludes them for the same reason.

const CHAT_TTL_MS = 30 * 60_000;   // matches the walkthrough's, so both sessions expire together
const CHAT_REOPEN_MS = 2 * 60_000; // the panel re-opens ITSELF only on a demonstrably live thread
const CHAT_MAX_MESSAGES = 20;
const CHAT_MAX_CONTENT = 4000;
const CHAT_MAX_CITATIONS = 8;
const CHAT_MAX_TITLE = 200;

interface PersistedMsg {
  role: Msg['role']; kind: MsgKind; content: string;
  citations?: Citation[]; queryId?: string; feedback?: 'up' | 'down';
}
interface ChatSession { open: boolean; messages: PersistedMsg[] }

const CHAT_SESSION: SessionSpec<ChatSession> = {
  slot: 'chat',
  version: 1,
  ttlMs: CHAT_TTL_MS,
  validate: (s) => Array.isArray(s?.messages),
};

/** Off wherever analytics and the heartbeat are off — a Studio preview reloads on every appearance
 *  edit and must not accumulate a thread across those reloads. */
const chatPersistEnabled = (): boolean => Boolean(cfg.key) && !cfg.preview;

/** Field-by-field allowlist. `walkOffer` (a full founder-derived plan copy) structurally cannot
 *  reach storage, and any field added to Msg later has to be opted in here deliberately. */
function toPersisted(m: Msg): PersistedMsg {
  const p: PersistedMsg = { role: m.role, kind: m.kind, content: m.content };
  if (m.citations?.length) p.citations = m.citations;
  if (m.queryId) p.queryId = m.queryId;
  if (m.feedback) p.feedback = m.feedback;
  return p;
}

/** Rebuild live messages from stored ones, discarding anything malformed rather than trusting it. */
function fromPersisted(list: PersistedMsg[]): Msg[] {
  const out: Msg[] = [];
  for (const raw of list.slice(-CHAT_MAX_MESSAGES)) {
    if (!raw || typeof raw.content !== 'string') continue;
    if (raw.role !== 'user' && raw.role !== 'assistant') continue;
    if (!PERSISTED_KINDS.has(raw.kind)) continue; // unknown, forged, or since-revoked kinds
    const m: Msg = { role: raw.role, kind: raw.kind, content: raw.content.slice(0, CHAT_MAX_CONTENT) };
    if (Array.isArray(raw.citations)) {
      m.citations = raw.citations
        .filter((c) => Boolean(c) && typeof c === 'object')
        .slice(0, CHAT_MAX_CITATIONS)
        .map((c) => {
          // The workflow key must survive the restore, not just the title: continuity bias
          // (cut 2) matters MOST right after a navigation, which is exactly when the citations
          // come from storage rather than from a live response.
          const out: Citation = {
            segmentTitle: typeof c.segmentTitle === 'string' ? c.segmentTitle.slice(0, CHAT_MAX_TITLE) : null,
          };
          if (typeof c.sourceId === 'string') out.sourceId = c.sourceId.slice(0, 64);
          if (typeof c.segmentIndex === 'number' && Number.isInteger(c.segmentIndex)) {
            out.segmentIndex = c.segmentIndex;
          }
          return out;
        });
    }
    if (typeof raw.queryId === 'string') m.queryId = raw.queryId.slice(0, 64);
    if (raw.feedback === 'up' || raw.feedback === 'down') m.feedback = raw.feedback;
    out.push(m);
  }
  return out;
}

function persistChat(): void {
  if (!chatPersistEnabled()) return;
  const keep = messages.filter((m) => PERSISTED_KINDS.has(m.kind)).slice(-CHAT_MAX_MESSAGES).map(toPersisted);
  if (keep.length === 0) { clearSession(CHAT_SESSION); return; }
  writeSession(CHAT_SESSION, cfg.key, { open, messages: keep });
}

/** Boot-time restore. Runs BEFORE mount so the first paint already carries the thread. */
function restoreChat(): void {
  if (!chatPersistEnabled()) return;
  const stored = readSession(CHAT_SESSION, cfg.key);
  if (!stored) return;
  const restored = fromPersisted(stored.data.messages);
  if (restored.length === 0) { clearSession(CHAT_SESSION); return; }
  messages.push(...restored);
  // Re-open the panel only on a demonstrably live thread. Restoring it from any half-hour-old
  // session would pop the copilot open on a page the user navigated to for their own reasons — on
  // someone else's product. The short window keeps continuity where it was clearly intentional and
  // stays quiet otherwise. A resuming walkthrough owns the screen (starting one closes the panel),
  // so never fight it — resumeWalkthrough is async, which is why the peek is synchronous.
  const walkResuming = cfg.walkthrough && senseActive() && walkthroughPending(cfg.key);
  // Slice 6: a RESUMING RUN now forces the panel OPEN — the conversation is the run's surface
  // (narration + value asks land there), the exact opposite of the walkthrough's card-only rule.
  const runResuming = agentRunPending(cfg.key);
  if (runResuming) open = true;
  else if (stored.data.open === true && stored.ageMs <= CHAT_REOPEN_MS && !walkResuming) open = true;
  log.debug('chat: restored', { messages: restored.length, ageMs: stored.ageMs, open, walkResuming, runResuming });
}
// ------------------------------------------------------------------------------------------------

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
  persistChat();
  // The viewport may have changed while the panel was closed — re-fit the dragged spot.
  if (dragPos) { dragPos = clampPos(dragPos.left, dragPos.top); applyDragPos(); }
  input.focus();
  // P2 Sense — prefetch this route's shard the moment the panel opens (a strong "about to ask"
  // signal), so the ask-time probe is instant. Fire-and-forget; NOTHING is fetched on page load.
  if (senseActive()) void ensureShard(cfg.apiBase, cfg.key, location.pathname, 1500);
});
closeBtn.addEventListener('click', () => { open = false; clearSpotlight(); render(); persistChat(); });
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q || loading) return;
  // P4 slice 6 — while the run awaits a value, the next message IS that value: routed to the run,
  // rendered as `user.value` (excluded from persistence by the allowlist — the D3 exclusion built
  // waiting for this), never sent to /answer, never logged anywhere. Checked LIVE so a run that
  // ended between keystrokes gets a normal question, not a swallowed message.
  if (runAwaitingValue()) {
    input.value = '';
    messages.push({ role: 'user', kind: 'user.value', content: q });
    render();
    void provideRunValue(q);
    return;
  }
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
  mode?: string; // operating mode — 'copilot' | 'agent' (unknown values fail closed to 'copilot')
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
  // Operating mode — anything unrecognised stays 'copilot', the read-only floor. That covers a
  // pre-retirement 'chatbot' row without a special case. The widget never widens its own capability
  // from a config value; the server is the authority and re-checks every call.
  if (s.mode === 'copilot' || s.mode === 'agent') cfg.mode = s.mode;
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
  // P5-M0 cut 1 — pick the conversation back up BEFORE the first paint, so a restored thread never
  // flashes the empty greeting first. Needs the resolved config (preview + the walkthrough flag).
  restoreChat();
  mount();
  // P4-M2 — an acting run resumes FIRST (one overlay at a time; storage-gated inside, so a page
  // with no run in flight fetches nothing). Runs start from a chat offer's consent sheet (slice 4)
  // or, on debug builds, the dev trigger; both share the same hooks, so narration and exits behave
  // identically however the run began.
  registerAgentRunDevTrigger(root, { ...runCfg(), debug: cfg.debug }, runHooks());
  const runResumed = await resumeAgentRun(root, runCfg(), runHooks());
  // P4-M0 — pick a mid-workflow walkthrough back up after a full-page navigation. Storage-gated
  // inside (no session = no fetch, nothing runs) and best-effort like everything else at boot.
  if (!runResumed && cfg.walkthrough && senseActive()) {
    void resumeWalkthrough(root, runCfg(), {
      onExit: onOverlayExit,
      onExplain: explainBlocker,
    });
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void boot());
else void boot();
