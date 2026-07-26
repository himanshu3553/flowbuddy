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
 * Parsing FAILS CLOSED: anything unrecognised — an older row, a typo, a value written by a future
 * version and then rolled back — resolves to `chatbot`, the mode that cannot do anything
 * surprising. A capability must never be granted by accident.
 */

export const COPILOT_MODES = ['chatbot', 'copilot', 'agent'] as const;
export type CopilotMode = (typeof COPILOT_MODES)[number];

/** The safe default, the value every existing workspace has, and the runtime fallback when the
 *  agent loop errors or times out. */
export const DEFAULT_COPILOT_MODE: CopilotMode = 'chatbot';

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
