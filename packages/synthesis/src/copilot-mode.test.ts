import { describe, expect, it } from 'vitest';
import {
  COPILOT_MODES,
  DEFAULT_COPILOT_MODE,
  MODE_LABELS,
  MODE_RANK,
  NEW_WORKSPACE_MODE,
  SELECTABLE_MODES,
  modeCanAct,
  parseCopilotMode,
} from '@flowbuddy/shared/copilot-mode';

/**
 * The mode vocabulary's safety invariants.
 *
 * WHY THIS FILE EXISTS. The product default and the fail-closed floor are two constants in one
 * file, a dozen lines apart, and they now hold the SAME value — which makes collapsing them look
 * like obvious tidying. It isn't: the day "new workspaces start as agents" is decided, the floor
 * must stay put, and a single constant would take every typo and every rolled-back row up the
 * ladder with the default. These tests state what each one is FOR, so the next person to touch
 * them finds out from a failing test rather than from a support ticket.
 *
 * WHAT CHANGED WHEN MODE 1 WAS RETIRED. The floor used to be "the rung that can do least", and the
 * test for it asked whether the floor reached the agent loop. With two modes the floor IS the agent
 * loop, so that question has no safe answer to assert — and asserting it would have forced the
 * floor down to a mode that no longer exists. The invariant was always really about CAPABILITY, so
 * it is now stated that way: the floor may never be a mode that ACTS. Same protection, and it
 * survives the next mode being added above it.
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

  it('cannot act on the user\'s behalf — the rule that outlived mode 1', () => {
    // THE invariant, in its durable form. Not "the floor is the dumbest mode" (that died with the
    // AI Chatbot rung) but "the floor cannot do anything to anyone". An unrecognised value may cost
    // a read-only assistant; it may never buy an unattended one.
    expect(modeCanAct(DEFAULT_COPILOT_MODE)).toBe(false);
  });

  it('never lets an unrecognised value reach the agent loop', () => {
    // THE test. Every one of these is a real way a bad value arrives: a typo, a label pasted
    // instead of a key, a row written by a future version and then rolled back, a null column, a
    // hand-edited database. None of them may buy capability.
    for (const bad of [
      'garbage',
      '',
      'Copilot', // the LABEL, not the key — casing must not be forgiven
      'chatbot', // THE RETIRED MODE — must resolve forward to copilot, not linger as a special case
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
      expect(modeCanAct(resolved), `${JSON.stringify(bad)} must not buy the ability to act`).toBe(false);
    }
  });

  it('does NOT follow the product default upward', () => {
    // The one that would break silently. If someone "simplifies" these back into one constant,
    // then the day the default climbs a rung, every typo climbs with it. They hold the same value
    // today, which is exactly why this test has to exist rather than the constants being merged.
    expect(MODE_RANK[DEFAULT_COPILOT_MODE]).toBeLessThanOrEqual(MODE_RANK[NEW_WORKSPACE_MODE]);
  });
});

describe('the ladder', () => {
  it('passes every real mode through unchanged', () => {
    for (const m of COPILOT_MODES) expect(parseCopilotMode(m)).toBe(m);
  });

  it('has retired AI Chatbot completely', () => {
    // Not a nostalgia test. A half-retirement — the key gone from the ladder but still lurking in
    // the labels or the picker — would render a tier a founder can select and the API will not
    // honour, and the failure would show up as "my setting keeps reverting".
    expect(COPILOT_MODES as readonly string[]).not.toContain('chatbot');
    expect(SELECTABLE_MODES as readonly string[]).not.toContain('chatbot');
    expect(Object.keys(MODE_LABELS)).not.toContain('chatbot');
  });

  it('keeps acting behind the top rung — selectable since slice 5, but ONLY via acceptance', () => {
    expect(COPILOT_MODES.filter(modeCanAct)).toEqual(['agent']);
    // `agent` entered SELECTABLE_MODES with the contractual shell (2026-08-05). Selectability is
    // not the safety boundary — the boundary is the acceptance the server action requires, plus
    // the floor below, which must NEVER follow: an unrecognised value still lands read-only.
    expect(SELECTABLE_MODES).toContain('agent');
    expect(modeCanAct(DEFAULT_COPILOT_MODE)).toBe(false);
  });

  it('never leaks a founder-facing label into a stored key', () => {
    // Labels are display text and may be renamed for pricing at any time; storing one would turn a
    // copy edit into a data migration.
    for (const m of COPILOT_MODES) {
      expect(COPILOT_MODES as readonly string[]).not.toContain(MODE_LABELS[m].name);
    }
  });
});
