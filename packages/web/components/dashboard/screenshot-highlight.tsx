'use client';

/**
 * The "click here" highlight shared by every surface that draws a captured element's rect onto a
 * screenshot (the step card + lightbox, the frame picker). Extracted at the second consumer.
 */

export type Bbox = { x: number; y: number; w: number; h: number };
export type Viewport = { w: number; h: number };

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

/**
 * Map a viewport-pixel bbox to CSS percentages of the screenshot. The screenshot is the full
 * viewport (scaled by the device pixel ratio), so percentages relative to the viewport line up with
 * the image at any rendered size — no DPR math needed. The one alignment rule: the positioned
 * ancestor must be sized to the IMAGE (natural ratio, or a stage whose aspect-ratio IS the capture
 * viewport's) — percentages of a letterboxed stage drift off the picture. Width/height are clamped
 * so the box never spills past an edge; returns null for an empty box. (Mirrors the parked
 * `lib/highlight.ts` math — kept self-contained here rather than importing parked Phase-2 code.)
 */
export function boxStyle(bbox: Bbox, vp: Viewport): React.CSSProperties | null {
  const x = clamp01(bbox.x / vp.w);
  const y = clamp01(bbox.y / vp.h);
  const w = Math.min(clamp01(bbox.w / vp.w), 1 - x);
  const h = Math.min(clamp01(bbox.h / vp.h), 1 - y);
  if (w <= 0 || h <= 0) return null;
  return { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` };
}

/** Red "click here" highlight — a soft-glow rounded rectangle over the captured target element. */
export function Highlight({ style }: { style: React.CSSProperties }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute rounded-[4px] border-2 border-[#dc2626] bg-[#dc2626]/5 shadow-[0_0_0_2px_rgba(220,38,38,0.20),0_2px_12px_rgba(220,38,38,0.40)]"
      style={style}
    />
  );
}
