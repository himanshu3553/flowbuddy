import type { Bbox, Highlight } from '@sync/shared';

const clamp01 = (n: number): number => Math.min(Math.max(n, 0), 1);

/**
 * Convert a captured element bbox (in viewport pixels) into a clamped fractional `Highlight`
 * for the screenshot overlay. Returns `undefined` when there's nothing usable to draw (missing
 * bbox/viewport, or zero area after clamping) so callers can simply omit the highlight.
 *
 * Lives in web (not `@sync/shared`) because Studio is its only runtime caller and we keep
 * web→shared imports type-only. The `Highlight` type itself is shared.
 */
export function highlightFromBbox(
  bbox: Bbox | undefined,
  viewport: { w: number; h: number } | undefined,
): Highlight | undefined {
  if (!bbox || !viewport?.w || !viewport?.h) return undefined;
  const x = clamp01(bbox.x / viewport.w);
  const y = clamp01(bbox.y / viewport.h);
  const w = Math.min(clamp01(bbox.w / viewport.w), 1 - x);
  const h = Math.min(clamp01(bbox.h / viewport.h), 1 - y);
  if (w <= 0 || h <= 0) return undefined;
  return { x, y, w, h };
}
