/**
 * User onboarding — the guided walkthrough's PUSHED trigger.
 *
 * A walkthrough is normally PULLED: a positional answer offers "Walk me through it" and the user
 * clicks. Onboarding starts one WITHOUT a question: a new user lands on the page a founder-flagged
 * workflow begins on, the widget recognises the page, and the same card takes over. Same engine,
 * same card, same cross-page resume — only who starts it differs. It is the answer to "what should
 * I do first?", where the offer pill answers "show me how to do this".
 *
 * Posture (the same one Sense was allowed to exist under): founder-derived data is shipped DOWN
 * in the config the widget already fetches — each flagged workflow's key, title and FIRST-step
 * route as a pattern — and compared on the user's machine with the one route matcher. Nothing is
 * read off the page to decide when to speak, and nothing is fetched until a page has matched; then
 * exactly one workflow is fetched by key. "New" means "this browser has no record": v1 carries no
 * end-user identity, so the record lives in localStorage, scoped to the workspace key.
 *
 * The founder's "usually once" is a BUDGET, not a rule: each workflow may auto-start `maxShows`
 * times per browser (default 1); completing it, or dismissing it, ends it sooner. The decision is a
 * pure function (`pickOnboarding`) so the test suite pins it.
 *
 * Tie rule: one auto-start per page visit; the strongest route match wins; a tie goes to the
 * workflow the founder flagged first (the config list is served in that order).
 */
import { normalizePath, routeMatchStrength } from '@flowbuddy/shared/route-pattern';
import { log } from './log.js';
import { observeRun } from './step-engine.js';
import { fetchWorkflowByKey } from './sense.js';
import { startWalkthrough, walkthroughActive, walkthroughPending } from './walkthrough.js';
import { agentRunActive } from './agent-run.js';

// ── Wire (from /v1/copilot/config) ─────────────────────────────────────────────────────────────
export interface OnboardingWorkflowWire {
  key: string; // `sourceId:segmentIndex` — what the by-key fetch takes
  title: string;
  route: string; // the first step's route, already a PATTERN
}
export interface OnboardingWire {
  enabled: boolean;
  maxShows?: number;
  workflows?: OnboardingWorkflowWire[];
}

// ── The per-browser record ─────────────────────────────────────────────────────────────────────
export interface OnboardingEntry {
  shows: number; // auto-starts so far
  done?: boolean; // the walkthrough completed (by any trigger)
  dismissed?: boolean; // "Don't show again"
}
export type OnboardingProgress = Record<string, OnboardingEntry>;

const STORE_KEY = 'flowbuddy.onboarding.v1';
// Generous on purpose: nothing visible waits on this fetch, and the server compiles the workspace
// plan on a cold cache (the same compile the route shard pays) — a first visit after an idle minute
// must not lose its one chance to a budget tuned for a warm one.
const FETCH_TIMEOUT_MS = 8000;

interface Envelope {
  k: string; // the workspace public key — another workspace's embed on the same origin reads nothing
  entries: OnboardingProgress;
}

export function readProgress(key: string): OnboardingProgress {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const env = JSON.parse(raw) as Partial<Envelope> | null;
    if (!env || typeof env !== 'object' || env.k !== key || !env.entries || typeof env.entries !== 'object') return {};
    return env.entries;
  } catch {
    return {}; // private mode, blocked storage, corrupt JSON — onboarding simply treats the user as new
  }
}

function writeProgress(key: string, entries: OnboardingProgress): void {
  try {
    const env: Envelope = { k: key, entries };
    localStorage.setItem(STORE_KEY, JSON.stringify(env));
  } catch {
    /* storage unavailable — the budget is not enforced for this user, nothing else changes */
  }
}

function update(key: string, workflowKey: string, patch: Partial<OnboardingEntry>): void {
  const entries = readProgress(key);
  const cur = entries[workflowKey] ?? { shows: 0 };
  entries[workflowKey] = { ...cur, ...patch };
  writeProgress(key, entries);
}

// ── The decision (pure) ────────────────────────────────────────────────────────────────────────
/**
 * Which flagged workflow, if any, should auto-start on `path`. Eligible = its first route matches
 * the page, and its record is not done, not dismissed, and under the show budget. Strongest match
 * wins; ties keep list order (flagged first).
 */
export function pickOnboarding(
  workflows: OnboardingWorkflowWire[],
  path: string,
  progress: OnboardingProgress,
  maxShows: number,
): OnboardingWorkflowWire | null {
  const budget = Number.isFinite(maxShows) && maxShows >= 1 ? Math.floor(maxShows) : 1;
  const page = normalizePath(path);
  let best: { wf: OnboardingWorkflowWire; strength: number } | null = null;
  for (const wf of workflows) {
    if (!wf.key || !wf.route) continue;
    const rec = progress[wf.key];
    if (rec && (rec.done || rec.dismissed || rec.shows >= budget)) continue;
    const strength = routeMatchStrength(wf.route, page);
    if (strength === 0) continue;
    if (!best || strength > best.strength) best = { wf, strength };
  }
  return best?.wf ?? null;
}

// ── The trigger ────────────────────────────────────────────────────────────────────────────────
export interface OnboardingCfg {
  apiBase: string;
  key: string;
  reason: boolean;
}
export interface OnboardingHooks {
  onExplain?: () => void;
}

let installed: (() => void) | null = null;
let lastFiredPath: string | null = null;

/** Record an ending, whichever trigger started the walkthrough. Completed = onboarded for good. */
export function noteWalkthroughEnd(key: string, outcome: 'completed' | 'aborted', workflowKey: string): void {
  if (!key) return;
  if (outcome === 'completed') update(key, workflowKey, { done: true });
}

/** "Don't show again" — the user's own permanent opt-out for this workflow, this browser. */
export function dismissOnboarding(key: string, workflowKey: string): void {
  update(key, workflowKey, { dismissed: true });
}

/**
 * Arm the trigger for this page view: evaluate now, and again on every route change (the same
 * popstate/hashchange/poll watcher the actors use, hoisted to widget scope for the page's
 * lifetime). Idempotent; returns the teardown.
 */
export function installOnboarding(
  root: ShadowRoot,
  cfg: OnboardingCfg,
  wire: OnboardingWire | undefined,
  hooks: OnboardingHooks = {},
): () => void {
  installed?.();
  installed = null;
  const workflows = wire?.enabled ? (wire.workflows ?? []).filter((w) => w && w.key && w.route) : [];
  if (!cfg.key || workflows.length === 0) return () => {};
  const maxShows = wire?.maxShows ?? 1;

  const evaluate = (path: string): void => {
    const page = normalizePath(path);
    if (page === lastFiredPath) return; // one auto-start per page visit
    // Something is already guiding — a live or resumable walkthrough, or an acting run — and it
    // owns the page. Onboarding never interrupts; it gets its turn on a later visit.
    if (walkthroughActive() || walkthroughPending(cfg.key) || agentRunActive()) return;
    const pick = pickOnboarding(workflows, page, readProgress(cfg.key), maxShows);
    if (!pick) return;
    lastFiredPath = page;
    log.debug('onboarding: page matched', { key: pick.key, page });
    void fetchWorkflowByKey(cfg.apiBase, cfg.key, pick.key, FETCH_TIMEOUT_MS).then((wf) => {
      if (!wf || wf.steps.length === 0) {
        log.debug('onboarding: workflow not served — nothing shown', { key: pick.key });
        return;
      }
      if (walkthroughActive() || agentRunActive()) return; // the world moved while we fetched
      if (normalizePath(location.pathname) !== page) return; // the user already left the page
      // The show is spent when the card actually APPEARS — "shows" means what it says. A failed
      // fetch costs nothing; the once-per-page-visit guard above is what stops it hammering.
      update(cfg.key, pick.key, { shows: (readProgress(cfg.key)[pick.key]?.shows ?? 0) + 1 });
      startWalkthrough(
        root,
        cfg,
        wf,
        1,
        undefined,
        {
          // No onExit: the user never opened the chat, so closing the card must not open it.
          onExplain: hooks.onExplain,
          onEnd: (outcome, k) => noteWalkthroughEnd(cfg.key, outcome, k),
          onDismiss: (k) => dismissOnboarding(cfg.key, k),
        },
        'onboarding',
      );
    });
  };

  evaluate(location.pathname);
  const stop = observeRun({ onRouteChange: evaluate, onTick: () => {} });
  installed = () => {
    stop();
    lastFiredPath = null;
  };
  return installed;
}

/** Test-only. */
export function __resetOnboarding(): void {
  installed?.();
  installed = null;
  lastFiredPath = null;
}
