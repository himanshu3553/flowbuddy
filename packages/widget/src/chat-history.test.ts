import { describe, expect, it } from 'vitest';
import { HISTORY_KINDS, historyForAnswer } from './chat-history.js';

type TestMsg = { role: 'user' | 'assistant'; kind: string; content: string };

const msg = (role: TestMsg['role'], kind: string, content: string): TestMsg => ({ role, kind, content });

describe('historyForAnswer', () => {
  it('NEVER lets user.value ride the wire — the D3 privacy invariant (agent.md §6)', () => {
    const messages = [
      msg('user', 'user.question', 'how do I invite a teammate?'),
      msg('assistant', 'assistant.answer', 'Open Settings → Team…'),
      msg('assistant', 'assistant.narration', 'I need the customer email to continue.'),
      msg('user', 'user.value', 'jane@customer.example'), // typed for the run — must not leave the page
      msg('assistant', 'assistant.narration', 'Filled the email field.'),
      msg('user', 'user.question', 'what happens next?'), // the just-pushed question
    ];
    const history = historyForAnswer(messages);
    expect(JSON.stringify(history)).not.toContain('jane@customer.example');
    // …and the exclusion is by KIND, not by luck of position.
    expect(HISTORY_KINDS.has('user.value')).toBe(false);
  });

  it('excludes assistant.error — a transport failure is about a moment, not the conversation', () => {
    const messages = [
      msg('user', 'user.question', 'q1'),
      msg('assistant', 'assistant.error', 'Request failed (503)'),
      msg('user', 'user.question', 'q2'),
    ];
    expect(historyForAnswer(messages)).toEqual([{ role: 'user', content: 'q1' }]);
  });

  it('drops the just-pushed question (it rides separately) and keeps at most 10 turns', () => {
    const messages: TestMsg[] = [];
    for (let i = 1; i <= 8; i++) {
      messages.push(msg('user', 'user.question', `q${i}`));
      messages.push(msg('assistant', 'assistant.answer', `a${i}`));
    }
    messages.push(msg('user', 'user.question', 'current'));
    const history = historyForAnswer(messages);
    expect(history).toHaveLength(10);
    expect(history.at(-1)).toEqual({ role: 'assistant', content: 'a8' });
    expect(history.some((h) => h.content === 'current')).toBe(false);
  });

  it('an excluded kind in last place does not evict a real turn (filter runs before the drop)', () => {
    const messages = [
      msg('user', 'user.question', 'q1'),
      msg('assistant', 'assistant.answer', 'a1'),
      msg('user', 'user.value', 'secret'),
      msg('user', 'user.question', 'current'),
    ];
    // Filtering first means slice(0,-1) removes 'current', not 'a1'.
    expect(historyForAnswer(messages)).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ]);
  });

  it('empty and single-question threads produce empty history', () => {
    expect(historyForAnswer([])).toEqual([]);
    expect(historyForAnswer([msg('user', 'user.question', 'first ever')])).toEqual([]);
  });
});
