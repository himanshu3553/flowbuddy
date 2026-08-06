/**
 * The copilot's operating mode — the ONE definition of the vocabulary, shared by the API (which
 * enforces it), the Studio (which renders the picker), and anything added later.
 *
 * **Two modes, and the boundary between them is ACTING.** `copilot` reads and advises; `agent` also
 * does things on the user's behalf. That is the only distinction a customer has to understand, and
 * it is the one that carries real risk.
 *
 * *(A third mode, `AI Chatbot` — a single grounded call with no tools — was retired: it was a
 * strictly worse Copilot that had to be tuned in parallel forever, and every knowledge feature had
 * to be built into both. Its ENGINE survives, unsellable, as the floor beneath a failed agent loop
 * — one round of the agent's own prompt with no tools bound. See `docs/build/agent.md`.)*
 *
 * Three things this file deliberately keeps apart:
 *
 * 1. **The stored key vs. the label the founder reads.** The database holds `copilot` | `agent`;
 *    the labels below are display text. Renaming a tier — for a pricing experiment, a rebrand,
 *    anything — is an edit to one string here, with no migration and nothing to coordinate
 *    (user decision 2026-07-26: "these are only names to show").
 *
 * 2. **The ladder vs. the permission.** Modes are strictly ordered and each one CONTAINS the one
 *    below it. `agent` is `copilot` plus the ability to act. Ordering is expressed once, in
 *    `MODE_RANK`, so callers ask "is this at least X?" instead of hard-coding lists of modes that
 *    drift apart.
 *
 * 3. **The product default vs. the safety floor.** `NEW_WORKSPACE_MODE` is what a fresh workspace
 *    starts as — an opinion about what FlowBuddy IS, and it may climb the ladder as modes prove
 *    out. `DEFAULT_COPILOT_MODE` is where an unrecognised value lands, and it may only ever move
 *    DOWN. **They read identically today and must STILL stay apart:** the whole point arrives the
 *    day "new workspaces start as agents" is decided, when the floor must not follow. Collapsing
 *    them would silently turn every typo and every rolled-back value into an acting agent.
 *
 * Parsing FAILS CLOSED to `copilot`. With mode 1 retired the floor is no longer "the mode that can
 * do least" — it is **the mode that cannot ACT**, which was always the part that mattered. A
 * mislabelled row costs a read-only assistant, never an unattended one. `copilot-mode.test.ts`
 * enforces it, and the floor may never be raised to a mode where `modeCanAct` is true.
 */

export const COPILOT_MODES = ['copilot', 'agent'] as const;
export type CopilotMode = (typeof COPILOT_MODES)[number];

/** The SAFETY FLOOR — where an unrecognised stored value lands, and the mode assumed when we cannot
 *  tell. Not the product default (see `NEW_WORKSPACE_MODE`): this one answers "what do we do when
 *  we don't know?", and the only safe answer is a mode that cannot act on anyone's behalf. It may
 *  move down the ladder, never up — and never to a mode where `modeCanAct` is true. */
export const DEFAULT_COPILOT_MODE: CopilotMode = 'copilot';

/** The mode a NEWLY CREATED workspace starts in.
 *
 *  The database applies this, not this constant: workspaces are created without a `copilotMode`
 *  ([web/lib/workspace.ts]), so the `@default` on the column is what actually decides. This is here
 *  so the intent is stated in the shared vocabulary rather than only in a migration, and so any
 *  future code that creates or previews a workspace has one thing to read. Change BOTH together. */
export const NEW_WORKSPACE_MODE: CopilotMode = 'copilot';

/** Position on the ladder. Higher = may do more. Compare, never enumerate. */
export const MODE_RANK: Record<CopilotMode, number> = { copilot: 0, agent: 1 };

/** Founder-facing labels + one-liners. Display only — never persisted, never sent to the model. */
export const MODE_LABELS: Record<CopilotMode, { name: string; blurb: string }> = {
  copilot: {
    name: 'Copilot',
    blurb:
      "Answers your users' questions from your approved workflows, and decides how to help as the conversation goes — explains, points, guides users through steps. Never touches anything on the page.",
  },
  agent: {
    name: 'AI Agent',
    blurb: 'Everything Copilot does, and can complete steps for your users.',
  },
};

/** Modes a founder may actually select. `agent` became selectable with the contractual shell
 *  (P4 slice 5, 2026-08-05): selecting it REQUIRES a recorded acceptance of the current
 *  `AGENT_TERMS_VERSION` — the Studio collects it, the server action refuses without it, and the
 *  `AgentAcceptance` row is the durable answer to "who turned acting on, and when". */
export const SELECTABLE_MODES: readonly CopilotMode[] = ['copilot', 'agent'];

/**
 * The version of the acting terms a founder must have accepted for `agent` mode (agent.md §7 Q4:
 * acceptance is a ROW, never a toggle state). BUMP THIS when the acting terms materially change —
 * every workspace then re-accepts before the mode can be (re-)selected; existing agent-mode
 * workspaces keep running on the version they accepted, which the row records.
 */
export const AGENT_TERMS_VERSION = '2026-08-05';

/** Normalise an untrusted/legacy value to a mode. Unknown → `copilot` (fail closed).
 *
 *  `chatbot` now arrives here as an unrecognised string and resolves to `copilot`, which IS the
 *  retirement path: a row written before the retirement reads as the mode that replaced it, with no
 *  special case to remember and nothing that has to be back-filled first. */
export function parseCopilotMode(value: unknown): CopilotMode {
  return typeof value === 'string' && (COPILOT_MODES as readonly string[]).includes(value)
    ? (value as CopilotMode)
    : DEFAULT_COPILOT_MODE;
}

/** Is this workspace at or above the given rung? The only way callers should branch on mode. */
export function modeAtLeast(mode: CopilotMode, floor: CopilotMode): boolean {
  return MODE_RANK[mode] >= MODE_RANK[floor];
}

/** Does this mode permit acting on the page? Always false until mode 3 is built — the check
 *  exists now so the acting path has a single gate to consult rather than inventing one later.
 *
 *  This is now the ONLY capability gate in the vocabulary. Its sibling `modeUsesAgentLoop` went with
 *  mode 1: every mode uses the agent loop, so a function asking "does it?" could only ever return
 *  true, and a gate that cannot say no misleads whoever reads it into thinking a fork still exists. */
export const modeCanAct = (mode: CopilotMode): boolean => modeAtLeast(mode, 'agent');
