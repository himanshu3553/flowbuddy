// P2 Sense (in-context help) — the widget half of the LOCKED hybrid architecture
// (docs/phase-2-sense.md §2): fetch the ROUTE-SHARDED sense plan on panel open, run an ask-time
// READ-ONLY probe of the live DOM against it, score deterministic top-k hypotheses ("the user
// appears to be at step 3 of Create an invoice"), and ship ONLY those hypotheses — evidence
// booleans plus one MASKED error snippet — on the /answer call. Never screenshots, never DOM,
// never input values, never continuous monitoring: the probe is an instantaneous glance at ask
// time, and everything here degrades silently (Sense failing must never break an answer).

import { log } from './log.js';

// ── Plan wire shapes (mirror packages/api/src/sense-plan.ts) ────────────────────────────────────
export interface SenseLocator {
  strategy: string;
  value: string;
  unique?: boolean;
}
export interface SenseStep {
  index: number; // 1-based
  instruction: string;
  route: string;
  kind: 'input' | 'action';
  locators: SenseLocator[];
  postRoute?: string;
}
export interface SenseWorkflow {
  sourceId: string;
  segmentIndex: number;
  title: string;
  steps: SenseStep[];
}

/** One hypothesis as sent to /answer (server re-validates every field against approvals). */
export interface SenseHypothesisWire {
  sourceId: string;
  segmentIndex: number;
  step: number;
  totalSteps: number;
  confidence: number;
  stepsDone: number[];
  error?: string;
}

export interface SenseProbeResult {
  tie: boolean;
  hypotheses: SenseHypothesisWire[];
  /** `${sourceId}:${segmentIndex}:${step}` → EVERY resolved step's element (powers the show-me
   *  highlight and the P4-M0 walkthrough's initial aim; walkthrough.ts re-resolves live after). */
  elements: Map<string, Element>;
}

// ── Masking (client-side, before anything leaves the page) ─────────────────────────────────────
// The error snippet is the ONLY page text Sense ships; scrub high-precision structured PII first,
// using the same placeholder vocabulary as the server's P1-M12 redactText. Card before phone
// (digit-run overlap). Shared with the P2-M5 Reason capture (reason.ts) — one masking vocabulary.
export function maskText(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[redacted-email]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[redacted-card]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[redacted-ssn]')
    .replace(/\+?\d{1,3}[ .-]?\(?\d{2,4}\)?[ .-]\d{3,4}[ .-]?\d{2,4}/g, '[redacted-phone]');
}

// ── Route matching (mirrors the server/retrieval rules: segment-boundary, root matches nothing) ─
export function normalizePath(p: string): string {
  const s = (p || '').trim().replace(/\/+$/, '');
  return s === '' ? '/' : s;
}
/** 2 = exact, 1 = segment-boundary prefix (either direction), 0 = no match. */
export function matchStrength(stepRoute: string, ctx: string): number {
  if (!stepRoute || ctx === '/') return 0;
  const route = normalizePath(stepRoute);
  if (route === '/') return 0;
  if (route === ctx) return 2;
  if (route.startsWith(ctx + '/') || ctx.startsWith(route + '/')) return 1;
  return 0;
}

// ── Locator resolution (read-only; every strategy but text/xpath is a ready-to-run selector) ───
const TEXT_CANDIDATE_SELECTOR = 'button, a, [role="button"], [role="menuitem"], [role="tab"], summary, label';
const MAX_TEXT_CANDIDATES = 400;

function resolveLocator(loc: SenseLocator): Element | null {
  try {
    if (loc.strategy === 'xpath') {
      const r = document.evaluate(loc.value, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return r.singleNodeValue instanceof Element ? r.singleNodeValue : null;
    }
    if (loc.strategy === 'text') {
      const want = loc.value.trim();
      if (!want) return null;
      const candidates = document.querySelectorAll(TEXT_CANDIDATE_SELECTOR);
      const n = Math.min(candidates.length, MAX_TEXT_CANDIDATES);
      for (let i = 0; i < n; i++) {
        const el = candidates[i]!;
        if ((el.textContent ?? '').trim().replace(/\s+/g, ' ') === want) return el;
      }
      return null;
    }
    return document.querySelector(loc.value);
  } catch {
    return null; // an invalid selector must never break the probe
  }
}

export function resolveStep(step: SenseStep): Element | null {
  for (const loc of step.locators) {
    const el = resolveLocator(loc);
    if (el) return el;
  }
  return null;
}

// ── Element evidence (booleans only) ───────────────────────────────────────────────────────────
export function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}
export function isFilled(el: Element): boolean {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    return el.checked; // a checkbox's .value is always "on" — an unchecked box is IN FRONT of the user
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return el.value.trim() !== '';
  }
  return false;
}

// ── Alert/error surfaces (shared: Sense's error snippet + Reason's [alert] capture pass) ───────
// Detection is GENERIC, never per-app: web standards (role=alert, assertive live regions),
// error-styled class names, and the one near-universal visual convention — red-family TEXT on a
// short visible block (catches utility-CSS banners: Tailwind's text-red-600 carries no "error" in
// any class name and usually no role, yet it's how half of modern SaaS reports a rejection).
const ALERT_STANDARDS_SELECTOR =
  '[role="alert"], [aria-live="assertive"], [class*="error" i], [class*="danger" i], [class*="alert" i]';
const RED_TEXT_CANDIDATE_SELECTOR = 'div, p, span, output, small, li, strong, em';
const MAX_RED_TEXT_CANDIDATES = 400;

function isRedFamily(color: string): boolean {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  if (!m) return false;
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return r >= 150 && r > g * 1.4 && r > b * 1.4; // red-dominant, not brown/orange-muddy
}
/** Does this element carry its OWN short text (a direct text-node child)? Color inherits, so
 *  without this a red-themed wrapper with no text of its own would false-positive. */
function hasOwnText(el: Element): boolean {
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE && (n.nodeValue ?? '').trim().length >= 2) return true;
  }
  return false;
}

/** Visible alert/error surfaces on the page, document order, outermost-first (nested duplicates
 *  dropped). Read-only, bounded, ~ms. */
export function findAlertSurfaces(max = 8): Element[] {
  const out: Element[] = [];
  const push = (el: Element): void => {
    if (out.length >= max) return;
    if (!isVisible(el) || el.closest('#flowbuddy-copilot-root')) return;
    if ((el.textContent ?? '').trim().length < 2) return;
    if (out.some((c) => c.contains(el) || el.contains(c))) return; // outermost wins
    out.push(el);
  };
  try {
    document.querySelectorAll(ALERT_STANDARDS_SELECTOR).forEach(push);
    if (out.length < max) {
      const candidates = document.querySelectorAll(RED_TEXT_CANDIDATE_SELECTOR);
      const n = Math.min(candidates.length, MAX_RED_TEXT_CANDIDATES);
      for (let i = 0; i < n && out.length < max; i++) {
        const el = candidates[i]!;
        if ((el.textContent ?? '').length > 300) continue; // text blocks, not page containers
        if (!hasOwnText(el)) continue;
        if (!isRedFamily(getComputedStyle(el).color)) continue;
        push(el);
      }
    }
  } catch {
    /* detection must never break a probe or capture */
  }
  return out;
}

/** The masked on-screen error near the current step, if one is showing (the "why stuck" signal). */
function findError(el: Element): string | undefined {
  let text = '';
  const describedBy = el.getAttribute('aria-describedby');
  if (el.getAttribute('aria-invalid') === 'true' && describedBy) {
    for (const id of describedBy.split(/\s+/)) {
      const d = document.getElementById(id);
      if (d?.textContent?.trim()) {
        text = d.textContent;
        break;
      }
    }
  }
  if (!text) {
    const scope = el.closest('form, [role="dialog"], section') ?? document.body;
    const alert = scope.querySelector('[role="alert"], [aria-live="assertive"]');
    if (alert?.textContent?.trim()) text = alert.textContent;
  }
  // Last resort: any live alert surface on the page (incl. red-styled utility-CSS banners that
  // carry no role/class signal) — so even FAST-PATH answers know a rejection is on screen and
  // stop advising the user to click again.
  if (!text) {
    const surface = findAlertSurfaces(1)[0];
    if (surface?.textContent?.trim()) text = surface.textContent;
  }
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean ? maskText(clean).slice(0, 200) : undefined;
}

// ── The scorer (deterministic; the answer LLM makes the final call with the question in hand) ──
const MIN_SCORE = 0.2; // below this a workflow isn't worth sending as a hypothesis
const TIE_DELTA = 0.15; // top two closer than this = "ask X or Y?" territory

/** Probe the live DOM against a shard and score top-k hypotheses. Read-only; ~ms. */
export function runProbe(workflows: SenseWorkflow[], path: string): SenseProbeResult {
  const ctx = normalizePath(path);
  const elements = new Map<string, Element>();
  const scored: Array<{ h: SenseHypothesisWire; score: number; el: Element | null }> = [];

  for (const wf of workflows) {
    if (wf.steps.length === 0) continue;
    let exact = false;
    let anyMatch = false;
    let candidate: { step: SenseStep; el: Element } | null = null;
    let lastFound: { step: SenseStep; el: Element } | null = null;
    const filled: number[] = [];

    for (const step of wf.steps) {
      const m = matchStrength(step.route, ctx);
      if (m > 0) anyMatch = true;
      if (m === 2) exact = true;
      if (step.locators.length === 0) continue;
      const el = resolveStep(step);
      if (!el) continue;
      // Keep EVERY resolved step's element (P4-M0 walkthrough aims at any step; show-me reads the
      // current one). The map is a snapshot — consumers re-check isConnected before using it.
      elements.set(`${wf.sourceId}:${wf.segmentIndex}:${step.index}`, el);
      const stepFilled = step.kind === 'input' && isFilled(el);
      if (stepFilled) filled.push(step.index);
      if (m > 0 && isVisible(el)) {
        lastFound = { step, el };
        // The current step = the FIRST on-route, on-screen step NOT already completed (a filled
        // input is behind the user, not in front of them). A disabled target still localizes —
        // a disabled Send button IS the user's current wall.
        if (!candidate && !stepFilled) candidate = { step, el };
      }
    }
    if (!anyMatch) continue;

    const cur = candidate ?? lastFound;
    const inputsBefore = cur ? wf.steps.filter((s) => s.kind === 'input' && s.index < cur.step.index).length : 0;
    const filledBefore = cur ? filled.filter((i) => i < cur.step.index).length : 0;
    const doneFrac = inputsBefore > 0 ? filledBefore / inputsBefore : 0;
    const score = Math.min(1, (exact ? 0.45 : 0.3) + (cur ? 0.35 : 0) + 0.2 * doneFrac);
    if (score < MIN_SCORE) continue;

    const stepIndex = cur ? cur.step.index : wf.steps.find((s) => matchStrength(s.route, ctx) > 0)?.index ?? 1;
    const h: SenseHypothesisWire = {
      sourceId: wf.sourceId,
      segmentIndex: wf.segmentIndex,
      step: stepIndex,
      totalSteps: wf.steps.length,
      confidence: Math.round(score * 100) / 100,
      stepsDone: filled.filter((i) => i < stepIndex),
      ...(cur ? { error: findError(cur.el) } : {}),
    };
    if (h.error === undefined) delete h.error;
    scored.push({ h, score, el: cur?.el ?? null });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 2);
  return {
    tie: top.length === 2 && top[0]!.score - top[1]!.score < TIE_DELTA,
    hypotheses: top.map((s) => s.h),
    elements,
  };
}

// ── Shard fetch + per-route cache (fetched on PANEL OPEN, never page load) ─────────────────────
const SHARD_TTL_MS = 5 * 60_000; // a founder's approval flip reaches embeds within ~minutes
const FAIL_RETRY_MS = 60_000; // don't hammer a failing endpoint
interface ShardEntry {
  at: number;
  workflows: SenseWorkflow[] | null; // null = fetch failed
}
const shardCache = new Map<string, ShardEntry>();
let serverDisabled = false; // the workspace toggle is off — stop asking for this page's lifetime

export async function ensureShard(
  apiBase: string,
  key: string,
  path: string,
  timeoutMs: number,
): Promise<SenseWorkflow[] | null> {
  if (serverDisabled) return null;
  const k = normalizePath(path);
  const cached = shardCache.get(k);
  if (cached && Date.now() - cached.at < (cached.workflows ? SHARD_TTL_MS : FAIL_RETRY_MS)) {
    return cached.workflows;
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase}/v1/copilot/sense-plan?route=${encodeURIComponent(k)}`, {
      headers: { 'X-FlowBuddy-Key': key },
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`sense-plan ${res.status}`);
    const data = (await res.json()) as { enabled?: boolean; workflows?: SenseWorkflow[] };
    if (data.enabled === false) {
      serverDisabled = true;
      return null;
    }
    const workflows = Array.isArray(data.workflows) ? data.workflows : [];
    shardCache.set(k, { at: Date.now(), workflows });
    return workflows;
  } catch (e) {
    log.debug('sense-plan fetch failed (degrading to route bias)', e);
    shardCache.set(k, { at: Date.now(), workflows: null });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The ask-time probe: shard (usually already cached from panel open) → probe → hypotheses.
 * Returns null when Sense has nothing to say (disabled, fetch failed, or no workflows near this
 * route) — the caller then simply omits the sense context, and the copilot behaves exactly as
 * before (route bias only).
 */
export async function probeForAsk(
  apiBase: string,
  key: string,
  path: string,
  timeoutMs: number,
): Promise<SenseProbeResult | null> {
  const workflows = await ensureShard(apiBase, key, path, timeoutMs);
  if (!workflows || workflows.length === 0) return null;
  try {
    return runProbe(workflows, path);
  } catch (e) {
    log.debug('sense probe failed (degrading to route bias)', e);
    return null;
  }
}

// ── P2-M3 "show me" — the config-gated single-step highlight ───────────────────────────────────
// P4-M0 adds a STICKY mode: a walkthrough highlight stays up until the walkthrough itself moves or
// ends, so incidental clearSpotlight() calls (a new question, closing the panel) can't kill it —
// only a forced clear (or the target leaving the DOM) removes a sticky box.
let spot: { box: HTMLDivElement; target: Element; reposition: () => void; timer: number; sticky: boolean } | null = null;

export function clearSpotlight(force = false): void {
  if (!spot) return;
  if (spot.sticky && !force) return; // a walkthrough highlight survives casual clears
  clearTimeout(spot.timer);
  window.removeEventListener('scroll', spot.reposition, true);
  window.removeEventListener('resize', spot.reposition);
  spot.box.remove();
  spot = null;
}

/** Highlight `target` on the host page (scrolls it into view first). Default = show-me semantics
 *  (auto-clears after 6s); `sticky` = walkthrough semantics (stays until forced clear/re-aim). */
export function spotlight(root: ShadowRoot, target: Element, opts?: { sticky?: boolean }): void {
  clearSpotlight(true); // re-aiming always replaces whatever box is up
  const sticky = opts?.sticky === true;
  try {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch {
    /* older engines: highlight where it is */
  }
  const box = document.createElement('div');
  box.className = 'fb-spotlight';
  root.appendChild(box);
  const reposition = () => {
    if (!target.isConnected) return clearSpotlight(true); // a gone target is gone, sticky or not
    const r = target.getBoundingClientRect();
    box.style.top = `${r.top - 4}px`;
    box.style.left = `${r.left - 4}px`;
    box.style.width = `${r.width + 8}px`;
    box.style.height = `${r.height + 8}px`;
  };
  reposition();
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);
  const timer = sticky ? 0 : window.setTimeout(() => clearSpotlight(), 6000);
  spot = { box, target, reposition, timer, sticky };
}
