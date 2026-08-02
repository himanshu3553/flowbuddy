#!/usr/bin/env node
// REASON FIXTURES — the diagnostic path's first automated coverage (agent.md §9 Gap 3's hard
// prerequisite). Sibling to copilot-baseline.mjs, deliberately NOT a mode inside it: that harness
// measures the TEXT path over a question set and reports a covered rate, this one replays frozen
// page states and asserts what the answer said and what it reached for. Two different measurements
// wearing one flag would make both headers lie.
//
// WHY THIS EXISTS. `REASON_SYSTEM` is the most heavily tuned prompt in the product — ten diagnosis
// rules, each learned from a real session it got wrong — and it has never had a single automated
// check. Any change to it (and above all folding it into the agent loop) is currently shipped on a
// hunch, with no way to detect that diagnosis got worse. That is not hypothetical: an earlier stage
// introduced a 1-in-6 decline on a trivially-covered question and it was caught ONLY because that
// path happened to be measurable.
//
// WHY FIXTURES RATHER THAN A LIVE PAGE. Testing diagnosis has always meant "go re-record something
// and click around", so it never happened. A committed snapshot is testable from a cold checkout,
// survives every database wipe, and pins the exact page state a rule was learned from. It is also
// the ONLY form of copilot testing that outlives the workspace it was captured in — the question-set
// baselines do not (their cells are tuned to specific workflows in a specific workspace).
//
// WHY EACH FIXTURE CARRIES SENSE TOO. The server attaches the founder's expected-state artifacts off
// the top SENSE hypothesis, so a snapshot ALONE binds only get_page_image and silently measures a
// one-tool version of the engine. Both halves are captured from the same moment on the same page.
//
// WHY THE WORKFLOW IS NAMED, NOT KEYED. A fixture that hard-coded `sourceId:segmentIndex` would be
// born broken on the next reseed: the ids change, the server drops the hypotheses as unapproved,
// and every fixture would quietly degrade to unlocalized WHILE STILL REPORTING A RATE. So a fixture
// stores the workflow TITLE and this script re-resolves the key from the live sense plan each run.
// No match = the row is INVALID and says so; it is never scored.
//
// Reported as RATES (3/3), never pass/fail: the model is non-deterministic and a binary would flap.
//
// Usage:
//   node scripts/reason-fixtures.mjs --key pk_xxx [--api http://localhost:8787]
//                                    [--runs 3] [--only empty-form] [--out capture.json]
//                                    [--dir path/to/scratch-fixtures] [--delay 11000]
//
// Capture recipe (how a fixture file is produced): docs/ops/e2e-testing.md

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// The scoring rules live apart so they can be unit-tested — this file cannot be imported (argv,
// exits, network at the top level). See scripts/reason-assertions.mjs.
import { scoreRun } from './reason-assertions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// `--dir` points at a scratch fixture folder — for iterating on a capture before committing it, and
// for driving the harness against a stub while there is no workspace to point it at.
const FIXTURE_DIR = arg('dir', join(HERE, 'reason-fixtures'));

const api = arg('api', 'http://localhost:8787').replace(/\/+$/, '');
const key = arg('key', process.env.FLOWBUDDY_COPILOT_KEY);
const runs = Number(arg('runs', '3'));
const out = arg('out', join(HERE, `reason-fixtures-${new Date().toISOString().slice(0, 10)}.json`));
// The diagnostic path has its OWN per-key ceiling (REASON_MAX_PER_WINDOW = 6/min) on top of the
// route's 30/min — far tighter than the text baseline's, so pace against the tighter one or most of
// a run degrades to the fast path and the whole capture measures the wrong engine.
const delayMs = Number(arg('delay', '11000'));

if (!key) {
  console.error('Missing --key (the workspace PUBLIC copilot key, pk_...). Studio → Copilot shows it.');
  process.exit(1);
}

const only = arg('only', '').split(',').map((s) => s.trim()).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── One replay ──────────────────────────────────────────────────────────────────────────────────

async function askWithFixture(fx, hypothesis) {
  const res = await fetch(`${api}/v1/copilot/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-FlowBuddy-Key': key },
    body: JSON.stringify({
      question: fx.question,
      history: [],
      context: {
        path: fx.path ?? fx.snapshot?.path ?? '',
        // Assembled exactly as the widget assembles it, so a replay reproduces production rather
        // than an idealised version of it (postAnswer in packages/widget/src/index.ts).
        ...(hypothesis ? { sense: { probed: true, tie: false, hypotheses: [hypothesis] } } : {}),
        reason: { available: true, trigger: fx.trigger ?? 'intent', snapshot: fx.snapshot },
      },
      preview: true, // identical answer path, zero analytics writes — and the only path that returns loop stats
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data.error ?? data.message ?? 'request failed' };
  return {
    ok: true,
    covered: data.covered === true,
    answer: data.answer ?? data.reason ?? '',
    engine: data.engine ?? null,
    rounds: data.loop?.rounds ?? null,
    // Only calls that actually RAN count as evidence the model examined something; a `skipped` entry
    // is the loop refusing a duplicate or a budget overrun, not a look at the page.
    tools: (data.loop?.toolCalls ?? []).filter((t) => !t.skipped).map((t) => t.name),
    blockers: data.blockers ?? [],
  };
}

// ── Load fixtures ───────────────────────────────────────────────────────────────────────────────

if (!existsSync(FIXTURE_DIR)) {
  console.error(`No fixture directory at ${FIXTURE_DIR}.`);
  process.exit(1);
}
// `_`-prefixed files are documentation (the template), not fixtures.
const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
const fixtures = files
  .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf8')) }))
  .filter((fx) => !only.length || only.some((o) => fx.id === o || fx.file.startsWith(o)));

if (fixtures.length === 0) {
  console.error(
    `No fixtures to run in ${FIXTURE_DIR}.\n` +
      'Capture one first — the recipe is in docs/ops/e2e-testing.md (embed the widget with\n' +
      'data-flowbuddy-debug="true", put the page in the state you want, ask a diagnostic question,\n' +
      'then copy window.FlowBuddyLastAsk out of the console).',
  );
  process.exit(1);
}

// ── Resolve each fixture's workflow against the LIVE sense plan (the anti-rot step) ─────────────

/**
 * A fixture names its workflow; this turns that name into the live `sourceId:segmentIndex`.
 *
 * `blocked` is the important half. A fixture that DECLARES a workflow and cannot resolve it must
 * not be scored at all: the request would still answer, still produce a covered rate, and still
 * look like a result — while measuring a version of the engine with the founder's expected-state
 * tools never bound. Warning and scoring anyway is precisely the silent degradation this whole
 * name-don't-key design exists to prevent, so an unresolved workflow HALTS the row instead.
 *
 * A fixture that declares NO workflow is a different thing: unlocalized on purpose, scored normally.
 */
async function senseHypothesis(fx) {
  if (!fx.workflow?.title) {
    return { hypothesis: null, blocked: false, note: 'fixture declares no workflow — expected-state tools will not bind' };
  }
  const route = fx.path ?? fx.snapshot?.path ?? '';
  let plan;
  try {
    const res = await fetch(`${api}/v1/copilot/sense-plan?route=${encodeURIComponent(route)}`, {
      headers: { 'X-FlowBuddy-Key': key },
    });
    plan = await res.json().catch(() => ({}));
    if (!res.ok) return { hypothesis: null, blocked: true, note: `sense-plan request failed (${res.status})` };
  } catch (e) {
    return { hypothesis: null, blocked: true, note: `sense-plan request failed (${e})` };
  }
  if (plan.enabled === false) {
    return { hypothesis: null, blocked: true, note: 'Sense is OFF for this workspace — turn it on, or this fixture cannot localize' };
  }
  const wf = (plan.workflows ?? []).find((w) => w.title === fx.workflow.title);
  if (!wf) {
    return {
      hypothesis: null,
      blocked: true,
      note: `workflow "${fx.workflow.title}" is not in the live sense plan for ${route} — re-record/approve it, or re-capture this fixture`,
    };
  }
  const totalSteps = wf.steps?.length ?? 0;
  const step = Math.min(Math.max(1, fx.workflow.step ?? 1), Math.max(1, totalSteps));
  return {
    hypothesis: {
      sourceId: wf.sourceId,
      segmentIndex: wf.segmentIndex,
      step,
      totalSteps,
      confidence: fx.workflow.confidence ?? 0.8,
      stepsDone: (fx.workflow.stepsDone ?? []).filter((n) => n >= 1 && n <= totalSteps),
    },
    blocked: false,
    note: null,
  };
}

// ── Run ─────────────────────────────────────────────────────────────────────────────────────────

console.log(`\nReason fixtures · ${fixtures.length} fixture(s) × ${runs} run(s) → ${api}\n`);

const results = [];
for (const fx of fixtures) {
  const { hypothesis, blocked, note } = await senseHypothesis(fx);
  const id = fx.id ?? fx.file.replace(/\.json$/, '');

  // Not runnable = not scored. Emitting rates for a fixture we know is mis-set-up is how a suite
  // starts lying: the numbers read fine and nobody re-reads the warning above them.
  if (blocked) {
    console.log(`  ${id}${fx.label ? ` — ${fx.label}` : ''}`);
    console.log(`      "${fx.question}"`);
    console.log(`      ⛔ SKIPPED — ${note}\n`);
    results.push({ id, label: fx.label ?? '', question: fx.question, skipped: true, note });
    continue;
  }

  const attempts = [];
  for (let i = 0; i < runs; i++) {
    try {
      attempts.push(await askWithFixture(fx, hypothesis));
    } catch (e) {
      attempts.push({ ok: false, error: String(e) });
    }
    const last = attempts[attempts.length - 1];
    // A 429 here is either the route's limiter, Reason's own 6/min ceiling, or the provider's
    // (including credit exhaustion). Back off — a saturated window clears, exhausted credits do not,
    // and the row's error text says which one you got.
    await sleep(!last.ok && last.status === 429 ? 30_000 : delayMs);
  }

  const good = attempts.filter((a) => a.ok);
  const scored = good.map((a) => ({ a, s: scoreRun(fx, a) }));
  const valid = scored.filter((x) => x.s);
  const rate = (pred) => `${valid.filter((x) => pred(x.s)).length}/${valid.length}`;

  const row = {
    id,
    label: fx.label ?? '',
    question: fx.question,
    path: fx.path ?? fx.snapshot?.path ?? '',
    workflow: fx.workflow?.title ?? null,
    localized: Boolean(hypothesis),
    // >0 means some runs never reached the diagnostic engine (Reason toggle off, rate-limited into
    // the fast path, or the engine threw and the AI Chatbot floor answered). Those runs measure
    // nothing about diagnosis and are excluded from every rate below rather than scored as failures.
    invalidRuns: good.length - valid.length,
    ...(note ? { note } : {}),
    enginesSeen: [...new Set(good.map((a) => a.engine).filter(Boolean))],
    covered: rate((s) => s.covered),
    noVocabularyLeak: rate((s) => s.noLeaks),
    coversAllBlockers: rate((s) => s.blockersCovered),
    mustMention: rate((s) => s.mustMention.length === 0),
    toolExpectations: rate((s) => s.toolsMissing.length === 0 && s.toolsForbidden.length === 0),
    rounds: [...new Set(valid.map((x) => x.a.rounds).filter((n) => n !== null))],
    toolsUsed: [...new Set(valid.flatMap((x) => x.a.tools))],
    // The specifics behind any rate that is not perfect — what leaked, what went unaddressed.
    failures: valid
      .map((x, i) => ({
        run: i + 1,
        ...(x.s.leaks.length ? { vocabularyLeaks: x.s.leaks } : {}),
        ...(x.s.missedBlockers.length ? { missedBlockers: x.s.missedBlockers } : {}),
        ...(x.s.mustMention.length ? { missingPhrases: x.s.mustMention } : {}),
        ...(x.s.mustNotMention.length ? { forbiddenPhrases: x.s.mustNotMention } : {}),
        ...(x.s.toolsMissing.length ? { toolsNotCalled: x.s.toolsMissing } : {}),
        ...(x.s.toolsForbidden.length ? { toolsWronglyCalled: x.s.toolsForbidden } : {}),
        ...(x.s.covered ? {} : { coveredMismatch: true }),
      }))
      .filter((f) => Object.keys(f).length > 1),
    errors: attempts.filter((a) => !a.ok).map((a) => a.error ?? `HTTP ${a.status}`),
    answers: valid.map((x) => x.a.answer),
  };
  results.push(row);

  console.log(`  ${row.id}${row.label ? ` — ${row.label}` : ''}`);
  console.log(`      "${row.question}"`);
  if (note) console.log(`      ⚠ ${note}`);
  if (row.invalidRuns) console.log(`      ⚠ ${row.invalidRuns} run(s) never reached the diagnostic engine (saw: ${row.enginesSeen.join(', ') || 'nothing'}) — excluded from the rates`);
  if (row.errors.length) console.log(`      ⚠ ${row.errors[0]}`);
  if (valid.length) {
    console.log(
      `      covered ${row.covered} · plain-language ${row.noVocabularyLeak} · blockers ${row.coversAllBlockers} · phrases ${row.mustMention} · tools ${row.toolExpectations}`,
    );
    if (row.toolsUsed.length) console.log(`      reached for: ${row.toolsUsed.join(', ')}`);
    for (const f of row.failures) console.log(`      ✗ run ${f.run}: ${JSON.stringify({ ...f, run: undefined })}`);
  } else {
    console.log('      ⛔ no valid runs — nothing measured');
  }
  console.log('');
}

// HOW MUCH OF THIS CAPTURE IS REAL. A suite that quietly measured half of what it claims is the
// failure mode worth shouting about: the per-fixture warnings scroll past, the rates read fine, and
// a capture gets compared against a later one as though both covered the same ground.
const skipped = results.filter((r) => r.skipped);
const partial = results.filter((r) => !r.skipped && r.invalidRuns > 0);
const measured = results.filter((r) => !r.skipped && r.invalidRuns === 0);
console.log(`  ${measured.length}/${results.length} fixture(s) fully measured.`);
if (skipped.length) console.log(`  ⛔ ${skipped.length} skipped (not runnable): ${skipped.map((r) => r.id).join(', ')}`);
if (partial.length) console.log(`  ⚠ ${partial.length} partly invalid (some runs missed the diagnostic engine): ${partial.map((r) => r.id).join(', ')}`);

writeFileSync(
  out,
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      api,
      runs,
      fixtures: files,
      // Carried into the file so a later comparison can tell "this rate got worse" from "this
      // fixture stopped running" without re-reading the console output that no longer exists.
      measured: measured.length,
      skipped: skipped.map((r) => r.id),
      results,
    },
    null,
    2,
  ),
);
console.log(`\nSaved → ${out}\n`);
