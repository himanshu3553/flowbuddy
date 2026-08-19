import { describe, expect, it } from 'vitest';

import type { DistilledStep } from './distill';
import { applyStepOverrides, stepOverridesByKeyEvent } from './step-overrides';

// ── founder edits survive a reprocess ───────────────────────────────────────────────────────────
//
// A reprocess deletes and recreates every step row, so without re-attachment a founder's edited
// instruction (or picked frame) silently reverts to model output — the exact "human edits lost to
// a rebuild" failure the override layer exists to prevent. These tests pin the two halves:
// indexing stored edits by their anchor, and re-applying them to a fresh distillation.

const row = (keyEventId: string | undefined, instruction: string, detail: string | undefined, at: number) => ({
  data: { keyEventId, instruction, detail },
  editedAt: new Date(at),
  editedById: 'user-1',
});

const imageRow = (
  keyEventId: string,
  screenshotFile: string,
  at: number,
  fields: string[] = ['image'],
  bbox?: { x: number; y: number; w: number; h: number },
) => ({
  data: { keyEventId, instruction: 'Stored wording', screenshotFile, editedFields: fields, ...(bbox ? { bbox } : {}) },
  editedAt: new Date(at),
  editedById: 'user-1',
});

const step = (keyEventId: string | undefined, instruction: string, detail?: string): DistilledStep => ({
  instruction,
  ...(detail ? { detail } : {}),
  route: '/a',
  narration: null,
  screenshotFile: 'model-frame.webp',
  bbox: { x: 1, y: 2, w: 3, h: 4 },
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

  it('a row with no field list is a TEXT edit — the legacy shape from before images were editable', () => {
    const o = stepOverridesByKeyEvent([row('e1', 'Click Save', undefined, 100)]).get('e1');
    expect(o?.editedFields).toEqual(['text']);
    expect(o?.screenshotFile).toBeUndefined();
  });

  it('an image-only row carries the frame and NOT the stored wording', () => {
    const o = stepOverridesByKeyEvent([imageRow('e1', 'founder-frame.webp', 100)]).get('e1');
    expect(o?.editedFields).toEqual(['image']);
    expect(o?.screenshotFile).toBe('founder-frame.webp');
    expect(o?.instruction).toBeUndefined();
  });

  it('a text+image row carries both', () => {
    const o = stepOverridesByKeyEvent([imageRow('e1', 'founder-frame.webp', 100, ['text', 'image'])]).get('e1');
    expect(o?.editedFields).toEqual(['text', 'image']);
    expect(o?.instruction).toBe('Stored wording');
    expect(o?.screenshotFile).toBe('founder-frame.webp');
  });

  it('an image marker whose frame is missing is skipped, not half-applied', () => {
    const map = stepOverridesByKeyEvent([
      { data: { keyEventId: 'e1', editedFields: ['image'] }, editedAt: new Date(100), editedById: 'user-1' },
    ]);
    expect(map.size).toBe(0);
  });
});

describe('applyStepOverrides', () => {
  it('rewrites the matched step in place and reports its anchor as applied', () => {
    const steps = [step('e1', 'Model wording', 'model detail'), step('e2', 'Untouched')];
    const applied = applyStepOverrides(steps, stepOverridesByKeyEvent([row('e1', 'Founder wording', 'founder detail', 100)]));
    expect(steps[0]).toMatchObject({ instruction: 'Founder wording', detail: 'founder detail' });
    expect(steps[1]!.instruction).toBe('Untouched');
    expect([...applied]).toEqual(['e1']);
  });

  it('an override with no detail CLEARS the model detail — the founder saved what they meant', () => {
    const steps = [step('e1', 'Model wording', 'model detail')];
    applyStepOverrides(steps, stepOverridesByKeyEvent([row('e1', 'Founder wording', undefined, 100)]));
    expect(steps[0]!.detail).toBeUndefined();
  });

  it('steps without an anchor are never touched', () => {
    const steps = [step(undefined, 'Model wording')];
    const applied = applyStepOverrides(steps, stepOverridesByKeyEvent([row('e1', 'Founder wording', undefined, 100)]));
    expect(steps[0]!.instruction).toBe('Model wording');
    expect(applied.size).toBe(0);
  });

  it('an override whose anchor keys no step is simply not applied — the caller counts it as lost', () => {
    const overrides = stepOverridesByKeyEvent([row('gone', 'Founder wording', undefined, 100)]);
    const applied = applyStepOverrides([step('e1', 'Model wording')], overrides);
    expect(applied.size).toBe(0);
    expect(overrides.size).toBe(1);
  });

  it('an image override swaps the frame, clears a rect the pick did not have, and leaves the wording alone', () => {
    const steps = [step('e1', 'Model wording', 'model detail')];
    applyStepOverrides(steps, stepOverridesByKeyEvent([imageRow('e1', 'founder-frame.webp', 100)]));
    expect(steps[0]!.screenshotFile).toBe('founder-frame.webp');
    expect(steps[0]!.bbox).toBeUndefined();
    expect(steps[0]).toMatchObject({ instruction: 'Model wording', detail: 'model detail' });
  });

  it('an image override carries the picked frame’s OWN rect, so the highlight survives reprocess', () => {
    const picked = { x: 10, y: 20, w: 30, h: 40 };
    const steps = [step('e1', 'Model wording')];
    applyStepOverrides(steps, stepOverridesByKeyEvent([imageRow('e1', 'founder-frame.webp', 100, ['image'], picked)]));
    expect(steps[0]!.screenshotFile).toBe('founder-frame.webp');
    expect(steps[0]!.bbox).toEqual(picked);
  });

  it('stamps editedFields onto the step so the NEXT reprocess knows what to carry', () => {
    const textSteps = [step('e1', 'Model wording')];
    applyStepOverrides(textSteps, stepOverridesByKeyEvent([row('e1', 'Founder wording', undefined, 100)]));
    expect(textSteps[0]!.editedFields).toEqual(['text']);

    const imageSteps = [step('e1', 'Model wording')];
    applyStepOverrides(imageSteps, stepOverridesByKeyEvent([imageRow('e1', 'founder-frame.webp', 100)]));
    expect(imageSteps[0]!.editedFields).toEqual(['image']);
  });

  it('a text-only override never touches the frame', () => {
    const steps = [step('e1', 'Model wording')];
    applyStepOverrides(steps, stepOverridesByKeyEvent([row('e1', 'Founder wording', undefined, 100)]));
    expect(steps[0]!.screenshotFile).toBe('model-frame.webp');
    expect(steps[0]!.bbox).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });
});
