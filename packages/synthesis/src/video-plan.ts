/**
 * The demo-video PLAN compiler — pure, no I/O, the same posture as `execution-plan.ts`:
 * everything time- and camera-shaped is decided here so it can be unit-tested without
 * touching an image, a model, or ffmpeg. The renderer (`video-render.ts`) is a dumb
 * executor of this plan; if a video looks wrong, the bug is almost always here, and a
 * test can replay it.
 *
 * Coordinate model. Camera centers, cursor positions and highlight rects are all
 * NORMALIZED to the *cropped* screenshot (0..1 on each axis) — resolution-independent,
 * so the plan never needs to see an image. The renderer maps them to pixels.
 *
 * Tuning constants (this header is their one home):
 * - FPS/WIDTH/HEIGHT — 30fps 1080p. The output is a marketing asset; 720p reads as a
 *   screen recording, which is exactly what this feature exists to not look like.
 * - CONTROLBAR_CROP_CSS_PX (76) — the recorder's control bar is baked into every
 *   captured frame at its DEFAULT position (bottom-center, `bottom:20px`, ~40px tall).
 *   We crop that strip off the bottom of every screenshot before compositing. The bar
 *   is draggable, so a founder who moved it mid-recording will still see it in the
 *   video — the real fix is hiding it pre-capture in a future recorder release; this
 *   crop is the retroactive one that works on every recording already in storage.
 * - STEP_LEAD_MS → CLICK_MS — a step opens wide for 500ms so the viewer orients, the
 *   cursor travels for 700ms, the click lands at 1200ms. Slower than a real user on
 *   purpose: demo pacing, not replay pacing.
 * - POST_CUT_DELAY_MS (400) — the action frame lingers briefly after the click (the
 *   pressed state) before crossfading to the post-action "result" frame.
 * - ZOOM_* — zoom depth is derived from target size (small target → deeper zoom),
 *   clamped so a huge hero button doesn't zoom to 1.0 and a tiny icon doesn't pixelate
 *   past 1.6× of a JPEG-quality-80 source.
 * - MIN_STEP_MS / AUDIO_TAIL_MS — a step never ends mid-sentence: duration is driven
 *   by the measured TTS length plus a settling tail, floored so even a silent step
 *   gets a readable beat.
 */

export const VIDEO_FPS = 30;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const CONTROLBAR_CROP_CSS_PX = 76;
export const TRANSITION_MS = 320;

const INTRO_MIN_MS = 2600;
const OUTRO_MIN_MS = 2200;
const CARD_AUDIO_LEAD_MS = 500;
const CARD_AUDIO_TAIL_MS = 700;

const STEP_LEAD_MS = 500;
const CURSOR_TRAVEL_MS = 700;
const CLICK_MS = STEP_LEAD_MS + CURSOR_TRAVEL_MS;
const POST_CUT_DELAY_MS = 400;
const POST_CUT_NO_CURSOR_FRACTION = 0.45;
const STEP_AUDIO_LEAD_MS = 350;
const AUDIO_TAIL_MS = 700;
const MIN_STEP_MS = 3400;

const ZOOM_REST = 1.03;
const ZOOM_MIN = 1.15;
const ZOOM_MAX = 1.6;
const ZOOM_TARGET_WIDTH_FRACTION = 0.3;
const ZOOM_SETTLE_FACTOR = 0.85;
const ZOOM_IN_LAG_MS = 350;
const CAMERA_SETTLE_MS = 600;

const CURSOR_HOME = { x: 0.5, y: 0.58 };

export interface Bbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VideoPlanStepInput {
  /** Caption line shown in the step band — the distilled instruction. */
  caption: string;
  /** Measured duration of this step's TTS narration (0 when narration failed). */
  audioMs: number;
  /** Click-target rect in CSS px of the recorded viewport, when the step has one. */
  bbox?: Bbox | null;
  /** Recorded viewport in CSS px (from the capture manifest). */
  viewport: { w: number; h: number };
  /** Whether a distinct post-action "result" frame exists for this step. */
  hasPostFrame: boolean;
}

export interface VideoPlanInput {
  title: string;
  introAudioMs: number;
  outroAudioMs: number;
  steps: VideoPlanStepInput[];
}

/** A camera keyframe; the renderer eases between consecutive keys. Times are segment-relative ms. */
export interface CameraKey {
  t: number;
  cx: number;
  cy: number;
  zoom: number;
}

export interface CursorKey {
  t: number;
  x: number;
  y: number;
}

export interface StepSegment {
  kind: 'step';
  /** 0-based index into the plan's step inputs (and the renderer's frame assets). */
  index: number;
  caption: string;
  startMs: number;
  durationMs: number;
  /** Absolute timeline ms at which this step's narration begins. */
  audioStartMs: number;
  camera: CameraKey[];
  /** Two keys (from → to), or null when the step has no click target. */
  cursor: CursorKey[] | null;
  /** Segment-relative click moment; null without a target. */
  clickMs: number | null;
  /** Segment-relative crossfade to the post-action frame; null when there is none. */
  postCutMs: number | null;
  /** Normalized highlight rect around the target; null without one. */
  highlight: Bbox | null;
}

export interface CardSegment {
  kind: 'intro' | 'outro';
  text: string;
  startMs: number;
  durationMs: number;
  audioStartMs: number;
}

export type VideoSegment = StepSegment | CardSegment;

export interface VideoPlan {
  fps: number;
  width: number;
  height: number;
  totalMs: number;
  transitionMs: number;
  segments: VideoSegment[];
}

export function easeInOutCubic(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

export function easeOutCubic(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

/** Clamp a camera center so the zoomed crop never shows past the card's edge. */
export function clampCenter(c: number, zoom: number): number {
  const half = 0.5 / zoom;
  return Math.min(1 - half, Math.max(half, c));
}

interface NormalizedTarget {
  cx: number;
  cy: number;
  rect: Bbox;
  zoom: number;
}

/**
 * Normalize a CSS-px bbox against the cropped viewport. Returns null when the bbox is
 * degenerate or lies entirely inside the cropped control-bar strip (nothing to point at).
 */
function normalizeTarget(bbox: Bbox, viewport: { w: number; h: number }): NormalizedTarget | null {
  const effH = viewport.h - CONTROLBAR_CROP_CSS_PX;
  if (effH <= 0 || viewport.w <= 0 || bbox.w <= 0 || bbox.h <= 0) return null;
  if (bbox.y >= effH) return null;
  const rect: Bbox = {
    x: Math.max(0, Math.min(1, bbox.x / viewport.w)),
    y: Math.max(0, Math.min(1, bbox.y / effH)),
    w: Math.min(1, bbox.w / viewport.w),
    h: Math.min(1, (Math.min(bbox.h, effH - bbox.y)) / effH),
  };
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, ZOOM_TARGET_WIDTH_FRACTION / Math.max(rect.w, rect.h * (16 / 9) * 0.6, 0.02)));
  const cx = clampCenter(rect.x + rect.w / 2, zoom);
  const cy = clampCenter(rect.y + rect.h / 2, zoom);
  return { cx, cy, rect, zoom };
}

function stepDuration(audioMs: number): number {
  return Math.max(MIN_STEP_MS, STEP_AUDIO_LEAD_MS + audioMs + AUDIO_TAIL_MS);
}

export function buildVideoPlan(input: VideoPlanInput): VideoPlan {
  const segments: VideoSegment[] = [];
  let clock = 0;

  const introMs = Math.max(INTRO_MIN_MS, CARD_AUDIO_LEAD_MS + input.introAudioMs + CARD_AUDIO_TAIL_MS);
  segments.push({
    kind: 'intro',
    text: input.title,
    startMs: 0,
    durationMs: introMs,
    audioStartMs: CARD_AUDIO_LEAD_MS,
  });
  clock += introMs;

  let cursorFrom = { ...CURSOR_HOME };
  input.steps.forEach((step, index) => {
    const durationMs = stepDuration(step.audioMs);
    const target = step.bbox ? normalizeTarget(step.bbox, step.viewport) : null;

    const camera: CameraKey[] = [];
    camera.push({ t: 0, cx: 0.5, cy: 0.5, zoom: ZOOM_REST });
    let cursor: CursorKey[] | null = null;
    let clickMs: number | null = null;
    let postCutMs: number | null = null;

    if (target) {
      clickMs = CLICK_MS;
      cursor = [
        { t: STEP_LEAD_MS, x: cursorFrom.x, y: cursorFrom.y },
        { t: CLICK_MS - 80, x: target.cx > 0 ? target.rect.x + target.rect.w / 2 : target.cx, y: target.rect.y + target.rect.h / 2 },
      ];
      cursorFrom = { x: cursor[1]!.x, y: cursor[1]!.y };
      camera.push({ t: CLICK_MS + ZOOM_IN_LAG_MS, cx: target.cx, cy: target.cy, zoom: target.zoom });
      const settleZoom = Math.max(ZOOM_REST + 0.03, target.zoom * ZOOM_SETTLE_FACTOR);
      camera.push({ t: Math.max(CLICK_MS + ZOOM_IN_LAG_MS + 200, durationMs - CAMERA_SETTLE_MS), cx: target.cx, cy: target.cy, zoom: target.zoom });
      camera.push({
        t: durationMs,
        cx: clampCenter(0.5 + (target.cx - 0.5) * 0.5, settleZoom),
        cy: clampCenter(0.5 + (target.cy - 0.5) * 0.5, settleZoom),
        zoom: settleZoom,
      });
      if (step.hasPostFrame) postCutMs = CLICK_MS + POST_CUT_DELAY_MS;
    } else {
      // No target: a slow center drift; the narration carries the step.
      camera.push({ t: durationMs, cx: 0.5, cy: 0.5, zoom: ZOOM_REST + 0.07 });
      if (step.hasPostFrame) postCutMs = Math.round(durationMs * POST_CUT_NO_CURSOR_FRACTION);
    }

    segments.push({
      kind: 'step',
      index,
      caption: step.caption,
      startMs: clock,
      durationMs,
      audioStartMs: clock + STEP_AUDIO_LEAD_MS,
      camera,
      cursor,
      clickMs,
      postCutMs,
      highlight: target ? target.rect : null,
    });
    clock += durationMs;
  });

  const outroMs = Math.max(OUTRO_MIN_MS, CARD_AUDIO_LEAD_MS + input.outroAudioMs + CARD_AUDIO_TAIL_MS);
  segments.push({
    kind: 'outro',
    text: input.title,
    startMs: clock,
    durationMs: outroMs,
    audioStartMs: clock + CARD_AUDIO_LEAD_MS,
  });
  clock += outroMs;

  return {
    fps: VIDEO_FPS,
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    totalMs: clock,
    transitionMs: TRANSITION_MS,
    segments,
  };
}

/** Sample a camera key list at a segment-relative time, easing between keys. */
export function sampleCamera(keys: CameraKey[], t: number): { cx: number; cy: number; zoom: number } {
  if (t <= keys[0]!.t) return keys[0]!;
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i]!.t) {
      const a = keys[i - 1]!;
      const b = keys[i]!;
      const p = easeInOutCubic((t - a.t) / Math.max(1, b.t - a.t));
      return {
        cx: a.cx + (b.cx - a.cx) * p,
        cy: a.cy + (b.cy - a.cy) * p,
        zoom: a.zoom + (b.zoom - a.zoom) * p,
      };
    }
  }
  return keys[keys.length - 1]!;
}

/**
 * Sample the cursor between its two keys with an eased, gently curved path (a
 * perpendicular bulge, so travel reads as a hand movement rather than a linear tween).
 */
export function sampleCursor(keys: CursorKey[], t: number): { x: number; y: number } {
  const a = keys[0]!;
  const b = keys[keys.length - 1]!;
  if (t <= a.t) return a;
  if (t >= b.t) return b;
  const p = easeOutCubic((t - a.t) / Math.max(1, b.t - a.t));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const bulge = Math.min(0.06, dist * 0.18);
  // Quadratic bezier through a control point offset perpendicular to the travel line.
  const mx = (a.x + b.x) / 2 - dy / Math.max(dist, 1e-6) * bulge;
  const my = (a.y + b.y) / 2 + dx / Math.max(dist, 1e-6) * bulge;
  const q = 1 - p;
  return {
    x: q * q * a.x + 2 * q * p * mx + p * p * b.x,
    y: q * q * a.y + 2 * q * p * my + p * p * b.y,
  };
}
