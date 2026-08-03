import { describe, expect, it } from 'vitest';
import type { CapturedEvent } from '@flowbuddy/shared';

import { eventLabel } from './segment';

// ── eventLabel — a placeholder is not a label ───────────────────────────────────────────────────
//
// Collapsing the two cost a whole step. Chatful AI's project form gives its inputs no label, id or
// aria-label — only a placeholder. Rendered as if it were the element's name, the project-name field
// arrived called "My Website Chatbot" beside a bot-name field called "AI Assistant": two adjacent
// text fields that both read as a bot name. The distiller merged them and the project name lost its
// step. It had survived only while the recorder's sample values ("Test 123" vs "Test Bot Name")
// happened to tell them apart — the very leak valueHint exists to close.

const ev = (target: Record<string, unknown>): CapturedEvent =>
  ({
    id: 'e1',
    t: 1,
    type: 'input',
    target,
    route: { url: 'https://x.test/new', path: '/new', hash: '', title: 'N' },
  }) as CapturedEvent;

describe('eventLabel', () => {
  it('marks a placeholder AS a placeholder, so it cannot be read as the field name', () => {
    const out = eventLabel(ev({ tag: 'input', attributes: { placeholder: 'My Website Chatbot' } }));
    expect(out).toBe('input placeholder "My Website Chatbot" @ /new');
  });

  it('keeps the two look-alike fields distinguishable', () => {
    const project = eventLabel(ev({ tag: 'input', attributes: { placeholder: 'My Website Chatbot' } }));
    const bot = eventLabel(ev({ tag: 'input', attributes: { placeholder: 'AI Assistant' } }));
    expect(project).not.toBe(bot);
    expect(project).toContain('placeholder');
    expect(bot).toContain('placeholder');
  });

  it('prefers a real label and does NOT mark it', () => {
    expect(eventLabel(ev({ tag: 'input', accessibleName: 'Bot name', attributes: { placeholder: 'AI Assistant' } })))
      .toBe('input "Bot name" @ /new');
  });

  it('falls back to visible text before the placeholder', () => {
    expect(eventLabel(ev({ tag: 'button', text: 'Create Project', attributes: { placeholder: 'x' } })))
      .toBe('input "Create Project" @ /new');
  });

  it('says plainly when there is neither, rather than naming the element after its tag', () => {
    expect(eventLabel(ev({ tag: 'input', attributes: {} }))).toBe('input <input> @ /new');
  });

  it('collapses whitespace and clips a long label', () => {
    const out = eventLabel(ev({ tag: 'div', text: `${'  a  b  '}${'x'.repeat(200)}` }));
    expect(out).not.toContain('  ');
    expect(out.length).toBeLessThan(120);
  });
});
