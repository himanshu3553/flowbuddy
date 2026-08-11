import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SenseStep } from './sense.js';
import { buildFingerprint } from '@flowbuddy/shared/screen-fingerprint';
import {
  actionCompletionEvidence,
  disappearedSatisfied,
  earliestPendingInput,
  entryVerdict,
  firstUnfinishedEarlierInput,
  inputDone,
  invalidHint,
  labelMatches,
  markerBaseline,
  markerVerdict,
  observeRun,
  outcomeSatisfied,
  resolveStepWithRetries,
  ROUTE_POLL_MS,
  stateDone,
  watchInputState,
} from './step-engine.js';

/**
 * P4-M2 — the shared step engine, extracted from the shipped walkthrough (§A2.10). These are the
 * widget package's FIRST tests, and they pin the extraction: the walkthrough's user-visible
 * behavior is guarded by its E2E legs, but the engine's verdicts are what BOTH actors trust — a
 * drift here surfaces as "the walkthrough says done when it isn't" today and as "the agent acts on
 * a step that didn't happen" in slice 3. Fixtures are real jsdom elements, not mocks of them
 * (see test-setup.ts for the one jsdom limitation that has to be papered over).
 *
 * The environment URL puts every test at path `/projects` — steps use that route unless a case is
 * specifically about being elsewhere.
 */

function mkStep(over: Partial<SenseStep> & { index: number }): SenseStep {
  return {
    instruction: `Step ${over.index}`,
    route: '/projects',
    kind: 'action',
    locators: [],
    ...over,
  };
}
const cssLoc = (value: string) => [{ strategy: 'css', value }];

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.useRealTimers();
});

describe('element-state verdicts (the vocabulary both actors gate on)', () => {
  it('stateDone: checkbox truth, filled-and-not-provably-invalid, nothing-readable = not done', () => {
    expect(stateDone({ tag: 'input', checked: true })).toBe(true);
    expect(stateDone({ tag: 'input', checked: false })).toBe(false);
    expect(stateDone({ tag: 'input', filled: true })).toBe(true); // `valid` absent = nothing checkable — honestly passes
    expect(stateDone({ tag: 'input', filled: true, valid: false })).toBe(false);
    expect(stateDone({ tag: 'input', filled: false })).toBe(false);
    expect(stateDone({ tag: 'div' })).toBe(false);
  });

  it('inputDone reads real elements: value, constraints, aria-invalid, checkboxes', () => {
    document.body.innerHTML = `
      <input id="plain" value="hi">
      <input id="empty" required>
      <input id="satisfied" required value="x">
      <input id="flagged" value="x" aria-invalid="true">
      <input id="unchecked" type="checkbox">
      <input id="checked" type="checkbox" checked>
    `;
    const $ = (s: string) => document.querySelector(s)!;
    expect(inputDone($('#plain'))).toBe(true);
    expect(inputDone($('#empty'))).toBe(false); // valueMissing
    expect(inputDone($('#satisfied'))).toBe(true);
    expect(inputDone($('#flagged'))).toBe(false); // the app flagged it — never count it done
    expect(inputDone($('#unchecked'))).toBe(false);
    expect(inputDone($('#checked'))).toBe(true);
  });

  it('invalidHint maps constraint names to words a user can act on, with an honest fallback', () => {
    expect(invalidHint('valueMissing')).toBe('it looks required and empty');
    expect(invalidHint('typeMismatch')).toBe("the format doesn't look right");
    expect(invalidHint('somethingNew')).toBe('the app flagged it as invalid');
    expect(invalidHint(undefined)).toBe('the app flagged it as invalid');
  });
});

describe('earliestPendingInput (the self-correcting pointer’s evidence)', () => {
  const steps = [
    mkStep({ index: 1, kind: 'input', locators: cssLoc('#f1') }),
    mkStep({ index: 2, kind: 'input', locators: cssLoc('#f2') }),
    mkStep({ index: 3, kind: 'action', locators: cssLoc('#go') }),
  ];

  beforeEach(() => {
    document.body.innerHTML = `<input id="f1"><input id="f2"><button id="go">Go</button>`;
  });

  it('finds the earliest on-route input that is verifiably not done', () => {
    expect(earliestPendingInput(steps, 3, '/projects', [])).toBe(1);
    (document.querySelector('#f1') as HTMLInputElement).value = 'done';
    expect(earliestPendingInput(steps, 3, '/projects', [])).toBe(2);
    (document.querySelector('#f2') as HTMLInputElement).value = 'done';
    expect(earliestPendingInput(steps, 3, '/projects', [])).toBeNull();
  });

  it('only looks BEFORE the pointer, respects explicit skips, and never counts action steps', () => {
    expect(earliestPendingInput(steps, 1, '/projects', [])).toBeNull(); // nothing before step 1
    expect(earliestPendingInput(steps, 3, '/projects', [1])).toBe(2); // the user's override wins
    const actionsOnly = [mkStep({ index: 1, kind: 'action', locators: cssLoc('#f1') })];
    expect(earliestPendingInput(actionsOnly, 2, '/projects', [])).toBeNull(); // clicks leave no evidence
  });

  it('ignores off-route steps and elements that are not visible', () => {
    const offRoute = [mkStep({ index: 1, kind: 'input', route: '/settings', locators: cssLoc('#f1') })];
    expect(earliestPendingInput(offRoute, 2, '/projects', [])).toBeNull();
    (document.querySelector('#f1') as HTMLElement).style.display = 'none';
    expect(earliestPendingInput(steps, 3, '/projects', [])).toBe(2); // hidden field can’t pull back
  });
});

describe('firstUnfinishedEarlierInput (why is this button disabled?)', () => {
  it('names the first earlier input step that is not genuinely done', () => {
    document.body.innerHTML = `<input id="f1"><input id="f2" value="ok">`;
    const steps = [
      mkStep({ index: 1, kind: 'input', locators: cssLoc('#f1') }),
      mkStep({ index: 2, kind: 'input', locators: cssLoc('#f2') }),
      mkStep({ index: 3, kind: 'action', locators: cssLoc('#go') }),
    ];
    expect(firstUnfinishedEarlierInput(steps, 3)?.index).toBe(1);
    (document.querySelector('#f1') as HTMLInputElement).value = 'ok';
    expect(firstUnfinishedEarlierInput(steps, 3)).toBeNull();
  });
});

describe('actionCompletionEvidence (did the action do its job?)', () => {
  const steps = [
    mkStep({ index: 1, kind: 'action', locators: cssLoc('#do') }),
    mkStep({ index: 2, kind: 'action', locators: cssLoc('#next') }),
  ];

  it('no evidence either way = false — uncertainty never counts as progress', () => {
    document.body.innerHTML = `<button id="do">Do</button>`;
    const currentEl = document.querySelector('#do')!;
    expect(actionCompletionEvidence({ steps, stepIndex: 1, currentEl, path: '/projects' })).toBe(false);
  });

  it('the next step appearing is evidence the page moved on', () => {
    document.body.innerHTML = `<button id="do">Do</button><button id="next">Next</button>`;
    const currentEl = document.querySelector('#do')!;
    expect(actionCompletionEvidence({ steps, stepIndex: 1, currentEl, path: '/projects' })).toBe(true);
  });

  it('the acted-on control leaving the DOM is evidence', () => {
    document.body.innerHTML = `<button id="do">Do</button>`;
    const currentEl = document.querySelector('#do')!;
    currentEl.remove();
    expect(actionCompletionEvidence({ steps, stepIndex: 1, currentEl, path: '/projects' })).toBe(true);
  });

  it('a next step that lives elsewhere, or no next step at all, leaves nothing to prove here', () => {
    document.body.innerHTML = `<button id="do">Do</button>`;
    const currentEl = document.querySelector('#do')!;
    const elsewhere = [steps[0]!, mkStep({ index: 2, kind: 'action', route: '/settings', locators: cssLoc('#next') })];
    expect(actionCompletionEvidence({ steps: elsewhere, stepIndex: 1, currentEl, path: '/projects' })).toBe(true);
    expect(actionCompletionEvidence({ steps, stepIndex: 2, currentEl, path: '/projects' })).toBe(true); // last step
  });

  it('the last-step and lives-elsewhere shortcuts need an OBSERVED act — polling gets hard evidence only', () => {
    // The live bug this pins: a hand-back poll (no click observed) consulted the last-step
    // shortcut and "completed" a disabled final submit nobody had touched.
    document.body.innerHTML = `<button id="do">Do</button>`;
    const currentEl = document.querySelector('#do')!;
    expect(
      actionCompletionEvidence({ steps, stepIndex: 2, currentEl, path: '/projects', clickObserved: false }),
    ).toBe(false); // last step, untouched control still in the DOM — NOT done
    const elsewhere = [steps[0]!, mkStep({ index: 2, kind: 'action', route: '/settings', locators: cssLoc('#next') })];
    expect(
      actionCompletionEvidence({ steps: elsewhere, stepIndex: 1, currentEl, path: '/projects', clickObserved: false }),
    ).toBe(false);
    // Hard evidence still counts without an observed click: the control leaving the DOM…
    currentEl.remove();
    expect(
      actionCompletionEvidence({ steps, stepIndex: 2, currentEl, path: '/projects', clickObserved: false }),
    ).toBe(true);
    // …or the next step's element appearing.
    document.body.innerHTML = `<button id="do">Do</button><button id="next">Next</button>`;
    expect(
      actionCompletionEvidence({
        steps,
        stepIndex: 1,
        currentEl: document.querySelector('#do'),
        path: '/projects',
        clickObserved: false,
      }),
    ).toBe(true);
  });
});

describe('resolveStepWithRetries (the ladder — SPAs hydrate late)', () => {
  it('resolves immediately when the element is already there', async () => {
    document.body.innerHTML = `<button id="go">Go</button>`;
    const el = await resolveStepWithRetries(mkStep({ index: 1, locators: cssLoc('#go') }), () => true);
    expect(el?.id).toBe('go');
  });

  it('keeps trying on the shipped ladder and finds a late-hydrating element', async () => {
    vi.useFakeTimers();
    const promise = resolveStepWithRetries(mkStep({ index: 1, locators: cssLoc('#late') }), () => true);
    window.setTimeout(() => {
      document.body.innerHTML = `<button id="late">Late</button>`;
    }, 700);
    await vi.advanceTimersByTimeAsync(800);
    const el = await promise;
    expect(el?.id).toBe('late');
  });

  it('returns null once the caller no longer wants it — a stale resolve must not aim anywhere', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = ''; // nothing yet
    let wanted = true;
    const promise = resolveStepWithRetries(mkStep({ index: 1, locators: cssLoc('#go') }), () => wanted);
    wanted = false;
    document.body.innerHTML = `<button id="go">Go</button>`; // appears — but nobody is on this step now
    await vi.advanceTimersByTimeAsync(3000);
    expect(await promise).toBeNull();
  });

  it('exhausts the ladder to null — SAFE-STOP is the caller’s move', async () => {
    vi.useFakeTimers();
    const promise = resolveStepWithRetries(mkStep({ index: 1, locators: cssLoc('#never') }), () => true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await promise).toBeNull();
  });
});

describe('watchInputState (typing settles before the state is judged)', () => {
  it('debounces typing, fires immediately on commit (Enter/blur), and detaches cleanly', () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<input id="f">`;
    const el = document.querySelector('#f')!;
    const check = vi.fn();
    const cleanup = watchInputState(el, check);

    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('input'));
    expect(check).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    expect(check).toHaveBeenCalledTimes(1); // debounced across keystrokes

    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(check).toHaveBeenCalledTimes(2); // commit = immediate

    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    vi.advanceTimersByTime(800);
    expect(check).toHaveBeenCalledTimes(2); // a plain keystroke is neither commit nor input

    el.dispatchEvent(new Event('blur'));
    expect(check).toHaveBeenCalledTimes(3);

    cleanup();
    el.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(800);
    expect(check).toHaveBeenCalledTimes(3); // detached — nothing observes any more
  });
});

describe('observeRun (route watcher + state tick — no history monkey-patching)', () => {
  it('reports route changes once, ticks every poll, and tears down cleanly', () => {
    vi.useFakeTimers();
    const onRouteChange = vi.fn();
    const onTick = vi.fn();
    const cleanup = observeRun({ onRouteChange, onTick });

    vi.advanceTimersByTime(ROUTE_POLL_MS);
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onRouteChange).not.toHaveBeenCalled(); // same path — nothing to report

    history.pushState({}, '', '/projects/123/settings');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(onRouteChange).toHaveBeenCalledWith('/projects/123/settings');
    expect(onRouteChange).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(ROUTE_POLL_MS);
    expect(onRouteChange).toHaveBeenCalledTimes(1); // unchanged since — the poll stays quiet
    expect(onTick).toHaveBeenCalledTimes(2);

    cleanup();
    history.pushState({}, '', '/projects');
    window.dispatchEvent(new PopStateEvent('popstate'));
    vi.advanceTimersByTime(ROUTE_POLL_MS * 3);
    expect(onRouteChange).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenCalledTimes(2);
  });
});

// ── P3-M2 contract questions (execution-contracts.md §4) ───────────────────────────────────────

describe('marker baseline + verdict (EC-7 — appearance means NEWLY visible)', () => {
  it('baseline captures what is already on screen; a phrase appearing after the act is "newly"', () => {
    document.body.innerHTML = `<h1>Team members</h1>`;
    const base = markerBaseline(['Invitation sent', 'Team members']);
    expect(base.has('team members')).toBe(true);
    expect(base.has('invitation sent')).toBe(false);
    document.body.innerHTML += `<div role="status">Invitation sent</div>`;
    expect(markerVerdict(['Invitation sent', 'Team members'], base)).toBe('newly');
  });

  it('ALL markers pre-visible = presence fallback (no signal, still satisfied); a partial set that never newly appears = unsatisfied', () => {
    document.body.innerHTML = `<h1>Team members</h1>`;
    const base = markerBaseline(['Team members']);
    expect(markerVerdict(['Team members'], base)).toBe('presence'); // pre-satisfied — vacuous pass, audited by the caller
    const base2 = markerBaseline(['Team members', 'Invitation sent']);
    expect(markerVerdict(['Team members', 'Invitation sent'], base2)).toBe('unsatisfied'); // one could have appeared and did not
  });

  it('no markers = none; pre-visible markers that VANISHED are unsatisfied, not presence', () => {
    document.body.innerHTML = `<h1>Team members</h1>`;
    const base = markerBaseline(['Team members']);
    document.body.innerHTML = `<h1>Somewhere else</h1>`;
    expect(markerVerdict(['Team members'], base)).toBe('unsatisfied');
    expect(markerVerdict([], base)).toBe('none');
    expect(markerVerdict(undefined, base)).toBe('none');
  });
});

describe('disappearedSatisfied (EC-7 — the inverse half)', () => {
  it('a phrase that WAS visible must be gone; one never visible proves nothing', () => {
    document.body.innerHTML = `<div class="modal">Invite a teammate</div>`;
    const base = markerBaseline(['Invite a teammate', 'Ghost phrase']);
    expect(disappearedSatisfied(['Invite a teammate'], base)).toBe(false); // still on screen
    document.body.innerHTML = `<h1>Team members</h1>`;
    expect(disappearedSatisfied(['Invite a teammate'], base)).toBe(true); // was there, now gone
    expect(disappearedSatisfied(['Ghost phrase'], base)).toBe(true); // never visible — vacuous
    expect(disappearedSatisfied(undefined, base)).toBe(true);
  });
});

describe('labelMatches (EC-8 — the resolved element must still say what the recording said)', () => {
  it('normalizes case, whitespace, digits and edge punctuation; matches by containment either way', () => {
    expect(labelMatches('Invite member', 'Invite member')).toBe(true);
    expect(labelMatches('Invite member', 'Invite member (3)')).toBe(true); // count badge grew
    expect(labelMatches('Inbox 3', 'Inbox 12')).toBe(true); // digits carry no identity
    expect(labelMatches('Invite member', '  invite   MEMBER  ')).toBe(true);
    expect(labelMatches('Invite member', 'Delete member')).toBe(false); // the contradiction EC-8 exists for
  });

  it('a short expected label or an unreadable live label is vacuously true — only contradiction blocks', () => {
    expect(labelMatches('OK', 'Anything at all')).toBe(true); // <3 chars after normalizing
    expect(labelMatches(undefined, 'Anything')).toBe(true);
    expect(labelMatches('Invite member', '')).toBe(true); // unreadable cannot contradict
    expect(labelMatches('Invite member', undefined)).toBe(true);
    expect(labelMatches('Invite member', '42')).toBe(true); // digits-only live label normalizes away
  });
});

describe('entryVerdict (EC-3/EC-4 — may the run start here?)', () => {
  const screen = buildFingerprint('Team', ['Invite member', 'Pending invites', 'Send invite']);
  it('route compared as a pattern; the screen consulted only once the route matches', () => {
    expect(entryVerdict({ route: '/settings/team', screen }, { path: '/projects' })).toBe('wrong-route');
    expect(
      entryVerdict(
        { route: '/projects', screen },
        { path: '/projects', screen: { title: 'Team', anchors: ['Invite member', 'Pending invites', 'Send invite'] } },
      ),
    ).toBe('ok');
    expect(
      entryVerdict(
        { route: '/projects', screen },
        { path: '/projects', screen: { title: 'Billing', anchors: ['Change plan', 'Add card', 'Save billing'] } },
      ),
    ).toBe('screen-mismatch');
  });

  it('an unknown entry route, an absent contract, or an unidentifiable screen checks nothing', () => {
    expect(entryVerdict({ route: '' }, { path: '/anywhere' })).toBe('ok');
    expect(entryVerdict(undefined, { path: '/anywhere' })).toBe('ok');
    expect(entryVerdict({ route: '/projects' }, { path: '/projects' })).toBe('ok'); // no screen recorded
  });
});

describe('outcomeSatisfied (EC-5 — does the page look the way the recording says Done looks?)', () => {
  const screen = buildFingerprint('Team', ['Invite member', 'Pending invites', 'Send invite']);
  it('reports component verdicts, null for facts the contract does not carry', () => {
    const check = outcomeSatisfied(
      { route: '/projects', appeared: ['Invitation sent'] },
      { path: '/projects', bodyText: 'Team members · Invitation sent' },
    );
    expect(check).toEqual({ checked: true, ok: true, route: true, screen: null, markers: true });
  });

  it('one missed component fails the whole check, and an empty contract checks nothing', () => {
    const miss = outcomeSatisfied(
      { route: '/projects', screen, appeared: ['Invitation sent'] },
      {
        path: '/projects',
        screen: { title: 'Billing', anchors: ['Change plan', 'Add card', 'Save billing'] },
        bodyText: 'Invitation sent',
      },
    );
    expect(miss.ok).toBe(false);
    expect(miss.screen).toBe(false);
    expect(miss.route).toBe(true);
    expect(miss.markers).toBe(true);

    const empty = outcomeSatisfied({}, { path: '/projects', bodyText: 'anything' });
    expect(empty.checked).toBe(false); // nothing checkable — the caller stamps nothing
  });
});
