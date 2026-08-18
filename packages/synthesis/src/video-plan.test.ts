import { describe, expect, it } from 'vitest';
import {
  buildVideoPlan,
  clampCenter,
  CONTROLBAR_CROP_CSS_PX,
  sampleCamera,
  sampleCursor,
  type StepSegment,
  type VideoPlanInput,
} from './video-plan';

const viewport = { w: 1280, h: 800 };

const step = (over: Partial<VideoPlanInput['steps'][number]> = {}): VideoPlanInput['steps'][number] => ({
  caption: 'Click Save',
  audioMs: 4000,
  bbox: { x: 600, y: 300, w: 120, h: 40 },
  viewport,
  hasPostFrame: true,
  ...over,
});

const plan = (steps = [step()], intro = 1500, outro = 1200) =>
  buildVideoPlan({ title: 'Invite a teammate', introAudioMs: intro, outroAudioMs: outro, steps });

describe('buildVideoPlan', () => {
  it('brackets steps with intro and outro cards and keeps the timeline contiguous', () => {
    const p = plan([step(), step({ caption: 'Open settings' })]);
    expect(p.segments[0]!.kind).toBe('intro');
    expect(p.segments[p.segments.length - 1]!.kind).toBe('outro');
    let clock = 0;
    for (const seg of p.segments) {
      expect(seg.startMs).toBe(clock);
      clock += seg.durationMs;
    }
    expect(p.totalMs).toBe(clock);
  });

  it('sizes a step from its narration audio plus lead and tail', () => {
    const p = plan([step({ audioMs: 6000 })]);
    const s = p.segments[1] as StepSegment;
    expect(s.durationMs).toBe(350 + 6000 + 700);
    expect(s.audioStartMs).toBe(s.startMs + 350);
  });

  it('floors a near-silent step at the minimum watchable length', () => {
    const p = plan([step({ audioMs: 100 })]);
    expect((p.segments[1] as StepSegment).durationMs).toBe(3400);
  });

  it('keeps every camera key inside the zoomed crop bounds', () => {
    // A target at the far edge must not push the camera past the card.
    const p = plan([step({ bbox: { x: 1250, y: 770 - CONTROLBAR_CROP_CSS_PX, w: 28, h: 20 } })]);
    const s = p.segments[1] as StepSegment;
    for (const k of s.camera) {
      const half = 0.5 / k.zoom;
      expect(k.cx).toBeGreaterThanOrEqual(half - 1e-9);
      expect(k.cx).toBeLessThanOrEqual(1 - half + 1e-9);
      expect(k.cy).toBeGreaterThanOrEqual(half - 1e-9);
      expect(k.cy).toBeLessThanOrEqual(1 - half + 1e-9);
    }
  });

  it('zooms deeper on a small target than a large one, within clamps', () => {
    const small = plan([step({ bbox: { x: 600, y: 300, w: 30, h: 20 } })]).segments[1] as StepSegment;
    const large = plan([step({ bbox: { x: 100, y: 100, w: 900, h: 500 } })]).segments[1] as StepSegment;
    const zoomOf = (s: StepSegment) => Math.max(...s.camera.map((k) => k.zoom));
    expect(zoomOf(small)).toBeGreaterThan(zoomOf(large));
    expect(zoomOf(small)).toBeLessThanOrEqual(1.6);
    expect(zoomOf(large)).toBeGreaterThanOrEqual(1.15);
  });

  it('drops the cursor, click and highlight when a step has no target', () => {
    const p = plan([step({ bbox: null })]);
    const s = p.segments[1] as StepSegment;
    expect(s.cursor).toBeNull();
    expect(s.clickMs).toBeNull();
    expect(s.highlight).toBeNull();
    // But the result frame still shows, on a fraction of the step.
    expect(s.postCutMs).toBeGreaterThan(0);
    expect(s.postCutMs!).toBeLessThan(s.durationMs);
  });

  it('treats a target inside the cropped control-bar strip as no target', () => {
    const p = plan([step({ bbox: { x: 600, y: 800 - CONTROLBAR_CROP_CSS_PX + 5, w: 40, h: 20 } })]);
    expect((p.segments[1] as StepSegment).highlight).toBeNull();
  });

  it('chains the cursor: each step starts where the previous one ended', () => {
    const p = plan([step(), step({ bbox: { x: 100, y: 500, w: 60, h: 30 } })]);
    const s1 = p.segments[1] as StepSegment;
    const s2 = p.segments[2] as StepSegment;
    expect(s2.cursor![0]!.x).toBeCloseTo(s1.cursor![1]!.x, 8);
    expect(s2.cursor![0]!.y).toBeCloseTo(s1.cursor![1]!.y, 8);
  });

  it('never cuts to the post frame before the click lands', () => {
    const p = plan([step()]);
    const s = p.segments[1] as StepSegment;
    expect(s.postCutMs).toBeGreaterThan(s.clickMs!);
    expect(s.postCutMs!).toBeLessThan(s.durationMs);
  });

  it('omits the post cut when the step has no post frame', () => {
    const p = plan([step({ hasPostFrame: false })]);
    expect((p.segments[1] as StepSegment).postCutMs).toBeNull();
  });
});

describe('sampling', () => {
  it('sampleCamera eases between keys and clamps at both ends', () => {
    const keys = [
      { t: 0, cx: 0.5, cy: 0.5, zoom: 1 },
      { t: 1000, cx: 0.7, cy: 0.4, zoom: 1.4 },
    ];
    expect(sampleCamera(keys, -50).zoom).toBe(1);
    expect(sampleCamera(keys, 5000).zoom).toBe(1.4);
    const mid = sampleCamera(keys, 500);
    expect(mid.zoom).toBeGreaterThan(1);
    expect(mid.zoom).toBeLessThan(1.4);
  });

  it('sampleCursor lands exactly on the target', () => {
    const keys = [
      { t: 0, x: 0.2, y: 0.8 },
      { t: 700, x: 0.6, y: 0.3 },
    ];
    const end = sampleCursor(keys, 700);
    expect(end.x).toBeCloseTo(0.6, 8);
    expect(end.y).toBeCloseTo(0.3, 8);
    // Mid-travel the curved path deviates from the straight line.
    const mid = sampleCursor(keys, 350);
    const line = { x: (0.2 + 0.6) / 2, y: (0.8 + 0.3) / 2 };
    expect(Math.hypot(mid.x - line.x, mid.y - line.y)).toBeGreaterThan(0.001);
  });

  it('clampCenter pins the visible window inside the card', () => {
    expect(clampCenter(0.05, 1.5)).toBeCloseTo(1 / 3, 5);
    expect(clampCenter(0.98, 1.5)).toBeCloseTo(1 - 1 / 3, 5);
    expect(clampCenter(0.5, 1.5)).toBe(0.5);
  });
});
