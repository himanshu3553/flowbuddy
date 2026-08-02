import { describe, expect, it } from 'vitest';
import { __agentSystemForTest as agentSystem } from './agent';

/**
 * The agent prompt in its two configurations — Copilot (tools bound) and THE FLOOR (nothing bound,
 * one round, what answers when the loop above it fails).
 *
 * WHY THIS FILE EXISTS. Retiring AI Chatbot merged two prompts into one, which removed a whole
 * class of drift (CLAUDE.md's trap: tune one, forget the other, and the failure path quietly
 * answers worse than the tier above it) and introduced exactly one new risk in its place: the
 * surviving prompt talks about tools, and the floor has none.
 *
 * A prompt that tells the model to "search first, then answer" when nothing is bound produces a
 * decline invented by the PROMPT rather than by the knowledge — and it produces it at the moment
 * the user has already hit one failure. That is the worst possible place to spend a bad answer, and
 * it is invisible in every other test, because the floor only runs when something else broke.
 */

const TOOL_NAMES = ['search_knowledge', 'get_workflow'];

describe('the floor configuration', () => {
  const floor = agentSystem(false);

  it('never names a tool it does not have', () => {
    // THE test. Each of these is a real instruction the model would try to follow.
    for (const tool of TOOL_NAMES) {
      expect(floor, `the floor must not mention ${tool}`).not.toContain(tool);
    }
  });

  it('never tells the model to go and look something up', () => {
    // The subtler half: no tool NAME, but still a promise of an action it cannot take. These
    // phrasings are the ones the shared prompt actually used before it was made conditional.
    for (const phrase of ['search first', 'Re-search', 'call a tool', 'call tools', 'YOUR TOOLS']) {
      expect(floor, `the floor must not say "${phrase}"`).not.toContain(phrase);
    }
  });

  it('still tells the model what it DOES have', () => {
    // Removing the tool talk must not leave the model with no account of its situation — an
    // unexplained absence is how you get "let me check that for you" with nothing behind it.
    expect(floor).toContain('nothing further to look up');
  });

  it('keeps every rule that has nothing to do with tools', () => {
    // The floor is a degraded TOOLSET, never a degraded standard. Grounding, honest declines,
    // position handling and formatting all still apply — this is the same assistant with less reach.
    expect(floor).toContain('NEVER use general knowledge');
    expect(floor).toContain('POSITION CONTEXT');
    expect(floor).toContain('ASKING THE USER A QUESTION');
    expect(floor).toContain('Formatting');
    // The decline rule matters most here: the floor runs for someone who already hit a failure.
    expect(floor).toContain('BEFORE YOU DECLINE');
  });
});

describe('the Copilot configuration', () => {
  const copilot = agentSystem(true);

  it('still offers both tools', () => {
    for (const tool of TOOL_NAMES) expect(copilot).toContain(tool);
    expect(copilot).toContain('YOUR TOOLS');
  });

  it('is strictly longer than the floor — the difference is only reach', () => {
    // A cheap guard against the conditionals being wired backwards, which would silently ship the
    // floor's prompt to every question and read as "the copilot stopped searching".
    expect(copilot.length).toBeGreaterThan(agentSystem(false).length);
  });

  it('does not carry the floor\'s no-tools framing', () => {
    expect(copilot).not.toContain('nothing further to look up');
  });
});
