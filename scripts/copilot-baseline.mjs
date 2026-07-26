#!/usr/bin/env node
// Copilot answer baseline — capture how the copilot answers a fixed question set, so a change to
// the answer path can be compared against what it did before (added 2026-07-26, ahead of mode 2).
//
// WHY IT COMPARES WHAT IT COMPARES. The answer model runs at temperature 0.2, so the PROSE differs
// between two runs of identical code. Diffing answer text would drown a real regression in noise.
// What IS comparable is the shape of the decision:
//
//   covered      did it answer, or honestly decline?   ← the signal that matters most
//   citations    which approved workflows did it use?
//   position     did it work out where the user is?
//
// So each question is asked several times and reported as a RATE (answered 3/3, 1/3, 0/3). A
// question that flips from 3/3 to 0/3 is a regression; one whose wording changed is not.
//
// Runs in `preview` mode: the identical answer path, but the API skips analytics writes — a
// baseline must never pollute the founder's own numbers with dozens of synthetic questions.
//
// LIMITATION: this is the TEXT path only. It sends no page context, so questions that depend on
// live page state ("why can't I create the account?") exercise the fast path here, not the
// diagnostic one. Those still need a real browser — see docs/e2e-testing.md.
//
// Usage:
//   node scripts/copilot-baseline.mjs --key pk_xxx [--api http://localhost:8787]
//                                     [--runs 3] [--out baseline.json] [--path /some/route]

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const api = (arg('api', 'http://localhost:8787')).replace(/\/+$/, '');
const key = arg('key', process.env.FLOWBUDDY_COPILOT_KEY);
const runs = Number(arg('runs', '3'));
const out = arg('out', join(HERE, `baseline-${Date.now()}.json`));
const contextPath = arg('path', '');
// The API allows 30 requests per minute per key; pace under it rather than tripping the limiter.
const delayMs = Number(arg('delay', '2300'));

if (!key) {
  console.error('Missing --key (the workspace PUBLIC copilot key, pk_...). Studio → Copilot shows it.');
  process.exit(1);
}

// `--only h` / `--only h2,f1` narrows the run while iterating on a prompt — a full capture is 30
// model calls, and burning all of them to check one question is waste. Baselines you intend to
// COMPARE should always be full runs, so the diff has every question on both sides.
const only = arg('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allQuestions = JSON.parse(readFileSync(join(HERE, 'copilot-baseline-questions.json'), 'utf8'));
const questions = only.length
  ? allQuestions.filter((q) => only.some((o) => q.id === o || q.group === o || q.id.startsWith(o)))
  : allQuestions;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(question) {
  const res = await fetch(`${api}/v1/copilot/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-FlowBuddy-Key': key },
    body: JSON.stringify({
      question,
      history: [],
      context: contextPath ? { path: contextPath } : {},
      preview: true, // identical answer path, zero analytics writes
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data.error ?? 'request failed' };
  return {
    ok: true,
    covered: data.covered === true,
    answer: data.answer ?? data.reason ?? '',
    citations: (data.citations ?? [])
      .map((c) => c.segmentTitle)
      .filter(Boolean)
      .filter((t, i, a) => a.indexOf(t) === i),
    position: data.position ? `${data.position.sourceId}:${data.position.segmentIndex}#${data.position.step}` : null,
    // Copilot mode only — what the assistant decided to do ON the page. Absent in AI Chatbot.
    intents: data.intents ?? null,
  };
}

console.log(`\nBaseline · ${questions.length} questions × ${runs} run(s) → ${api}\n`);

const results = [];
for (const item of questions) {
  const attempts = [];
  for (let r = 0; r < runs; r++) {
    try {
      attempts.push(await ask(item.q));
    } catch (e) {
      attempts.push({ ok: false, error: String(e) });
    }
    await sleep(delayMs);
  }
  const good = attempts.filter((a) => a.ok);
  const coveredCount = good.filter((a) => a.covered).length;
  const cited = [...new Set(good.flatMap((a) => a.citations))].sort();
  const row = {
    id: item.id,
    group: item.group,
    question: item.q,
    answeredRate: `${coveredCount}/${attempts.length}`,
    citedWorkflows: cited,
    positions: [...new Set(good.map((a) => a.position).filter(Boolean))],
    intents: [...new Set(good.map((a) => (a.intents ? JSON.stringify(a.intents) : null)).filter(Boolean))],
    errors: attempts.filter((a) => !a.ok).map((a) => a.error ?? `HTTP ${a.status}`),
    answers: good.map((a) => a.answer),
  };
  results.push(row);
  const flag = row.errors.length ? '  ⚠ ' + row.errors[0] : '';
  console.log(
    `  ${item.id.padEnd(3)} ${row.answeredRate.padEnd(5)} ${item.group.padEnd(14)} ${item.q}${flag}`,
  );
  if (cited.length) console.log(`        cited: ${cited.join(' · ')}`);
}

const summary = {
  capturedAt: new Date().toISOString(),
  api,
  runs,
  contextPath: contextPath || null,
  results,
};
writeFileSync(out, JSON.stringify(summary, null, 2));

console.log(`\nSaved → ${out}`);
console.log('Compare a later capture with:  node scripts/copilot-baseline-diff.mjs <before.json> <after.json>\n');
