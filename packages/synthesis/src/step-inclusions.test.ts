import { describe, expect, it } from 'vitest';
import type { CapturedEvent } from '@flowbuddy/shared';

import type { DistilledStep } from './distill';
import { applyStepInclusions, parseStepInclusions } from './step-inclusions';

// ── founder step inclusion survives every rebuild ───────────────────────────────────────────────
//
// A deleted step must stay deleted and a restored step must stay restored across reprocesses —
// otherwise the founder's curation silently reverts to the distiller's judgment. These tests pin
// the pure application: removal by anchor, re-insertion at timeline position with the event's own
// anchor and the founder's words, and the skip/lost edges.

const cev = (id: string, i: number): CapturedEvent =>
  ({
    id,
    t: i * 100,
    type: 'click',
    target: { tag: 'button', text: id, bbox: { x: i, y: i, w: 10, h: 10 } },
    route: { url: `https://x.test/${id}`, path: `/${id}`, hash: '', title: id },
    screenshot: { file: `${id}.jpg` },
  }) as unknown as CapturedEvent;

const events = [cev('e1', 1), cev('e2', 2), cev('e3', 3), cev('e4', 4)];

const step = (keyEventId: string, instruction: string): DistilledStep => ({
  instruction,
  route: `/${keyEventId}`,
  narration: null,
  screenshotFile: `${keyEventId}.jpg`,
  keyEventId,
  sourceEventIds: [keyEventId],
});

describe('parseStepInclusions', () => {
  it('parses a well-formed shape and drops malformed entries', () => {
    const parsed = parseStepInclusions({
      removed: ['e1', 42, ''],
      added: [
        { keyEventId: 'e2', instruction: 'Click the thing', detail: ' ' },
        { keyEventId: 'e3', instruction: '' },
        { instruction: 'no anchor' },
        null,
      ],
    });
    expect(parsed).toEqual({ removed: ['e1'], added: [{ keyEventId: 'e2', instruction: 'Click the thing' }] });
  });

  it('null/empty shapes parse to null', () => {
    expect(parseStepInclusions(null)).toBeNull();
    expect(parseStepInclusions({})).toBeNull();
    expect(parseStepInclusions({ removed: [], added: [] })).toBeNull();
  });
});

describe('applyStepInclusions', () => {
  it('drops removed steps by anchor and leaves the rest', () => {
    const { steps } = applyStepInclusions(
      [step('e1', 'One'), step('e2', 'Two')],
      events,
      new Map(),
      { removed: ['e2'], added: [] },
    );
    expect(steps.map((s) => s.keyEventId)).toEqual(['e1']);
  });

  it('re-inserts an addition at its timeline position with the event anchor and the founder words', () => {
    const { steps, appliedAdditions } = applyStepInclusions(
      [step('e1', 'One'), step('e4', 'Four')],
      events,
      new Map(),
      { removed: [], added: [{ keyEventId: 'e2', instruction: 'Founder wording', detail: 'why' }] },
    );
    expect(steps.map((s) => s.keyEventId)).toEqual(['e1', 'e2', 'e4']);
    const added = steps[1]!;
    expect(added).toMatchObject({
      instruction: 'Founder wording',
      detail: 'why',
      route: '/e2',
      screenshotFile: 'e2.jpg',
      sourceEventIds: ['e2'],
      editedFields: ['text'],
    });
    expect([...appliedAdditions]).toEqual(['e2']);
  });

  it('an addition after every existing step lands at the end', () => {
    const { steps } = applyStepInclusions([step('e1', 'One')], events, new Map(), {
      removed: [],
      added: [{ keyEventId: 'e4', instruction: 'Last' }],
    });
    expect(steps.map((s) => s.keyEventId)).toEqual(['e1', 'e4']);
  });

  it('skips an addition whose event already became a step — the distiller kept it this time', () => {
    const { steps, appliedAdditions } = applyStepInclusions([step('e2', 'Kept')], events, new Map(), {
      removed: [],
      added: [{ keyEventId: 'e2', instruction: 'Founder wording' }],
    });
    expect(steps).toHaveLength(1);
    expect(steps[0]!.instruction).toBe('Kept');
    expect(appliedAdditions.size).toBe(0);
  });

  it('an addition outside this segment is not applied here — its own segment will take it', () => {
    const { appliedAdditions } = applyStepInclusions([step('e1', 'One')], events.slice(0, 2), new Map(), {
      removed: [],
      added: [{ keyEventId: 'e4', instruction: 'Elsewhere' }],
    });
    expect(appliedAdditions.size).toBe(0);
  });

  it('removed wins over added for the same anchor', () => {
    const { steps } = applyStepInclusions([], events, new Map(), {
      removed: ['e2'],
      added: [{ keyEventId: 'e2', instruction: 'Contradiction' }],
    });
    expect(steps).toHaveLength(0);
  });

  it('steps without an anchor are never removed', () => {
    const anchorless: DistilledStep = { instruction: 'Old', route: '/', narration: null, screenshotFile: null };
    const { steps } = applyStepInclusions([anchorless], events, new Map(), { removed: ['e1'], added: [] });
    expect(steps).toHaveLength(1);
  });
});
