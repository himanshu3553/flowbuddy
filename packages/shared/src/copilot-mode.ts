/**
 * The copilot's operating mode — the ONE definition of the vocabulary, shared by the API (which
 * enforces it), the Studio (which renders the picker), and anything added later.
 *
 * Two things this file deliberately keeps apart:
 *
 * 1. **The stored key vs. the label the founder reads.** The database holds `chatbot` | `copilot` |
 *    `agent`; the labels below are display text. Renaming a tier — for a pricing experiment, a
 *    rebrand, anything — is an edit to one string here, with no migration and nothing to
 *    coordinate (user decision 2026-07-26: "these are only names to show").
 *
 * 2. **The ladder vs. the permission.** Modes are strictly ordered and each one CONTAINS the one
 *    below it. `agent` is `copilot` plus the ability to act; `copilot` is `chatbot` plus the
 *    ability to decide. Ordering is expressed once, in `MODE_RANK`, so callers ask
 *    "is this at least X?" instead of hard-coding lists of modes that drift apart.
 *
 * 3. **The product default vs. the safety floor.** `NEW_WORKSPACE_MODE` is what a fresh workspace
 *    starts as — an opinion about what FlowBuddy IS, and it may climb the ladder as modes prove
 *    out. `DEFAULT_COPILOT_MODE` is where an unrecognised value lands, and it may only ever move
 *    DOWN. They were one constant until 2026-07-27 and read identically; collapsing them again
 *    would mean a future "new workspaces start as agents" decision silently turned every typo and
 *    every rolled-back value into an acting agent.
 *
 * Parsing FAILS CLOSED: anything unrecognised — an older row, a typo, a value written by a future
 * version and then rolled back — resolves to `chatbot`, the mode that cannot do anything
 * surprising. A capability must never be granted by accident.
 */

export const COPILOT_MODES = ['chatbot', 'copilot', 'agent'] as const;
export type CopilotMode = (typeof COPILOT_MODES)[number];

/** The SAFETY FLOOR — where an unrecognised stored value lands, and the runtime fallback when the
 *  agent loop fails. Not the product default (see `NEW_WORKSPACE_MODE`): this one answers "what do
 *  we do when we don't know?", and the only safe answer is the mode that cannot surprise anyone.
 *  It may move down the ladder, never up. */
export const DEFAULT_COPILOT_MODE: CopilotMode = 'chatbot';

/** The mode a NEWLY CREATED workspace starts in — `copilot` since 2026-07-27 (was `chatbot`).
 *
 *  The database applies this, not this constant: workspaces are created without a `copilotMode`
 *  ([web/lib/workspace.ts]), so the `@default` on the column is what actually decides. This is here
 *  so the intent is stated in the shared vocabulary rather than only in a migration, and so any
 *  future code that creates or previews a workspace has one thing to read. Change BOTH together. */
export const NEW_WORKSPACE_MODE: CopilotMode = 'copilot';

/** Position on the ladder. Higher = may do more. Compare, never enumerate. */
export const MODE_RANK: Record<CopilotMode, number> = { chatbot: 0, copilot: 1, agent: 2 };

/** Founder-facing labels + one-liners. Display only — never persisted, never sent to the model. */
export const MODE_LABELS: Record<CopilotMode, { name: string; blurb: string }> = {
  chatbot: {
    name: 'AI Chatbot',
    blurb: "Answers your users' questions from your approved workflows.",
  },
  copilot: {
    name: 'Copilot',
    blurb:
      'Also decides how to help as the conversation goes — explains, points, guides users through steps. Never touches anything on the page.',
  },
  agent: {
    name: 'AI Agent',
    blurb: 'Can complete steps for your users.',
  },
};

/** Modes a founder may actually select today. `agent` is defined (so the ladder is visible and the
 *  stored value is stable) but NOT yet buildable — its UI and safety model are deliberately
 *  deferred, and it must never become reachable by accident. */
export const SELECTABLE_MODES: readonly CopilotMode[] = ['chatbot', 'copilot'];

/** Normalise an untrusted/legacy value to a mode. Unknown → `chatbot` (fail closed). */
export function parseCopilotMode(value: unknown): CopilotMode {
  return typeof value === 'string' && (COPILOT_MODES as readonly string[]).includes(value)
    ? (value as CopilotMode)
    : DEFAULT_COPILOT_MODE;
}

/** Is this workspace at or above the given rung? The only way callers should branch on mode. */
export function modeAtLeast(mode: CopilotMode, floor: CopilotMode): boolean {
  return MODE_RANK[mode] >= MODE_RANK[floor];
}

/** Does this mode let the assistant decide for itself which grounded primitive to use? */
export const modeUsesAgentLoop = (mode: CopilotMode): boolean => modeAtLeast(mode, 'copilot');

/** Does this mode permit acting on the page? Always false until mode 3 is built — the check
 *  exists now so the acting path has a single gate to consult rather than inventing one later. */
export const modeCanAct = (mode: CopilotMode): boolean => modeAtLeast(mode, 'agent');
