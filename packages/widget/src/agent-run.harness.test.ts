import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startConsentedRun, type RunContract, type RunStep } from './agent-run.js';

/**
 * P3-M2 slice 3 — the minimal ACTED-RUN HARNESS (the coverage hole agent.md §A2.11 names: "until
 * it exists, whether a whole run still behaves is a manual E2E question"). A compiled plan is
 * driven over a real jsdom fixture page with a stubbed wire; what is pinned is the RUN's behavior
 * end to end — audit event order, the rejection path, and EC-7's newly-visible marker semantics —
 * not any one function. Deliberately OUT (stays manual E2E): hard-navigation unload/resume.
 *
 * Time: everything is fake-timer driven — settle windows (500ms quiet / 3s cap), the delayed
 * second rejection sample, and the observer poll all advance through `run()` below.
 */

type Recorded = { event: string; [k: string]: unknown };

let audit: Recorded[] = [];
let plan: { title: string; planHash: string; steps: RunStep[]; contract?: RunContract };

function stubWire(): void {
  vi.stubGlobal('fetch', (async (url: unknown, init?: { body?: unknown }) => {
    const u = String(url);
    if (u.includes('/v1/copilot/execution-plan')) {
      return { ok: true, status: 200, json: async () => plan } as Response;
    }
    if (u.includes('/v1/copilot/run')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as Recorded;
      audit.push(body);
      return { ok: true, status: 200, json: async () => ({ ok: true, runId: 'run-1' }) } as Response;
    }
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch);
}

const cfg = { apiBase: 'http://api.test', key: 'wk_test', reason: false };
const offer = () => ({ key: 'src:0', title: plan.title, planHash: plan.planHash, prefills: {} });

function clickStep(index: number, css: string, over: Partial<RunStep> = {}): RunStep {
  return {
    index,
    verb: 'click',
    instruction: `Click ${css}`,
    route: '/projects',
    locators: [{ strategy: 'css', value: css }],
    ...over,
  };
}

const CONTRACT: RunContract = {
  v: 1,
  entry: { route: '/projects', start: 'anywhere' },
  outcome: { route: '/projects', appeared: ['Invitation sent'] },
};

/** Advance fake time in small slices so chained awaits (settle → recheck → next step) progress. */
async function run(ms: number): Promise<void> {
  for (let t = 0; t < ms; t += 100) await vi.advanceTimersByTimeAsync(100);
}

async function startRun(hooks: { onNarrate?: (t: string) => void } = {}): Promise<void> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  const started = startConsentedRun(root, cfg, hooks, offer(), undefined);
  await vi.advanceTimersByTimeAsync(0); // flush the start + plan fetches
  expect(await started).toBe('started');
}

beforeEach(() => {
  vi.useFakeTimers();
  audit = [];
  document.body.innerHTML = '';
  stubWire();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the acted run, end to end (jsdom fixture page, stubbed wire)', () => {
  it('a two-step click plan completes verified, with the audit events in order', async () => {
    document.body.innerHTML = `<button id="b1">Invite member</button><button id="b2">Send invite</button>`;
    document.querySelector('#b2')!.addEventListener('click', () => {
      const done = document.createElement('div');
      done.setAttribute('role', 'status');
      done.textContent = 'Invitation sent';
      document.body.appendChild(done);
    });
    plan = {
      title: 'Invite a teammate',
      planHash: 'h1',
      steps: [clickStep(1, '#b1'), clickStep(2, '#b2', { expect: { appeared: ['Invitation sent'] } })],
      contract: CONTRACT,
    };

    await startRun();
    await run(12_000);

    expect(audit.map((a) => a.event)).toEqual(['start', 'step', 'step', 'completed']);
    expect(audit[1]).toMatchObject({ step: 1, outcome: 'acted' });
    expect(typeof audit[1]!.ms).toBe('number');
    expect(audit[2]).toMatchObject({ step: 2, outcome: 'acted' });
    expect(audit[3]).toMatchObject({ event: 'completed', verified: true }); // the Done check SAW the finish
  });

  it('a fresh rejection surface beats completion evidence: the app’s words are audited and the step hands back', async () => {
    document.body.innerHTML = `<button id="b1">Send invite</button>`;
    document.querySelector('#b1')!.addEventListener('click', () => {
      const alert = document.createElement('div');
      alert.setAttribute('role', 'alert');
      alert.textContent = 'Seat limit reached';
      document.body.appendChild(alert);
    });
    plan = { title: 'Invite a teammate', planHash: 'h2', steps: [clickStep(1, '#b1')], contract: CONTRACT };

    const onNarrate = vi.fn();
    await startRun({ onNarrate });
    await run(8_000);

    const failure = audit.find((a) => a.event === 'failure');
    expect(failure).toMatchObject({ kind: 'rejected', step: 1, reason: 'Seat limit reached' });
    expect(audit.some((a) => a.event === 'step')).toBe(false); // never completed
    expect(audit.some((a) => a.event === 'completed')).toBe(false);
    expect(onNarrate.mock.calls.some(([t]) => String(t).includes('Seat limit reached'))).toBe(true);
  });

  it('EC-7: a marker that could have newly appeared and didn’t is a marker-miss hand-back — presence alone no longer completes', async () => {
    document.body.innerHTML = `<div>Already here</div><button id="b1">Do it</button>`; // click changes nothing
    plan = {
      title: 'Phantom success',
      planHash: 'h3',
      steps: [clickStep(1, '#b1', { expect: { appeared: ['Already here', 'Never appears'] } })],
    };

    await startRun();
    await run(8_000);

    const failure = audit.find((a) => a.event === 'failure');
    expect(failure).toMatchObject({ kind: 'marker-miss', step: 1 });
    expect(audit.some((a) => a.event === 'step')).toBe(false);
  });

  it('EC-7: ALL markers pre-visible falls back to presence — the step completes, stamped presat for the founder’s numbers', async () => {
    document.body.innerHTML = `<div>Already here</div><button id="b1">Do it</button>`;
    plan = {
      title: 'Vacuous phrases',
      planHash: 'h4',
      steps: [clickStep(1, '#b1', { expect: { appeared: ['Already here'] } })],
    };

    await startRun();
    await run(8_000);

    const step = audit.find((a) => a.event === 'step');
    expect(step).toMatchObject({ step: 1, outcome: 'acted', presat: true });
    expect(audit.some((a) => a.event === 'completed')).toBe(true); // no contract outcome facts → no stamp
    expect(audit.find((a) => a.event === 'completed')!.verified).toBeUndefined();
  });
});
