import { createHash } from 'node:crypto';
import type { CapturedEvent, Locator } from '@flowbuddy/shared';
import { eventLocators } from '@flowbuddy/shared/event-locators';
import { routePattern } from '@flowbuddy/shared/route-pattern';
import type { ScreenFingerprint } from '@flowbuddy/shared/screen-fingerprint';
import { distinctActableControls } from './event-granularity';
import { redactText } from './redact';
import { buildScreens } from './screen-runs';
import type { StepEvidence } from './step-evidence';

/**
 * P4-M1 — the EXECUTION PLAN compiler: turn one approved workflow's distilled steps + its
 * recording's captured events into the replay-ready artifact the acting agent runs, plus the
 * ELIGIBILITY verdict that decides whether the founder may enable acting at all
 * (docs/build/agent.md §A2.2, §A2.9).
 *
 * PURE by design — items and events in, plan and verdict out, no I/O. That is what makes it the
 * first acting code with tests, and what lets the Studio enable action and the worker's reprocess
 * hook share one implementation without this package growing a DB dependency.
 *
 * Two properties are load-bearing:
 *
 *  - **Eligibility is decided HERE, at enable/compile time — never discovered mid-run.** Anything
 *    the executor cannot drive (framed targets, file pickers, foreign-origin hops, steps with no
 *    recoverable anchor) must block the flag while the founder is looking at it, because the
 *    alternative is a safe-stop in front of their customer.
 *  - **The hash pins consent.** `planHash` is content-derived (key-sorted, whitespace-independent),
 *    so "the run executes the exact plan version the user consented to" is checkable equality, not
 *    a timestamp comparison.
 *
 * Tuning constants:
 *   MAX_LOCATORS_PER_STEP = 6 — same cap and same reason as the sense plan: plenty for a resolve
 *     walk, keeps the persisted plan small (`eventLocators` owns the recovery rule itself).
 *   DESTRUCTIVE_LABEL_RE — deliberately over-inclusive. A destructive step costs the end-user ONE
 *     extra confirmation click (§A2.7); a missed one commits something in their live account with
 *     no pause. When in doubt, flag — and submit-type controls are always flagged.
 *   LABEL_MAX = 80 / INSTRUCTION_MAX = 200 / ROUTE_MAX = 512 — wire hygiene, matching the caps the
 *     sense plan already ships under.
 */

const MAX_LOCATORS_PER_STEP = 6;
const DESTRUCTIVE_LABEL_RE =
  /\b(delete|remove|destroy|erase|archive|deactivate|disable|revoke|cancel|unsubscribe|pay|purchase|buy|charge|checkout|transfer|submit|confirm)\b/i;
const LABEL_MAX = 80;
const INSTRUCTION_MAX = 200;
const ROUTE_MAX = 512;

/** What the executor may do at one step. Coarse on purpose — see agent.md §A2.1. */
export type ExecutionVerb = 'click' | 'fill' | 'select' | 'check' | 'navigate';

export interface ExecutionInputSlot {
  /** Founder-page chrome ("Project name"), scrubbed — this text reaches end-users in prompts. */
  label: string;
  /**
   * D3 hard rule (agent.md §A2.4): password / `autocomplete="cc-*"` / founder-marked redacted.
   * A sensitive slot is ALWAYS point-and-type — the value must never ride the chat or the wire.
   */
  sensitive: boolean;
}

export interface ExecutionStep {
  /** 1-based, matching the step numbers answers and walkthroughs cite. */
  index: number;
  verb: ExecutionVerb;
  instruction: string;
  /** The captured path this step happens on (raw; consumers compare as PATTERNS). */
  route: string;
  /** Ranked best-first; empty only on `navigate` steps, which target a route, not an element. */
  locators: Locator[];
  /** Where the step lands when it navigates — emitted only when the PATTERN changes. */
  postRoute?: string;
  /** Present on fill/select/check: what the run must obtain from the user. */
  inputSlot?: ExecutionInputSlot;
  /** Pause for a typed confirmation before acting (§A2.7). */
  destructive?: boolean;
  /** A step only a HUMAN can perform in a page-script world (today: choosing a file — browsers
   *  open pickers on trusted gestures only). Compiled as the user's own step instead of
   *  disqualifying the workflow (2026-08-07): the run pauses, the user does it, Continue verifies
   *  the resulting state. Never chat-asked, never acted by the agent. */
  userOnly?: boolean;
  /** P3-M2 capture tranche — a check step's RECORDED end state (recorder ≥0.9.0). CONTEXT, never
   *  a value to replay: the values rule stands (every value comes from the user — the run still
   *  asks), this exists so surfaces can say which way the recording went. Absent = unknown. */
  desired?: boolean;
  /** The step's recorded moment, distilled (execution-contracts.md EC-7/EC-8): `appeared` — short
   *  phrases NEWLY on the founder's screen when this step succeeded (a success toast, the next
   *  screen's heading); `disappeared` — phrases gone after it (the closed dialog); `label` — the
   *  acted element's recorded label, the resolved-element cross-check; `landedTitle` — the landing
   *  page's title on navigating steps, an audit corroborator. Sourced from the KB's stored step
   *  evidence (build-time extraction) — or, for rows processed before the evidence layer, from the
   *  legacy enable-time diff of the last + destructive steps. Matched at run time by recall
   *  (contains), never equality. PRESENCE tightens verification (fail-closed); absence changes
   *  nothing — a step without expectations verifies exactly as before. */
  expect?: { appeared?: string[]; disappeared?: string[]; label?: string; landedTitle?: string };
}

/**
 * The workflow-level halves of the contract (execution-contracts.md §3): where a run may START and
 * what DONE looks like — derived from the same events the steps compiled from, checked by the run
 * at pre-flight and at completion. Signals here narrate and audit; they never block (EC-4, EC-5).
 */
export interface PlanContract {
  v: 1;
  entry: {
    /** Step 1's recorded route (raw; consumers compare as PATTERNS). '' when unknown. */
    route: string;
    /** What the starting screen looked like — when the recording made it identifiable. */
    screen?: ScreenFingerprint;
    /** 'anywhere' = the entry route is pattern-safe to navigate to cold (the §A2.5 rule, decided
     *  at compile time); 'on-screen' = the workflow presupposes being somewhere (a record route,
     *  or an unknown entry) — the run waits for the user instead of attempting navigation. */
    start: 'anywhere' | 'on-screen';
  };
  outcome: {
    /** Where the workflow ends: the last step's landing route, or its own route when it stays. */
    route?: string;
    /** The final screen's fingerprint — omitted when the last step navigates away, because the
     *  landing screen has no recorded events to fingerprint. */
    screen?: ScreenFingerprint;
    /** The last step's appeared markers, duplicated here ON PURPOSE: the Done check runs whatever
     *  path the last step completed by, so it must not depend on that step's own verification
     *  having consulted them. */
    appeared?: string[];
  };
}

export interface EligibilityIssue {
  /** 1-based step the issue anchors to; absent for workflow-level issues. */
  step?: number;
  code:
    | 'no-steps'
    | 'unanchored'
    | 'unsupported-action'
    | 'framed-target'
    | 'no-locator'
    | 'nav-into-record'
    | 'foreign-origin'
    | 'multi-action-step';
  /** Founder-facing, plain words — rendered verbatim in Studio when enabling is refused. */
  message: string;
}

export interface CompiledExecutionPlan {
  steps: ExecutionStep[];
  /** The entry/outcome halves — null only when the plan is ineligible (nothing will ever run it). */
  contract: PlanContract | null;
  /** Content hash over steps + contract (key-sorted) — the consent pin (§A2.2). */
  hash: string;
  eligible: boolean;
  issues: EligibilityIssue[];
}

/** The step fields the compiler needs out of `KnowledgeItem.data` (the distilled step shape). */
export interface ExecutionStepSource {
  instruction?: string;
  route?: string;
  keyEventId?: string;
  screenshotFile?: string | null;
  /** The stored evidence layer (step-evidence.ts), present on rows processed since it exists. */
  evidence?: StepEvidence;
  /** The validated events the step was built from (distill.ts) — lets the granularity backstop
   *  below verify one-step-one-control. Absent on pre-invariant rows: nothing to check. */
  sourceEventIds?: string[];
}

/** Deterministic JSON: keys sorted at every depth, so the hash ignores construction order. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const INPUT_TAGS = new Set(['input', 'textarea', 'select']);

function urlOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function slotFor(ev: CapturedEvent): ExecutionInputSlot {
  const attrs = ev.target?.attributes ?? {};
  const raw = ev.target?.accessibleName || attrs['placeholder'] || attrs['name'] || '';
  const label = redactText(raw).slice(0, LABEL_MAX) || 'this field';
  const sensitive =
    (attrs['type'] ?? '').toLowerCase() === 'password' ||
    (attrs['autocomplete'] ?? '').toLowerCase().startsWith('cc-') ||
    'data-flowbuddy-redact' in attrs;
  return { label, sensitive };
}

function isDestructive(ev: CapturedEvent): boolean {
  if (ev.type === 'submit') return true;
  const attrs = ev.target?.attributes ?? {};
  if ((attrs['type'] ?? '').toLowerCase() === 'submit') return true;
  const label = ev.target?.accessibleName || ev.target?.text || '';
  return DESTRUCTIVE_LABEL_RE.test(label);
}

/** A step's `expect` from its stored evidence — only the fields the evidence actually carries. */
function expectFrom(evidence: StepEvidence | undefined): ExecutionStep['expect'] {
  if (!evidence) return undefined;
  const expect = {
    ...(evidence.appeared?.length ? { appeared: evidence.appeared } : {}),
    ...(evidence.disappeared?.length ? { disappeared: evidence.disappeared } : {}),
    ...(evidence.label ? { label: evidence.label } : {}),
    ...(evidence.landedTitle ? { landedTitle: evidence.landedTitle } : {}),
  };
  return Object.keys(expect).length > 0 ? expect : undefined;
}

/**
 * Compile one workflow. Steps arrive in workflow order (`orderIndex`); events are the recording's
 * full manifest event list. Recovery mirrors the sense plan: `keyEventId` first, screenshot-file
 * match for pre-2026-07-08 rows — but where the sense plan degrades an unrecovered step to
 * `locators: []` (the probe just can't anchor there), the EXECUTOR cannot act on what it cannot
 * anchor, so here the same condition is an eligibility failure.
 */
export function compileExecutionPlan(input: {
  steps: ExecutionStepSource[];
  events: CapturedEvent[];
}): CompiledExecutionPlan {
  const issues: EligibilityIssue[] = [];
  const steps: ExecutionStep[] = [];
  // Which recorded event each compiled step anchored to — the contract derivation below needs the
  // first and last steps' screens, and the loop is where recovery already happened.
  const evByIndex = new Map<number, CapturedEvent>();

  const byId = new Map<string, CapturedEvent>();
  const byShot = new Map<string, CapturedEvent>();
  for (const ev of input.events) {
    byId.set(ev.id, ev);
    if (ev.screenshot?.file) byShot.set(ev.screenshot.file, ev);
    if (ev.postAction?.screenshot?.file) byShot.set(ev.postAction.screenshot.file, ev);
  }

  // The app's own origin = the first event's. Any step that leaves it is out of bounds: the agent
  // acts on the founder's product, never across sites (OAuth popups land here too).
  const homeOrigin = urlOrigin(input.events[0]?.route?.url);

  if (input.steps.length === 0) {
    issues.push({ code: 'no-steps', message: 'This workflow has no steps to run.' });
  }

  input.steps.forEach((src, i) => {
    const index = i + 1;
    const ev =
      (src.keyEventId ? byId.get(src.keyEventId) : undefined) ??
      (src.screenshotFile ? byShot.get(src.screenshotFile) : undefined);

    if (!ev) {
      issues.push({
        step: index,
        code: 'unanchored',
        message: `Step ${index} can't be tied to a recorded action, so there is nothing safe to act on.`,
      });
      return;
    }

    // The granularity BACKSTOP (kb-step-distillation.md): a step spanning several actable controls
    // would compile to a plan that acts on one and silently drops the rest — found live as
    // "Enter your email address and password", the password never asked. The distillation split
    // pass makes this unreachable for new rows; refusing here turns any future regression loud at
    // enable time instead of silent at a user's form. Pre-invariant rows carry no sourceEventIds
    // and compile as before — a reprocess is what splits them.
    if (src.sourceEventIds && src.sourceEventIds.length > 1) {
      const controls = distinctActableControls(src.sourceEventIds.map((id) => byId.get(id)));
      if (controls > 1) {
        issues.push({
          step: index,
          code: 'multi-action-step',
          message: `Step ${index} combines ${controls} separate controls in one step — re-process this recording to split it, then enable acting.`,
        });
        return;
      }
    }

    const attrs = ev.target?.attributes ?? {};
    const tag = (ev.target?.tag ?? '').toLowerCase();
    const inputType = (attrs['type'] ?? '').toLowerCase();

    let verb: ExecutionVerb;
    if (ev.type === 'click' || ev.type === 'submit') verb = 'click';
    else if (ev.type === 'input') {
      if (inputType === 'checkbox' || inputType === 'radio') verb = 'check';
      else if (tag === 'select') verb = 'select';
      else verb = 'fill';
    } else if (ev.type === 'nav') verb = 'navigate';
    else {
      issues.push({
        step: index,
        code: 'unsupported-action',
        message: `Step ${index} is a "${ev.type}" action, which the agent can't perform yet.`,
      });
      return;
    }

    // The widget script lives in the top document; it cannot reach into frames — and cross-origin
    // frames (Stripe Elements, checkout) it must never try to (agent.md §A2.9, §6).
    if (verb !== 'navigate' && ev.target?.framePath) {
      issues.push({
        step: index,
        code: 'framed-target',
        message: `Step ${index} happens inside an embedded frame, which the agent can't reach into.`,
      });
      return;
    }

    // A file input compiles as a USER-ONLY step rather than disqualifying the workflow
    // (2026-08-07 — the hand-back machinery made this survivable): browsers open file pickers on
    // trusted gestures only, so the run pauses and the user chooses the file. A chosen file is
    // verifiable state (the input's value carries the name), so Continue still verifies.
    const userOnly = verb === 'fill' && inputType === 'file';

    for (const origin of [urlOrigin(ev.route?.url), urlOrigin(ev.postAction?.route?.url)]) {
      if (homeOrigin && origin && origin !== homeOrigin) {
        issues.push({
          step: index,
          code: 'foreign-origin',
          message: `Step ${index} leaves your product for another site — the agent only acts inside your own app.`,
        });
        return;
      }
    }

    const locators = eventLocators(ev, MAX_LOCATORS_PER_STEP);
    if (verb !== 'navigate' && locators.length === 0) {
      issues.push({
        step: index,
        code: 'no-locator',
        message: `Step ${index} has no way to find its element on the page.`,
      });
      return;
    }

    const route = (src.route ?? ev.route?.path ?? '').slice(0, ROUTE_MAX);
    // Same rule as the sense plan: `postRoute` exists to say "this step NAVIGATES", so it is
    // emitted only when the PATTERN changes — /projects/123 → /projects/456 is the same screen.
    const landed = ev.postAction?.route?.path;
    const navigates = !!landed && routePattern(landed) !== routePattern(ev.route?.path ?? '');

    if (verb === 'navigate') {
      // Navigation is an allowed action (§A2.5) — but only to a SCREEN, never into a record: a
      // recorded destination carrying an id is the founder's own data, and an end-user can neither
      // be sent there nor create it by URL.
      const destination = landed ?? ev.route?.path ?? '';
      if (routePattern(destination).includes(':id')) {
        issues.push({
          step: index,
          code: 'nav-into-record',
          message: `Step ${index} opens a specific record from the recording — end-users can't be sent there directly.`,
        });
        return;
      }
      evByIndex.set(index, ev);
      const navExpect = expectFrom(src.evidence);
      steps.push({
        index,
        verb,
        instruction: (src.instruction ?? '').slice(0, INSTRUCTION_MAX),
        route,
        locators: [],
        postRoute: destination,
        ...(navExpect ? { expect: navExpect } : {}),
      });
      return;
    }

    evByIndex.set(index, ev);
    const expect = expectFrom(src.evidence);
    steps.push({
      index,
      verb,
      instruction: (src.instruction ?? '').slice(0, INSTRUCTION_MAX),
      route,
      locators,
      ...(navigates ? { postRoute: landed } : {}),
      ...(verb === 'fill' || verb === 'select' || verb === 'check' ? { inputSlot: slotFor(ev) } : {}),
      ...(verb === 'check' && ev.checked !== undefined ? { desired: ev.checked } : {}),
      ...(isDestructive(ev) ? { destructive: true } : {}),
      ...(userOnly ? { userOnly: true } : {}),
      ...(expect ? { expect } : {}),
    });
  });

  // Indexes were assigned per SOURCE step so issue messages match what the founder sees on the KB
  // page; a plan only exists when every step compiled, so a gap cannot ship.
  const eligible = issues.length === 0;
  const contract = eligible && steps.length > 0 ? deriveContract(steps, evByIndex, input.events) : null;
  return {
    steps,
    contract,
    hash: hashPlan(steps, contract),
    eligible,
    issues,
  };
}

/** The entry/outcome halves, from the same events the steps compiled from (execution-contracts.md
 *  §3). Screens come from the ONE screen-run builder the sense plan uses, so the probe's idea of a
 *  screen and the contract's can never drift. Note for legacy rows: `outcome.appeared` copies the
 *  last step's evidence-built markers; markers attached AFTER compile (the legacy last+destructive
 *  path) deliberately do not reach it — the Done check then rests on route/screen, which is still
 *  strictly more than today's. */
function deriveContract(
  steps: ExecutionStep[],
  evByIndex: Map<number, CapturedEvent>,
  events: CapturedEvent[],
): PlanContract {
  const { screens, byEventId } = buildScreens(events);
  const fingerprintOf = (step: ExecutionStep | undefined): ScreenFingerprint | undefined => {
    const ev = step ? evByIndex.get(step.index) : undefined;
    const key = ev ? byEventId.get(ev.id) : undefined;
    return key ? screens.get(key) : undefined;
  };

  const first = steps[0]!;
  const last = steps[steps.length - 1]!;
  const entryScreen = fingerprintOf(first);
  // The §A2.5 rule, decided at compile time: navigable cold only to a pattern-safe, known route.
  const start: PlanContract['entry']['start'] =
    first.route && !routePattern(first.route).includes(':id') ? 'anywhere' : 'on-screen';

  const navigatesAway = last.verb === 'navigate' || !!last.postRoute;
  const outcomeRoute = last.postRoute ?? last.route;
  const outcomeScreen = navigatesAway ? undefined : fingerprintOf(last);

  return {
    v: 1,
    entry: {
      route: first.route,
      ...(entryScreen ? { screen: entryScreen } : {}),
      start,
    },
    outcome: {
      ...(outcomeRoute ? { route: outcomeRoute } : {}),
      ...(outcomeScreen ? { screen: outcomeScreen } : {}),
      ...(last.expect?.appeared?.length ? { appeared: last.expect.appeared } : {}),
    },
  };
}

// ── Part 2 — outcome markers, compiled from the recording's before/after snapshots ─────────────
// Tuning constants:
//   MARKER_MAX = 5            — enough to survive one redesigned phrase, small enough to stay honest
//   MARKER_MIN/MAX_CHARS      — a marker must be a PHRASE (3–60 chars): shorter is noise ("OK"),
//                               longer is a paragraph that will never recur verbatim
//   SNAPSHOT_MAX_CHARS = 2M   — a runaway snapshot is skipped, never parsed

const MARKER_MAX = 5;
const MARKER_MIN_CHARS = 3;
const MARKER_MAX_CHARS = 60;
export const SNAPSHOT_MAX_CHARS = 2_000_000;

/** Crude-but-dependency-free HTML → visible-text lines (script/style stripped, tags removed). */
function htmlToLines(html: string): string[] {
  const text = html
    .slice(0, SNAPSHOT_MAX_CHARS)
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);
}

/** Phrases visible AFTER the step that were not visible BEFORE it — the recorded shape of success.
 *  Scrubbed on the way out: these strings come from the FOUNDER's own account and ship to every
 *  embed (the screen-fingerprint rule, applied to outcomes). */
export function extractAppearedMarkers(preHtml: string, postHtml: string): string[] {
  const before = new Set(htmlToLines(preHtml));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of htmlToLines(postHtml)) {
    if (before.has(line)) continue;
    const scrubbed = redactText(line).trim();
    if (scrubbed.length < MARKER_MIN_CHARS || scrubbed.length > MARKER_MAX_CHARS) continue;
    if (!/[a-z]/i.test(scrubbed)) continue; // numbers/punctuation alone recur by accident
    if (scrubbed.includes('[redacted')) continue; // a marker built on PII is a marker built on sand
    const key = scrubbed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(scrubbed);
    if (out.length >= MARKER_MAX) break;
  }
  return out;
}

/** LEGACY fallback (rows processed before the evidence layer): which steps deserve an enable-time
 *  marker diff — the LAST step and every DESTRUCTIVE one, the "did the app accept it?" moments
 *  where every false-Done so far had lived. Rows with stored evidence never reach this: their
 *  `expect` compiles from the KB and `attachOutcomeMarkers` leaves it alone. Bounded so enable-time
 *  artifact fetches stay a handful, not two per step of a long workflow. */
export function markerStepIndexes(steps: ExecutionStep[]): number[] {
  const last = steps[steps.length - 1]?.index;
  const set = new Set<number>();
  if (last !== undefined) set.add(last);
  for (const s of steps) if (s.destructive) set.add(s.index);
  return [...set].sort((a, b) => a - b);
}

/** The before/after DOM-snapshot FILE REFS for the marker steps — the caller fetches them (the
 *  compiler stays pure and I/O-free) and hands the text to `attachOutcomeMarkers`. */
export function markerSnapshotRefs(
  steps: ExecutionStep[],
  sources: ExecutionStepSource[],
  events: CapturedEvent[],
): Array<{ index: number; pre?: string; post?: string }> {
  const byId = new Map<string, CapturedEvent>();
  const byShot = new Map<string, CapturedEvent>();
  for (const ev of events) {
    byId.set(ev.id, ev);
    if (ev.screenshot?.file) byShot.set(ev.screenshot.file, ev);
    if (ev.postAction?.screenshot?.file) byShot.set(ev.postAction.screenshot.file, ev);
  }
  return markerStepIndexes(steps).map((index) => {
    const src = sources[index - 1];
    const ev =
      (src?.keyEventId ? byId.get(src.keyEventId) : undefined) ??
      (src?.screenshotFile ? byShot.get(src.screenshotFile) : undefined);
    return { index, pre: ev?.domSnapshot?.file, post: ev?.postAction?.domSnapshot?.file };
  });
}

/** LEGACY fallback: attach enable-time markers to their steps (pure — snapshots arrive as text).
 *  A step that already carries `expect` (compiled from stored evidence) is left alone — the KB's
 *  richer extraction wins over the last+destructive diff. Steps without usable snapshots compile
 *  WITHOUT `expect` and verify exactly as before: knowledge tightens, absence never loosens.
 *  Returns the new steps array; re-hash with `hashPlan` after. */
export function attachOutcomeMarkers(
  steps: ExecutionStep[],
  snapshots: Map<number, { pre: string; post: string }>,
): ExecutionStep[] {
  return steps.map((s) => {
    if (s.expect) return s;
    const snap = snapshots.get(s.index);
    if (!snap) return s;
    const appeared = extractAppearedMarkers(snap.pre, snap.post);
    return appeared.length > 0 ? { ...s, expect: { appeared } } : s;
  });
}

/** Load the legacy marker snapshots for `markerSnapshotRefs` output — pure by dependency injection
 *  (the caller supplies the artifact reader), shared by the enable action and the worker's
 *  reprocess hook so the two can never drift. Unreadable or oversized snapshots are skipped:
 *  best-effort, enabling never gains a new way to fail. */
export async function loadMarkerSnapshots(
  refs: Array<{ index: number; pre?: string; post?: string }>,
  read: (file: string) => Promise<Buffer | null>,
): Promise<Map<number, { pre: string; post: string }>> {
  const snapshots = new Map<number, { pre: string; post: string }>();
  for (const ref of refs) {
    if (!ref.pre || !ref.post) continue;
    const [pre, post] = await Promise.all([read(ref.pre), read(ref.post)]);
    if (!pre || !post || pre.length > SNAPSHOT_MAX_CHARS || post.length > SNAPSHOT_MAX_CHARS) continue;
    snapshots.set(ref.index, { pre: pre.toString('utf8'), post: post.toString('utf8') });
  }
  return snapshots;
}

/** The consent pin over the FINAL plan — steps (markers included) plus the entry/outcome contract.
 *  One hash function, used by the compiler and by every caller that post-processes steps, so two
 *  sites can never hash differently. The contract is INSIDE the pin on purpose (EC-2): a run must
 *  execute the verification the user consented to, not just the steps. */
export function hashPlan(steps: ExecutionStep[], contract: PlanContract | null): string {
  return createHash('sha256').update(stableStringify({ contract, steps })).digest('hex');
}

/** Hash over steps alone — the pre-contract pin, kept for tests that reason about step content
 *  drift in isolation. Persisted plans pin with `hashPlan`. */
export function hashSteps(steps: ExecutionStep[]): string {
  return createHash('sha256').update(stableStringify(steps)).digest('hex');
}

/** The founder-facing summary Studio shows beside the switch ("6 steps · 2 inputs · 1 confirm-first
 *  · 1 you do yourself"). `inputs` counts only the ASKABLE slots — user-only steps are their own
 *  number, because "asked as it runs" and "yours to do" are different promises. */
export function planSummary(steps: ExecutionStep[]): {
  steps: number;
  inputs: number;
  destructive: number;
  manual: number;
} {
  return {
    steps: steps.length,
    inputs: steps.filter((s) => s.inputSlot && !s.userOnly).length,
    destructive: steps.filter((s) => s.destructive).length,
    manual: steps.filter((s) => s.userOnly).length,
  };
}
