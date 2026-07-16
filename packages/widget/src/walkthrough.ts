// P4-M0 Guided walkthrough (docs/phase-4-autopilot.md §4) — the zero-acting stepping stone to
// Autopilot. After a positional answer the widget offers "Walk me through it"; on consent it
// highlights each remaining step of the APPROVED workflow and watches the user complete it —
// detection only ACKNOWLEDGES ("Detected ✓ — hit Next"); the pointer moves FORWARD exclusively on
// the user's Next click (manual-only advancement, user decision 2026-07-15). The user performs
// every action themselves; FlowBuddy never clicks, fills, or navigates.
//
// POSTURE — user-initiated, zero-acting, session-scoped observation. Observation starts only on
// the user's explicit click and is torn down on done/exit/stall-exit/TTL: (a) read-only
// re-resolution of the current step's element (the same checks Sense runs at ask time), (b) a
// document capture-phase click listener used solely to test "was that the highlighted element?",
// (c) `location.pathname`. Nothing leaves the page except walkthrough analytics — workflow key +
// step numbers + auto/manual + outcome; never page content, values, or selectors. This is the
// widget's ONLY use of storage: one sessionStorage key holding founder-derived plan data (so a
// full-page navigation mid-workflow can resume), auto-expiring after 30 minutes.
//
// Detection is evidence-or-nothing: any ambiguity leaves the card waiting with Next available
// (uncertainty costs one click, never a wrong assertion), and an unresolvable step SAFE-STOPS
// (Retry/Back/Exit) — the walkthrough never guesses forward.

import { log } from './log.js';
import {
  clearSpotlight,
  ensureShard,
  isFilled,
  isVisible,
  matchStrength,
  normalizePath,
  resolveStep,
  spotlight,
  type SenseStep,
  type SenseWorkflow,
} from './sense.js';
// P2-M5 Reason — ONE element-state vocabulary: the same reading Reason ships to the diagnostic
// model gates the walkthrough locally (disabled/checked/filled/valid + the failed-constraint name).
import { readElementState, type ReasonElementWire } from './reason.js';

// ── Session (the sessionStorage shape — versioned; foreign/expired/corrupt = discarded) ────────
const STORE_KEY = 'flowbuddy.walkthrough.v1';
const WALK_TTL_MS = 30 * 60_000; // an abandoned tab stops observing within the half hour
const AWAIT_NAV_TIMEOUT_MS = 10_000; // a click that never navigates goes back to waiting
const SETTLE_QUIET_MS = 500; // mutation-quiet window = "the page finished reacting" (recorder R2)
const SETTLE_MAX_MS = 3000;
const RESOLVE_RETRIES_MS = [0, 750, 2000]; // SPAs hydrate late — retry before declaring a stall
const ROUTE_POLL_MS = 400; // SPA route watcher (no history monkey-patching — guest-script hygiene)

interface AwaitingNav {
  fromStep: number;
  postRoute?: string;
  at: number;
}
interface WalkSession {
  v: 1;
  k: string; // the public key this session belongs to (mismatch = discard)
  startedAt: number;
  updatedAt: number; // TTL anchor — refreshed on every transition
  runId?: string; // server analytics run id (from the `started` response)
  queryId?: string; // the originating question, when known
  sourceId: string;
  segmentIndex: number;
  title: string;
  workflow: SenseWorkflow; // the full plan copy (founder-derived data only) — deterministic resume
  step: number; // current 1-based step
  startStep: number;
  awaitingNav?: AwaitingNav;
  /** Steps the user EXPLICITLY skipped via Next while the gate still saw them as pending — the
   *  self-correcting pointer respects the override and never pulls back to these. */
  skipped?: number[];
  /** ACTION steps with conclusive completion evidence (click landed / recorded navigation matched).
   *  Detection only ACKNOWLEDGES — the pointer moves exclusively on the user's Next. Persisted so
   *  a navigating step's evidence survives the page load it causes. */
  detected?: number[];
  auto: number;
  manual: number;
}

interface WalkCfg {
  apiBase: string;
  key: string;
  reason: boolean; // founder's Reason toggle — gates the "Explain what's blocking me" escalation
}
interface WalkHooks {
  onExit?: () => void; // user closed the walkthrough — index.ts reopens the chat panel
  onExplain?: () => void; // blocked/invalid escalation — index.ts opens chat + asks the diagnostic question
}

// ── Module state (one walkthrough at a time, per page view) ────────────────────────────────────
let session: WalkSession | null = null;
let cfgRef: WalkCfg | null = null;
let rootRef: ShadowRoot | null = null;
let hooksRef: WalkHooks = {};
let currentEl: Element | null = null;
let stalled = false;
let resolving = false; // showStep's retry ladder is in flight — the state tick must not re-enter
let cleanups: Array<() => void> = [];
let card: {
  el: HTMLDivElement;
  chip: HTMLSpanElement;
  title: HTMLSpanElement;
  instr: HTMLDivElement;
  status: HTMLDivElement;
  explain: HTMLButtonElement;
  back: HTMLButtonElement;
  retry: HTMLButtonElement;
  next: HTMLButtonElement;
} | null = null;

export function walkthroughActive(): boolean {
  return session !== null;
}

// ── Storage (best-effort — a blocked sessionStorage just means no cross-nav resume) ────────────
function persist(): void {
  if (!session) return;
  session.updatedAt = Date.now();
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(session));
  } catch {
    /* privacy mode / quota — the walkthrough still works within this page view */
  }
}
function clearStore(): void {
  try {
    sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* best-effort */
  }
}
function readStore(key: string): WalkSession | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as WalkSession;
    if (s?.v !== 1 || s.k !== key) return null;
    if (!s.workflow?.steps?.length || !Number.isInteger(s.step)) return null;
    if (Date.now() - s.updatedAt > WALK_TTL_MS) return null;
    return s;
  } catch {
    return null;
  }
}

// ── Analytics (fire-and-forget; failures never affect the walkthrough) ─────────────────────────
type WalkEvent = 'started' | 'step_advanced' | 'completed' | 'aborted' | 'stalled';
function emit(event: WalkEvent, mode?: 'auto' | 'manual'): void {
  if (!cfgRef || !session) return;
  const body = JSON.stringify({
    ...(session.runId ? { runId: session.runId } : {}),
    event,
    sourceId: session.sourceId,
    segmentIndex: session.segmentIndex,
    step: session.step,
    totalSteps: session.workflow.steps.length,
    ...(mode ? { mode } : {}),
    ...(event === 'started' && session.queryId ? { queryId: session.queryId } : {}),
  });
  const req = fetch(`${cfgRef.apiBase}/v1/copilot/walkthrough`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-FlowBuddy-Key': cfgRef.key },
    body,
    keepalive: true, // survives the click→navigation race (same trick as /seen)
  });
  if (event === 'started') {
    void req
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { runId?: string } | null) => {
        if (d?.runId && session) {
          session.runId = d.runId;
          persist();
        }
      })
      .catch(() => {
        /* best-effort */
      });
  } else {
    void req.catch(() => {
      /* best-effort */
    });
  }
}

// ── Settle helper (mutation-quiet, mirroring the recorder's post-action semantics) ─────────────
function awaitSettle(quietMs = SETTLE_QUIET_MS, maxMs = SETTLE_MAX_MS): Promise<void> {
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

// ── Element-state verdicts (Reason's vocabulary, consulted locally — added after the first E2E:
//    a walkthrough must never say "click it" at a disabled button or advance past an invalid or
//    unchecked field) ────────────────────────────────────────────────────────────────────────────

/** Is this input step genuinely behind the user? Checkbox/radio = checked; fields = filled AND not
 *  provably invalid (constraint API / aria-invalid — `valid` absent means nothing machine-checkable,
 *  which honestly passes; purely-visual custom validation is the Explain escalation's job). */
function stateDone(st: ReasonElementWire): boolean {
  if (st.checked !== undefined) return st.checked;
  if (st.filled !== undefined) return st.filled && st.valid !== false;
  return false;
}
function inputDone(el: Element): boolean {
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
function invalidHint(reason: string | undefined): string {
  return (reason && INVALID_HINTS[reason]) || 'the app flagged it as invalid';
}

/** The right status line for an input step's current state (invalid ⇒ show the Explain escalation). */
function inputStatus(st: ReasonElementWire): { text: string; explain: boolean } {
  if (st.filled && st.valid === false) {
    return { text: `This field doesn't look right yet — ${invalidHint(st.invalidReason)}.`, explain: true };
  }
  if (st.checked !== undefined) return { text: 'Waiting for you — tick the highlighted box.', explain: false };
  return { text: 'Waiting for you — fill the highlighted field.', explain: false };
}

/** Why a disabled button is disabled, as far as the plan can tell: name the first earlier input
 *  step that isn't genuinely done (unchecked box, empty or invalid field). */
function blockedText(current: SenseStep): string {
  if (session) {
    for (const s of session.workflow.steps) {
      if (s.index >= current.index || s.kind !== 'input' || s.locators.length === 0) continue;
      const el = resolveStep(s);
      if (el && !inputDone(el)) {
        const what = s.instruction.length > 48 ? `${s.instruction.slice(0, 45)}…` : s.instruction;
        return `This button is disabled — check step ${s.index} (“${what}”) first.`;
      }
    }
  }
  return 'This button is disabled — an earlier requirement may be unfinished.';
}

// ── Card UI (shadow-root resident; fixed overlay — never touches the host page's layout) ───────
function buildCard(): void {
  if (!rootRef || card) return;
  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const el = mk('div', 'fb-walk-card');
  const head = mk('div', 'fb-walk-head');
  const chip = mk('span', 'fb-walk-chip');
  const title = mk('span', 'fb-walk-title');
  const exit = mk('button', 'fb-walk-exit', '✕');
  exit.setAttribute('aria-label', 'Exit walkthrough');
  head.appendChild(chip);
  head.appendChild(title);
  head.appendChild(exit);
  const instr = mk('div', 'fb-walk-instr');
  const status = mk('div', 'fb-walk-status');
  const actions = mk('div', 'fb-walk-actions');
  // The Reason escalation — shown only on blocked/invalid/stalled states (and only when the
  // founder's Reason toggle is on): opens the chat and asks the diagnostic question for the user.
  const explain = mk('button', 'fb-walk-btn fb-walk-explain', "Explain what's blocking me");
  const back = mk('button', 'fb-walk-btn', 'Back');
  const retry = mk('button', 'fb-walk-btn', 'Retry');
  const next = mk('button', 'fb-walk-btn fb-walk-next', 'Next');
  explain.style.display = 'none';
  retry.style.display = 'none';
  actions.appendChild(explain);
  actions.appendChild(back);
  actions.appendChild(retry);
  actions.appendChild(next);
  el.appendChild(head);
  el.appendChild(instr);
  el.appendChild(status);
  el.appendChild(actions);
  rootRef.appendChild(el);

  exit.addEventListener('click', () => end('aborted'));
  explain.addEventListener('click', () => hooksRef.onExplain?.());
  back.addEventListener('click', () => {
    if (!session) return;
    session.step = Math.max(1, session.step - 1); // no analytics — Back is the user re-reading
    // Stepping back onto a step they'd skipped re-engages the gate for it (they changed their mind).
    session.skipped = (session.skipped ?? []).filter((i) => i !== session!.step);
    persist();
    void showStep();
  });
  retry.addEventListener('click', () => void showStep());
  next.addEventListener('click', () => advanceNext());
  card = { el, chip, title, instr, status, explain, back, retry, next };
}
function removeCard(): void {
  card?.el.remove();
  card = null;
}
function setStatus(text: string, opts?: { stall?: boolean; explain?: boolean }): void {
  if (!card) return;
  card.status.textContent = text;
  card.status.classList.toggle('fb-walk-stalled', opts?.stall === true);
  card.retry.style.display = opts?.stall ? '' : 'none';
  // The escalation shows only where a "why" exists AND the founder's Reason toggle allows it.
  card.explain.style.display = opts?.explain && cfgRef?.reason ? '' : 'none';
}

// ── Observers (attached only while a walkthrough is active) ────────────────────────────────────
function attachObservers(): void {
  const onClick = (e: MouseEvent): void => {
    if (!session || stalled || !currentEl) return;
    const step = curStep();
    if (!step || step.kind !== 'action') return;
    const target = e.target;
    const hit =
      (typeof e.composedPath === 'function' && e.composedPath().includes(currentEl)) ||
      (target instanceof Node && currentEl.contains(target));
    if (hit) onActionTriggered(step);
  };
  const onKeydown = (e: KeyboardEvent): void => {
    if (!session || stalled || !currentEl || e.key !== 'Enter') return;
    const step = curStep();
    if (step?.kind === 'action' && document.activeElement === currentEl) onActionTriggered(step);
  };
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeydown, true);
  cleanups.push(() => document.removeEventListener('click', onClick, true));
  cleanups.push(() => document.removeEventListener('keydown', onKeydown, true));

  // Route watcher: popstate/hashchange for the eager cases + a light poll for pushState SPAs.
  let lastPath = normalizePath(location.pathname);
  const onRoute = (): void => {
    const now = normalizePath(location.pathname);
    if (now === lastPath) return;
    lastPath = now;
    handleRouteChange(now);
  };
  window.addEventListener('popstate', onRoute);
  window.addEventListener('hashchange', onRoute);
  const poll = window.setInterval(() => {
    onRoute();
    onStateTick();
  }, ROUTE_POLL_MS);
  cleanups.push(() => window.removeEventListener('popstate', onRoute));
  cleanups.push(() => window.removeEventListener('hashchange', onRoute));
  cleanups.push(() => clearInterval(poll));
}

/** The live state check (every ROUTE_POLL_MS while active): keeps the card HONEST between events —
 *  the pointer self-corrects to the earliest pending input, a button enabling/disabling, a field
 *  turning valid, a programmatic fill, or an SPA re-render swapping the element out from under the
 *  spotlight all surface within a tick. Read-only. */
function onStateTick(): void {
  if (!session || resolving) return;
  // A pending navigation that outlived its budget (its timer died with a reload) must not block
  // the state checks forever — clear it and fall through to a normal re-render.
  if (session.awaitingNav) {
    if (Date.now() - session.awaitingNav.at <= AWAIT_NAV_TIMEOUT_MS) return;
    log.debug('walkthrough: stale awaiting-nav cleared');
    session.awaitingNav = undefined;
    persist();
    void showStep();
    return;
  }
  // Self-correction first: no matter how the pointer got ahead, converge to the earliest
  // verifiably-pending input on this route (this also recovers from a stall on a later step).
  if (correctPointer()) {
    stalled = false;
    void showStep();
    return;
  }
  if (stalled) return;
  if (session.step && isDetected(session.step)) {
    setStatus(ackText(session.step)); // acknowledged done — nothing left to observe but Next
    return;
  }
  const step = curStep();
  if (!step || step.locators.length === 0) return; // instruction-only: nothing to observe
  if (step.route && matchStrength(step.route, normalizePath(location.pathname)) === 0) return; // wrong-route: the route watcher owns this
  if (!currentEl || !currentEl.isConnected) {
    void showStep(); // the element was replaced (SPA re-render) — re-resolve and re-aim
    return;
  }
  const st = readElementState(currentEl);
  if (step.kind === 'input') {
    if (stateDone(st)) setStatus(ackText(step.index)); // done (incl. programmatic fills) — Next moves
    else {
      const s = inputStatus(st);
      setStatus(s.text, { explain: s.explain });
    }
    return;
  }
  if (st.disabled) setStatus(blockedText(step), { explain: true });
  else setStatus('Waiting for you — click the highlighted element.');
}
function detachObservers(): void {
  for (const fn of cleanups.splice(0)) {
    try {
      fn();
    } catch {
      /* teardown must never throw */
    }
  }
}
/** Per-step input listener (input steps only) — replaced every time the aim moves. Advances only
 *  on a genuinely-done state (filled AND not invalid / checked); a filled-but-invalid field gets
 *  the explanatory status instead of a false advance. */
let inputCleanup: (() => void) | null = null;
function watchInput(el: Element, stepIndex: number): void {
  inputCleanup?.();
  let debounce = 0;
  const check = (): void => {
    // The debounce can outlive a pointer move — never let a stale check touch another step's card.
    if (!session || stalled || session.step !== stepIndex) return;
    const st = readElementState(el);
    if (stateDone(st) || (st.checked === undefined && st.filled === undefined && isFilled(el))) {
      setStatus(ackText(stepIndex)); // acknowledged — the user's Next moves the pointer
      return;
    }
    const s = inputStatus(st);
    setStatus(s.text, { explain: s.explain });
  };
  const onInput = (): void => {
    clearTimeout(debounce);
    debounce = window.setTimeout(check, 800);
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
  inputCleanup = () => {
    clearTimeout(debounce);
    el.removeEventListener('input', onInput);
    el.removeEventListener('change', onInput);
    el.removeEventListener('blur', onCommit);
    el.removeEventListener('keydown', onCommit);
    inputCleanup = null;
  };
}

// ── The state machine ───────────────────────────────────────────────────────────────────────────
function curStep(): SenseStep | null {
  return session?.workflow.steps.find((s) => s.index === session!.step) ?? null;
}

/** The earliest ON-THIS-ROUTE input step before `before` that is verifiably NOT done (empty /
 *  invalid / unchecked). Only INPUT steps count — their state is readable; a completed click
 *  leaves no evidence, so action steps can never cause a false pullback. Steps the user
 *  explicitly skipped via Next are respected. */
function earliestPendingInput(before: number): number | null {
  if (!session) return null;
  const path = normalizePath(location.pathname);
  const skipped = session.skipped ?? [];
  for (const s of session.workflow.steps) {
    if (s.index >= before) return null;
    if (s.kind !== 'input' || s.locators.length === 0) continue;
    if (skipped.includes(s.index)) continue; // the user's explicit override wins
    if (!s.route || matchStrength(s.route, path) === 0) continue;
    const el = resolveStep(s);
    if (el && isVisible(el) && !inputDone(el)) return s.index;
  }
  return null;
}

// ── Detection = acknowledgment, never motion (manual-only advancement, user decision 2026-07-15).
//    The card confirms what the user did; ONLY the Next click moves the pointer forward. ─────────
function isDetected(i: number): boolean {
  return (session?.detected ?? []).includes(i);
}
function ackText(i: number): string {
  const last = session?.workflow.steps[session.workflow.steps.length - 1]?.index ?? i;
  return i >= last ? 'Detected ✓ — hit Next to finish.' : 'Detected ✓ — hit Next to continue.';
}
/** Record conclusive completion evidence for an ACTION step and acknowledge it on the card.
 *  (Input steps are live-verified instead — their state is re-readable at any moment.) */
function markDetected(i: number): void {
  if (!session) return;
  if (!isDetected(i)) {
    session.detected = [...(session.detected ?? []), i];
    persist();
    log.debug('walkthrough: step detected done (awaiting Next)', { step: i });
  }
  if (session.step === i) void showStep();
}

/** THE POINTER IS SELF-CORRECTING (post-E2E redesign): it always means "the first thing you
 *  haven't done yet." Page evidence beats stored position, beats forward momentum — no matter how
 *  the pointer got ahead (stale resume, hydration race, a manual skip elsewhere), every tick and
 *  every advance converges it back to the earliest verifiably-pending input step on this route.
 *  Returns true when the pointer moved (caller re-renders). A correction, not progress — no
 *  analytics event. */
function correctPointer(): boolean {
  if (!session) return false;
  const pending = earliestPendingInput(session.step);
  if (pending === null) return false;
  log.debug('walkthrough: pointer corrected to earliest pending input', { from: session.step, to: pending });
  session.step = pending;
  persist();
  return true;
}

function onActionTriggered(step: SenseStep): void {
  if (!session) return;
  // A disabled control swallows the activation anyway — never treat it as progress.
  if (currentEl && readElementState(currentEl).disabled) return;
  if (step.postRoute) {
    // The step navigates — persist the expectation SYNCHRONOUSLY (a full-page nav unloads us
    // immediately after this handler); the route watcher (SPA) or resume handshake (hard nav)
    // confirms the landing and advances.
    session.awaitingNav = { fromStep: step.index, postRoute: step.postRoute, at: Date.now() };
    persist();
    setStatus('Nice — waiting for the page…');
    window.setTimeout(() => {
      if (session?.awaitingNav && Date.now() - session.awaitingNav.at >= AWAIT_NAV_TIMEOUT_MS) {
        session.awaitingNav = undefined; // the click didn't go anywhere — back to waiting
        persist();
        void showStep();
      }
    }, AWAIT_NAV_TIMEOUT_MS + 50);
    return;
  }
  // Same-page action: let the page react, then look for evidence the click did its job. Evidence
  // only ACKNOWLEDGES (markDetected) — the pointer moves when the user hits Next.
  void awaitSettle().then(() => {
    if (!session || session.step !== step.index) return;
    const nextStep = session.workflow.steps.find((s) => s.index > step.index) ?? null;
    const nextEl = nextStep && nextStep.locators.length > 0 ? resolveStep(nextStep) : null;
    const nextOffRoute = nextStep ? matchStrength(nextStep.route, normalizePath(location.pathname)) === 0 : false;
    if (
      !nextStep || // that was the last step
      nextOffRoute || // what follows lives elsewhere — this page has nothing left to prove
      (nextEl !== null && isVisible(nextEl)) || // the next step appeared — the page moved on
      (currentEl !== null && !currentEl.isConnected) // the clicked control left the DOM
    ) {
      markDetected(step.index);
    }
    // No evidence either way — keep waiting; Next stays one click away.
  });
}

function handleRouteChange(path: string): void {
  if (!session) return;
  const nav = session.awaitingNav;
  if (nav?.postRoute && matchStrength(nav.postRoute, path) > 0) {
    session.awaitingNav = undefined;
    markDetected(nav.fromStep); // the recorded landing happened — acknowledged; Next moves on
    return;
  }
  const step = curStep();
  // A route matching the current step's postRoute is conclusive even without an observed click
  // (menus, keyboard shortcuts — the OUTCOME is what matters, not how the user got there).
  if (step?.postRoute && matchStrength(step.postRoute, path) > 0) {
    markDetected(step.index);
    return;
  }
  if (isDetected(session.step)) return; // acknowledged — don't repaint the ack with route guidance
  void showStep(); // wrong-route ↔ on-route transitions re-render the aim
}

/** The ONLY way the pointer moves forward: the user's Next click (manual-only advancement, user
 *  decision 2026-07-15). Analytics keep measuring detection quality without a wire change: a Next
 *  on a step the widget had VERIFIED done logs as `auto` (detection-confirmed); an unverified Next
 *  logs as `manual` (override/skip). */
function advanceNext(): void {
  if (!session) return;
  const from = session.step;
  const cur = curStep();
  const el = cur && cur.kind === 'input' && cur.locators.length > 0 ? resolveStep(cur) : null;
  const verified =
    cur?.kind === 'input'
      ? el !== null && isVisible(el) && inputDone(el) // inputs re-verify live at click time
      : isDetected(from); // actions need recorded evidence (click landed / navigation matched)
  const mode: 'auto' | 'manual' = verified ? 'auto' : 'manual';
  // Next over a step the gate still sees as pending = an explicit user override ("I know better —
  // skip it"): remember it so the self-correcting pointer never drags them back to it.
  if (cur?.kind === 'input' && el && isVisible(el) && !inputDone(el)) {
    session.skipped = [...(session.skipped ?? []), from];
  }
  let nxt = session.workflow.steps.find((s) => s.index > from)?.index ?? null;
  // The pointer never leapfrogs an earlier verifiably-pending input on this route — and completion
  // is never declared over one.
  const pending = earliestPendingInput(nxt ?? Number.MAX_SAFE_INTEGER);
  if (pending !== null) nxt = nxt === null ? pending : Math.min(nxt, pending);
  if (mode === 'auto') session.auto += 1;
  else session.manual += 1;
  stalled = false;
  log.debug('walkthrough: next', { mode, from, to: nxt ?? 'completed' });
  if (nxt === null) {
    session.step = from;
    persist();
    emit('step_advanced', mode);
    end('completed');
    return;
  }
  session.step = nxt;
  session.awaitingNav = undefined;
  persist();
  emit('step_advanced', mode);
  void showStep();
}

/** Render the current step: resolve → aim the sticky spotlight → arm detection. Wrong route =
 *  text-only guidance; unresolvable = SAFE-STOP (stalled). State-aware: a disabled target or an
 *  invalid field gets an explanatory status (+ the Reason escalation), never a "click it". */
async function showStep(): Promise<void> {
  if (!session || !rootRef) return;
  if (resolving) return; // one resolve loop at a time (the tick may race a resume/advance render)
  resolving = true;
  try {
    const step = curStep();
    if (!step) return end('completed'); // step index past the plan (defensive)
    buildCard();
    stalled = false;
    inputCleanup?.();
    currentEl = null;
    card!.chip.textContent = `${step.index}/${session.workflow.steps.length}`;
    card!.title.textContent = session.title;
    card!.instr.textContent = step.instruction;
    card!.back.disabled = step.index <= 1;
    const path = normalizePath(location.pathname);

    // Evidence already in (click landed / navigation matched — possibly on a page this element no
    // longer exists on): acknowledge and wait for the user's Next. Never re-demand a done step.
    if (isDetected(step.index)) {
      clearSpotlight(true);
      inputCleanup?.();
      setStatus(ackText(step.index));
      return;
    }

    if (step.route && matchStrength(step.route, path) === 0) {
      clearSpotlight(true);
      setStatus(`This step happens on ${step.route} — head there and I'll pick it up.`);
      return;
    }
    if (step.locators.length === 0) {
      clearSpotlight(true);
      setStatus('Do this, then hit Next.'); // unrecoverable capture — instruction-only, manual advance
      return;
    }
    setStatus('Looking for this step on your page…');
    for (let i = 0; i < RESOLVE_RETRIES_MS.length; i++) {
      if (RESOLVE_RETRIES_MS[i]! > 0) await new Promise((r) => setTimeout(r, RESOLVE_RETRIES_MS[i]));
      if (!session || session.step !== step.index) return; // the world moved while we waited
      const el = resolveStep(step);
      if (el && isVisible(el)) {
        currentEl = el;
        spotlight(rootRef, el, { sticky: true });
        const st = readElementState(el);
        if (step.kind === 'input') {
          watchInput(el, step.index); // keeps the ack honest if the state regresses
          if (stateDone(st)) {
            setStatus(ackText(step.index)); // already done — acknowledged; Next moves on
          } else {
            const s = inputStatus(st);
            setStatus(s.text, { explain: s.explain });
          }
        } else if (st.disabled) {
          setStatus(blockedText(step), { explain: true }); // the tick flips this live on enable
        } else {
          setStatus('Waiting for you — click the highlighted element.');
        }
        return;
      }
    }
    // SAFE-STOP: on the right page but the element won't resolve — say so, never guess forward.
    stalled = true;
    clearSpotlight(true);
    setStatus(
      "I can't find this step on your page — it may have moved or may not be available to your account.",
      { stall: true, explain: true },
    );
    emit('stalled');
    log.debug('walkthrough: stalled', { step: step.index });
  } finally {
    resolving = false;
  }
}

function end(outcome: 'completed' | 'aborted'): void {
  if (!session) return;
  emit(outcome);
  detachObservers();
  inputCleanup?.();
  clearSpotlight(true);
  clearStore();
  const title = session.title;
  session = null;
  currentEl = null;
  stalled = false;
  if (outcome === 'completed' && card) {
    // A brief done state, then the card dismisses itself. (The button's advance handler is
    // harmless now — advance() no-ops without a session — so Close just needs its own listener.)
    card.chip.textContent = '✓';
    card.instr.textContent = `Done — you finished “${title}”.`;
    setStatus('');
    card.back.style.display = 'none';
    card.retry.style.display = 'none';
    card.next.textContent = 'Close';
    card.next.addEventListener('click', removeCard);
    window.setTimeout(removeCard, 6000);
  } else {
    removeCard();
    if (outcome === 'aborted') hooksRef.onExit?.();
  }
}

// ── Public API ──────────────────────────────────────────────────────────────────────────────────

/** Should this answer carry a "Walk me through it" offer? Position must map to a shard workflow
 *  with at least one step at/after the user's current step. */
export function walkthroughOffer(
  position: { sourceId: string; segmentIndex: number; step: number },
  workflows: SenseWorkflow[] | null,
): { workflow: SenseWorkflow; startStep: number } | null {
  if (!workflows) return null;
  const wf = workflows.find((w) => w.sourceId === position.sourceId && w.segmentIndex === position.segmentIndex);
  if (!wf || wf.steps.length === 0) return null;
  const startStep = Math.min(Math.max(1, position.step), wf.steps.length);
  return { workflow: wf, startStep };
}

/** Start a walkthrough (explicit user consent = the offer click). Replaces any active run. */
export function startWalkthrough(
  root: ShadowRoot,
  cfg: WalkCfg,
  workflow: SenseWorkflow,
  startStep: number,
  queryId: string | undefined,
  hooks: WalkHooks = {},
): void {
  if (session) end('aborted'); // one walkthrough at a time
  rootRef = root;
  cfgRef = cfg;
  hooksRef = hooks;
  session = {
    v: 1,
    k: cfg.key,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    ...(queryId ? { queryId } : {}),
    sourceId: workflow.sourceId,
    segmentIndex: workflow.segmentIndex,
    title: workflow.title,
    workflow,
    step: startStep,
    startStep,
    auto: 0,
    manual: 0,
  };
  persist();
  emit('started');
  attachObservers();
  void showStep();
  log.debug('walkthrough: started', { key: `${workflow.sourceId}:${workflow.segmentIndex}`, startStep });
}

/**
 * Boot-time resume — a full-page navigation mid-workflow unloads the widget; the snippet on the
 * next page picks the session back up. The storage check comes FIRST so pages without an active
 * walkthrough fetch nothing (Sense's "never on page load" posture holds); only a live session
 * pulls this route's shard, which reconciles the persisted plan: a re-approved workflow is
 * swapped in fresh; a workflow REVOKED since (absent from a shard its route says it belongs in)
 * ends the walkthrough silently — absence = not approved, applied to resumption.
 */
export async function resumeWalkthrough(root: ShadowRoot, cfg: WalkCfg, hooks: WalkHooks = {}): Promise<void> {
  const stored = readStore(cfg.key);
  if (!stored) {
    clearStore(); // expired/foreign/corrupt — discard silently
    return;
  }
  rootRef = root;
  cfgRef = cfg;
  hooksRef = hooks;
  session = stored;
  const path = normalizePath(location.pathname);

  const freshShard = await ensureShard(cfg.apiBase, cfg.key, path, 1500);
  if (!session) return; // ended while the fetch was in flight (defensive)
  if (freshShard) {
    const fresh = freshShard.find(
      (w) => w.sourceId === session!.sourceId && w.segmentIndex === session!.segmentIndex,
    );
    if (fresh && fresh.steps.length > 0) {
      session.workflow = fresh; // pick up recompiles/re-approvals
      session.title = fresh.title;
      session.step = Math.min(session.step, fresh.steps.length);
    } else if (session.workflow.steps.some((s) => matchStrength(s.route, path) > 0)) {
      // This route belongs to the workflow, yet the shard no longer carries it → revoked.
      log.debug('walkthrough: workflow no longer served — ending quietly');
      clearStore();
      session = null;
      return;
    }
    // Off-plan route + fetch succeeded but no match: shards are route-scoped, so absence here
    // proves nothing — proceed on the persisted copy (bounded by the TTL).
  }

  // Resolve a pending navigation: the recorded landing happening is EVIDENCE, not motion — the
  // step is acknowledged done and the card waits for the user's Next on the new page.
  const nav = session.awaitingNav;
  session.awaitingNav = undefined;
  if (nav?.postRoute && matchStrength(nav.postRoute, path) > 0 && !isDetected(nav.fromStep)) {
    session.detected = [...(session.detected ?? []), nav.fromStep];
  }
  persist();

  attachObservers();
  await awaitSettle(); // let the new page hydrate before the first resolve attempt
  correctPointer(); // page truth beats the stored pointer; if the form hydrates even later, the tick converges within ~400ms
  void showStep();
  log.debug('walkthrough: resumed', { step: session?.step });
}
