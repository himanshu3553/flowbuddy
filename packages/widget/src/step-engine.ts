// P4-M2 STEP ENGINE — the actor-independent half of running a workflow's steps against the live
// page, extracted from the guided walkthrough (P4-M0) the day the acting driver became its second
// consumer (docs/build/agent.md §A2.10). One engine, two actor policies on top:
//
//   guided (walkthrough.ts)  the USER acts; detection acknowledges; Next advances  — shipped
//   acting (slice 3)         the WIDGET acts; verification advances; pauses on input/destructive
//
// Everything here answers questions about the page; nothing here decides what to do about the
// answers, renders UI, talks to the server, or touches storage — those are the actors'. And
// nothing here ACTS: this module stays read-only so the guided mode built on it remains
// structurally incapable of clicking anything. The act verbs arrive in a separate module, bound
// only by the acting driver.
//
// BEHAVIOR CONTRACT: this code moved verbatim from walkthrough.ts (2026-08-05); the walkthrough's
// user-visible behavior is pinned by its E2E legs and must survive this extraction identically.
// Tuning constants keep their shipped values — each one's rationale sits beside it.

import {
  isFilled,
  isVisible,
  matchStrength,
  normalizePath,
  resolveStep,
  type SenseStep,
} from './sense.js';
import {
  screenMatchScore,
  SCREEN_MATCH_MIN,
  type LiveScreen,
  type ScreenFingerprint,
} from '@flowbuddy/shared/screen-fingerprint';
// ONE element-state vocabulary (P2-M5): the same reading Reason ships to the diagnostic model
// gates the engine locally — disabled/checked/filled/valid + the failed-constraint name.
import { readElementState, type ReasonElementWire } from './reason.js';

// ── Tuning (shipped values — P4-M0) ────────────────────────────────────────────────────────────
export const AWAIT_NAV_TIMEOUT_MS = 10_000; // a click that never navigates goes back to waiting
export const SETTLE_QUIET_MS = 500; // mutation-quiet window = "the page finished reacting" (recorder R2)
export const SETTLE_MAX_MS = 3000;
export const RESOLVE_RETRIES_MS = [0, 750, 2000]; // SPAs hydrate late — retry before declaring a stall
export const ROUTE_POLL_MS = 400; // SPA route watcher (no history monkey-patching — guest-script hygiene)
export const INPUT_DEBOUNCE_MS = 800; // typing settles before the state is judged

// ── Settle (mutation-quiet, mirroring the recorder's post-action semantics) ────────────────────
export function awaitSettle(quietMs = SETTLE_QUIET_MS, maxMs = SETTLE_MAX_MS): Promise<void> {
  return new Promise((resolve) => {
    let quiet: number;
    const obs = new MutationObserver(() => {
      clearTimeout(quiet);
      quiet = window.setTimeout(finish, quietMs);
    });
    const cap = window.setTimeout(finish, maxMs);
    function finish(): void {
      clearTimeout(quiet);
      clearTimeout(cap);
      obs.disconnect();
      resolve();
    }
    try {
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    } catch {
      finish();
      return;
    }
    quiet = window.setTimeout(finish, quietMs);
  });
}

// ── Element-state verdicts (Reason's vocabulary, consulted locally — a run must never say "click
//    it" at a disabled button or count an invalid/unchecked field as done) ──────────────────────

/** Is this input step genuinely behind the user? Checkbox/radio = checked; fields = filled AND not
 *  provably invalid (constraint API / aria-invalid — `valid` absent means nothing machine-checkable,
 *  which honestly passes; purely-visual custom validation is the diagnostic escalation's job). */
export function stateDone(st: ReasonElementWire): boolean {
  if (st.checked !== undefined) return st.checked;
  if (st.filled !== undefined) return st.filled && st.valid !== false;
  return false;
}
export function inputDone(el: Element): boolean {
  const st = readElementState(el);
  if (st.checked === undefined && st.filled === undefined) return isFilled(el); // non-standard control
  return stateDone(st);
}

/** The failed HTML5 constraint, in words a user can act on. */
const INVALID_HINTS: Record<string, string> = {
  valueMissing: 'it looks required and empty',
  typeMismatch: "the format doesn't look right",
  patternMismatch: "it doesn't match the required format",
  tooShort: 'it looks too short',
  tooLong: 'it looks too long',
  rangeUnderflow: 'the value looks too low',
  rangeOverflow: 'the value looks too high',
  stepMismatch: "the value doesn't fit the allowed increments",
  badInput: "the value doesn't parse",
  customError: 'the app flagged it as invalid',
  ariaInvalid: 'the app flagged it as invalid',
};
export function invalidHint(reason: string | undefined): string {
  return (reason && INVALID_HINTS[reason]) || 'the app flagged it as invalid';
}

// ── The self-correcting pointer's evidence (page truth beats stored position) ──────────────────

/** The earliest ON-THIS-ROUTE input step before `before` that is verifiably NOT done (empty /
 *  invalid / unchecked). Only INPUT steps count — their state is readable; a completed click
 *  leaves no evidence, so action steps can never cause a false pullback. Steps in `skipped`
 *  (the user's explicit override) are respected. */
export function earliestPendingInput(
  steps: SenseStep[],
  before: number,
  path: string,
  skipped: number[],
): number | null {
  for (const s of steps) {
    if (s.index >= before) return null;
    if (s.kind !== 'input' || s.locators.length === 0) continue;
    if (skipped.includes(s.index)) continue; // the user's explicit override wins
    if (!s.route || matchStrength(s.route, path) === 0) continue;
    const el = resolveStep(s);
    if (el && isVisible(el) && !inputDone(el)) return s.index;
  }
  return null;
}

/** Why is the current control disabled, as far as the plan can tell? The first earlier input step
 *  that isn't genuinely done (unchecked box, empty or invalid field) — the actor words the message. */
export function firstUnfinishedEarlierInput(steps: SenseStep[], current: number): SenseStep | null {
  for (const s of steps) {
    if (s.index >= current || s.kind !== 'input' || s.locators.length === 0) continue;
    const el = resolveStep(s);
    if (el && !inputDone(el)) return s;
  }
  return null;
}

// ── Resolution (the retry ladder — SAFE-STOP is the caller's move when this exhausts) ──────────

/** Resolve a step's element with the shipped retry ladder. `stillWanted` is consulted after every
 *  wait — the world may move while we sleep (an advance, a route change, the run ending); a stale
 *  resolve must return null rather than aim at a step nobody is on any more. */
export async function resolveStepWithRetries(
  step: SenseStep,
  stillWanted: () => boolean,
): Promise<Element | null> {
  for (let i = 0; i < RESOLVE_RETRIES_MS.length; i++) {
    const wait = RESOLVE_RETRIES_MS[i]!;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (!stillWanted()) return null;
    const el = resolveStep(step);
    if (el && isVisible(el)) return el;
  }
  return null;
}

// ── Completion evidence for ACTION steps (consulted after settle) ──────────────────────────────

/** Did the action do its job, judged from recorded evidence only. No evidence either way returns
 *  false — uncertainty never counts as progress.
 *
 *  `clickObserved` (default true) is load-bearing: the last-step / lives-elsewhere shortcuts mean
 *  "this page has nothing left to prove ABOUT THE CLICK THAT JUST HAPPENED" — they are only valid
 *  when an activation was actually observed or dispatched. Consulted WITHOUT one (the acting run's
 *  hand-back poll), they proved a click nobody made: a disabled final submit "completed" untouched
 *  and the run declared Done over a form the app had refused. Pass `false` when polling. */
export function actionCompletionEvidence(args: {
  steps: SenseStep[];
  stepIndex: number;
  currentEl: Element | null;
  path: string;
  clickObserved?: boolean;
}): boolean {
  const nextStep = args.steps.find((s) => s.index > args.stepIndex) ?? null;
  const nextEl = nextStep && nextStep.locators.length > 0 ? resolveStep(nextStep) : null;
  const nextOffRoute = nextStep ? matchStrength(nextStep.route, args.path) === 0 : false;
  const clickObserved = args.clickObserved !== false;
  return (
    (clickObserved && !nextStep) || // that was the last step — valid only after an observed act
    (clickObserved && nextOffRoute) || // what follows lives elsewhere — same condition
    (nextEl !== null && isVisible(nextEl)) || // the next step appeared — the page moved on
    (args.currentEl !== null && !args.currentEl.isConnected) // the acted-on control left the DOM
  );
}

// ── P3-M2 contract questions (execution-contracts.md §4) — pure page reads, policy-free ────────
// The acting run is the only caller today; the walkthrough deliberately never asks these (its
// adoption is the contract road's last item, shadow-first). Everything here answers; the actor
// decides — same contract as the rest of this module.

/** The page's visible text, lowercased. `innerText` when the engine provides it (visible text
 *  only — the honest read); `textContent` as the fallback where it doesn't (jsdom). */
function visiblePageText(): string {
  const body = document.body as HTMLElement | null;
  return (body?.innerText ?? body?.textContent ?? '').toLowerCase();
}

/** Which of these phrases are visible RIGHT NOW — the pre-act baseline EC-7's newly-visible
 *  semantics diff against (the discipline rejection detection always had, applied to markers). */
export function markerBaseline(phrases: string[] | undefined): Set<string> {
  if (!phrases || phrases.length === 0) return new Set();
  const text = visiblePageText();
  return new Set(phrases.filter((p) => text.includes(p.toLowerCase())).map((p) => p.toLowerCase()));
}

export type MarkerVerdict = 'none' | 'newly' | 'presence' | 'unsatisfied';
/** EC-7 — a marker means NEWLY visible.
 *  `none`        — the step carries no appeared-markers: nothing to check, verify as before.
 *  `newly`       — a marker is visible now that was NOT visible before the act: the recorded success.
 *  `presence`    — EVERY marker was already visible before the act, so appearance carries no signal;
 *                  presence is the honest fallback (the page can't distinguish), and the caller
 *                  audits it so phrase quality stays measurable.
 *  `unsatisfied` — markers that COULD have newly appeared didn't (or the pre-visible ones vanished). */
export function markerVerdict(appeared: string[] | undefined, baseline: Set<string>): MarkerVerdict {
  if (!appeared || appeared.length === 0) return 'none';
  const text = visiblePageText();
  const visible = appeared.filter((m) => text.includes(m.toLowerCase()));
  if (visible.some((m) => !baseline.has(m.toLowerCase()))) return 'newly';
  if (appeared.every((m) => baseline.has(m.toLowerCase()))) {
    return visible.length > 0 ? 'presence' : 'unsatisfied';
  }
  return 'unsatisfied';
}

/** EC-7's inverse half: every disappeared-marker that WAS visible before the act must be gone now;
 *  one that was never visible proves nothing (vacuously fine). No markers → true. */
export function disappearedSatisfied(disappeared: string[] | undefined, baseline: Set<string>): boolean {
  if (!disappeared || disappeared.length === 0) return true;
  const text = visiblePageText();
  return disappeared.every((m) => !baseline.has(m.toLowerCase()) || !text.includes(m.toLowerCase()));
}

/** EC-8 — does the resolved element still say what the recording said? Tolerant on purpose:
 *  normalized (case, whitespace, digits, edge punctuation — labels legitimately grow counts and
 *  badges), matched by equality or containment either direction. A short expected label (<3 chars
 *  after normalizing) or an unreadable live label is vacuously true — unreadable cannot CONTRADICT,
 *  and EC-8 blocks only on contradiction. */
export function labelMatches(expected: string | undefined, liveLabel: string | undefined): boolean {
  const norm = (s: string): string =>
    s.toLowerCase().replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[^a-z]+|[^a-z]+$/g, '');
  const e = norm(expected ?? '');
  if (e.length < 3) return true;
  const l = norm(liveLabel ?? '');
  if (l.length === 0) return true;
  return e === l || l.includes(e) || (l.length >= 3 && e.includes(l));
}

/** EC-3/EC-4 — may the run start here? Route compared as a PATTERN; the screen consulted only when
 *  the route already matches (a wrong route makes the screen question moot), and only when the
 *  recording made the entry screen identifiable. An unknown entry route checks nothing. */
export function entryVerdict(
  entry: { route: string; screen?: ScreenFingerprint } | undefined,
  live: { path: string; screen?: LiveScreen },
): 'ok' | 'wrong-route' | 'screen-mismatch' {
  if (!entry || !entry.route.trim()) return 'ok';
  if (matchStrength(entry.route, live.path) === 0) return 'wrong-route';
  if (entry.screen && live.screen && screenMatchScore(entry.screen, live.screen) < SCREEN_MATCH_MIN) {
    return 'screen-mismatch';
  }
  return 'ok';
}

export interface OutcomeCheck {
  /** Whether the contract carried anything checkable at all — an uncheckable finish stamps nothing. */
  checked: boolean;
  ok: boolean;
  route: boolean | null;
  screen: boolean | null;
  markers: boolean | null;
}
/** EC-5 — does the page look the way the recording says DONE looks? Component verdicts (null =
 *  the contract carried no such fact) so the caller can audit WHICH half missed. Never blocks —
 *  the caller stamps and narrates. */
export function outcomeSatisfied(
  outcome: { route?: string; screen?: ScreenFingerprint; appeared?: string[] } | undefined,
  live: { path: string; screen?: LiveScreen; bodyText: string },
): OutcomeCheck {
  const text = live.bodyText.toLowerCase();
  const route = outcome?.route ? matchStrength(outcome.route, live.path) > 0 : null;
  const screen =
    outcome?.screen && live.screen ? screenMatchScore(outcome.screen, live.screen) >= SCREEN_MATCH_MIN : null;
  const markers =
    outcome?.appeared && outcome.appeared.length > 0
      ? outcome.appeared.some((m) => text.includes(m.toLowerCase()))
      : null;
  const parts = [route, screen, markers];
  return {
    checked: parts.some((p) => p !== null),
    ok: parts.every((p) => p !== false),
    route,
    screen,
    markers,
  };
}

// ── Observation harness (attached only while a run is active; detached on end) ─────────────────

/** Per-element input watching: `check` runs debounced on typing and immediately on commit
 *  (blur / Enter). The verdict and what to do about it are the caller's — this is only the wiring,
 *  so both actors judge state through the exact same event surface. Returns the cleanup. */
export function watchInputState(el: Element, check: () => void): () => void {
  let debounce = 0;
  const onInput = (): void => {
    clearTimeout(debounce);
    debounce = window.setTimeout(check, INPUT_DEBOUNCE_MS);
  };
  const onCommit = (e: Event): void => {
    if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
    clearTimeout(debounce);
    check();
  };
  el.addEventListener('input', onInput);
  el.addEventListener('change', onInput); // checkbox/select toggles in engines that skip `input`
  el.addEventListener('blur', onCommit);
  el.addEventListener('keydown', onCommit);
  return () => {
    clearTimeout(debounce);
    el.removeEventListener('input', onInput);
    el.removeEventListener('change', onInput);
    el.removeEventListener('blur', onCommit);
    el.removeEventListener('keydown', onCommit);
  };
}

/** Route watcher + state tick: popstate/hashchange for the eager cases, a light poll for pushState
 *  SPAs (ROUTE_POLL_MS; no history monkey-patching — guest-script hygiene). `onTick` fires every
 *  poll regardless of route so the actor can keep its state honest between events. Returns the
 *  cleanup; never throws through teardown. */
export function observeRun(handlers: {
  onRouteChange: (path: string) => void;
  onTick: () => void;
}): () => void {
  let lastPath = normalizePath(location.pathname);
  const onRoute = (): void => {
    const now = normalizePath(location.pathname);
    if (now === lastPath) return;
    lastPath = now;
    handlers.onRouteChange(now);
  };
  window.addEventListener('popstate', onRoute);
  window.addEventListener('hashchange', onRoute);
  const poll = window.setInterval(() => {
    onRoute();
    handlers.onTick();
  }, ROUTE_POLL_MS);
  return () => {
    window.removeEventListener('popstate', onRoute);
    window.removeEventListener('hashchange', onRoute);
    clearInterval(poll);
  };
}
