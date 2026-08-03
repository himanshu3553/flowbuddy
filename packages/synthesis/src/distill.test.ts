import { describe, expect, it } from 'vitest';
import type { CapturedEvent } from '@flowbuddy/shared';

import { valueHint } from './distill';

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

  it('reports a checkbox as toggled WITHOUT a state, because the state is not captured', () => {
    // `maskValue` reads el.value; for a checkbox that is the value ATTRIBUTE — the string "on"
    // whether it was ticked or cleared. Passing it through told the model it knew a state it has
    // never had, which is how "for now I'm just keeping it enabled" became an instruction.
    const out = valueHint(ev('input', { type: 'checkbox' }, 'on'));
    expect(out).toBe(' | toggled');
    expect(out).not.toContain('on"');
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
