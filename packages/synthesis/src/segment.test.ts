import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapturedEvent } from '@flowbuddy/shared';

vi.mock('./responses', () => ({ structuredJsonCall: vi.fn() }));

import { structuredJsonCall } from './responses';
import { eventLabel, partitionByMarkers, segment } from './segment';

const mockCall = vi.mocked(structuredJsonCall);

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

// ── markers are HARD cut points ─────────────────────────────────────────────────────────────────
//
// The marker button existed and shipped in the manifest, but segmentation consumed it as a prompt
// line under "supporting signals" — which the model could, and under drift did, overrule: a
// workflow silently merged across an explicit author boundary. The fix is structural, the same
// lesson as the labelled-question fix: partition the events at each marker BEFORE the model, one
// pass per span, so the events on either side are never in the same prompt. These tests pin both
// halves — the pure partition and the per-span orchestration.

const cev = (id: string, t: number): CapturedEvent =>
  ({
    id,
    t,
    type: 'click',
    target: { tag: 'button', text: id },
    route: { url: `https://x.test/${id}`, path: `/${id}`, hash: '', title: id },
  }) as CapturedEvent;

const events = [cev('e1', 100), cev('e2', 200), cev('e3', 300), cev('e4', 400)];

describe('partitionByMarkers', () => {
  const ids = (spans: CapturedEvent[][]) => spans.map((s) => s.map((e) => e.id));

  it('no markers → one span holding everything (the pre-partition behaviour)', () => {
    expect(ids(partitionByMarkers(events, []))).toEqual([['e1', 'e2', 'e3', 'e4']]);
  });

  it('cuts at the first event at or after the marker time', () => {
    expect(ids(partitionByMarkers(events, [{ t: 250 }]))).toEqual([
      ['e1', 'e2'],
      ['e3', 'e4'],
    ]);
  });

  it('a marker exactly on an event starts the new span WITH that event', () => {
    expect(ids(partitionByMarkers(events, [{ t: 300 }]))).toEqual([
      ['e1', 'e2'],
      ['e3', 'e4'],
    ]);
  });

  it('a marker before the first event produces no empty leading span', () => {
    expect(ids(partitionByMarkers(events, [{ t: 50 }]))).toEqual([['e1', 'e2', 'e3', 'e4']]);
  });

  it('a marker after the last event produces no empty trailing span', () => {
    expect(ids(partitionByMarkers(events, [{ t: 999 }]))).toEqual([['e1', 'e2', 'e3', 'e4']]);
  });

  it('two markers collapsing onto the same cut produce one cut, never an empty span', () => {
    expect(ids(partitionByMarkers(events, [{ t: 250 }, { t: 260 }]))).toEqual([
      ['e1', 'e2'],
      ['e3', 'e4'],
    ]);
  });

  it('markers arriving out of order still cut in timeline order', () => {
    expect(ids(partitionByMarkers(events, [{ t: 350 }, { t: 150 }]))).toEqual([
      ['e1'],
      ['e2', 'e3'],
      ['e4'],
    ]);
  });

  it('no events → no spans', () => {
    expect(partitionByMarkers([], [{ t: 100 }])).toEqual([]);
  });
});

describe('segment — one model pass per marker-delimited span', () => {
  const wf = (title: string, eventIds: string[]) => ({
    title,
    event_ids: eventIds,
    boundary_evidence: 'test',
    confidence: 'high',
  });
  const answer = (...workflows: ReturnType<typeof wf>[]) => JSON.stringify({ workflows });
  const run = (markers: { t: number }[]) =>
    segment({} as never, 'test-model', events, markers, new Map(), 'overall narration');

  beforeEach(() => {
    mockCall.mockReset();
  });

  it('calls the model once per span, each call blind to the other span, markers absent from every prompt', async () => {
    mockCall
      .mockResolvedValueOnce(answer(wf('Task A', ['e1', 'e2'])))
      .mockResolvedValueOnce(answer(wf('Task B', ['e3', 'e4'])));

    const out = await run([{ t: 250 }]);

    expect(mockCall).toHaveBeenCalledTimes(2);
    const first = mockCall.mock.calls[0]![0];
    const second = mockCall.mock.calls[1]![0];
    expect(first.user).toContain('id=e2');
    expect(first.user).not.toContain('id=e3');
    expect(second.user).toContain('id=e3');
    expect(second.user).not.toContain('id=e2');
    for (const call of [first, second]) {
      expect(call.user.toLowerCase()).not.toContain('marker');
      expect(call.system.toLowerCase()).not.toContain('marker');
      expect(call.user).toContain('author-delimited span');
    }
    expect(out).toEqual([
      { title: 'Task A', eventIds: ['e1', 'e2'] },
      { title: 'Task B', eventIds: ['e3', 'e4'] },
    ]);
  });

  it('a workflow structurally cannot claim events across a marker', async () => {
    // Span 1's model reaches for e3 — an id that lives across the marker. It is unknown in that
    // span's call, so it is filtered exactly like any hallucinated id.
    mockCall
      .mockResolvedValueOnce(answer(wf('Task A', ['e1', 'e2', 'e3'])))
      .mockResolvedValueOnce(answer(wf('Task B', ['e3', 'e4'])));

    const out = await run([{ t: 250 }]);
    expect(out).toEqual([
      { title: 'Task A', eventIds: ['e1', 'e2'] },
      { title: 'Task B', eventIds: ['e3', 'e4'] },
    ]);
  });

  it('carry-forward assigns omitted events within their own span only', async () => {
    mockCall
      .mockResolvedValueOnce(answer(wf('Task A', ['e1']))) // e2 omitted → carried into Task A
      .mockResolvedValueOnce(answer(wf('Task B', ['e3', 'e4'])));

    const out = await run([{ t: 250 }]);
    expect(out).toEqual([
      { title: 'Task A', eventIds: ['e1', 'e2'] },
      { title: 'Task B', eventIds: ['e3', 'e4'] },
    ]);
  });

  it('an empty model answer collapses that span alone to one workflow', async () => {
    mockCall
      .mockResolvedValueOnce('{}')
      .mockResolvedValueOnce(answer(wf('Task B', ['e3', 'e4'])));

    const out = await run([{ t: 250 }]);
    expect(out).toEqual([
      { title: 'Recorded workflow', eventIds: ['e1', 'e2'] },
      { title: 'Task B', eventIds: ['e3', 'e4'] },
    ]);
  });

  it('fallback titles number globally across spans, never restarting per span', async () => {
    mockCall
      .mockResolvedValueOnce(answer(wf('', ['e1', 'e2'])))
      .mockResolvedValueOnce(answer(wf('', ['e3', 'e4'])));

    const out = await run([{ t: 250 }]);
    expect(out.map((s) => s.title)).toEqual(['Workflow 1', 'Workflow 2']);
  });

  it('without markers: one call over all events, and no span note', async () => {
    mockCall.mockResolvedValueOnce(answer(wf('Only task', ['e1', 'e2', 'e3', 'e4'])));

    const out = await run([]);
    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall.mock.calls[0]![0].user).not.toContain('author-delimited');
    expect(out).toEqual([{ title: 'Only task', eventIds: ['e1', 'e2', 'e3', 'e4'] }]);
  });
});
