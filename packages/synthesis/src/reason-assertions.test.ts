import { describe, it, expect } from 'vitest';
// @ts-expect-error — a plain .mjs harness module with no types; it lives in scripts/ because it is
// tooling, not product code, and it is imported here because a safety net whose own logic is
// unverified is worse than none (every check below fails OPEN).
import { vocabularyLeaks, missedBlockers, scoreRun } from '../../../scripts/reason-assertions.mjs';

/**
 * The scoring rules behind `scripts/reason-fixtures.mjs` — the diagnostic path's first automated
 * coverage (agent.md §9 Gap 3). These tests exist because the checks FAIL OPEN: a mistake here does
 * not break the harness, it makes every fixture pass forever while measuring nothing, which is the
 * exact failure the fixtures were built to prevent one level up.
 *
 * The case-sensitivity split is the whole game. REASON_SYSTEM requires the model to TRANSLATE its
 * evidence vocabulary into plain English ("typeMismatch" → "isn't a valid email address"), and the
 * correct translations are ordinary sentences containing the very letters the flags are made of.
 * Check them case-insensitively and every good answer fails; skip the check and the rule is gone.
 */

describe('vocabularyLeaks — the "never expose the evidence vocabulary" rule', () => {
  it('passes a correctly translated diagnosis', () => {
    expect(
      vocabularyLeaks(
        "The Full Name field is still empty, and that email address isn't valid yet. " +
          'Fill those in and Create account will unlock.',
      ),
    ).toEqual([]);
  });

  it('catches a leaked constraint name whatever its casing', () => {
    expect(vocabularyLeaks('The email failed typeMismatch.')).toContain('typeMismatch');
    expect(vocabularyLeaks('the email failed typemismatch')).toContain('typeMismatch');
    expect(vocabularyLeaks('Reason: VALUEMISSING on Full Name')).toContain('valueMissing');
  });

  it('catches a shouted flag word but never its plain-English translation', () => {
    // The leak.
    expect(vocabularyLeaks('The Email field is INVALID.')).toContain('INVALID');
    expect(vocabularyLeaks('Create account is DISABLED.')).toContain('DISABLED');
    expect(vocabularyLeaks('Full Name is EMPTY.')).toContain('EMPTY');
    // The required translations — these MUST pass, or the check would punish correct answers and
    // get deleted, taking the rule with it.
    expect(vocabularyLeaks("That email isn't valid yet.")).toEqual([]);
    expect(vocabularyLeaks('Create account stays greyed out until every field is filled in.')).toEqual([]);
    expect(vocabularyLeaks('The Full Name field is still empty.')).toEqual([]);
  });

  it('does not fire on a flag word buried inside an ordinary word', () => {
    // Whole-word matching: "EMPTY" must not match inside a longer token.
    expect(vocabularyLeaks('See EMPTYSTATE_DOCS for details.')).toEqual([]);
  });

  it('catches the model narrating where it read something', () => {
    expect(vocabularyLeaks('According to the page state, the form is complete.')).toContain('"page state"');
    expect(vocabularyLeaks('Comparing against the expected state of that step…')).toContain('"expected state"');
  });

  it('treats a missing answer as clean rather than throwing', () => {
    // A decline carries no `answer`; the harness scores it on other axes and must not crash here.
    expect(vocabularyLeaks(undefined)).toEqual([]);
    expect(vocabularyLeaks('')).toEqual([]);
  });
});

describe('missedBlockers — the "answer MUST cover every entry" rule', () => {
  const blockers = [
    '"Full Name" — required, still empty',
    '"Email" — invalid (typeMismatch)',
    '"Terms" — required box not ticked',
  ];

  it('passes an answer that names every blocker', () => {
    const answer = 'Fill in Full Name, fix the Email address, and tick Terms.';
    expect(missedBlockers(answer, blockers)).toEqual({ missed: [], unverifiable: 0 });
  });

  it('reports the ones a partial answer left out', () => {
    // The failure this rule exists for: the reader fixes what was mentioned and hits a second wall.
    const { missed } = missedBlockers('Just fill in Full Name and you should be good.', blockers);
    expect(missed).toEqual(['Email', 'Terms']);
  });

  it('matches labels case-insensitively', () => {
    expect(missedBlockers('fill in full name, email, terms', blockers).missed).toEqual([]);
  });

  it('counts an unlabelled control as unverifiable, never as missed', () => {
    // `input — invalid (…)` names no control an answer could reference; scoring it would fail
    // correct answers.
    const { missed, unverifiable } = missedBlockers('Fix the email address.', [
      'input — invalid (badInput)',
      '"Email" — invalid (typeMismatch)',
    ]);
    expect(missed).toEqual([]);
    expect(unverifiable).toBe(1);
  });

  it('is vacuously satisfied when the server reported no blockers', () => {
    expect(missedBlockers('Anything at all.', [])).toEqual({ missed: [], unverifiable: 0 });
    expect(missedBlockers('Anything at all.', undefined)).toEqual({ missed: [], unverifiable: 0 });
  });
});

describe('scoreRun — the row-validity gate and the per-fixture expectations', () => {
  const run = {
    engine: 'reason',
    covered: true,
    answer: 'The Full Name field is still empty — fill that in and Create account will unlock.',
    blockers: ['"Full Name" — required, still empty'],
    tools: ['get_page_image'],
  };

  it('invalidates a run that never reached the diagnostic engine', () => {
    // The whole point: a fixture answered by the AI Chatbot floor (or the agent) measures nothing
    // about diagnosis, and must be excluded rather than scored.
    expect(scoreRun({}, { ...run, engine: 'chatbot' })).toBeNull();
    expect(scoreRun({}, { ...run, engine: 'agent' })).toBeNull();
    expect(scoreRun({}, { ...run, engine: null })).toBeNull();
    expect(scoreRun({}, run)).not.toBeNull();
  });

  it('defaults to expecting a diagnosis, not a decline', () => {
    // "never conclude everything looks fine — and never decline — from structure alone".
    expect(scoreRun({}, run)!.covered).toBe(true);
    expect(scoreRun({}, { ...run, covered: false })!.covered).toBe(false);
  });

  it('honours a fixture where declining is the correct behaviour', () => {
    const fixture = { expect: { covered: false } };
    expect(scoreRun(fixture, { ...run, covered: false })!.covered).toBe(true);
    expect(scoreRun(fixture, run)!.covered).toBe(false);
  });

  it('checks blockers by default and skips them only when told to', () => {
    const thin = { ...run, answer: 'Something went wrong somewhere.' };
    expect(scoreRun({}, thin)!.blockersCovered).toBe(false);
    expect(scoreRun({ expect: { coversAllBlockers: false } }, thin)!.blockersCovered).toBe(true);
  });

  it('scores required and forbidden tool calls', () => {
    // "look at the image BEFORE hedging" vs "call a tool ONLY when it would change the diagnosis".
    const needsImage = { expect: { tools: { required: ['get_page_image'] } } };
    expect(scoreRun(needsImage, run)!.toolsMissing).toEqual([]);
    expect(scoreRun(needsImage, { ...run, tools: [] })!.toolsMissing).toEqual(['get_page_image']);

    const mustStayCheap = { expect: { tools: { forbidden: ['get_expected_screenshot'] } } };
    expect(scoreRun(mustStayCheap, run)!.toolsForbidden).toEqual([]);
    expect(
      scoreRun(mustStayCheap, { ...run, tools: ['get_expected_screenshot'] })!.toolsForbidden,
    ).toEqual(['get_expected_screenshot']);
  });

  it('applies the plain-language check with no declaration needed', () => {
    // It is a rule for EVERY diagnosis, so it can never be switched off by a fixture author.
    expect(scoreRun({}, run)!.noLeaks).toBe(true);
    expect(scoreRun({}, { ...run, answer: 'Full Name is EMPTY.' })!.noLeaks).toBe(false);
  });

  it('applies a fixture\'s own mustMention / mustNotMention phrases', () => {
    const fixture = { expect: { mustMention: ['already exists'], mustNotMention: ['network'] } };
    const rejected = {
      ...run,
      answer: 'That address already exists — try signing in instead.',
      blockers: [],
    };
    const scored = scoreRun(fixture, rejected)!;
    expect(scored.mustMention).toEqual([]);
    expect(scored.mustNotMention).toEqual([]);

    // The "no speculative declines" rule, as a per-fixture check.
    const speculative = { ...rejected, answer: 'It may be a network problem — check your internet.' };
    expect(scoreRun(fixture, speculative)!.mustMention).toEqual(['already exists']);
    expect(scoreRun(fixture, speculative)!.mustNotMention).toEqual(['network']);
  });
});
