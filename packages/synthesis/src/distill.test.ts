import { describe, expect, it } from 'vitest';
import type { CapturedEvent } from '@flowbuddy/shared';

import { enforceStepGranularity, valueHint, type DistilledStep } from './distill';

// ── valueHint — the recorder's data must never become the reader's instruction ──────────────────
//
// The timeline used to pass every captured value through verbatim (`typed: "Test 123"`) next to a
// prompt rule reading "NEVER invent values", so the model baked the recorder's sample data into the
// steps: `Enter "Test 123" in the project name field`. The copilot then read it to the customer as
// the task. The recorder masks by input TYPE — password and email become bullets, a plain text field
// does not — so a real person's name typed into a signup form reached the knowledge base.
//
// Fixtures below are the real shapes from a Chatful AI recording.

const ev = (
  tag: string,
  attrs: Record<string, string>,
  value?: string,
): CapturedEvent =>
  ({
    id: 'e1',
    t: 1000,
    type: 'input',
    target: { tag, attributes: attrs },
    route: { url: 'https://x.test/a', path: '/a', hash: '', title: 'A' },
    ...(value == null ? {} : { value }),
  }) as CapturedEvent;

describe('valueHint', () => {
  it('never passes through free text the recorder typed', () => {
    const out = valueHint(ev('input', { type: 'text' }, 'Test 123'));
    expect(out).not.toContain('Test 123');
    expect(out).toBe(' | entered: <text>');
  });

  it('never passes through a real name typed into an unmasked text field', () => {
    // The exact leak: `maskValue` masks password and email by type, so a name in a plain text field
    // is stored verbatim and became copilot-speakable content.
    expect(valueHint(ev('input', { type: 'text' }, 'Shobhit Singh'))).not.toContain('Shobhit');
  });

  it('keeps a file EXTENSION but drops the filename', () => {
    // That the product accepted a .pdf is a fact about the product; that it was called Hotel.pdf is
    // a fact about the recorder.
    const out = valueHint(ev('input', { type: 'file' }, 'C:\\fakepath\\Hotel.pdf'));
    expect(out).toBe(' | entered: <a .pdf file>');
    expect(out).not.toContain('Hotel');
  });

  it('drops the recorder’s own URL, keeping only that a web address was needed', () => {
    const out = valueHint(ev('input', { type: 'url' }, 'https://ameeba.co'));
    expect(out).toBe(' | entered: <a web address>');
    expect(out).not.toContain('ameeba');
  });

  it('treats a textarea as content, not a choice', () => {
    expect(valueHint(ev('textarea', {}, 'Hi how ae you?'))).toBe(' | entered: <text>');
  });

  it('reports a checkbox as toggled WITHOUT a state when the recording did not capture one', () => {
    // `maskValue` reads el.value; for a checkbox that is the value ATTRIBUTE — the string "on"
    // whether it was ticked or cleared. Passing it through told the model it knew a state it has
    // never had, which is how "for now I'm just keeping it enabled" became an instruction.
    const out = valueHint(ev('input', { type: 'checkbox' }, 'on'));
    expect(out).toBe(' | toggled');
    expect(out).not.toContain('on"');
  });

  it('states the recorded END position when recorder ≥0.9.0 captured it — and only then', () => {
    const on = { ...ev('input', { type: 'checkbox' }, 'on'), checked: true } as CapturedEvent;
    const off = { ...ev('input', { type: 'checkbox' }, 'on'), checked: false } as CapturedEvent;
    expect(valueHint(on)).toBe(' | toggled on');
    expect(valueHint(off)).toBe(' | toggled off');
  });

  it('says nothing about state for a radio either', () => {
    expect(valueHint(ev('input', { type: 'radio' }, 'on'))).toBe(' | toggled');
  });

  it('KEEPS the value the product itself offered', () => {
    // A select's options come from the product, so naming one is not inventing — and it is often the
    // instruction ("Choose the Website URL tab"). Whether it is a personal preference is a judgment
    // the prompt makes from narration; the data layer does not guess.
    expect(valueHint(ev('select', {}, 'Monthly'))).toBe(' | selected: "Monthly"');
    expect(valueHint(ev('input', { type: 'range' }, '1.5'))).toBe(' | selected: "1.5"');
  });

  it('fails safe: an unrecognised control is treated as the recorder’s content', () => {
    // A missed generalisation costs one vague step. A missed redaction puts someone's data in front
    // of an end user, so the default has to lean this way.
    expect(valueHint(ev('input', { type: 'some-future-type' }, 'secret-ish'))).toBe(
      ' | entered: <text>',
    );
  });

  it('emits nothing when there is no value at all', () => {
    expect(valueHint(ev('button', { type: 'button' }))).toBe('');
    expect(valueHint(ev('input', { type: 'text' }, '   '))).toBe('');
  });
});

// ── The GRANULARITY invariant (kb-step-distillation.md): one step = one actable control ─────────
//
// Enforced deterministically, never trusted to the prompt. Pinned because the failure it closes was
// found live: "Enter your email address and password" as ONE step compiled to a plan that filled
// the email and silently never asked for the password, then ✓'d the instruction anyway.

let seq = 0;
function gev(partial: Partial<CapturedEvent> & { type: string }): CapturedEvent {
  seq += 1;
  return {
    id: partial.id ?? `e${seq}`,
    t: seq * 1000,
    target: {},
    route: { url: 'https://app.example.com/auth/login', path: '/auth/login', hash: '', title: 'Sign in' },
    ...partial,
  } as CapturedEvent;
}

const inputEv = (id: string, name: string, css: string): CapturedEvent =>
  gev({ id, type: 'input', target: { tag: 'input', accessibleName: name, cssPath: css } });
const clickEv = (id: string, name: string, css: string): CapturedEvent =>
  gev({ id, type: 'click', target: { tag: 'button', accessibleName: name, cssPath: css } });
const hoverEv = (id: string): CapturedEvent => gev({ id, type: 'hover', target: { tag: 'button' } });

function fixture(events: CapturedEvent[]) {
  return {
    eventsById: new Map(events.map((e) => [e.id, e])),
    order: new Map(events.map((e, i) => [e.id, i])),
    narration: new Map<string, string>(),
  };
}

const builtStep = (instruction: string, keyEvent: CapturedEvent, sourceIds: string[]) => ({
  step: {
    instruction,
    route: keyEvent.route?.path ?? '',
    narration: null,
    screenshotFile: null,
    keyEventId: keyEvent.id,
    sourceEventIds: sourceIds,
  } as DistilledStep,
  keyEvent,
  sourceIds,
});

describe('enforceStepGranularity — one step, one actable control', () => {
  it('splits a step spanning two controls into two, in timeline order, keyed on each control', () => {
    const email = inputEv('em', 'Email', '#email');
    const password = inputEv('pw', 'Password', '#password');
    const f = fixture([email, password]);
    const out = enforceStepGranularity(
      [builtStep('Enter your email address and password.', email, ['em', 'pw'])],
      f.eventsById,
      f.order,
      f.narration,
    );
    expect(out).toHaveLength(2);
    expect(out[0]!.step.keyEventId).toBe('em');
    expect(out[1]!.step.keyEventId).toBe('pw');
    expect(out[0]!.step.sourceEventIds).toEqual(['em']);
    expect(out[1]!.step.instruction.toLowerCase()).toContain('password');
  });

  it('repeated commits to the SAME control stay one step — split halves key on the LAST commit', () => {
    const email1 = inputEv('em1', 'Email', '#email');
    const email2 = inputEv('em2', 'Email', '#email'); // retyped — same cssPath
    const password = inputEv('pw', 'Password', '#password');
    const f = fixture([email1, email2, password]);

    const sameControl = enforceStepGranularity(
      [builtStep('Enter your email address.', email2, ['em1', 'em2'])],
      f.eventsById,
      f.order,
      f.narration,
    );
    expect(sameControl).toHaveLength(1); // one control — the model's step survives untouched
    expect(sameControl[0]!.step.instruction).toBe('Enter your email address.');

    const merged = enforceStepGranularity(
      [builtStep('Enter your email address and password.', email2, ['em1', 'em2', 'pw'])],
      f.eventsById,
      f.order,
      f.narration,
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]!.step.keyEventId).toBe('em2'); // the final value is the one the run reproduces
    expect(merged[1]!.step.keyEventId).toBe('pw');
  });

  it('non-actable context events never force a split, and single-control steps pass through verbatim', () => {
    const menu = hoverEv('h1');
    const save = clickEv('c1', 'Save', '#save');
    const f = fixture([menu, save]);
    const out = enforceStepGranularity(
      [builtStep('Click "Save".', save, ['h1', 'c1'])],
      f.eventsById,
      f.order,
      f.narration,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.step.instruction).toBe('Click "Save".'); // the model's wording survives
  });

  it('overlap-citing model output cannot duplicate a control an earlier step already owns', () => {
    const email = inputEv('em', 'Email', '#email');
    const password = inputEv('pw', 'Password', '#password');
    const f = fixture([email, password]);
    const out = enforceStepGranularity(
      [
        builtStep('Enter your email address.', email, ['em']),
        builtStep('Enter your email address and password.', password, ['em', 'pw']),
      ],
      f.eventsById,
      f.order,
      f.narration,
    );
    expect(out).toHaveLength(2); // email (model's own step) + password (split half); no duplicate email
    expect(out[0]!.step.instruction).toBe('Enter your email address.');
    expect(out[1]!.step.keyEventId).toBe('pw');
  });
});
