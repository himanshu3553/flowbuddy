import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actCheck, actClick, actFill, actSelect } from './act.js';
import { canDirectNavigate, stepKindOf, toSenseWorkflow, type RunStep } from './agent-run.js';

/**
 * P4-M2 slice 3 — the act verbs and the run's pure mapping helpers.
 *
 * WHY THESE. The verbs are the only code that touches a host page's controls, and their failure
 * mode is silent: a fill React never saw, a change event that never fired, a checkbox "set" without
 * its events — each looks done to a human and undone to the app. The tests pin the event CONTRACT
 * (what fires, in what order, through the native setter), not "did it work" — that judgment is the
 * driver's verify step, by design.
 */

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('actClick', () => {
  it('dispatches the pointer sequence and ends on the native activation', () => {
    document.body.innerHTML = `<button id="b">Go</button>`;
    const el = document.querySelector('#b')!;
    const seen: string[] = [];
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.addEventListener(type, () => seen.push(type));
    }
    expect(actClick(el)).toBe(true);
    expect(seen[seen.length - 1]).toBe('click');
    expect(seen).toContain('mousedown');
    expect(seen).toContain('mouseup');
    expect(seen.indexOf('mousedown')).toBeLessThan(seen.indexOf('mouseup'));
  });

  it('a listener throwing on the page never breaks the verb', () => {
    document.body.innerHTML = `<button id="b">Go</button>`;
    const el = document.querySelector('#b')!;
    el.addEventListener('mousedown', () => {
      throw new Error('hostile listener');
    });
    // Per spec a listener's exception never crosses dispatchEvent — it is REPORTED to the window
    // (the page's own uncaught error, exactly as if the user had clicked). Swallow the report so
    // the suite doesn't count the fixture page's error against itself.
    const swallow = (e: ErrorEvent): void => e.preventDefault();
    window.addEventListener('error', swallow);
    try {
      expect(actClick(el)).toBe(true);
    } finally {
      window.removeEventListener('error', swallow);
    }
  });
});

describe('actFill', () => {
  it('writes through the NATIVE setter and announces input then change', () => {
    document.body.innerHTML = `<input id="f">`;
    const el = document.querySelector('#f') as HTMLInputElement;
    const seen: string[] = [];
    el.addEventListener('input', () => seen.push(`input:${el.value}`));
    el.addEventListener('change', () => seen.push('change'));
    expect(actFill(el, 'Acme')).toBe(true);
    expect(el.value).toBe('Acme');
    // The value is ALREADY set when input fires — exactly what typing produces, which is what
    // controlled-input frameworks read back out of the event target.
    expect(seen).toEqual(['input:Acme', 'change']);
  });

  it('works on textareas and refuses non-text controls', () => {
    document.body.innerHTML = `<textarea id="t"></textarea><div id="d"></div>`;
    const ta = document.querySelector('#t') as HTMLTextAreaElement;
    expect(actFill(ta, 'notes')).toBe(true);
    expect(ta.value).toBe('notes');
    expect(actFill(document.querySelector('#d')!, 'x')).toBe(false);
  });
});

describe('actSelect', () => {
  it('selects by value, falls back to visible text, fires input+change, refuses unknown options', () => {
    document.body.innerHTML = `
      <select id="s">
        <option value="">Pick…</option>
        <option value="pro">Pro plan</option>
        <option value="team">Team plan</option>
      </select>`;
    const el = document.querySelector('#s') as HTMLSelectElement;
    const seen: string[] = [];
    el.addEventListener('change', () => seen.push(`change:${el.value}`));
    expect(actSelect(el, 'pro')).toBe(true);
    expect(el.value).toBe('pro');
    expect(actSelect(el, 'Team plan')).toBe(true); // by text
    expect(el.value).toBe('team');
    expect(actSelect(el, 'enterprise')).toBe(false); // not an option — the driver hands back
    expect(seen).toEqual(['change:pro', 'change:team']);
  });
});

describe('actCheck', () => {
  it('toggles via native activation (events for free) and no-ops when already right', () => {
    document.body.innerHTML = `<input id="c" type="checkbox">`;
    const el = document.querySelector('#c') as HTMLInputElement;
    const changes = vi.fn();
    el.addEventListener('change', changes);
    expect(actCheck(el, true)).toBe(true);
    expect(el.checked).toBe(true);
    expect(actCheck(el, true)).toBe(true); // already there — nothing dispatched
    expect(el.checked).toBe(true);
    expect(actCheck(el, false)).toBe(true);
    expect(el.checked).toBe(false);
    expect(changes).toHaveBeenCalledTimes(2);
    expect(actCheck(document.createElement('div'), true)).toBe(false);
  });
});

describe('run helpers (pure)', () => {
  it('stepKindOf collapses acting verbs onto the engine’s two kinds', () => {
    expect(stepKindOf('click')).toBe('action');
    expect(stepKindOf('navigate')).toBe('action');
    expect(stepKindOf('fill')).toBe('input');
    expect(stepKindOf('select')).toBe('input');
    expect(stepKindOf('check')).toBe('input');
  });

  it('canDirectNavigate allows screens (the landing page included), never records or unknowns', () => {
    expect(canDirectNavigate('/projects')).toBe(true);
    expect(canDirectNavigate('/projects/new')).toBe(true);
    expect(canDirectNavigate('/')).toBe(true); // the landing page is a screen
    expect(canDirectNavigate('/projects/6a6a49ca1a22045b0b32b353')).toBe(false); // a record
    expect(canDirectNavigate('/projects/12345')).toBe(false);
    expect(canDirectNavigate('')).toBe(false); // unknown route, not the root
    expect(canDirectNavigate('   ')).toBe(false);
  });

  it('toSenseWorkflow reshapes the remaining plan for a guided takeover', () => {
    const steps: RunStep[] = [
      { index: 1, verb: 'fill', instruction: 'Name it', route: '/projects', locators: [{ strategy: 'css', value: '#n' }] },
      { index: 2, verb: 'click', instruction: 'Create', route: '/projects', locators: [], postRoute: '/projects/done' },
    ];
    const wf = toSenseWorkflow({ workflowKey: 'src-1:2', title: 'Create a project', steps });
    expect(wf).toMatchObject({ sourceId: 'src-1', segmentIndex: 2, title: 'Create a project' });
    expect(wf.steps[0]).toMatchObject({ index: 1, kind: 'input', route: '/projects' });
    expect(wf.steps[1]).toMatchObject({ index: 2, kind: 'action', postRoute: '/projects/done' });
  });
});

// `actNavigate` is deliberately untested here: it is `location.assign` in a try/catch, and jsdom
// cannot perform navigations — exercising it only raises an unhandled "not implemented" error that
// fails the suite while proving nothing. Arrival is the resume handshake's job, verified E2E.
