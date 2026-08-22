import { describe, expect, it } from 'vitest';
import type { CapturedEvent } from '@flowbuddy/shared';

import { matchStepsByMoment } from './edit-carryover';

// ── edit carry-over pairs steps by MOMENT, never by position ────────────────────────────────────

const ev = (id: string, path: string, label: string, type = 'click'): CapturedEvent =>
  ({
    id,
    t: 1,
    type,
    target: { tag: 'button', accessibleName: label },
    route: { url: `https://x.test${path}`, path, hash: '', title: '' },
  }) as unknown as CapturedEvent;

describe('matchStepsByMoment', () => {
  it('pairs the same control on the same screen across two recordings, regardless of position', () => {
    const oldEvents = [ev('o1', '/projects/new', 'Project name'), ev('o2', '/projects/new', 'Create')];
    const newEvents = [ev('n0', '/projects/new', 'Welcome'), ev('n1', '/projects/new', 'Project name'), ev('n2', '/projects/new', 'Create')];
    const pairs = matchStepsByMoment(
      [{ itemId: 'old-a', keyEventId: 'o1' }, { itemId: 'old-b', keyEventId: 'o2' }],
      oldEvents,
      [{ itemId: 'new-0', keyEventId: 'n0' }, { itemId: 'new-1', keyEventId: 'n1' }, { itemId: 'new-2', keyEventId: 'n2' }],
      newEvents,
    );
    expect(pairs.get('old-a')).toBe('new-1');
    expect(pairs.get('old-b')).toBe('new-2');
  });

  it('record ids in the route do not break the pairing (patterns, not strings)', () => {
    const pairs = matchStepsByMoment(
      [{ itemId: 'old', keyEventId: 'o' }],
      [ev('o', '/projects/6a6a49ca-1111-4222-8333-444444444444/settings', 'Save')],
      [{ itemId: 'new', keyEventId: 'n' }],
      [ev('n', '/projects/9999/settings', 'Save')],
    );
    expect(pairs.get('old')).toBe('new');
  });

  it('a changed screen or label is NOT paired — the product may have changed that step', () => {
    const pairs = matchStepsByMoment(
      [{ itemId: 'old', keyEventId: 'o' }],
      [ev('o', '/projects/new', 'Website URL')],
      [{ itemId: 'new', keyEventId: 'n' }],
      [ev('n', '/projects/new', 'Knowledge source')],
    );
    expect(pairs.size).toBe(0);
  });

  it('ambiguity on either side means no offer', () => {
    const pairs = matchStepsByMoment(
      [{ itemId: 'old', keyEventId: 'o' }],
      [ev('o', '/team', 'Invite')],
      [{ itemId: 'n1', keyEventId: 'a' }, { itemId: 'n2', keyEventId: 'b' }],
      [ev('a', '/team', 'Invite'), ev('b', '/team', 'Invite')],
    );
    expect(pairs.size).toBe(0);
  });

  it('steps without an anchor or without a label never pair', () => {
    const pairs = matchStepsByMoment(
      [{ itemId: 'old', keyEventId: null }, { itemId: 'old2', keyEventId: 'o2' }],
      [ev('o2', '/x', '')],
      [{ itemId: 'new', keyEventId: 'n' }],
      [ev('n', '/x', '')],
    );
    expect(pairs.size).toBe(0);
  });
});
