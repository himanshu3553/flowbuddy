// The checks reason-fixtures.mjs scores a diagnosis with — extracted here for ONE reason: they are
// side-effect-free so they can be unit-tested (packages/synthesis/src/reason-assertions.test.ts).
// The harness itself cannot be imported — it parses argv, exits, and makes network calls at the top
// level — and a safety net whose own logic is unverified is worse than none: every rule below fails
// OPEN, so a mistake here would let every fixture pass forever while measuring nothing.
//
// Each check encodes a rule from REASON_SYSTEM (packages/synthesis/src/reason.ts). The source
// prompt is the authority; these are the machine-checkable subset of it.

// ── "NEVER expose the evidence vocabulary" ──────────────────────────────────────────────────────
// The highest-value assertion here: it breaks SILENTLY (the answer still reads fluently to us, and
// like a bug report to a customer), and no covered-rate would ever catch it.

/** Machine words that are never legitimate English — matched case-insensitively. */
export const FORBIDDEN_CONSTRAINTS = [
  'valueMissing', 'typeMismatch', 'patternMismatch', 'tooShort', 'tooLong',
  'rangeUnderflow', 'rangeOverflow', 'stepMismatch', 'badInput', 'customError', 'ariaInvalid',
];

/**
 * Flag words, forbidden AS FLAGS. Matched case-SENSITIVELY and whole-word on purpose: the prompt's
 * own required translations are ordinary English that contains these letters — "that email isn't
 * valid", "the field is still empty", "the button stays greyed out" must all PASS. Only the shouted
 * evidence form is the leak. A case-insensitive check here would fail correct answers, and the
 * natural fix for that (deleting the check) would lose the rule entirely.
 */
export const FORBIDDEN_FLAGS = ['INVALID', 'DISABLED', 'EMPTY', 'UNCHECKED'];

/** Naming the evidence channel at all ("according to the page state…") — case-insensitive. */
export const FORBIDDEN_PHRASES = ['page state', 'page-state', 'expected state', 'the snapshot'];

/** Every forbidden-vocabulary hit in one answer. Empty = the answer spoke like a support agent. */
export function vocabularyLeaks(answer) {
  const text = answer ?? '';
  const lower = text.toLowerCase();
  const hits = [];
  for (const c of FORBIDDEN_CONSTRAINTS) if (lower.includes(c.toLowerCase())) hits.push(c);
  for (const f of FORBIDDEN_FLAGS) if (new RegExp(`\\b${f}\\b`).test(text)) hits.push(f);
  for (const p of FORBIDDEN_PHRASES) if (lower.includes(p)) hits.push(`"${p}"`);
  return hits;
}

// ── "the answer MUST cover every entry" ─────────────────────────────────────────────────────────

/**
 * Which machine-checked blockers the answer failed to address.
 *
 * `blockers` is the server's OWN list (returned on preview responses), so this can never drift from
 * the list the model was handed and told was exhaustive. Entries read like
 * `"Full Name" — required, still empty`; the quoted label is what an answer has to name.
 *
 * An entry with NO quoted label describes an unnamed control (`input — invalid (…)`), which an
 * answer cannot reasonably reference by name. Those are counted as UNVERIFIABLE rather than missed:
 * scoring them would fail correct answers, and a check that punishes good work gets deleted.
 */
export function missedBlockers(answer, blockers) {
  const lower = (answer ?? '').toLowerCase();
  const missed = [];
  let unverifiable = 0;
  for (const b of blockers ?? []) {
    const label = /"([^"]+)"/.exec(b)?.[1];
    if (!label) { unverifiable++; continue; }
    if (!lower.includes(label.toLowerCase())) missed.push(label);
  }
  return { missed, unverifiable };
}

/**
 * Score one replay against a fixture's expectations, or null when the run is INVALID.
 *
 * A run that did not reach the diagnostic engine measures nothing about it — Reason's toggle may be
 * off, the tighter per-key ceiling may have degraded it to the fast path, or the engine may have
 * thrown and been answered by the AI Chatbot floor. Scoring a chatbot answer as a diagnosis is
 * worse than reporting no result, so those runs are excluded from every rate rather than counted as
 * failures. Same discipline as the text baseline's `setupFailures`.
 */
export function scoreRun(fixture, run) {
  if (run.engine !== 'reason') return null;
  const e = fixture.expect ?? {};
  const answer = run.answer ?? '';
  const lower = answer.toLowerCase();
  const leaks = vocabularyLeaks(answer);
  const { missed, unverifiable } =
    e.coversAllBlockers === false
      ? { missed: [], unverifiable: 0 }
      : missedBlockers(answer, run.blockers);
  const tools = run.tools ?? [];
  // Undefined means "expect a diagnosis" — the DEFAULT expectation, not the absence of one. Written
  // as `e.covered === undefined ? true : …` this silently returned a pass for every fixture that
  // declared nothing, so a path that started declining would still have scored perfectly. Caught by
  // the test beside it; the rule is that an absent expectation must resolve to a value and then be
  // COMPARED, never short-circuit the comparison.
  const wantCovered = e.covered === undefined ? true : e.covered;
  return {
    covered: run.covered === wantCovered,
    noLeaks: leaks.length === 0,
    leaks,
    blockersCovered: missed.length === 0,
    missedBlockers: missed,
    unverifiableBlockers: unverifiable,
    mustMention: (e.mustMention ?? []).filter((s) => !lower.includes(s.toLowerCase())),
    mustNotMention: (e.mustNotMention ?? []).filter((s) => lower.includes(s.toLowerCase())),
    toolsMissing: (e.tools?.required ?? []).filter((t) => !tools.includes(t)),
    toolsForbidden: (e.tools?.forbidden ?? []).filter((t) => tools.includes(t)),
  };
}
