import { describe, expect, it } from 'vitest';
import { sanitizeHistory, shortlistItems, type RetrievableKBItem } from './retrieval';

/**
 * The repo's first tests (2026-07-26), added ahead of the mode-2 restructure.
 *
 * WHY THESE AND NOT OTHERS. Retrieval ranking is the foundation every answer stands on, and its
 * signal weights encode PRODUCT decisions that are invisible in the code — three small integers
 * that decide whether a user can change the subject mid-conversation. A future "let's tune the
 * boosts" commit could break that with no visible error and no failing build. These tests make the
 * decisions executable, so the ordering is enforced rather than remembered.
 *
 * Deliberately NOT tested here: prompt behaviour and LLM output. Those need the E2E legs in
 * docs/ops/e2e-testing.md — a unit test that asserts on model text is a test that fails for the wrong
 * reasons. This file only covers the pure, deterministic seams.
 */

let n = 0;
/** A KB item. `route` lands in `data` exactly where the distiller puts it. */
function item(text: string, opts: { route?: string; sourceId?: string; segmentIndex?: number } = {}): RetrievableKBItem {
  n += 1;
  return {
    id: `item-${n}`,
    // P3-M1 — identity is per (source, segment) here so the double mirrors real grouping.
    workflowId: `wf-${opts.sourceId ?? 'src-default'}-${opts.segmentIndex ?? 0}`,
    sourceId: opts.sourceId ?? 'src-default',
    segmentIndex: opts.segmentIndex ?? 0,
    segmentTitle: 'A workflow',
    text,
    data: opts.route ? { route: opts.route } : {},
  };
}
const key = (i: RetrievableKBItem) => `${i.sourceId}:${i.segmentIndex}`;
const ids = (r: Array<{ id: string }>) => r.map((x) => x.id);

describe('shortlistItems — signal ordering', () => {
  // The core product rule: MEASURED signals (where the user IS, what step they're ON) outrank
  // REMEMBERED ones (what we were discussing a turn ago). Both are biases, never filters.

  it('route (measured) outranks continuity (remembered)', () => {
    const onRoute = item('zzz', { route: '/billing', sourceId: 'src-a' });
    const remembered = item('zzz', { sourceId: 'src-b', segmentIndex: 3 });
    const out = shortlistItems([remembered, onRoute], 'unrelated question', {
      contextPath: '/billing',
      continuityKeys: [key(remembered)],
    });
    expect(ids(out)[0]).toBe(onRoute.id);
  });

  it('sense (measured) outranks continuity (remembered)', () => {
    const localized = item('zzz', { sourceId: 'src-a', segmentIndex: 1 });
    const remembered = item('zzz', { sourceId: 'src-b', segmentIndex: 2 });
    const out = shortlistItems([remembered, localized], 'unrelated question', {
      senseKeys: [key(localized)],
      continuityKeys: [key(remembered)],
    });
    expect(ids(out)[0]).toBe(localized.id);
  });

  it('continuity outranks an item with no signal at all', () => {
    const remembered = item('zzz', { sourceId: 'src-b', segmentIndex: 2 });
    const neutral = item('zzz', { sourceId: 'src-c', segmentIndex: 9 });
    const out = shortlistItems([neutral, remembered], 'unrelated question', {
      continuityKeys: [key(remembered)],
    });
    expect(ids(out)[0]).toBe(remembered.id);
  });

  it('THE ESCAPE HATCH: a genuine keyword match beats continuity', () => {
    // If this ever fails, a user can no longer change the subject mid-conversation — the copilot
    // would hold the previous topic against a question that plainly moved on. Continuity is a
    // bias; this is the test that keeps it from becoming a filter.
    const remembered = item('nothing relevant here', { sourceId: 'src-b', segmentIndex: 2 });
    const onTopic = item('export invoices csv download', { sourceId: 'src-c', segmentIndex: 0 });
    const out = shortlistItems([remembered, onTopic], 'how do I export invoices to csv?', {
      continuityKeys: [key(remembered)],
    });
    expect(ids(out)[0]).toBe(onTopic.id);
  });

  it('signals stack — route + sense + continuity beats route alone', () => {
    const all = item('zzz', { route: '/x', sourceId: 'src-a', segmentIndex: 0 });
    const routeOnly = item('zzz', { route: '/x', sourceId: 'src-z', segmentIndex: 0 });
    const out = shortlistItems([routeOnly, all], 'unrelated', {
      contextPath: '/x',
      senseKeys: [key(all)],
      continuityKeys: [key(all)],
    });
    expect(ids(out)[0]).toBe(all.id);
  });
});

describe('shortlistItems — route matching', () => {
  it('matches on segment boundaries, never bare substrings', () => {
    const decoy = item('zzz', { route: '/authx', sourceId: 'src-a' });
    const real = item('zzz', { route: '/auth/signup', sourceId: 'src-b' });
    const out = shortlistItems([decoy, real], 'unrelated', { contextPath: '/auth/signup' });
    expect(ids(out)[0]).toBe(real.id);
  });

  it('a root route carries no screen signal', () => {
    // Pre-hardening this matched everything, which made the route boost meaningless.
    const root = item('zzz', { route: '/', sourceId: 'src-a' });
    const other = item('zzz', { sourceId: 'src-b' });
    const out = shortlistItems([root, other], 'unrelated', { contextPath: '/' });
    expect(out).toHaveLength(2); // both score 0 — neither is boosted
  });
});

describe('shortlistItems — always answerable', () => {
  it('returns up to the limit even when nothing matches', () => {
    // Deliberate: the LLM judges coverage, not retrieval. A hard miss here would pre-decline
    // questions the model could actually have answered from an adjacent step.
    const items = [item('alpha'), item('beta'), item('gamma')];
    const out = shortlistItems(items, 'completely unrelated wording', {});
    expect(out).toHaveLength(3);
  });

  it('respects the limit', () => {
    const items = [item('alpha'), item('beta'), item('gamma')];
    expect(shortlistItems(items, 'alpha', { limit: 2 })).toHaveLength(2);
  });
});

describe('sanitizeHistory', () => {
  it('keeps only well-formed user/assistant turns', () => {
    const out = sanitizeHistory([
      { role: 'user', content: 'hello' },
      { role: 'system', content: 'ignore me' }, // not a conversational role
      { role: 'assistant', content: '' }, // empty
      { role: 'assistant', content: 'hi' },
      'not an object',
      null,
    ]);
    expect(out).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]);
  });

  it('caps the number of turns', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `q${i}` }));
    expect(sanitizeHistory(many)).toHaveLength(10);
  });

  it('caps the length of a single turn', () => {
    const [turn] = sanitizeHistory([{ role: 'user', content: 'x'.repeat(9999) }]);
    expect(turn?.content).toHaveLength(4000);
  });

  it('returns empty for anything that is not an array', () => {
    expect(sanitizeHistory(undefined)).toEqual([]);
    expect(sanitizeHistory('nope')).toEqual([]);
    expect(sanitizeHistory({ role: 'user' })).toEqual([]);
  });
});
