/**
 * The pushed trigger end to end under jsdom: config says a flagged workflow begins on this page,
 * the by-key fetch returns it, and the walkthrough card appears without anyone asking — then the
 * budget, the opt-out and the once-per-visit guard hold on later visits.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetOnboarding, dismissOnboarding, installOnboarding, readProgress } from './onboarding.js';
import { walkthroughActive } from './walkthrough.js';

const KEY = 'pk_test';
const CFG = { apiBase: 'http://api.test', key: KEY, reason: false };
// jsdom's URL is http://app.test/projects (vitest.config) — the flagged workflow begins there.
const WIRE = { enabled: true, maxShows: 2, workflows: [{ key: 's1:0', title: 'Create a project', route: '/projects' }] };
const WORKFLOW = {
  sourceId: 's1',
  segmentIndex: 0,
  title: 'Create a project',
  steps: [{ index: 1, instruction: 'Click New project', route: '/projects', kind: 'action', locators: [] }],
};

function mountRoot(): ShadowRoot {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host.attachShadow({ mode: 'open' });
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('installOnboarding — the pushed trigger', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const byKeyCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('sense-plan?workflow=')).length;
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '<button>New project</button>';
    fetchMock = vi.fn(async (url: string) => {
      // The by-key fetch is the one under test; the walkthrough's own analytics post also lands here.
      if (url.includes('/v1/copilot/sense-plan?workflow=s1%3A0')) {
        return { ok: true, json: async () => ({ enabled: true, workflow: WORKFLOW }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    __resetOnboarding();
    // End any card the test left up so the next test starts clean (✕ = abort).
    document.querySelectorAll('div').forEach((h) => h.shadowRoot?.querySelector<HTMLButtonElement>('.fb-tour-exit')?.click());
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('starts the walkthrough on the matching page without a question, and spends one show', async () => {
    const root = mountRoot();
    installOnboarding(root, CFG, WIRE);
    await flush();
    expect(byKeyCalls()).toBe(1);
    expect(walkthroughActive()).toBe(true);
    const card = root.querySelector('.fb-tour-card');
    expect(card).not.toBeNull();
    expect(card!.classList.contains('fb-tour-pending')).toBe(false); // placed → revealed
    expect(root.querySelector('.fb-tour-exit')?.getAttribute('aria-label')).toBe('Not now');
    expect((root.querySelector('.fb-tour-dismiss') as HTMLElement).style.display).toBe('');
    expect(readProgress(KEY)['s1:0']).toEqual({ shows: 1 });
  });

  it('does nothing when the wire is off, or the page is not a flagged first route', async () => {
    const root = mountRoot();
    installOnboarding(root, CFG, { enabled: false });
    await flush();
    expect(byKeyCalls()).toBe(0);
    __resetOnboarding();
    installOnboarding(root, CFG, { ...WIRE, workflows: [{ key: 's1:0', title: 't', route: '/settings' }] });
    await flush();
    expect(byKeyCalls()).toBe(0);
    expect(walkthroughActive()).toBe(false);
  });

  it('a failed fetch shows nothing and costs no show', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response);
    const root = mountRoot();
    installOnboarding(root, CFG, WIRE);
    await flush();
    expect(walkthroughActive()).toBe(false);
    expect(readProgress(KEY)['s1:0']).toBeUndefined();
  });

  it('honours the budget across visits, and the opt-out for good', async () => {
    localStorage.setItem('flowbuddy.onboarding.v1', JSON.stringify({ k: KEY, entries: { 's1:0': { shows: 2 } } }));
    let root = mountRoot();
    installOnboarding(root, CFG, WIRE);
    await flush();
    expect(byKeyCalls()).toBe(0);
    __resetOnboarding();

    localStorage.clear();
    dismissOnboarding(KEY, 's1:0');
    root = mountRoot();
    installOnboarding(root, CFG, WIRE);
    await flush();
    expect(byKeyCalls()).toBe(0);
    expect(readProgress(KEY)['s1:0']).toEqual({ shows: 0, dismissed: true });
  });

  it('"Don\'t show this again" on the card records the opt-out and closes it', async () => {
    const root = mountRoot();
    installOnboarding(root, CFG, WIRE);
    await flush();
    (root.querySelector('.fb-tour-dismiss') as HTMLButtonElement).click();
    expect(walkthroughActive()).toBe(false);
    expect(root.querySelector('.fb-tour-card')).toBeNull();
    expect(readProgress(KEY)['s1:0']).toEqual({ shows: 1, dismissed: true });
  });

  it('yields to a walkthrough already waiting to resume in this tab', async () => {
    sessionStorage.setItem(
      'flowbuddy.walkthrough.v2',
      JSON.stringify({ k: KEY, createdAt: Date.now(), updatedAt: Date.now(), data: { sourceId: 's9', segmentIndex: 0, title: 't', workflow: WORKFLOW, step: 1, startStep: 1, auto: 0, manual: 0 } }),
    );
    const root = mountRoot();
    installOnboarding(root, CFG, WIRE);
    await flush();
    expect(byKeyCalls()).toBe(0);
  });
});

describe('installOnboarding — arriving by client-side navigation', () => {
  it('fires when the SPA pushes the matching route after boot, not only on a full load', async () => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '<button>New project</button>';
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('sense-plan?workflow=')
        ? ({ ok: true, json: async () => ({ enabled: true, workflow: WORKFLOW }) } as Response)
        : ({ ok: true, json: async () => ({}) } as Response),
    );
    vi.stubGlobal('fetch', fetchMock);
    history.pushState({}, '', '/dashboard'); // boot happens on a page that matches nothing
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    try {
      installOnboarding(root, CFG, WIRE);
      await vi.advanceTimersByTimeAsync(0);
      expect(walkthroughActive()).toBe(false);
      history.pushState({}, '', '/projects'); // the SPA navigates — no popstate, no reload
      await vi.advanceTimersByTimeAsync(5000); // past the route poll
      expect(root.querySelector('.fb-tour-card')).not.toBeNull();
      expect(walkthroughActive()).toBe(true);
    } finally {
      root.querySelector<HTMLButtonElement>('.fb-tour-exit')?.click();
      __resetOnboarding();
      history.pushState({}, '', '/projects');
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
