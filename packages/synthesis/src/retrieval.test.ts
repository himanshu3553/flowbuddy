import { describe, expect, it } from 'vitest';
import {
  coldStartScore,
  sanitizeHistory,
  selectOnePerTask,
  shortlistItems,
  type RetrievableKBItem,
} from './retrieval';

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


describe('selectOnePerTask — two routes to one goal', () => {
  // P3-M1. This is the only place retrieval DROPS approved content, so each rule is pinned: a
  // regression here does not error, it quietly answers from the wrong route.
  const step = (workflowId: string, route: string): RetrievableKBItem => ({
    id: `${workflowId}-${route}`,
    workflowId,
    sourceId: 'src',
    segmentIndex: 0,
    segmentTitle: null,
    text: 'step',
    data: { route },
  });
  const ids = (out: RetrievableKBItem[]) => [...new Set(out.map((i) => i.workflowId))].sort();

  it('leaves everything alone when nothing is grouped', () => {
    const items = [step('wf-a', '/settings'), step('wf-b', '/team')];
    expect(selectOnePerTask(items, new Map(), '')).toHaveLength(2);
  });

  it('keeps the route the user is actually standing on', () => {
    const items = [step('wf-a', '/settings/team'), step('wf-b', '/projects/9')];
    const tasks = new Map([['wf-a', 't1'], ['wf-b', 't1']]);
    expect(ids(selectOnePerTask(items, tasks, '/projects/9'))).toEqual(['wf-b']);
  });

  it('falls back to the route that can be started cold', () => {
    // No screen match, so the tiebreak decides: `/settings` can be reached by anyone;
    // `/projects/6a6a49ca1a22045b0b32b353` presupposes you are already inside that project.
    const items = [step('wf-a', '/settings'), step('wf-b', '/projects/6a6a49ca1a22045b0b32b353')];
    const tasks = new Map([['wf-a', 't1'], ['wf-b', 't1']]);
    expect(ids(selectOnePerTask(items, tasks, '/somewhere-else'))).toEqual(['wf-a']);
  });

  it('never drops a workflow that shares a task with nothing', () => {
    const items = [step('wf-a', '/a'), step('wf-b', '/b')];
    const tasks = new Map([['wf-a', 't1']]); // grouped, but alone in its group
    expect(ids(selectOnePerTask(items, tasks, ''))).toEqual(['wf-a', 'wf-b']);
  });

  it('separate tasks each keep a winner', () => {
    const items = [step('wf-a', '/a'), step('wf-b', '/b'), step('wf-c', '/c'), step('wf-d', '/d')];
    const tasks = new Map([
      ['wf-a', 't1'], ['wf-b', 't1'],
      ['wf-c', 't2'], ['wf-d', 't2'],
    ]);
    expect(selectOnePerTask(items, tasks, '')).toHaveLength(2);
  });
});

describe('coldStartScore — can a user begin here?', () => {
  it('ranks a shallow stable route above a deep one', () => {
    expect(coldStartScore('/settings')).toBeGreaterThan(coldStartScore('/settings/team/invite'));
  });

  it('treats an opaque id as the strongest sign of "you were already somewhere"', () => {
    expect(coldStartScore('/projects/6a6a49ca1a22045b0b32b353')).toBe(0);
    expect(coldStartScore('/invoices/12345')).toBe(0);
  });

  it('rates the root most startable of all', () => {
    expect(coldStartScore('/')).toBeGreaterThanOrEqual(coldStartScore('/dashboard'));
  });
});

describe('the relevance reserve — a bias must not become a filter', () => {
  /**
   * THE BUG THIS PINS, measured on a real workspace 2026-08-04. Standing on a hub page where 23 of
   * 46 approved items had been recorded, against a 24-item window, the route boost could occupy the
   * whole window and evict the ONE item that answered the question — "how do I log out" lost the
   * Sign out step, which was ranked #1 by relevance and recorded on another page. The copilot then
   * declined, correctly, on evidence it had never been shown.
   *
   * Route/sense/continuity are documented as biases the answer model may overrule. They are applied
   * in retrieval, which decides what the model ever sees; nothing bounded how many items could claim
   * one. These tests state the invariant: context orders the window, the question keeps a share of it.
   */
  const crowdedPage = '/dashboard/projects/6a70ab21ea39cf8ce7066f81';

  it('THE REGRESSION: the one relevant item survives a page full of boosted ones', () => {
    const onPage = Array.from({ length: 23 }, () => item('Click Save Voice Settings.', { route: crowdedPage }));
    const answer = item('Click Sign out. Sign out of the application.', {
      route: '/dashboard/billing',
      sourceId: 'src-signout',
    });
    const filler = Array.from({ length: 22 }, () => item('Unrelated step.', { route: '/elsewhere' }));

    const got = shortlistItems([...onPage, answer, ...filler], 'how do I sign out of the account?', {
      contextPath: crowdedPage,
      limit: 24,
    });
    expect(ids(got)).toContain(answer.id);
  });

  it('still spends most of the window on where the user IS', () => {
    const onPage = Array.from({ length: 23 }, () => item('Click Save Voice Settings.', { route: crowdedPage }));
    const answer = item('Click Sign out.', { route: '/dashboard/billing', sourceId: 'src-signout' });
    const got = shortlistItems([...onPage, answer], 'how do I sign out?', {
      contextPath: crowdedPage,
      limit: 24,
    });
    // 23 on-page items + the relevant one: context keeps everything it had, nothing was evicted.
    expect(got).toHaveLength(24);
    expect(ids(got)).toContain(answer.id);
  });

  it('a POSITIONAL question still gets the page, not keyword noise', () => {
    // "what do I do next?" carries no real search terms — context is the entire answer. The word
    // "next" appears in an unrelated off-page step, which must not claim the window.
    const onPage = Array.from({ length: 12 }, () => item('A step on this screen.', { route: crowdedPage }));
    const noise = Array.from({ length: 12 }, () =>
      item('Click Next: Add Knowledge Sources.', { route: '/elsewhere', sourceId: 'src-noise' }),
    );
    const got = shortlistItems([...onPage, ...noise], 'what do I do next?', {
      contextPath: crowdedPage,
      limit: 12,
    });
    const onPageIds = new Set(onPage.map((i) => i.id));
    // The reserve caps keyword noise at 8 of 12 — the page keeps the rest and, critically, the
    // reserve never REMOVES a signal, so a page with fewer competitors keeps all of them.
    expect(ids(got).filter((id) => onPageIds.has(id)).length).toBeGreaterThanOrEqual(4);
  });

  it('items with no relevance at all never claim a reserved slot', () => {
    const onPage = Array.from({ length: 30 }, () => item('On-screen step.', { route: crowdedPage }));
    const nothing = Array.from({ length: 30 }, () => item('Nothing to do with it.', { route: '/elsewhere' }));
    const got = shortlistItems([...onPage, ...nothing], 'zzzq unmatchable', { contextPath: crowdedPage, limit: 10 });
    const onPageIds = new Set(onPage.map((i) => i.id));
    expect(ids(got).every((id) => onPageIds.has(id))).toBe(true);
  });
});
