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
// MULTI-TURN (2026-07-29). A question may carry `after`: the turns to play FIRST, so the question
// under test arrives as a FOLLOW-UP with real conversation state behind it. This exists because a
// whole class of failure is invisible to a single-question harness — the copilot shipped for months
// answering the PREVIOUS question whenever a conversation changed subject, and every question here
// passed throughout, because none of them had a conversation in front of them. The setup turns are
// asked for real (not canned) so they cannot rot as the KB changes, and each run replays them fresh.
//
// LIMITATION: this is the TEXT path only. It sends `--path` when given but never live page STATE,
// so questions that depend on it ("why can't I create the account?") exercise the fast path here,
// not the diagnostic one. Those still need a real browser — see docs/e2e-testing.md.
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

async function ask(question, history = [], lastCited = []) {
  const res = await fetch(`${api}/v1/copilot/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-FlowBuddy-Key': key },
    body: JSON.stringify({
      question,
      history,
      context: {
        ...(contextPath ? { path: contextPath } : {}),
        // Sent exactly as the widget sends it, so a multi-turn case reproduces production rather
        // than an idealised version of it.
        ...(lastCited.length ? { lastCited } : {}),
      },
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
    // The raw keys, for `lastCited` on a following turn (the widget's continuity payload).
    citedKeys: (data.citations ?? [])
      .filter((c) => typeof c.sourceId === 'string' && Number.isInteger(c.segmentIndex))
      .map((c) => ({ sourceId: c.sourceId, segmentIndex: c.segmentIndex }))
      .slice(0, 4),
    position: data.position ? `${data.position.sourceId}:${data.position.segmentIndex}#${data.position.step}` : null,
    // Copilot mode only — what the assistant decided to do ON the page. Absent in AI Chatbot.
    intents: data.intents ?? null,
  };
}

/**
 * Play a question's `after` turns for real, and return the conversation state they leave behind.
 *
 * WHY THE SETUP TURNS ARE ASKED RATHER THAN CANNED (2026-07-29). A question that only fails as a
 * FOLLOW-UP is invisible to a single-question harness — which is exactly how the copilot shipped
 * for months answering the PREVIOUS question whenever a conversation changed subject. Hard-coding
 * a prior answer would have worked too, but it rots: the moment the KB is re-recorded the canned
 * text stops matching what the copilot would really have said, and the case quietly stops
 * reproducing. Asking for real costs one extra call per turn and always stays true.
 *
 * `priorAnswered` is reported so a case whose SETUP declined is visibly invalid rather than
 * silently counted as a failure of the question under test.
 */
async function playSetup(turns) {
  const history = [];
  let lastCited = [];
  let priorAnswered = true;
  for (const t of turns) {
    const r = await ask(t, history, lastCited);
    if (!r.ok || !r.covered) priorAnswered = false;
    history.push({ role: 'user', content: t });
    history.push({ role: 'assistant', content: r.ok ? r.answer : '' });
    if (r.ok && r.citedKeys.length) lastCited = r.citedKeys;
    await sleep(delayMs);
  }
  return { history, lastCited, priorAnswered };
}

console.log(`\nBaseline · ${questions.length} questions × ${runs} run(s) → ${api}\n`);

const results = [];
for (const item of questions) {
  // `after` = the turns that must happen BEFORE this question, replayed fresh on every run so the
  // conversation state is real rather than reused. A string is shorthand for a single turn.
  const setupTurns = item.after ? (Array.isArray(item.after) ? item.after : [item.after]) : [];
  const attempts = [];
  let setupFailures = 0;
  for (let r = 0; r < runs; r++) {
    try {
      const { history, lastCited, priorAnswered } = setupTurns.length
        ? await playSetup(setupTurns)
        : { history: [], lastCited: [], priorAnswered: true };
      if (!priorAnswered) setupFailures++;
      attempts.push(await ask(item.q, history, lastCited));
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
    ...(setupTurns.length ? { after: setupTurns } : {}),
    // >0 means the SETUP turn declined on some runs, so this row measures a broken conversation
    // rather than the question under test. Investigate before reading its rate as a result.
    ...(setupFailures ? { setupFailures } : {}),
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
  if (setupTurns.length) {
    console.log(`        after: ${setupTurns.map((t) => `"${t}"`).join(' → ')}`);
    if (setupFailures) console.log(`        ⚠ the setup turn declined on ${setupFailures}/${runs} run(s) — this row is not measuring what it looks like`);
  }
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
