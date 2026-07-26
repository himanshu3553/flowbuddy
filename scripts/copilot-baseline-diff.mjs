#!/usr/bin/env node
// Compare two copilot baselines and report only what MATTERS (added 2026-07-26).
//
// The answer model is non-deterministic (temperature 0.2), so wording always differs. This diff
// deliberately ignores prose and reports the decisions: did a question flip between answered and
// declined, did the cited workflows change, did positioning change. Answer text is printed only
// alongside a flagged question, as context for a human — never as the trigger.
//
// Usage: node scripts/copilot-baseline-diff.mjs before.json after.json

import { readFileSync } from 'node:fs';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  console.error('Usage: node scripts/copilot-baseline-diff.mjs <before.json> <after.json>');
  process.exit(1);
}

const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));
const byId = (cap) => new Map(cap.results.map((r) => [r.id, r]));
const b = byId(before);
const a = byId(after);

const rate = (s) => {
  const [n, d] = String(s).split('/').map(Number);
  return d ? n / d : 0;
};
const same = (x, y) => JSON.stringify(x ?? []) === JSON.stringify(y ?? []);

console.log(`\nBaseline diff\n  before: ${beforePath}  (${before.capturedAt})\n  after:  ${afterPath}  (${after.capturedAt})\n`);

let regressions = 0;
let changes = 0;

for (const [id, bef] of b) {
  const aft = a.get(id);
  if (!aft) {
    console.log(`  ${id}  ⚠ missing from the after capture`);
    changes++;
    continue;
  }

  const notes = [];
  const rb = rate(bef.answeredRate);
  const ra = rate(aft.answeredRate);

  if (rb !== ra) {
    // A "should-decline" question moving toward answering is just as bad as a good question
    // moving toward declining — inventing an answer is a worse failure than admitting ignorance.
    const wantsAnswer = bef.group !== 'should-decline';
    const worse = wantsAnswer ? ra < rb : ra > rb;
    notes.push(`${worse ? 'REGRESSION' : 'change'}: answered ${bef.answeredRate} → ${aft.answeredRate}`);
    if (worse) regressions++;
  }
  if (!same(bef.citedWorkflows, aft.citedWorkflows)) {
    notes.push(`cited: [${bef.citedWorkflows.join(', ')}] → [${aft.citedWorkflows.join(', ')}]`);
  }
  if (!same(bef.positions, aft.positions)) {
    notes.push(`position: [${bef.positions.join(', ')}] → [${aft.positions.join(', ')}]`);
  }
  if (aft.errors?.length && !bef.errors?.length) notes.push(`new errors: ${aft.errors[0]}`);

  if (notes.length) {
    changes++;
    console.log(`  ${id}  ${bef.question}`);
    for (const n of notes) console.log(`        ${n}`);
    console.log(`        before: ${(bef.answers[0] ?? '').slice(0, 160).replace(/\s+/g, ' ')}`);
    console.log(`        after:  ${(aft.answers[0] ?? '').slice(0, 160).replace(/\s+/g, ' ')}\n`);
  }
}

console.log(
  changes === 0
    ? '  No decision-level changes. (Wording will differ; that is expected and not reported.)\n'
    : `  ${changes} question(s) changed · ${regressions} look like regressions.\n`,
);
process.exit(regressions > 0 ? 1 : 0);
