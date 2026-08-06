import { describe, expect, it } from 'vitest';
import type { CapturedEvent } from '@flowbuddy/shared';
import {
  attachOutcomeMarkers,
  compileExecutionPlan,
  extractAppearedMarkers,
  hashSteps,
  markerSnapshotRefs,
  planSummary,
  stableStringify,
  type ExecutionStepSource,
} from './execution-plan';

/**
 * P4-M1 — the execution-plan compiler and the eligibility analyzer.
 *
 * WHY THESE. This is the first acting code in the product, and its two failure directions are not
 * symmetric: a plan that over-blocks costs the founder a toggle; a plan that under-blocks puts the
 * executor in front of a live customer with a step it cannot drive — the exact "discovered mid-run"
 * failure §A2.9 exists to prevent. Every eligibility class therefore gets a pinned test, and so
 * does the hash (it pins CONSENT — an unstable hash would make every run look non-consented, and a
 * loose one would let content drift under a consent).
 */

let seq = 0;
function ev(partial: Partial<CapturedEvent> & { type: string }): CapturedEvent {
  seq += 1;
  return {
    id: partial.id ?? `e${seq}`,
    t: seq * 1000,
    target: {},
    route: { url: 'https://app.example.com/projects', path: '/projects', hash: '', title: 'Projects' },
    ...partial,
  } as CapturedEvent;
}

function clickEvent(id: string, over: Partial<CapturedEvent> = {}): CapturedEvent {
  return ev({
    id,
    type: 'click',
    target: {
      tag: 'button',
      accessibleName: 'New project',
      locators: [
        { strategy: 'testid', value: '[data-testid="new-project"]', unique: true },
        { strategy: 'css', value: 'button.new' },
      ],
    },
    ...over,
  });
}

function fillEvent(id: string, over: Partial<CapturedEvent> = {}): CapturedEvent {
  return ev({
    id,
    type: 'input',
    target: {
      tag: 'input',
      accessibleName: 'Project name',
      attributes: { type: 'text', name: 'name' },
      locators: [{ strategy: 'name', value: 'input[name="name"]', unique: true }],
    },
    ...over,
  });
}

const step = (keyEventId: string, instruction = 'Do the thing'): ExecutionStepSource => ({
  instruction,
  route: '/projects',
  keyEventId,
});

describe('compileExecutionPlan — verbs, slots, flags', () => {
  it('compiles click / fill / check / select with input slots on the value-bearing verbs', () => {
    const events = [
      clickEvent('c1'),
      fillEvent('f1'),
      fillEvent('cb1', {
        target: {
          tag: 'input',
          accessibleName: 'Make it private',
          attributes: { type: 'checkbox' },
          locators: [{ strategy: 'id', value: '#private' }],
        },
      }),
      fillEvent('s1', {
        target: {
          tag: 'select',
          accessibleName: 'Plan',
          attributes: {},
          locators: [{ strategy: 'id', value: '#plan' }],
        },
      }),
    ];
    const { steps, eligible, issues } = compileExecutionPlan({
      steps: [step('c1'), step('f1'), step('cb1'), step('s1')],
      events,
    });
    expect(issues).toEqual([]);
    expect(eligible).toBe(true);
    expect(steps.map((s) => s.verb)).toEqual(['click', 'fill', 'check', 'select']);
    expect(steps[0]!.inputSlot).toBeUndefined();
    expect(steps[1]!.inputSlot).toEqual({ label: 'Project name', sensitive: false });
    expect(steps[2]!.inputSlot?.label).toBe('Make it private');
    expect(steps[3]!.inputSlot?.label).toBe('Plan');
  });

  it('marks password and cc-* fields sensitive (D3 hard rule) and submit-shaped steps destructive', () => {
    const events = [
      fillEvent('pw', {
        target: {
          tag: 'input',
          accessibleName: 'Password',
          attributes: { type: 'password' },
          locators: [{ strategy: 'id', value: '#pw' }],
        },
      }),
      fillEvent('cc', {
        target: {
          tag: 'input',
          accessibleName: 'Card number',
          attributes: { type: 'text', autocomplete: 'cc-number' },
          locators: [{ strategy: 'id', value: '#cc' }],
        },
      }),
      clickEvent('sub', {
        target: {
          tag: 'button',
          accessibleName: 'Create account',
          attributes: { type: 'submit' },
          locators: [{ strategy: 'css', value: 'button[type=submit]' }],
        },
      }),
      clickEvent('del', {
        target: {
          tag: 'button',
          accessibleName: 'Delete project',
          locators: [{ strategy: 'text', value: 'Delete project' }],
        },
      }),
    ];
    const { steps, eligible } = compileExecutionPlan({
      steps: [step('pw'), step('cc'), step('sub'), step('del')],
      events,
    });
    expect(eligible).toBe(true);
    expect(steps[0]!.inputSlot).toEqual({ label: 'Password', sensitive: true });
    expect(steps[1]!.inputSlot?.sensitive).toBe(true);
    expect(steps[2]!.destructive).toBe(true);
    expect(steps[3]!.destructive).toBe(true);
    expect(steps[0]!.destructive).toBeUndefined();
  });

  it('emits postRoute only when the PATTERN changes — /projects/123 → /projects/456 is the same screen', () => {
    const events = [
      clickEvent('nav1', {
        postAction: {
          route: { url: 'https://app.example.com/settings', path: '/settings', hash: '', title: '' },
        },
      }),
      clickEvent('same', {
        route: { url: 'https://app.example.com/projects/123', path: '/projects/123', hash: '', title: '' },
        postAction: {
          route: { url: 'https://app.example.com/projects/456', path: '/projects/456', hash: '', title: '' },
        },
      }),
    ];
    const { steps } = compileExecutionPlan({ steps: [step('nav1'), step('same')], events });
    expect(steps[0]!.postRoute).toBe('/settings');
    expect(steps[1]!.postRoute).toBeUndefined();
  });

  it('recovers pre-keyEventId steps by screenshot file, like the sense plan does', () => {
    const events = [
      clickEvent('old', { screenshot: { file: 'shot-7.webp' } }),
    ];
    const { steps, eligible } = compileExecutionPlan({
      steps: [{ instruction: 'Click it', route: '/projects', screenshotFile: 'shot-7.webp' }],
      events,
    });
    expect(eligible).toBe(true);
    expect(steps[0]!.verb).toBe('click');
  });
});

describe('compileExecutionPlan — eligibility (§A2.9: refused at enable time, never mid-run)', () => {
  it('refuses an empty workflow', () => {
    const { eligible, issues } = compileExecutionPlan({ steps: [], events: [] });
    expect(eligible).toBe(false);
    expect(issues.map((i) => i.code)).toEqual(['no-steps']);
  });

  it('refuses a step whose captured event cannot be recovered', () => {
    const { eligible, issues } = compileExecutionPlan({
      steps: [step('missing')],
      events: [clickEvent('other')],
    });
    expect(eligible).toBe(false);
    expect(issues[0]).toMatchObject({ step: 1, code: 'unanchored' });
  });

  it('refuses framed targets, unsupported actions, and locator-less steps', () => {
    const events = [
      clickEvent('framed', {
        target: { tag: 'input', framePath: 'iframe#stripe', locators: [{ strategy: 'id', value: '#x' }] },
      }),
      ev({ id: 'key', type: 'keydown', target: { tag: 'body' } }),
      clickEvent('bare', { target: { tag: 'button' } }),
    ];
    const { eligible, issues } = compileExecutionPlan({
      steps: [step('framed'), step('key'), step('bare')],
      events,
    });
    expect(eligible).toBe(false);
    expect(issues.map((i) => i.code)).toEqual(['framed-target', 'unsupported-action', 'no-locator']);
    expect(issues.every((i, n) => i.step === n + 1)).toBe(true);
  });

  it('a file input compiles as a USER-ONLY step — survivable, never disqualifying (2026-08-07)', () => {
    // The rule this replaced ("any file step ⇒ whole workflow ineligible") predated the hand-back
    // machinery. Now the run pauses for the user; the compiled step must say so, and the summary
    // must count it as "yours to do", never as an askable input.
    const events = [
      fillEvent('f1'),
      fillEvent('file', {
        target: {
          tag: 'input',
          accessibleName: 'Upload a document',
          attributes: { type: 'file' },
          locators: [{ strategy: 'id', value: '#f' }],
        },
      }),
    ];
    const { steps, eligible, issues } = compileExecutionPlan({ steps: [step('f1'), step('file')], events });
    expect(issues).toEqual([]);
    expect(eligible).toBe(true);
    expect(steps[1]).toMatchObject({
      verb: 'fill',
      userOnly: true,
      inputSlot: { label: 'Upload a document', sensitive: false },
    });
    expect(steps[0]!.userOnly).toBeUndefined();
    expect(planSummary(steps)).toEqual({ steps: 2, inputs: 1, destructive: 0, manual: 1 });
  });

  it('refuses steps that leave the app’s own origin (OAuth popups, checkout hops)', () => {
    const events = [
      clickEvent('home'),
      clickEvent('away', {
        postAction: {
          route: { url: 'https://accounts.google.com/oauth', path: '/oauth', hash: '', title: '' },
        },
      }),
    ];
    const { eligible, issues } = compileExecutionPlan({ steps: [step('home'), step('away')], events });
    expect(eligible).toBe(false);
    expect(issues[0]).toMatchObject({ step: 2, code: 'foreign-origin' });
  });

  it('allows navigation to a screen, refuses navigation into a record (§A2.5)', () => {
    const screenNav = ev({
      id: 'nav-screen',
      type: 'nav',
      route: { url: 'https://app.example.com/projects', path: '/projects', hash: '', title: '' },
    });
    const recordNav = ev({
      id: 'nav-record',
      type: 'nav',
      route: {
        url: 'https://app.example.com/projects/6a6a49ca1a22045b0b32b353',
        path: '/projects/6a6a49ca1a22045b0b32b353',
        hash: '',
        title: '',
      },
    });
    const ok = compileExecutionPlan({ steps: [step('nav-screen')], events: [screenNav] });
    expect(ok.eligible).toBe(true);
    expect(ok.steps[0]).toMatchObject({ verb: 'navigate', postRoute: '/projects', locators: [] });

    const bad = compileExecutionPlan({ steps: [step('nav-record')], events: [recordNav] });
    expect(bad.eligible).toBe(false);
    expect(bad.issues[0]).toMatchObject({ step: 1, code: 'nav-into-record' });
  });
});

describe('the hash — the consent pin (§A2.2)', () => {
  it('is stable across recompiles and construction order, and moves when content moves', () => {
    const events = [clickEvent('c1'), fillEvent('f1')];
    const a = compileExecutionPlan({ steps: [step('c1'), step('f1')], events });
    const b = compileExecutionPlan({ steps: [step('c1'), step('f1')], events });
    expect(a.hash).toBe(b.hash);

    const changed = compileExecutionPlan({
      steps: [step('c1', 'Do the OTHER thing'), step('f1')],
      events,
    });
    expect(changed.hash).not.toBe(a.hash);
  });

  it('stableStringify sorts keys at every depth and drops undefined', () => {
    expect(stableStringify({ b: 1, a: { d: undefined, c: [2, { z: 1, y: 2 }] } })).toBe(
      '{"a":{"c":[2,{"y":2,"z":1}]},"b":1}',
    );
  });
});

describe('outcome markers (Part 2 — the recorded AFTER, compiled)', () => {
  it('extracts phrases that APPEARED, scrubbed, phrase-sized, capped — never pre-existing or PII lines', () => {
    const pre = `<html><body><h1>Create your account</h1><div class="hint">Use a work email</div></body></html>`;
    const post = `<html><body>
      <script>trackSuccess();</script>
      <h1>Welcome to your dashboard</h1>
      <div role="status">Account created successfully</div>
      <div class="hint">Use a work email</div>
      <div>Signed in as user@acme.com</div>
      <div>42</div>
      <div>OK</div>
    </body></html>`;
    const markers = extractAppearedMarkers(pre, post);
    expect(markers).toContain('Welcome to your dashboard');
    expect(markers).toContain('Account created successfully');
    expect(markers).not.toContain('Use a work email'); // pre-existing — not an outcome
    expect(markers.some((m) => m.includes('trackSuccess'))).toBe(false); // scripts stripped
    expect(markers.some((m) => m.includes('acme.com') || m.includes('[redacted'))).toBe(false); // PII line dropped whole
    expect(markers).not.toContain('42'); // no letters — recurs by accident
    expect(markers).not.toContain('OK'); // below the phrase floor
    expect(markers.length).toBeLessThanOrEqual(5);
  });

  it('selects snapshot refs for the LAST and DESTRUCTIVE steps only, from the recovered events', () => {
    const events = [
      clickEvent('c1', { domSnapshot: { file: 'dom-1.html' }, postAction: { domSnapshot: { file: 'dom-1-post.html' } } }),
      clickEvent('sub', {
        target: { tag: 'button', attributes: { type: 'submit' }, locators: [{ strategy: 'css', value: 'b' }] },
        domSnapshot: { file: 'dom-2.html' },
        postAction: { domSnapshot: { file: 'dom-2-post.html' } },
      }),
      clickEvent('c3', { domSnapshot: { file: 'dom-3.html' }, postAction: { domSnapshot: { file: 'dom-3-post.html' } } }),
    ];
    const sources = [step('c1'), step('sub'), step('c3')];
    const { steps } = compileExecutionPlan({ steps: sources, events });
    const refs = markerSnapshotRefs(steps, sources, events);
    // Step 2 is destructive (submit), step 3 is last — step 1 is neither and costs no fetch.
    expect(refs.map((r) => r.index)).toEqual([2, 3]);
    expect(refs[0]).toMatchObject({ pre: 'dom-2.html', post: 'dom-2-post.html' });
  });

  it('attaches markers only where extraction found some, and the consent hash moves with them', () => {
    const events = [clickEvent('c1'), clickEvent('c2')];
    const { steps } = compileExecutionPlan({ steps: [step('c1'), step('c2')], events });
    const bare = hashSteps(steps);
    const withMarkers = attachOutcomeMarkers(
      steps,
      new Map([
        [2, { pre: '<div>Form</div>', post: '<div>Form</div><div>Saved successfully</div>' }],
        // Step 1 gets snapshots whose diff yields nothing usable — it must compile bare.
        [1, { pre: '<div>Same</div>', post: '<div>Same</div>' }],
      ]),
    );
    expect(withMarkers[0]!.expect).toBeUndefined();
    expect(withMarkers[1]!.expect).toEqual({ appeared: ['Saved successfully'] });
    expect(hashSteps(withMarkers)).not.toBe(bare); // the pin covers what the run will verify
    expect(hashSteps(attachOutcomeMarkers(steps, new Map()))).toBe(bare); // no snapshots ⇒ unchanged
  });
});

describe('planSummary', () => {
  it('counts what the founder is shown beside the switch', () => {
    const events = [clickEvent('c1'), fillEvent('f1'), clickEvent('sub', {
      target: { tag: 'button', attributes: { type: 'submit' }, locators: [{ strategy: 'css', value: 'b' }] },
    })];
    const { steps } = compileExecutionPlan({ steps: [step('c1'), step('f1'), step('sub')], events });
    expect(planSummary(steps)).toEqual({ steps: 3, inputs: 1, destructive: 1, manual: 0 });
  });
});
