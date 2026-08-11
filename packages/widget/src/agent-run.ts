// P4-M2 THE ACTING RUN (docs/build/agent.md §A2) — the second actor policy on the shared step
// engine: the WIDGET performs the founder's recorded steps; verification advances; input and
// destructive steps pause. The guided walkthrough remains the first policy (the user acts, Next
// advances) and both consult the same engine verdicts, which is the whole point of §A2.10.
//
// THE SHAPE OF A RUN. The answer carries a typed run OFFER; the user opens a consent sheet and
// clicks "Run it" — THAT is the consent moment, and `POST /v1/copilot/run { start }` records it and
// pins the plan hash. The run then narrates into the chat, asks for what it needs there, and
// appends per-step and terminal outcomes to its `ExecutionRun`. `window.FlowBuddyRun` survives only
// as a DEBUG-BUILD shortcut past the conversation (registered when the embed carries
// `data-flowbuddy-debug="true"`); the plan itself is served only for workflows whose founder
// enabled acting (live approval + `executeState: 'enabled'`, checked server-side).
//
// THE POSTURE, from the design:
//  - Act-verify-or-hand-back (§A2.6): every act is judged against recorded evidence (the engine's
//    vocabulary). An act the page ignored is a first-class outcome — that one step is handed to
//    the user in guided posture and the run continues acting afterward. Never act-and-hope.
//  - Inputs (§A2.4): a missing non-sensitive value is asked IN THE CHAT, one field at a time, and
//    the reply IS the value — no mid-run model call. Sensitive fields are always POINT-AND-TYPE:
//    the run pauses, highlights the app's own field, the user types THERE, and an explicit Continue
//    advances (D4 — `filled ≠ done`; D5 — state is read ON the Continue click). Chat-supplied and
//    dev-supplied values are NEVER persisted — a resume falls back to point-and-type for what
//    remains, and the audit stores only the SOURCE.
//  - Destructive steps pause for a typed Confirm BEFORE acting (§A2.7). Stopping is always
//    visible and unambiguous (founder decision 2026-08-11): "Stop Auto Run" (and the ✕) ABORTS the
//    run outright and returns the widget to the plain copilot — the earlier takeover-to-guided
//    handoff and the Pause control were removed with it (one exit, one meaning).
//  - Navigation is a run-level move (§A2.5): only to id-free destinations; anything else is a
//    polite hand-off ("head there and I'll pick it up") — same rule as the walkthrough.
//  - The plan is PINNED: a resume re-fetches and a changed `planHash` ends the run quietly rather
//    than continuing onto steps nobody started (§A2.2). Revocation mid-run ends it the same way —
//    absence applied to resumption, exactly like the walkthrough's shard reconcile.

import { log } from './log.js';
import {
  clearSpotlight,
  displayRoute,
  findAlertSurfaces,
  matchStrength,
  normalizePath,
  readLiveScreen,
  routePattern,
  spotlight,
  type SenseLocator,
  type SenseStep,
} from './sense.js';
import { readElementState } from './reason.js';
import {
  actionCompletionEvidence,
  AWAIT_NAV_TIMEOUT_MS,
  awaitSettle,
  disappearedSatisfied,
  entryVerdict,
  inputDone,
  invalidHint,
  labelMatches,
  markerBaseline,
  markerVerdict,
  observeRun,
  outcomeSatisfied,
  resolveStepWithRetries,
  stateDone,
  watchInputState,
  type OutcomeCheck,
} from './step-engine.js';
import { actCheck, actClick, actFill, actNavigate, actSelect } from './act.js';
import { clearSession, peekSession, readSession, writeSession, type SessionSpec } from './session.js';

const RUN_TTL_MS = 30 * 60_000; // same bound as the walkthrough — an abandoned tab stops within the half hour
const MAX_PLAN_STEPS = 200;
/** EC — the second, delayed rejection sample on the agent's OWN clicks: server-side validation
 *  often lands after mutation-quiet, and one late look catches it before a false Done. A beat of
 *  patience per click; never applied after a step has completed (no reconsideration). */
const REJECTION_RECHECK_MS = 750;

// ── The plan wire (GET /v1/copilot/execution-plan) ─────────────────────────────────────────────
export interface RunStep {
  index: number;
  verb: 'click' | 'fill' | 'select' | 'check' | 'navigate';
  instruction: string;
  route: string;
  locators: SenseLocator[];
  postRoute?: string;
  inputSlot?: { label: string; sensitive: boolean };
  destructive?: boolean;
  /** Only a human can perform this step (today: file pickers — trusted gestures only). The run
   *  pauses for the user and verifies the result; never chat-asked, never acted by the agent. */
  userOnly?: boolean;
  /** P3-M2 — the step's recorded moment (execution-contracts.md EC-7/EC-8): phrases that NEWLY
   *  appeared when it succeeded, phrases that disappeared, the target's recorded label (the
   *  resolved-element cross-check), and the landing title on navigating steps. Presence TIGHTENS
   *  completion; absence changes nothing. Matched by contains, case-insensitive — recall, never
   *  equality. Pre-contract plans carry `appeared` only. */
  expect?: { appeared?: string[]; disappeared?: string[]; label?: string; landedTitle?: string };
}

/** The plan-level contract halves (P3-M2): where the run may start and what Done looks like —
 *  founder-recording-derived, served beside the steps, consent-pinned with them. Absent on plans
 *  compiled before contracts existed: the run then verifies exactly as it always did. */
export interface RunContract {
  v: 1;
  entry: {
    route: string;
    screen?: { title: string; anchors: string[] };
    start: 'anywhere' | 'on-screen';
  };
  outcome: {
    route?: string;
    screen?: { title: string; anchors: string[] };
    appeared?: string[];
  };
}

/** Accept the contract only when it is structurally the thing we pinned consent over — junk from
 *  an out-of-sync server is treated as ABSENT (fail-open to today's behavior, never a throw). */
function parseContract(raw: unknown): RunContract | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as RunContract;
  if (c.v !== 1 || !c.entry || typeof c.entry.route !== 'string') return undefined;
  if (c.entry.start !== 'anywhere' && c.entry.start !== 'on-screen') return undefined;
  if (!c.outcome || typeof c.outcome !== 'object') return undefined;
  return c;
}

/** Engine compatibility: the acting plan's verbs collapse onto the engine's two step kinds. */
export function stepKindOf(verb: RunStep['verb']): 'input' | 'action' {
  return verb === 'fill' || verb === 'select' || verb === 'check' ? 'input' : 'action';
}
function asSenseStep(s: RunStep): SenseStep {
  return {
    index: s.index,
    instruction: s.instruction,
    route: s.route,
    kind: stepKindOf(s.verb),
    locators: s.locators,
    ...(s.postRoute ? { postRoute: s.postRoute } : {}),
  };
}

/** May the run navigate the user here itself? Only to a SCREEN — an id-carrying destination is a
 *  record out of the founder's account and is never enterable on an end-user's behalf (§A2.5).
 *  The landing page IS a screen; an EMPTY recorded route is unknown, never "the root". */
export function canDirectNavigate(path: string): boolean {
  if (!path.trim()) return false;
  return !routePattern(path).includes(':id');
}

// ── Session (persisted; values are NOT part of it — see the posture note above) ────────────────
interface RunSession {
  workflowKey: string; // sourceId:segmentIndex — what the widget knows workflows by
  title: string;
  planHash: string;
  /** The consented `ExecutionRun` id (slice 4) — absent on debug-trigger runs, which have no
   *  consent moment and therefore no audit row. Lifecycle events are emitted only when present. */
  runId?: string;
  steps: RunStep[];
  step: number; // current 1-based step
  done: number[];
  awaitingNav?: { fromStep: number; postRoute?: string; at: number };
  /** Part 1 of outcome checks: a direct navigation is TRIED ONCE. Landing anywhere else is the
   *  app refusing the destination (login wall, permission gate) — retrying builds a redirect loop,
   *  so the refusal is remembered HERE, across the very page loads the loop would span, until the
   *  user arrives themselves or the step completes. */
  navTried?: { target: string; at: number };
  /** P3-M2 — the plan's entry/outcome contract, pinned with the steps. Absent on pre-contract
   *  plans; the run then behaves exactly as before contracts existed. */
  contract?: RunContract;
  /** The entry pre-flight runs ONCE per run (before the first act); persisted so a reload can't
   *  re-audit an entry that was already judged. */
  entryChecked?: boolean;
}

interface RunCfg {
  apiBase: string;
  key: string;
  reason: boolean;
}
interface RunHooks {
  onExit?: () => void;
  /** Narration into the chat thread (slice 4) — every state change, in words, as it happens. */
  onNarrate?: (text: string) => void;
  /** Chat-first inputs (slice 6, agent.md §A2.4): the run needs a value — render `ask` in the
   *  thread and arm the composer; the user's next message arrives via `provideRunValue`. Absent
   *  (e.g. a bare embed with no chat wiring) the run falls back to point-and-type at the field. */
  onNeedValue?: (req: { step: number; label: string; ask: string }) => void;
  /** The run's card model changed — the panel re-renders its docked run strip (slice 6: while the
   *  chat is open, the strip IS the run's control surface and the floating card stays hidden). */
  onState?: () => void;
}

/** What the run's control surface shows right now — one model, two renderers (the floating card
 *  when the chat is closed; the panel's docked strip when it is open). */
export interface RunCardState {
  chip: string;
  title: string;
  instr: string;
  status: string;
  /** Label for the Continue/Confirm/Retry affordance, or null when none applies. */
  cont: string | null;
  stall: boolean;
}
let cardState: RunCardState | null = null;
function notifyState(): void {
  try {
    hooksRef.onState?.();
  } catch {
    /* the strip failing to paint must never break the run */
  }
}
export function runCardState(): RunCardState | null {
  return session ? cardState : null;
}

/** The panel tells the run whether the chat is on screen: open ⇒ the docked strip is the control
 *  surface and the floating card hides; closed ⇒ the floating card is the only surface. */
let panelOpen = false;
export function setRunPanelOpen(open: boolean): void {
  panelOpen = open;
  if (card) card.el.style.display = panelOpen ? 'none' : '';
}

// The strip's controls — thin exports over the same handlers the floating card's buttons use, so
// the two surfaces cannot drift in behavior.
export function pressRunContinue(): void {
  onContinue();
}
/** "Stop Auto Run" and the ✕ are the same act (founder decision 2026-08-11): abort outright, tear
 *  down, back to the plain copilot. No pause, no takeover-to-guided — one exit, one meaning. */
export function stopRun(): void {
  end('aborted');
}

const RUN_SESSION: SessionSpec<RunSession> = {
  slot: 'agent-run',
  version: 1,
  ttlMs: RUN_TTL_MS,
  validate: (s) =>
    Boolean(s?.steps?.length) && s.steps.length <= MAX_PLAN_STEPS && Number.isInteger(s?.step) && typeof s?.planHash === 'string',
};

// ── Module state (one run at a time, per page view) ────────────────────────────────────────────
let session: RunSession | null = null;
let cfgRef: RunCfg | null = null;
let rootRef: ShadowRoot | null = null;
let hooksRef: RunHooks = {};
let values = new Map<number, string>(); // dev-supplied, this page view only — NEVER persisted
let currentEl: Element | null = null;
let acting = false; // an act path is in flight — ticks must not re-enter (see withActing)

/** EVERY path that acts or verifies must hold the acting flag for its whole async span — the
 *  400ms tick's idle rescue (`waiting === null && !acting → showAndAct`) otherwise re-enters the
 *  CURRENT step mid-settle and double-acts it. Found live: a chat-supplied value was filled, the
 *  tick re-asked for it during the settle wait, and the stale wait then wedged the whole run. */
async function withActing<T>(fn: () => Promise<T>): Promise<T> {
  const prev = acting;
  acting = true;
  try {
    return await fn();
  } finally {
    acting = prev;
  }
}
let waiting: 'input' | 'chat-input' | 'confirm' | 'handback' | 'nav' | 'stalled' | null = null;
let chatAsk: { step: number; label: string } | null = null; // set only while waiting === 'chat-input'
/** WHY an action step was handed back — the two reasons resolve differently: a 'disabled' control
 *  is auto-pressed the moment it enables (the Confirm already given covers it), while a 'failed'
 *  act needs the USER's own click, observed, before anything counts as done. */
let handbackKind: 'disabled' | 'failed' | null = null;
let cleanups: Array<() => void> = [];
let inputCleanup: (() => void) | null = null;
let card: {
  el: HTMLDivElement;
  chip: HTMLSpanElement;
  title: HTMLSpanElement;
  instr: HTMLDivElement;
  status: HTMLDivElement;
  cont: HTMLButtonElement;
  stop: HTMLButtonElement;
} | null = null;

export function agentRunActive(): boolean {
  return session !== null;
}
export function agentRunPending(key: string): boolean {
  return peekSession(RUN_SESSION, key);
}
/** The value the run is waiting for in the CHAT right now, if any — the composer's routing truth.
 *  Read live at submit time, never cached: a route change or the run ending must instantly return
 *  the composer to normal questions. */
export function runAwaitingValue(): { step: number; label: string } | null {
  return waiting === 'chat-input' && chatAsk ? chatAsk : null;
}

function persist(): void {
  if (!session || !cfgRef) return;
  writeSession(RUN_SESSION, cfgRef.key, session);
}

function curStep(): RunStep | null {
  return session?.steps.find((s) => s.index === session!.step) ?? null;
}

// ── Narration + the audit wire (both best-effort; neither may affect the run) ──────────────────
let narrated = new Set<string>(); // one narration per (kind, step) — re-renders must not repeat it
/** True from "last step completed" until `end()` — the Done check awaits a settle, and nothing
 *  (tick, route watcher) may re-enter the loop and re-act a finished plan during that window. */
let finishing = false;
function narrate(key: string, text: string): void {
  if (narrated.has(key)) return;
  narrated.add(key);
  try {
    hooksRef.onNarrate?.(text);
  } catch {
    /* narration must never break the run */
  }
}

/** Append one lifecycle event to the consented run's audit row. Fire-and-forget, keepalive (the
 *  event most worth keeping precedes the navigation that unloads us). Debug runs have no runId
 *  and emit nothing — no consent, no audit row.
 *
 *  P3-M2 (execution-contracts.md EC-6): failures are first-class events — what KIND went wrong and
 *  where, so "which steps are fragile in the field" is a query instead of a guess. What travels is
 *  enum kinds, integers and at most one page-derived snippet (`reason`, scrubbed server-side like
 *  the safe-stop reason); values never ride this wire. */
type RunFailureKind =
  | 'handback'      // an act didn't take, or a control was disabled — the user finished the step
  | 'rejected'      // the app itself refused (a fresh rejection surface); `reason` = its words
  | 'marker-miss'   // page evidence looked done, but the recorded success phrases never showed
  | 'label-mismatch'// slice 3: the resolved element contradicted the recorded label
  | 'stall'         // the step's element never resolved on the right page
  | 'nav-timeout'   // a pressed navigation never arrived
  | 'entry-miss'    // slice 3: the run could not start where the recording starts
  | 'outcome-miss'; // slice 3: completed, but the finish didn't look like the recording's
function emitRun(
  event: 'step' | 'failure' | 'completed' | 'aborted' | 'safe_stop',
  extra: {
    step?: number;
    outcome?: 'acted' | 'user';
    input?: 'prefill' | 'typed' | 'chat';
    confirmed?: boolean;
    reason?: string;
    kind?: RunFailureKind;
    ms?: number;
    verified?: boolean;
    /** EC-7: the step's markers were ALL visible before the act — presence fallback fired. */
    presat?: boolean;
  } = {},
): void {
  if (!cfgRef) return;
  const runId = session?.runId;
  if (!runId) return;
  void fetch(`${cfgRef.apiBase}/v1/copilot/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-FlowBuddy-Key': cfgRef.key },
    body: JSON.stringify({ runId, event, ...extra }),
    keepalive: true,
  }).catch(() => {
    /* best-effort */
  });
}

/** When each step's FIRST attempt began (first-set-wins: a confirm pause or retry is part of the
 *  step's honest duration). Module state — a hard navigation loses it, so a step completed on
 *  resume simply carries no `ms`, which is true: its wall time is unknowable from here. */
const stepStartedAt = new Map<number, number>();
function markStepStart(index: number): void {
  if (!stepStartedAt.has(index)) stepStartedAt.set(index, Date.now());
}
function takeStepMs(index: number): number | undefined {
  const started = stepStartedAt.get(index);
  stepStartedAt.delete(index);
  return started !== undefined ? Math.max(0, Date.now() - started) : undefined;
}

// ── Card (reuses the walkthrough's shadow-root classes — same overlay, different actor) ────────
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
  exit.setAttribute('aria-label', 'Stop the run');
  head.appendChild(chip);
  head.appendChild(title);
  head.appendChild(exit);
  const instr = mk('div', 'fb-walk-instr');
  const status = mk('div', 'fb-walk-status');
  const actions = mk('div', 'fb-walk-actions');
  const stop = mk('button', 'fb-walk-btn', 'Stop Auto Run');
  const cont = mk('button', 'fb-walk-btn fb-walk-next', 'Continue');
  cont.style.display = 'none';
  actions.appendChild(stop);
  actions.appendChild(cont);
  el.appendChild(head);
  el.appendChild(instr);
  el.appendChild(status);
  el.appendChild(actions);
  rootRef.appendChild(el);

  exit.addEventListener('click', () => end('aborted'));
  stop.addEventListener('click', () => end('aborted'));
  cont.addEventListener('click', onContinue);
  if (panelOpen) el.style.display = 'none'; // the chat is on screen — its docked strip is the surface
  card = { el, chip, title, instr, status, cont, stop };
}
function removeCard(): void {
  card?.el.remove();
  card = null;
}
const EMPTY_CARD: RunCardState = { chip: '', title: '', instr: '', status: '', cont: null, stall: false };
function setStatus(text: string, opts?: { cont?: string | null; stall?: boolean }): void {
  cardState = {
    ...(cardState ?? EMPTY_CARD),
    status: text,
    cont: opts?.cont === undefined ? (cardState?.cont ?? null) : opts.cont,
    stall: opts?.stall === true,
  };
  notifyState();
  if (!card) return;
  card.status.textContent = text;
  card.status.classList.toggle('fb-walk-stalled', opts?.stall === true);
  if (opts?.cont !== undefined) {
    card.cont.style.display = opts.cont === null ? 'none' : '';
    if (opts.cont !== null) card.cont.textContent = opts.cont;
  }
}
function renderStepHead(step: RunStep): void {
  buildCard();
  cardState = {
    ...(cardState ?? EMPTY_CARD),
    chip: `${step.index}/${session!.steps.length}`,
    title: `AI Agent · ${session!.title}`,
    instr: step.instruction,
  };
  notifyState();
  card!.chip.textContent = `${step.index}/${session!.steps.length}`;
  card!.title.textContent = `AI Agent · ${session!.title}`;
  card!.instr.textContent = step.instruction;
}

// ── Controls ───────────────────────────────────────────────────────────────────────────────────

/** The explicit Continue on a paused input step (D4/D5): re-read the field's state NOW; advance
 *  only on genuinely-done, otherwise say why in the app's own terms and stay. */
function onContinue(): void {
  if (!session || waiting === null) return;
  const step = curStep();
  if (!step) return;
  if (waiting === 'stalled') {
    waiting = null;
    void showAndAct(); // Retry
    return;
  }
  if (waiting === 'confirm') {
    waiting = null;
    void withActing(() => performStep(step, { confirmed: true }));
    return;
  }
  if (waiting === 'input' || waiting === 'handback') {
    if (stepKindOf(step.verb) === 'input') {
      if (!currentEl || !inputDone(currentEl)) {
        const st = currentEl ? readElementState(currentEl) : null;
        setStatus(
          st && st.filled && st.valid === false
            ? `That doesn't look right yet — ${invalidHint(st.invalidReason)}.`
            : 'Please provide correct details then click Continue',
          { cont: 'Continue' },
        );
        return;
      }
    }
    waiting = null;
    completeStep(step.index, { o: 'user', ...(stepKindOf(step.verb) === 'input' ? { in: 'typed' as const } : {}) });
  }
}

// ── Observers ──────────────────────────────────────────────────────────────────────────────────
function attachObservers(): void {
  // The USER's own act on a handed-back step is the third way forward: a capture-phase click (or
  // Enter on the focused control) on the highlighted element — observed exactly the way the guided
  // walkthrough observes — then judged with the click-observed evidence rule, last step included.
  const onUserAct = (): void => {
    if (!session || waiting !== 'handback' || !currentEl) return;
    const step = curStep();
    if (!step || stepKindOf(step.verb) !== 'action') return;
    if (readElementState(currentEl).disabled) return; // a disabled control swallows the activation
    void withActing(async () => {
      if (!session || session.step !== step.index) return;
      const alertsBefore = alertTexts(); // the user's press gets the same outcome check as ours
      const markersBefore = markerBaseline([...(step.expect?.appeared ?? []), ...(step.expect?.disappeared ?? [])]);
      if (step.postRoute) {
        // Their click navigates: persist the expectation SYNCHRONOUSLY (the nav unloads us); the
        // route watcher (SPA) or the resume handshake (hard nav) completes the step on landing.
        session.awaitingNav = { fromStep: step.index, postRoute: step.postRoute, at: Date.now() };
        waiting = null;
        handbackKind = null;
        persist();
        setStatus('Waiting for the page…', { cont: null });
        // A rejection can arrive instead of the navigation — same rule as our own press.
        await awaitSettle();
        if (!session || session.step !== step.index || !session.awaitingNav) return;
        const rejection = newAlertAfterAct(alertsBefore);
        if (rejection) {
          session.awaitingNav = undefined;
          persist();
          rejectedByApp(step, rejection);
        }
        return;
      }
      await awaitSettle();
      if (!session || session.step !== step.index || waiting !== 'handback') return;
      const rejection = newAlertAfterAct(alertsBefore);
      if (rejection) {
        rejectedByApp(step, rejection); // stays handed back, with the app's fresh words
        return;
      }
      // The user's press earns completion by the same recorded standard as ours — newly-visible
      // markers against the baseline taken at their observed press (EC-7).
      const mv = markerVerdict(step.expect?.appeared, markersBefore);
      const gone = disappearedSatisfied(step.expect?.disappeared, markersBefore);
      if (
        actionCompletionEvidence({
          steps: session.steps.map(asSenseStep),
          stepIndex: step.index,
          currentEl,
          path: normalizePath(location.pathname),
          clickObserved: true,
        }) &&
        mv !== 'unsatisfied' &&
        gone
      ) {
        waiting = null;
        handbackKind = null;
        completeStep(step.index, { o: 'user', ...(mv === 'presence' ? { p: true } : {}) });
      }
    });
  };
  const onClick = (e: MouseEvent): void => {
    if (!currentEl) return;
    const target = e.target;
    const hit =
      (typeof e.composedPath === 'function' && e.composedPath().includes(currentEl)) ||
      (target instanceof Node && currentEl.contains(target));
    if (hit) onUserAct();
  };
  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && document.activeElement === currentEl) onUserAct();
  };
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeydown, true);
  cleanups.push(() => document.removeEventListener('click', onClick, true));
  cleanups.push(() => document.removeEventListener('keydown', onKeydown, true));
  cleanups.push(observeRun({ onRouteChange: handleRouteChange, onTick: onStateTick }));
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

/** Soft check on navigation-completed steps (the EC-7 per-path table): the step IS complete — the
 *  navigation happened and cannot be un-done — but the recorded phrases missing on arrival are a
 *  fragility signal worth an audit event and one gentle line, never a block. The LAST step is
 *  excluded: the Done check (`finishRun`) owns the finish, and double-counting one miss as two
 *  events would lie to the founder's numbers. */
function auditArrivalMarkers(stepIndex: number): void {
  const steps = session?.steps;
  const step = steps?.find((s) => s.index === stepIndex);
  const markers = step?.expect?.appeared;
  if (!steps || !step || !markers?.length) return;
  if (!steps.some((s) => s.index > step.index)) return; // last step — finishRun owns it
  void (async () => {
    await awaitSettle();
    if (anyMarkerVisible(markers)) return;
    emitRun('failure', { step: step.index, kind: 'marker-miss' });
    narrate(`arrmiss:${step.index}`, `(Though I didn’t spot the usual confirmation on arrival — worth a glance.)`);
  })();
}

function handleRouteChange(path: string): void {
  if (!session || finishing) return;
  const nav = session.awaitingNav;
  if (nav?.postRoute && matchStrength(nav.postRoute, path) > 0) {
    session.awaitingNav = undefined;
    waiting = null;
    completeStep(nav.fromStep);
    auditArrivalMarkers(nav.fromStep);
    return;
  }
  const step = curStep();
  if (step?.postRoute && matchStrength(step.postRoute, path) > 0) {
    session.awaitingNav = undefined;
    waiting = null;
    completeStep(step.index);
    auditArrivalMarkers(step.index);
    return;
  }
  // The world changed under whatever we were waiting for — re-aim from scratch. A pending confirm
  // simply re-asks when the step re-renders; a watched input re-attaches to the fresh element; a
  // pending chat ask re-fires against the new page (and the composer chip follows the live state).
  inputCleanup?.();
  inputCleanup = null;
  waiting = null;
  chatAsk = null;
  handbackKind = null;
  if (!acting) void showAndAct();
}

function onStateTick(): void {
  if (!session || acting || finishing) return;
  // A pending navigation that outlived its budget: the click didn't take — hand the step back.
  if (session.awaitingNav) {
    if (Date.now() - session.awaitingNav.at <= AWAIT_NAV_TIMEOUT_MS) return;
    const from = session.awaitingNav.fromStep;
    session.awaitingNav = undefined;
    persist();
    emitRun('failure', { step: from, kind: 'nav-timeout' });
    handBack(session.steps.find((s) => s.index === from) ?? null, 'The page did not follow my press.');
    return;
  }
  // A handed-back ACTION step. Three honest ways forward, and NO last-step shortcut — with no
  // observed act, "nothing left to prove" proves nothing (the live bug: a disabled final submit
  // "completed" untouched and the run said Done over a form the app refused).
  if (waiting === 'handback') {
    const step = curStep();
    if (!step || stepKindOf(step.verb) !== 'action') return;
    // (1) A control handed back for being DISABLED gets pressed by US the moment it enables —
    // the user's Confirm still covers it, and "I'll pick up right after" meant exactly this.
    if (
      handbackKind === 'disabled' &&
      currentEl &&
      currentEl.isConnected &&
      !readElementState(currentEl).disabled
    ) {
      waiting = null;
      handbackKind = null;
      narrate(`resume:${step.index}`, 'It’s enabled now — pressing it.');
      void withActing(() => performStep(step, { confirmed: true }));
      return;
    }
    // (2) Hard page evidence only (clickObserved: false): the next step appeared, or the control
    // left the DOM. The user's own click is (3), handled by the observers' click listener.
    // EC-7 per-path rule: with no act moment there is no baseline, so markers are required by
    // PRESENCE here — a marker-carrying step stays handed back until its phrases are on screen,
    // which costs nothing worse than continuing to wait.
    if (
      actionCompletionEvidence({
        steps: session.steps.map(asSenseStep),
        stepIndex: step.index,
        currentEl,
        path: normalizePath(location.pathname),
        clickObserved: false,
      }) &&
      (!step.expect?.appeared?.length || anyMarkerVisible(step.expect.appeared))
    ) {
      waiting = null;
      handbackKind = null;
      completeStep(step.index, { o: 'user' });
    }
    return;
  }
  // A paused input: keep the status honest live (done → invite Continue), like the walkthrough.
  if (waiting === 'input') {
    const step = curStep();
    if (!step || !currentEl || !currentEl.isConnected) {
      void showAndAct();
      return;
    }
    if (inputDone(currentEl)) setStatus('Looks good — hit Continue.', { cont: 'Continue' });
    return;
  }
  // Awaiting a chat value: only re-aim if the element vanished (an SPA re-render) — the fresh
  // showAndAct re-enters chat-input and re-asks against the new element.
  if (waiting === 'chat-input') {
    if (!currentEl || !currentEl.isConnected) {
      waiting = null;
      chatAsk = null;
      void showAndAct();
    }
    return;
  }
  if (waiting === null && !acting) void showAndAct(); // belt-and-braces: never leave the run idle
}

// ── The loop: resolve → act → verify → advance (or pause on purpose) ───────────────────────────
function completeStep(
  index: number,
  how: { o: 'acted' | 'user'; in?: 'prefill' | 'typed' | 'chat'; c?: boolean; p?: boolean } = { o: 'acted' },
): void {
  if (!session) return;
  // A completed step ends whatever was being waited for, as a RULE — a stale wait surviving the
  // step transition is what wedged the first chat-first run (the ask raced the fill's settle).
  waiting = null;
  chatAsk = null;
  handbackKind = null;
  if (!session.done.includes(index)) {
    session.done = [...session.done, index];
    const ms = takeStepMs(index);
    emitRun('step', {
      step: index,
      outcome: how.o,
      ...(how.in ? { input: how.in } : {}),
      ...(how.c ? { confirmed: true } : {}),
      ...(ms !== undefined ? { ms } : {}),
      ...(how.p ? { presat: true } : {}),
    });
    const instr = session.steps.find((s) => s.index === index)?.instruction ?? `step ${index}`;
    narrate(`done:${index}`, how.o === 'acted' ? `✓ ${instr}` : `✓ ${instr} — nicely done.`);
  }
  clearSpotlight(true);
  inputCleanup?.();
  inputCleanup = null;
  const next = session.steps.find((s) => s.index > index)?.index ?? null;
  log.debug('agent-run: step complete', { index, next: next ?? 'done' });
  if (next === null) {
    // EC-5 — Done is CHECKED, whatever path the last step completed by: settle, then judge the
    // finish against the outcome contract. `finishing` keeps the tick and the route watcher from
    // re-entering the loop during the await.
    finishing = true;
    void finishRun();
    return;
  }
  session.step = next;
  session.awaitingNav = undefined;
  session.navTried = undefined; // a completed step spends any refused-navigation memory
  persist();
  void showAndAct();
}

/** The Done check (EC-5, execution-contracts.md §4): completion is qualified, never blocked. A run
 *  with no contract — or a contract with nothing checkable — ends exactly as before, stamping
 *  nothing. A miss stamps `verified: false`, audits WHICH half missed, and narrates the honest
 *  qualifier; the run still ends `completed` — the steps did complete. */
async function finishRun(): Promise<void> {
  if (!session) return;
  const outcome = session.contract?.outcome;
  if (!outcome) {
    end('completed');
    return;
  }
  await awaitSettle();
  if (!session) return;
  const body = document.body as HTMLElement | null;
  const check = outcomeSatisfied(outcome, {
    path: normalizePath(location.pathname),
    screen: readLiveScreen(),
    bodyText: body?.innerText ?? body?.textContent ?? '',
  });
  if (!check.checked) {
    end('completed');
    return;
  }
  if (!check.ok) {
    emitRun('failure', { step: session.step, kind: 'outcome-miss', reason: outcomeMissReason(check) });
  }
  end('completed', { verified: check.ok });
}

/** Founder-readable component verdicts for the outcome-miss audit — derived booleans, never page
 *  content ("finish check: route ok · phrases miss"). */
function outcomeMissReason(c: OutcomeCheck): string {
  const part = (v: boolean | null, name: string): string | null =>
    v === null ? null : `${name} ${v ? 'ok' : 'miss'}`;
  const parts = [part(c.route, 'route'), part(c.screen, 'screen'), part(c.markers, 'phrases')]
    .filter((p): p is string => p !== null)
    .join(' · ');
  return `finish check: ${parts}`;
}

function handBack(step: RunStep | null, why: string, reason: 'disabled' | 'failed' = 'failed'): void {
  waiting = 'handback';
  handbackKind = reason;
  if (step) narrate(`hb:${step.index}`, `${why} I’ve highlighted it — take this one, I’ll pick up right after.`);
  const kind = step ? stepKindOf(step.verb) : 'action';
  if (kind === 'input' && currentEl) {
    inputCleanup?.();
    inputCleanup = watchInputState(currentEl, () => {
      if (waiting === 'handback' && currentEl && inputDone(currentEl)) {
        setStatus('Looks good — hit Continue.', { cont: 'Continue' });
      }
    });
    waiting = 'input';
    setStatus(`${why} Type it in the highlighted field yourself, then hit Continue.`, { cont: 'Continue' });
    return;
  }
  setStatus(`${why} Do this one yourself — I'll pick it back up.`, { cont: null });
}

async function showAndAct(): Promise<void> {
  if (!session || !rootRef || acting || finishing) return;
  if (
    waiting === 'confirm' ||
    waiting === 'input' ||
    waiting === 'chat-input' ||
    waiting === 'handback' ||
    waiting === 'stalled'
  )
    return;
  acting = true;
  try {
    const step = curStep();
    if (!step) return end('completed'); // pointer past the plan (defensive)
    renderStepHead(step);
    const path = normalizePath(location.pathname);

    // EC-3/EC-4 pre-flight — ONCE, before the first act. The verdict never blocks anything the
    // existing navigation rules wouldn't (wrong-route falls through to the same try-once /
    // polite-wait below — the compile-time cold-start verdict and `canDirectNavigate` are the same
    // rule on the same route); what it adds is the AUDIT, and the knowing caution when the URL is
    // right but the screen doesn't look like the recording's start.
    if (session.done.length === 0 && !session.entryChecked && session.contract) {
      session.entryChecked = true;
      persist();
      const verdict = entryVerdict(session.contract.entry, { path, screen: readLiveScreen() });
      if (verdict !== 'ok') {
        emitRun('failure', { step: step.index, kind: 'entry-miss' });
        if (verdict === 'screen-mismatch') {
          narrate(
            'entry',
            `This page doesn’t look quite like the screen the recording started on — I’ll go carefully.`,
          );
        }
      }
    }

    // Wrong route: navigate there if the destination is a screen — TRIED ONCE (outcome checks,
    // part 1); otherwise hand off politely. No awaiting-nav bookkeeping — the pointer is already
    // on this step, so landing there only re-aims (via resume or the route watcher).
    if (step.route && matchStrength(step.route, path) === 0) {
      clearSpotlight(true);
      attemptNavigate(step, step.route);
      return;
    }
    // We ARE on this step's route — any earlier refused-navigation memory is spent (arriving is
    // what clears it, and only arriving).
    if (session.navTried) {
      session.navTried = undefined;
      persist();
    }

    await performStep(step, { confirmed: false });
  } finally {
    acting = false;
  }
}

// ── Outcome checks (part 1, 2026-08-05): the app's answer to an act outranks every heuristic ───

/** Trim terminal punctuation when an instruction is EMBEDDED mid-sentence in a narration —
 *  distilled instructions carry their own full stops, and “Click “Create account”.” commits…»
 *  reads like a bug. */
function instrQuote(s: string): string {
  return s.replace(/[.!?。]+$/u, '');
}

/** The visible rejection surfaces on the page right now, as comparable text. Uses the SAME
 *  detector Reason diagnoses with (`findAlertSurfaces` — standards signals + error-styled classes
 *  + red-family text), so what the diagnostic engine can see, the acting run can no longer miss. */
function alertTexts(): Set<string> {
  const set = new Set<string>();
  for (const el of findAlertSurfaces(8)) {
    const t = (el.textContent ?? '').trim().slice(0, 200);
    if (t.length >= 2) set.add(t);
  }
  return set;
}
/** A rejection that APPEARED since the snapshot — the app answering the act with a no. Pre-existing
 *  surfaces don't count (a page can live with an old warning on it); only the delta convicts. */
function newAlertAfterAct(before: Set<string>): string | null {
  for (const el of findAlertSurfaces(8)) {
    const t = (el.textContent ?? '').trim().slice(0, 200);
    if (t.length >= 2 && !before.has(t)) return t;
  }
  return null;
}

/** Part 2 — is any of the step's recorded success markers visible right now? Recall matching on
 *  the page's whole visible text: a redesigned phrase stops matching and degrades to a hand-back —
 *  annoying, never wrong. PRESENCE semantics — used only where no act moment exists to baseline
 *  against (the hand-back poll, arrival audits); acted paths use the engine's `markerVerdict`. */
function anyMarkerVisible(markers: string[]): boolean {
  const body = document.body as HTMLElement | null;
  const text = (body?.innerText ?? body?.textContent ?? '').toLowerCase();
  return markers.some((m) => text.includes(m.toLowerCase()));
}

/** The app refused the act: the step is NOT done, whatever else looks finished. Say the app's own
 *  words and hand the step back. (Mapping the message to the FIELD it blames is Reason's deferred
 *  half — v1 tells the user honestly and watches for their retry.) */
function rejectedByApp(step: RunStep, message: string): void {
  // EC-6: the app's own words at the moment it refused are the most diagnostic thing the founder
  // can read — one snippet, scrubbed and clipped server-side under the safe-stop reason's rule.
  emitRun('failure', { step: step.index, kind: 'rejected', reason: message.slice(0, 200) });
  try {
    hooksRef.onNarrate?.(`The app said: “${message}” — so that didn’t go through. Fix what it mentions, then press it again; I’m watching. (Or stop the auto run.)`);
  } catch {
    /* best-effort */
  }
  if (waiting !== 'handback') handBack(step, 'The app rejected it.', 'failed');
  else setStatus('The app rejected it — fix what it mentions, then press it again.', { cont: null });
}

/** Enter the chat-input wait: the card points at the field, the ASK goes into the thread, and the
 *  composer's next message (via `provideRunValue`) is the value. Fires a fresh ask on every entry
 *  — a repair or a post-navigation re-aim SHOULD re-ask; narration dedup does not apply here. */
function enterChatInput(step: RunStep, el: Element): void {
  waiting = 'chat-input';
  const label = step.inputSlot?.label ?? 'this field';
  chatAsk = { step: step.index, label };
  setStatus('Enter details in the chatbot below', { cont: null });
  let ask = `What should ${label} be? Reply with just the value.`;
  if (step.verb === 'select' && el instanceof HTMLSelectElement) {
    const opts = [...el.options].map((o) => (o.textContent ?? '').trim()).filter(Boolean).slice(0, 6);
    if (opts.length > 0) ask = `Which ${label}? One of: ${opts.join(' · ')}.`;
  } else if (step.verb === 'check') {
    ask = `Should “${label}” be ticked? Reply yes or no.`;
  }
  try {
    hooksRef.onNeedValue?.({ step: step.index, label, ask });
  } catch {
    /* the ask failing must never break the run */
  }
}

/** The user's chat reply, routed here by the composer while `runAwaitingValue()` is non-null. The
 *  reply IS the value (deterministic, no model call): fill → validate against the field's own
 *  state (D5) → advance, or say why in the chat and ask again. Never persisted, never logged —
 *  the audit records only the SOURCE (`in: "chat"`). */
export async function provideRunValue(raw: string): Promise<void> {
  if (!session || waiting !== 'chat-input') return;
  const step = curStep();
  if (!step) return;
  const value = raw.trim().slice(0, 200);
  if (!value) return;
  if (!currentEl || !currentEl.isConnected) {
    waiting = null;
    chatAsk = null;
    void showAndAct(); // the world moved — re-aim, which re-asks against the fresh element
    return;
  }
  const el = currentEl;
  waiting = null;
  chatAsk = null;
  // Under the acting guard for its WHOLE span — the tick's idle rescue must not re-enter this
  // step while the fill settles (the live-found race that re-asked and wedged the run).
  await withActing(async () => {
    setStatus(`Filling in ${step.inputSlot?.label ?? 'the field'}…`, { cont: null });
    let dispatched: boolean;
    if (step.verb === 'fill') dispatched = actFill(el, value);
    else if (step.verb === 'select') dispatched = actSelect(el, value);
    else dispatched = actCheck(el, /^(y|yes|true|1|on|tick|check|checked)$/i.test(value));
    await awaitSettle(200, 1000);
    if (!session || session.step !== step.index) return;
    const st = readElementState(el);
    if (dispatched && (stateDone(st) || (st.checked === undefined && st.filled === undefined))) {
      completeStep(step.index, { o: 'acted', in: 'chat' });
      return;
    }
    // The app (or the option list) rejected it — conversational repair: say why, ask again.
    // Direct onNarrate, not narrate(): repair messages must repeat, and dedup would eat the second.
    const why =
      !dispatched && step.verb === 'select'
        ? 'that’s not one of the options'
        : st.filled && st.valid === false
          ? `the app flagged it — ${invalidHint(st.invalidReason)}`
          : 'it didn’t stick';
    try {
      hooksRef.onNarrate?.(`Hmm — ${why}. Let’s try another value.`);
    } catch {
      /* best-effort */
    }
    enterChatInput(step, el);
  });
}

/** Direct navigation, TRIED ONCE: landing anywhere else is the app refusing the destination (a
 *  login wall, a permission gate), and retrying is how good intentions become a redirect loop —
 *  found live: a signed-out user's run ping-ponged /login ↔ /dashboard. After one refusal the run
 *  says so and WAITS; the route watcher re-aims the moment the user gets there themselves, which
 *  also covers "sign in first" with no workflow-chaining at all. */
function attemptNavigate(step: RunStep, target: string, expectNav?: boolean): void {
  if (!session) return;
  if (!canDirectNavigate(target)) {
    waiting = 'handback';
    handbackKind = 'failed';
    setStatus(`This step happens on ${displayRoute(target)} — head there and I'll pick it up.`, { cont: null });
    return;
  }
  if (session.navTried && routePattern(session.navTried.target) === routePattern(target)) {
    waiting = 'handback';
    handbackKind = 'failed';
    narrate(
      `navblock:${step.index}`,
      `The app won’t take me to ${displayRoute(target)} from here — you may need to sign in first. Head there when you can; I’ll pick it up the moment you arrive.`,
    );
    setStatus(`Waiting for you on ${displayRoute(target)}…`, { cont: null });
    return;
  }
  session.navTried = { target, at: Date.now() };
  if (expectNav) session.awaitingNav = { fromStep: step.index, postRoute: target, at: Date.now() };
  setStatus('Heading to the right page…', { cont: null });
  persist(); // synchronously — a hard navigation unloads us
  actNavigate(target);
}

async function performStep(step: RunStep, opts: { confirmed: boolean }): Promise<void> {
  if (!session || !rootRef) return;
  markStepStart(step.index);

  // NAVIGATE steps target a route, not an element — same try-once rule as any other navigation.
  if (step.verb === 'navigate') {
    const dest = step.postRoute ?? step.route;
    if (matchStrength(dest, normalizePath(location.pathname)) > 0) {
      completeStep(step.index); // already there
      auditArrivalMarkers(step.index);
      return;
    }
    attemptNavigate(step, dest, true);
    return;
  }

  setStatus('Finding it on your page…', { cont: null });
  const el = await resolveStepWithRetries(asSenseStep(step), () => session !== null && session.step === step.index);
  if (!session || session.step !== step.index) return;
  if (!el) {
    // SAFE-STOP: on the right page but the element won't resolve — say so, never guess forward.
    // The Continue button doubles as Retry here (onContinue handles the stalled state).
    emitRun('failure', { step: step.index, kind: 'stall' });
    waiting = 'stalled';
    clearSpotlight(true);
    narrate(
      `stall:${step.index}`,
      `I can’t find “${instrQuote(step.instruction)}” on your page — it may have moved, or may not be available to your account. You can retry, or stop the auto run.`,
    );
    setStatus(
      "I can't find this step on your page — it may have moved or may not be available to your account.",
      { cont: 'Retry', stall: true },
    );
    return;
  }
  currentEl = el;
  spotlight(rootRef, el, { sticky: true });

  // EC-8 — the resolved element must still SAY what the recording said. A stale selector aiming at
  // the wrong control is invisible to resolution (the first locator that resolves wins); the
  // recorded label is the cross-check. Contradiction hands back, never acts — an act is
  // irreversible, a hand-back is annoying but never wrong. The audit kind tells us within weeks
  // if this over-fires (the recorded label rides as the detail — founder-derived, safe).
  const expectedLabel = step.expect?.label;
  if (expectedLabel && !labelMatches(expectedLabel, readElementState(el).name ?? (el.textContent ?? '').slice(0, 120))) {
    emitRun('failure', { step: step.index, kind: 'label-mismatch', reason: expectedLabel });
    handBack(step, `What I found doesn’t say what the recording said it would.`);
    return;
  }

  // Destructive steps confirm BEFORE acting — always, in v1 (§A2.7).
  if (step.destructive && !opts.confirmed) {
    waiting = 'confirm';
    narrate(`confirm:${step.index}`, `“${instrQuote(step.instruction)}” commits something — hit Confirm and I’ll press it.`);
    setStatus('This one commits something. Confirm and I’ll press it.', { cont: 'Confirm — go ahead' });
    return;
  }

  const kind = stepKindOf(step.verb);
  if (kind === 'input') {
    // USER-ONLY steps (file pickers): compiled as yours instead of disqualifying the workflow.
    // Checked FIRST — never chat-asked, never filled, whatever values arrived with the consent.
    if (step.userOnly) {
      waiting = 'input';
      inputCleanup?.();
      inputCleanup = watchInputState(el, () => {
        if (waiting === 'input' && currentEl && inputDone(currentEl)) {
          setStatus('Looks good — hit Continue.', { cont: 'Continue' });
        }
      });
      narrate(
        `input:${step.index}`,
        `Your turn — ${step.inputSlot?.label ?? 'this one'} needs you (I can’t open file pickers). Do it in the highlighted spot, then hit Continue.`,
      );
      setStatus(`${step.inputSlot?.label ?? 'This one'} is yours — do it, then hit Continue.`, { cont: 'Continue' });
      return;
    }
    const supplied = values.get(step.index);
    // A missing NON-sensitive value is asked for IN THE CHAT (slice 6): the agent asks, the user's
    // next message is the value, and the agent types it into the form itself — validated below in
    // `provideRunValue` exactly as a prefill is. Point-and-type remains for embeds with no chat
    // wiring, for the user cancelling the ask, and — always, hard rule — for sensitive fields.
    if (!step.inputSlot?.sensitive && supplied === undefined && hooksRef.onNeedValue) {
      enterChatInput(step, el);
      return;
    }
    // Sensitive fields are ALWAYS point-and-type — a supplied value is deliberately ignored
    // (the hard rule lives here, in the tool, not in a prompt).
    if (step.inputSlot?.sensitive || supplied === undefined) {
      waiting = 'input';
      inputCleanup?.();
      inputCleanup = watchInputState(el, () => {
        if (waiting === 'input' && currentEl && inputDone(currentEl)) {
          setStatus('Looks good — hit Continue.', { cont: 'Continue' });
        }
      });
      narrate(
        `input:${step.index}`,
        step.inputSlot?.sensitive
          ? `Your turn — ${step.inputSlot.label} is sensitive, so it goes straight into the app’s own field (it never touches me). Type it, then hit Continue.`
          : `Your turn — type ${step.inputSlot?.label ?? 'this field'} into the highlighted field, then hit Continue.`,
      );
      setStatus(
        step.inputSlot?.sensitive
          ? 'Enter details in the highlighted field and click Continue'
          : `Fill in ${step.inputSlot?.label ?? 'this field'}, then hit Continue.`,
        { cont: 'Continue' },
      );
      return;
    }
    // A known value: act, then judge the result exactly like a user's typing would be judged.
    setStatus(`Filling in ${step.inputSlot?.label ?? 'the field'}…`, { cont: null });
    const fillBase = markerBaseline([...(step.expect?.appeared ?? []), ...(step.expect?.disappeared ?? [])]);
    if (step.verb === 'fill') actFill(el, supplied);
    else if (step.verb === 'select') actSelect(el, supplied);
    else actCheck(el, /^(1|true|yes|on|checked)$/i.test(supplied));
    await awaitSettle(200, 1000);
    if (!session || session.step !== step.index) return;
    const st = readElementState(el);
    const unreadable = st.checked === undefined && st.filled === undefined;
    if (stateDone(st) || unreadable) {
      // EC-7 per-path rule: a READABLE control's state beats markers (stronger evidence for
      // inputs). An UNREADABLE custom control used to pass unconditionally — when it carries
      // markers, they are now the only evidence there is, so they must be newly satisfied.
      if (unreadable && step.expect?.appeared?.length) {
        const mv = markerVerdict(step.expect.appeared, fillBase);
        if (mv === 'unsatisfied') {
          emitRun('failure', { step: step.index, kind: 'marker-miss' });
          handBack(step, `I typed it, but I can’t see the app registering it.`);
          return;
        }
        completeStep(step.index, {
          o: 'acted',
          in: 'prefill',
          ...(opts.confirmed ? { c: true } : {}),
          ...(mv === 'presence' ? { p: true } : {}),
        });
        return;
      }
      completeStep(step.index, { o: 'acted', in: 'prefill', ...(opts.confirmed ? { c: true } : {}) });
      return;
    }
    emitRun('failure', { step: step.index, kind: 'handback' });
    handBack(
      step,
      st.filled && st.valid === false
        ? `The app didn't accept that — ${invalidHint(st.invalidReason)}.`
        : "My typing didn't stick here.",
    );
    return;
  }

  // ACTION step: a click, verified. A disabled target is a fact worth stopping on, not pressing —
  // and the moment it ENABLES, the tick presses it (the Confirm already given still covers it).
  if (readElementState(el).disabled) {
    emitRun('failure', { step: step.index, kind: 'handback' });
    handBack(step, 'This control is disabled right now — an earlier field may be unfinished.', 'disabled');
    return;
  }
  setStatus('Pressing it…', { cont: null });
  const alertsBefore = alertTexts(); // the app's answer to this press outranks every heuristic
  // EC-7 — the marker baseline, taken at the same moment as the alert baseline and for the same
  // reason: only what CHANGED after the act carries signal.
  const markersBefore = markerBaseline([...(step.expect?.appeared ?? []), ...(step.expect?.disappeared ?? [])]);
  if (step.postRoute) {
    // Persist the expectation BEFORE acting — the navigation this press causes unloads us.
    session.awaitingNav = { fromStep: step.index, postRoute: step.postRoute, at: Date.now() };
    persist();
    actClick(el);
    setStatus('Waiting for the page…', { cont: null });
    // A rejection can arrive INSTEAD of the navigation — check once the page settles, so the user
    // isn't left staring at a silent 10s timeout when the app has already said no.
    await awaitSettle();
    if (!session || session.step !== step.index || !session.awaitingNav) return; // navigated / moved on
    const rejection = newAlertAfterAct(alertsBefore);
    if (rejection) {
      session.awaitingNav = undefined;
      persist();
      rejectedByApp(step, rejection);
    }
    return; // otherwise the route watcher / resume handshake / timeout still own the outcome
  }
  actClick(el);
  await awaitSettle();
  if (!session || session.step !== step.index) return;
  const rejection = newAlertAfterAct(alertsBefore);
  if (rejection) {
    rejectedByApp(step, rejection);
    return; // a fresh rejection surface beats ANY completion evidence, last step included
  }
  const evidence = actionCompletionEvidence({
    steps: session.steps.map(asSenseStep),
    stepIndex: step.index,
    currentEl,
    path: normalizePath(location.pathname),
  });
  // Part 2 + EC-7: a step that KNOWS what its success looks like must actually see it — and
  // "see" now means NEWLY (against the pre-act baseline), with the disappeared half checked too.
  // All-pre-satisfied markers carry no signal and fall back to presence, stamped `presat` so the
  // phrase quality stays measurable (the page can't distinguish; failing the step would be worse).
  const mv = markerVerdict(step.expect?.appeared, markersBefore);
  const gone = disappearedSatisfied(step.expect?.disappeared, markersBefore);
  if (evidence && mv !== 'unsatisfied' && gone) {
    // The second, delayed rejection sample (EC-6/§5.5) — on the agent's own acts only, always
    // before completeStep, never after: a completed step is never reconsidered.
    await new Promise((r) => setTimeout(r, REJECTION_RECHECK_MS));
    if (!session || session.step !== step.index) return;
    const late = newAlertAfterAct(alertsBefore);
    if (late) {
      rejectedByApp(step, late);
      return;
    }
    completeStep(step.index, {
      o: 'acted',
      ...(opts.confirmed ? { c: true } : {}),
      ...(mv === 'presence' ? { p: true } : {}),
    });
    return;
  }
  // EC-6: the two honest reasons this press failed are different fragility signals — evidence
  // without the recorded phrases (newly appeared, or still-visible ones that should have gone)
  // is a marker miss; no reaction at all is a plain hand-back.
  emitRun('failure', { step: step.index, kind: evidence ? 'marker-miss' : 'handback' });
  handBack(
    step,
    evidence
      ? "I pressed it, but I can't see the usual confirmation the recording showed."
      : "I pressed it, but the page didn't seem to react.",
  );
}

function end(outcome: 'completed' | 'aborted', opts: { silent?: boolean; verified?: boolean } = {}): void {
  if (!session) return;
  // The terminal audit event goes out BEFORE teardown (it needs the runId and the step), and an
  // exit from a stalled state records as a SAFE-STOP — the honest outcome, not a mere abort.
  const stalledExit = outcome === 'aborted' && waiting === 'stalled';
  const stalledStep = stalledExit ? curStep() : null;
  emitRun(stalledExit ? 'safe_stop' : outcome, {
    step: session.step,
    ...(outcome === 'completed' && typeof opts.verified === 'boolean' ? { verified: opts.verified } : {}),
    ...(stalledStep ? { reason: `could not resolve step ${stalledStep.index} (“${stalledStep.instruction.slice(0, 80)}”)` } : {}),
  });
  // EC-5 — an unverified finish is narrated as a qualifier, never an alarm: the user did nothing
  // wrong and every step ran (the exact copy is founder-approved — execution-contracts.md §5.1).
  if (outcome === 'completed') {
    narrate(
      'end',
      opts.verified === false
        ? `Done — every step went through, though the finish didn’t look quite the way the recording did. Worth a glance.`
        : `Done — “${session.title}” is complete. ✅`,
    );
  } else if (!opts.silent) narrate('end', 'Stopped — nothing else will happen.');
  detachObservers();
  inputCleanup?.();
  inputCleanup = null;
  clearSpotlight(true);
  clearSession(RUN_SESSION);
  const title = session.title;
  const done = session.done.length;
  const total = session.steps.length;
  session = null;
  currentEl = null;
  waiting = null;
  chatAsk = null;
  handbackKind = null;
  values = new Map();
  narrated = new Set();
  stepStartedAt.clear(); // a later run must never inherit an earlier run's timers
  finishing = false;
  cardState = null;
  notifyState(); // the panel's strip clears with the run
  log.debug('agent-run: ended', { outcome, done, total });
  if (opts.silent) {
    removeCard();
    return;
  }
  if (outcome === 'completed' && card) {
    card.chip.textContent = '✓';
    card.instr.textContent = `Done — “${title}” is complete.`;
    setStatus('', { cont: null });
    card.stop.style.display = 'none';
    window.setTimeout(removeCard, 6000);
  } else {
    removeCard();
    if (outcome === 'aborted') hooksRef.onExit?.();
  }
}

// ── Start / resume / the debug trigger ─────────────────────────────────────────────────────────

async function fetchPlan(
  cfg: RunCfg,
  workflowKey: string,
): Promise<{ title: string; planHash: string; steps: RunStep[]; contract?: RunContract } | null> {
  try {
    const res = await fetch(
      `${cfg.apiBase}/v1/copilot/execution-plan?workflow=${encodeURIComponent(workflowKey)}`,
      { headers: { 'X-FlowBuddy-Key': cfg.key } },
    );
    if (!res.ok) return null;
    const d = (await res.json()) as { title?: string; planHash?: string; steps?: RunStep[]; contract?: unknown };
    if (!Array.isArray(d.steps) || d.steps.length === 0 || d.steps.length > MAX_PLAN_STEPS) return null;
    if (typeof d.planHash !== 'string') return null;
    const contract = parseContract(d.contract);
    return {
      title: typeof d.title === 'string' ? d.title : 'Workflow',
      planHash: d.planHash,
      steps: d.steps,
      ...(contract ? { contract } : {}),
    };
  } catch {
    return null;
  }
}

function startAgentRun(
  root: ShadowRoot,
  cfg: RunCfg,
  hooks: RunHooks,
  plan: { title: string; planHash: string; steps: RunStep[]; contract?: RunContract },
  workflowKey: string,
  suppliedValues?: Record<number, string>,
  runId?: string,
): void {
  if (session) end('aborted', { silent: true }); // one run at a time
  rootRef = root;
  cfgRef = cfg;
  hooksRef = hooks;
  narrated = new Set();
  finishing = false;
  values = new Map(Object.entries(suppliedValues ?? {}).map(([k, v]) => [Number(k), String(v)]));
  session = {
    workflowKey,
    title: plan.title,
    planHash: plan.planHash,
    ...(runId ? { runId } : {}),
    steps: plan.steps,
    step: plan.steps[0]?.index ?? 1,
    done: [],
    ...(plan.contract ? { contract: plan.contract } : {}),
  };
  persist();
  narrate('start', `Running “${plan.title}” — ${plan.steps.length} steps. I’ll do the clicks; you watch, and anything that needs you lands back with you.`);
  attachObservers();
  void showAndAct();
  log.debug('agent-run: started', { workflowKey, steps: plan.steps.length, consented: Boolean(runId) });
}

/**
 * Slice 4 — start a CONSENTED run from a chat offer (agent.md §A2.3). The click that called this
 * IS the consent: `start` re-verifies everything live server-side and writes the audit row; the
 * plan is then fetched and pinned against the hash the user consented to. Any mismatch returns an
 * honest word instead of a run.
 */
export async function startConsentedRun(
  root: ShadowRoot,
  cfg: RunCfg,
  hooks: RunHooks,
  offer: { key: string; title: string; planHash: string; prefills: Record<string, string> },
  queryId: string | undefined,
): Promise<'started' | 'changed' | 'unavailable'> {
  let runId: string | undefined;
  try {
    const res = await fetch(`${cfg.apiBase}/v1/copilot/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-FlowBuddy-Key': cfg.key },
      body: JSON.stringify({ event: 'start', workflow: offer.key, planHash: offer.planHash, ...(queryId ? { queryId } : {}) }),
    });
    if (res.status === 409) return 'changed';
    if (!res.ok) return 'unavailable';
    runId = ((await res.json()) as { runId?: string }).runId;
  } catch {
    return 'unavailable';
  }
  const plan = await fetchPlan(cfg, offer.key);
  if (!plan || plan.planHash !== offer.planHash) return 'changed';
  const prefills: Record<number, string> = {};
  for (const [k, v] of Object.entries(offer.prefills)) {
    const idx = Number(k);
    if (Number.isInteger(idx) && typeof v === 'string') prefills[idx] = v;
  }
  startAgentRun(root, cfg, hooks, plan, offer.key, prefills, runId);
  return 'started';
}

/** Boot-time resume (before the walkthrough's — one overlay at a time). The plan is re-fetched and
 *  the run continues ONLY if it is still served AND the hash matches the pinned one; anything else
 *  ends quietly. Dev values do not survive a navigation, so remaining inputs go point-and-type. */
export async function resumeAgentRun(root: ShadowRoot, cfg: RunCfg, hooks: RunHooks = {}): Promise<boolean> {
  const stored = readSession(RUN_SESSION, cfg.key);
  if (!stored) return false;
  const fresh = await fetchPlan(cfg, stored.data.workflowKey);
  if (!fresh || fresh.planHash !== stored.data.planHash) {
    clearSession(RUN_SESSION);
    log.debug('agent-run: not resumable (revoked or plan changed) — ended quietly');
    return false;
  }
  rootRef = root;
  cfgRef = cfg;
  hooksRef = hooks;
  session = stored.data;
  const path = normalizePath(location.pathname);

  // A pending navigation resolving on THIS page load completes its step (same as the walkthrough).
  const nav = session.awaitingNav;
  session.awaitingNav = undefined;
  persist();
  attachObservers();
  await awaitSettle();
  if (!session) return true;
  if (nav?.postRoute && matchStrength(nav.postRoute, path) > 0) {
    completeStep(nav.fromStep);
    auditArrivalMarkers(nav.fromStep);
    return true;
  }
  void showAndAct();
  log.debug('agent-run: resumed', { step: session.step });
  return true;
}

/** Debug builds only — the slice-3 entry point. From the embedding page's console:
 *    FlowBuddyRun('sourceId:segmentIndex')                      // point-and-type for every input
 *    FlowBuddyRun('sourceId:segmentIndex', { 2: 'Acme' })       // dev value for step 2 (exercises fill)
 *  Serving is still gated server-side on the founder's acting flag; this only asks. */
export function registerAgentRunDevTrigger(root: ShadowRoot, cfg: RunCfg & { debug: boolean }, hooks: RunHooks = {}): void {
  if (!cfg.debug) return;
  (window as unknown as { FlowBuddyRun?: unknown }).FlowBuddyRun = async (
    workflowKey: string,
    suppliedValues?: Record<number, string>,
  ): Promise<string> => {
    const plan = await fetchPlan(cfg, String(workflowKey ?? ''));
    if (!plan) return 'not available — is acting enabled for this workflow in Studio?';
    startAgentRun(root, cfg, hooks, plan, String(workflowKey), suppliedValues);
    return `running “${plan.title}” (${plan.steps.length} steps)`;
  };
  log.debug('agent-run: dev trigger registered — FlowBuddyRun("sourceId:segmentIndex", {stepIndex: "value"}?)');
}
