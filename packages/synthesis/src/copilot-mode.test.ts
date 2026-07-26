import { describe, expect, it } from 'vitest';
import {
  COPILOT_MODES,
  DEFAULT_COPILOT_MODE,
  MODE_LABELS,
  MODE_RANK,
  NEW_WORKSPACE_MODE,
  SELECTABLE_MODES,
  modeCanAct,
  modeUsesAgentLoop,
  parseCopilotMode,
} from '@flowbuddy/shared/copilot-mode';

/**
 * The mode vocabulary's safety invariants (2026-07-27).
 *
 * WHY THIS FILE EXISTS. New workspaces now start in Copilot mode, which means the product default
 * and the fail-closed floor are DIFFERENT values for the first time. That gap is the whole safety
 * property, and it is invisible: both are one-line constants in the same file, twelve lines apart,
 * and re-collapsing them would look like tidying. These tests state what each one is FOR, so the
 * next person to touch them finds out from a failing test rather than from a support ticket.
 *
 * Lives in @flowbuddy/synthesis only because that is where the repo's vitest runner is; it depends
 * on @flowbuddy/shared, so the import is clean. Move it if `shared` ever gets its own runner.
 */

describe('the product default', () => {
  it('starts new workspaces in Copilot mode', () => {
    // The decision itself, made executable. Mirrored by `@default("copilot")` on Workspace
    // .copilotMode — the DATABASE is what actually applies it (nothing sets the field on create),
    // so if you change one, change the other.
    expect(NEW_WORKSPACE_MODE).toBe('copilot');
  });

  it('is a mode the founder can actually see and switch away from', () => {
    // Defaulting a workspace into a mode that isn't in the picker would strand it there.
    expect(SELECTABLE_MODES).toContain(NEW_WORKSPACE_MODE);
  });

  it('cannot act on the page', () => {
    // A default is something nobody chose. Acting must always be chosen — so no matter how far up
    // the ladder the default climbs, it must stop below `agent`.
    expect(modeCanAct(NEW_WORKSPACE_MODE)).toBe(false);
  });
});

describe('the safety floor', () => {
  it('is the lowest rung on the ladder', () => {
    // "What do we do when we don't know?" has exactly one safe answer, and it is the bottom.
    const ranks = COPILOT_MODES.map((m) => MODE_RANK[m]);
    expect(MODE_RANK[DEFAULT_COPILOT_MODE]).toBe(Math.min(...ranks));
  });

  it('never lets an unrecognised value reach the agent loop', () => {
    // THE test. Every one of these is a real way a bad value arrives: a typo, a label pasted
    // instead of a key, a row written by a future version and then rolled back, a null column, a
    // hand-edited database. None of them may buy capability.
    for (const bad of [
      'garbage',
      '',
      'Copilot', // the LABEL, not the key — casing must not be forgiven
      'AI Chatbot',
      'agent ',
      'AGENT',
      undefined,
      null,
      0,
      {},
      ['agent'],
    ]) {
      const resolved = parseCopilotMode(bad);
      expect(resolved, `${JSON.stringify(bad)} must not be trusted`).toBe(DEFAULT_COPILOT_MODE);
      expect(modeUsesAgentLoop(resolved)).toBe(false);
      expect(modeCanAct(resolved)).toBe(false);
    }
  });

  it('does NOT follow the product default upward', () => {
    // The one that would break silently. If someone "simplifies" these back into one constant,
    // then the day the default climbs a rung, every typo climbs with it.
    expect(MODE_RANK[DEFAULT_COPILOT_MODE]).toBeLessThanOrEqual(MODE_RANK[NEW_WORKSPACE_MODE]);
    expect(modeUsesAgentLoop(DEFAULT_COPILOT_MODE)).toBe(false);
  });
});

describe('the ladder', () => {
  it('passes every real mode through unchanged', () => {
    for (const m of COPILOT_MODES) expect(parseCopilotMode(m)).toBe(m);
  });

  it('keeps acting behind the top rung, which is not selectable yet', () => {
    expect(COPILOT_MODES.filter(modeCanAct)).toEqual(['agent']);
    expect(SELECTABLE_MODES).not.toContain('agent');
  });

  it('never leaks a founder-facing label into a stored key', () => {
    // Labels are display text and may be renamed for pricing at any time; storing one would turn a
    // copy edit into a data migration.
    for (const m of COPILOT_MODES) {
      expect(COPILOT_MODES as readonly string[]).not.toContain(MODE_LABELS[m].name);
    }
  });
});
