// P2 Sense (in-context help) — the widget half of the LOCKED hybrid architecture
// (docs/build/sense-and-reason.md §2): fetch the ROUTE-SHARDED sense plan on panel open, run an ask-time
// READ-ONLY probe of the live DOM against it, score deterministic top-k hypotheses ("the user
// appears to be at step 3 of Create an invoice"), and ship ONLY those hypotheses — evidence
// booleans plus one MASKED error snippet — on the /answer call. Never screenshots, never DOM,
// never input values, never continuous monitoring: the probe is an instantaneous glance at ask
// time, and everything here degrades silently (Sense failing must never break an answer).

import {
  displayRoute,
  normalizePath,
  routeMatchStrength,
  routePattern,
} from '@flowbuddy/shared/route-pattern';
import {
  SCREEN_MATCH_MIN,
  screenMatchScore,
  type LiveScreen,
  type ScreenFingerprint,
} from '@flowbuddy/shared/screen-fingerprint';
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
  screenKey?: string;
}
export interface SenseWorkflow {
  sourceId: string;
  segmentIndex: number;
  title: string;
  steps: SenseStep[];
  screens?: Record<string, ScreenFingerprint>;
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

// ── Route matching ─────────────────────────────────────────────────────────────────────────────
// ONE rule, shared with the sense shard and retrieval (`@flowbuddy/shared/route-pattern`): routes
// are compared as PATTERNS, so a step recorded inside one record localizes on every record of that
// shape. Re-exported here because the walkthrough and the probe both aim with it.
export { displayRoute, normalizePath, routePattern, routeMatchStrength as matchStrength };

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

// ── Reading the live screen (structural identification) ────────────────────────────────────────
// The counterpart of the recorded fingerprint: the short visible labels this page is showing right
// now. Deliberately the SAME kinds of thing the recorder captured — headings, buttons, links, tabs,
// field labels — so the two sets are comparable.
//
// Read-only, bounded, and computed ONCE per probe: everything here is a text read, with no layout
// measurement and no visibility test. Visibility would cost a forced reflow per element, and it buys
// little — extra labels can only ever ADD to what the live page recalls, and the recorded set is
// what a screen is scored against.
const SCREEN_ANCHOR_SELECTOR =
  'h1, h2, h3, [role="heading"], button, a, [role="button"], [role="tab"], [role="menuitem"], label, legend, summary';
const MAX_SCREEN_ANCHORS = 300;

export function readLiveScreen(): LiveScreen {
  const anchors: string[] = [];
  try {
    const nodes = document.querySelectorAll(SCREEN_ANCHOR_SELECTOR);
    const n = Math.min(nodes.length, MAX_SCREEN_ANCHORS);
    for (let i = 0; i < n; i++) {
      const el = nodes[i]!;
      const label = el.getAttribute('aria-label') || (el.textContent ?? '');
      if (label) anchors.push(label);
    }
    // Field affordances the label list misses: a placeholder is often the only visible name a form
    // control has.
    const fields = document.querySelectorAll('input[placeholder], textarea[placeholder]');
    const fn = Math.min(fields.length, MAX_SCREEN_ANCHORS);
    for (let i = 0; i < fn; i++) {
      const ph = fields[i]!.getAttribute('placeholder');
      if (ph) anchors.push(ph);
    }
  } catch {
    // a hostile or exotic document must never break the probe
  }
  return { title: document.title || '', anchors };
}

// ── The scorer (deterministic; the answer LLM makes the final call with the question in hand) ──
const MIN_SCORE = 0.2; // below this a workflow isn't worth sending as a hypothesis
const TIE_DELTA = 0.15; // top two closer than this = "ask X or Y?" territory
/**
 * How many hypotheses may ride to the server — and why it is not 2.
 *
 * A HUB PAGE BREAKS THE TIEBREAK, measured 2026-08-04. On a project page where eight approved
 * workflows had steps, every one of them scored ~0.80: exact route, plus a resolvable, visible,
 * uncompleted step. Shipping the top two made the choice between them arbitrary, and the arbitrary
 * winner was a workflow with 1 of its 11 steps on that screen, beating the one with 4 of 6. The
 * answer then correctly ignored a position about a workflow the user hadn't asked about, and
 * replayed the whole thing from step 1 while the user stood on step 3's screen.
 *
 * The page does not contain the answer to "which of these is the user in" — the QUESTION does, and
 * this architecture already says so: hypotheses are shipped precisely so the answer model decides
 * with the question in hand. Pre-filtering eight candidates down to two before the question is
 * consulted defeats that. So: everything within TIE_DELTA of the leader travels (still at least the
 * top two, exactly as before), and the model picks.
 *
 * The cost is one prompt line each, and the server boosts retrieval on only the first two — a
 * candidate list is for CHOOSING from, while a retrieval boost applied to six workflows would flood
 * the evidence window it is meant to bias.
 */
const MAX_HYPOTHESES = 6;

/** Probe the live DOM against a shard and score top-k hypotheses. Read-only; ~ms. */
export function runProbe(workflows: SenseWorkflow[], path: string): SenseProbeResult {
  const ctx = normalizePath(path);
  const elements = new Map<string, Element>();
  const scored: Array<{
    h: SenseHypothesisWire;
    score: number;
    el: Element | null;
    routed: boolean; // the URL had something to say about this workflow
    exactRoute: boolean; // …and for one of its steps it was the exact screen
  }> = [];

  // Read the page once, and only if some workflow can actually use it. A plan compiled before
  // fingerprints existed — or from a recording too sparse to identify anything — costs nothing here
  // and behaves exactly as it did before.
  const live = workflows.some((wf) => wf.screens) ? readLiveScreen() : undefined;

  for (const wf of workflows) {
    if (wf.steps.length === 0) continue;
    let exact = false;
    let anyMatch = false;
    let bestScreen = 0;
    // Candidates are kept SEPARATE by how well their route matched, because "is this workflow
    // relevant here" and "where in it am I" are different questions and only the first one is served
    // by a loose match.
    //
    // THE BUG THIS ENDS. `routeMatchStrength` matches segment-boundary prefixes in EITHER direction, so a
    // step recorded at /dashboard/projects is "on route" for every /dashboard/projects/<id> page. Its
    // element is typically a SIDE-NAV link — visible on every screen in the product — so it resolved,
    // was visible, and won the first-match race before any exactly-matching step was considered. A
    // user standing on the project page with the Add Source button in front of them was told to start
    // from the sidebar, and the walkthrough highlighted that link.
    //
    // The exactness signal already existed and was thrown away: `exact` feeds the CONFIDENCE below
    // (0.45 vs 0.3) while having no say in which step was picked. That asymmetry was the whole defect.
    // Prefix candidates still win when nothing matches exactly, which is the ancestor-route case the
    // bidirectional rule was written for.
    //
    // STRUCTURE SITS BETWEEN THEM (slices 1–2), and that ordering is the point. An exact URL is the
    // strongest claim available. But "the page in front of me looks like the page this step was
    // recorded on" is BETTER evidence than "some ancestor of my URL was mentioned once" — which is
    // precisely the loose match that produced the sidebar bug above. So: exact route → recognised
    // screen → ancestor route.
    let exactCandidate: { step: SenseStep; el: Element } | null = null;
    let screenCandidate: { step: SenseStep; el: Element } | null = null;
    let prefixCandidate: { step: SenseStep; el: Element } | null = null;
    let exactLast: { step: SenseStep; el: Element } | null = null;
    let screenLast: { step: SenseStep; el: Element } | null = null;
    let prefixLast: { step: SenseStep; el: Element } | null = null;
    const filled: number[] = [];

    const screenScore = (step: SenseStep): number =>
      step.screenKey ? screenMatchScore(wf.screens?.[step.screenKey], live) : 0;

    for (const step of wf.steps) {
      const m = routeMatchStrength(step.route, ctx);
      const sc = screenScore(step);
      if (sc > bestScreen) bestScreen = sc;
      const recognised = sc >= SCREEN_MATCH_MIN;
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
      if ((m > 0 || recognised) && isVisible(el)) {
        // The current step = the FIRST on-screen step NOT already completed (a filled input is
        // behind the user, not in front of them). A disabled target still localizes — a disabled
        // Send button IS the user's current wall. "First" is resolved within each tier, so an
        // exactly-placed step is never beaten by a merely-recognised or ancestor-route one.
        if (m === 2) {
          exactLast = { step, el };
          if (!exactCandidate && !stepFilled) exactCandidate = { step, el };
        } else if (recognised) {
          screenLast = { step, el };
          if (!screenCandidate && !stepFilled) screenCandidate = { step, el };
        } else {
          prefixLast = { step, el };
          if (!prefixCandidate && !stepFilled) prefixCandidate = { step, el };
        }
      }
    }
    // A workflow the URL never mentioned stays in play if the PAGE recognised it — this is the whole
    // of slice 1. Before it, `!anyMatch` discarded a workflow even when every element of it had just
    // been found on screen.
    const recognisedHere = bestScreen >= SCREEN_MATCH_MIN;
    if (!anyMatch && !recognisedHere) continue;

    // Exact placement beats recognition beats an ancestor route, at every stage including the
    // fallback: a step whose recorded route IS the user's URL is better evidence of where they stand
    // than one that merely contains it.
    const candidate = exactCandidate ?? screenCandidate ?? prefixCandidate;
    const lastFound = exactLast ?? screenLast ?? prefixLast;
    const cur = candidate ?? lastFound;
    const inputsBefore = cur ? wf.steps.filter((s) => s.kind === 'input' && s.index < cur.step.index).length : 0;
    const filledBefore = cur ? filled.filter((i) => i < cur.step.index).length : 0;
    const doneFrac = inputsBefore > 0 ? filledBefore / inputsBefore : 0;
    // Base confidence by the strongest claim available; `+0.1 × screen` is slice 2 — among workflows
    // the URL rates identically (the normal case now that `/projects/:id` matches several), the one
    // whose screen the page actually shows wins, and TIE_DELTA stops that being a coin toss.
    const base = exact ? 0.45 : recognisedHere ? 0.4 : 0.3;
    const score = Math.min(1, base + (cur ? 0.35 : 0) + 0.2 * doneFrac + 0.1 * bestScreen);
    if (score < MIN_SCORE) continue;

    // Last resort — nothing resolved on screen, so fall back to placement alone. Same precedence:
    // an exactly-matching step, then a recognised screen, then an ancestor route.
    const stepIndex =
      cur?.step.index ??
      wf.steps.find((s) => routeMatchStrength(s.route, ctx) === 2)?.index ??
      wf.steps.find((s) => screenScore(s) >= SCREEN_MATCH_MIN)?.index ??
      wf.steps.find((s) => routeMatchStrength(s.route, ctx) > 0)?.index ??
      1;
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
    scored.push({ h, score, el: cur?.el ?? null, routed: anyMatch, exactRoute: exact });
  }

  // STRUCTURE SPEAKS WHEN THE URL DOESN'T. A workflow the route never mentioned is dropped as soon
  // as some workflow matched this URL exactly — otherwise a recognised screen lands ~0.05 below an
  // exact-route match, which is inside TIE_DELTA, and the copilot would start asking "X or Y?" on
  // pages that used to answer. Slice 1 exists for the pages the URL cannot describe, not to
  // second-guess the ones it describes precisely.
  const eligible = scored.some((s) => s.exactRoute) ? scored.filter((s) => s.routed) : scored;

  eligible.sort((a, b) => b.score - a.score);
  // The top two always travel (unchanged), plus anything else too close to the leader to separate
  // deterministically — those are exactly the candidates only the question can choose between.
  const leader = eligible[0]?.score ?? 0;
  const contenders = eligible.filter((s) => leader - s.score < TIE_DELTA).length;
  const top = eligible.slice(0, Math.min(Math.max(2, contenders), MAX_HYPOTHESES));
  return {
    // Still "the top two are too close to call" — the flag drives the copilot's "X or Y?" question,
    // which is about the leaders, not about how many candidates came along.
    tie: top.length >= 2 && top[0]!.score - top[1]!.score < TIE_DELTA,
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
  // Keyed by PATTERN, and the pattern is what goes on the wire: every record of one shape shares a
  // single shard (an app whose URLs carry ids used to re-fetch on every row), and the end-user's own
  // record id never leaves their page. Patterning is idempotent, so the server shards it identically.
  const k = routePattern(path);
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
 * Returns null when Sense has nothing to say (disabled, fetch failed, or nothing this page can be
 * placed against) — the caller then simply omits the sense context, and the copilot behaves exactly
 * as before (route bias only).
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
