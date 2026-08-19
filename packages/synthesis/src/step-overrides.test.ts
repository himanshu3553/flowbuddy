import { describe, expect, it } from 'vitest';

import type { DistilledStep } from './distill';
import { applyStepTextOverrides, stepOverridesByKeyEvent } from './step-overrides';

// ── founder edits survive a reprocess ───────────────────────────────────────────────────────────
//
// A reprocess deletes and recreates every step row, so without re-attachment a founder's edited
// instruction silently reverts to model output — the exact "human words lost to a rebuild" failure
// the override layer exists to prevent. These tests pin the two halves: indexing stored edits by
// their anchor, and re-applying them to a fresh distillation.

const row = (keyEventId: string | undefined, instruction: string, detail: string | undefined, at: number) => ({
  data: { keyEventId, instruction, detail },
  editedAt: new Date(at),
  editedById: 'user-1',
});

const step = (keyEventId: string | undefined, instruction: string, detail?: string): DistilledStep => ({
  instruction,
  ...(detail ? { detail } : {}),
  route: '/a',
  narration: null,
  screenshotFile: null,
  ...(keyEventId ? { keyEventId } : {}),
});

describe('stepOverridesByKeyEvent', () => {
  it('indexes edits by their anchor', () => {
    const map = stepOverridesByKeyEvent([row('e1', 'Click Save', 'Bottom right', 100)]);
    expect(map.get('e1')).toMatchObject({ instruction: 'Click Save', detail: 'Bottom right' });
  });

  it('skips rows without an anchor — there is nothing to re-attach them by', () => {
    const map = stepOverridesByKeyEvent([row(undefined, 'Click Save', undefined, 100)]);
    expect(map.size).toBe(0);
  });

  it('skips rows without an instruction', () => {
    const map = stepOverridesByKeyEvent([row('e1', '   ', undefined, 100)]);
    expect(map.size).toBe(0);
  });

  it('the LATEST edit wins when two rows share an anchor, regardless of order', () => {
    const older = row('e1', 'Old wording', undefined, 100);
    const newer = row('e1', 'New wording', undefined, 200);
    expect(stepOverridesByKeyEvent([older, newer]).get('e1')?.instruction).toBe('New wording');
    expect(stepOverridesByKeyEvent([newer, older]).get('e1')?.instruction).toBe('New wording');
  });

  it('an empty detail becomes absence, not an empty string', () => {
    const map = stepOverridesByKeyEvent([row('e1', 'Click Save', '  ', 100)]);
    expect(map.get('e1')?.detail).toBeUndefined();
  });
});

describe('applyStepTextOverrides', () => {
  it('rewrites the matched step in place and reports its anchor as applied', () => {
    const steps = [step('e1', 'Model wording', 'model detail'), step('e2', 'Untouched')];
    const applied = applyStepTextOverrides(steps, stepOverridesByKeyEvent([row('e1', 'Founder wording', 'founder detail', 100)]));
    expect(steps[0]).toMatchObject({ instruction: 'Founder wording', detail: 'founder detail' });
    expect(steps[1]!.instruction).toBe('Untouched');
    expect([...applied]).toEqual(['e1']);
  });

  it('an override with no detail CLEARS the model detail — the founder saved what they meant', () => {
    const steps = [step('e1', 'Model wording', 'model detail')];
    applyStepTextOverrides(steps, stepOverridesByKeyEvent([row('e1', 'Founder wording', undefined, 100)]));
    expect(steps[0]!.detail).toBeUndefined();
  });

  it('steps without an anchor are never touched', () => {
    const steps = [step(undefined, 'Model wording')];
    const applied = applyStepTextOverrides(steps, stepOverridesByKeyEvent([row('e1', 'Founder wording', undefined, 100)]));
    expect(steps[0]!.instruction).toBe('Model wording');
    expect(applied.size).toBe(0);
  });

  it('an override whose anchor keys no step is simply not applied — the caller counts it as lost', () => {
    const overrides = stepOverridesByKeyEvent([row('gone', 'Founder wording', undefined, 100)]);
    const applied = applyStepTextOverrides([step('e1', 'Model wording')], overrides);
    expect(applied.size).toBe(0);
    expect(overrides.size).toBe(1);
  });
});
