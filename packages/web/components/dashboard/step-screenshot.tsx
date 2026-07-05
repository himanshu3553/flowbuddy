'use client';

import { Maximize2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

type Bbox = { x: number; y: number; w: number; h: number };

interface StepScreenshotProps {
  url: string;
  alt: string;
  stepNumber: number;
  instruction?: string;
  /** The clicked element's rect, in capture-time viewport pixels (may be absent for some steps). */
  bbox?: Bbox | null;
  /** The capture-time viewport, used to express the bbox as DPR-independent percentages. */
  viewport?: { w: number; h: number } | null;
}

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

/**
 * Map a viewport-pixel bbox to CSS percentages of the screenshot. The screenshot is the full viewport
 * (scaled by the device pixel ratio), so percentages relative to the viewport line up with the image
 * at any rendered size — no DPR math needed. Width/height are clamped so the box never spills past an
 * edge; returns null for an empty box. (Mirrors the parked `lib/highlight.ts` math — kept self-
 * contained here rather than importing parked Phase-2 code.)
 */
function boxStyle(bbox: Bbox, vp: { w: number; h: number }): React.CSSProperties | null {
  const x = clamp01(bbox.x / vp.w);
  const y = clamp01(bbox.y / vp.h);
  const w = Math.min(clamp01(bbox.w / vp.w), 1 - x);
  const h = Math.min(clamp01(bbox.h / vp.h), 1 - y);
  if (w <= 0 || h <= 0) return null;
  return { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` };
}

/** Red "click here" highlight — a soft-glow rounded rectangle over the captured target element. */
function Highlight({ style }: { style: React.CSSProperties }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute rounded-[4px] border-2 border-[#dc2626] bg-[#dc2626]/5 shadow-[0_0_0_2px_rgba(220,38,38,0.20),0_2px_12px_rgba(220,38,38,0.40)]"
      style={style}
    />
  );
}

/**
 * A workflow-step screenshot: a clickable thumbnail that opens the shot in a same-page lightbox
 * (no new tab). Both the thumbnail and the popup overlay the captured element's bbox as an indigo
 * highlight so the reader sees where to click. Renders without a highlight when no bbox exists.
 */
export function StepScreenshot({
  url,
  alt,
  stepNumber,
  instruction,
  bbox,
  viewport,
}: StepScreenshotProps) {
  const style =
    bbox && viewport && viewport.w > 0 && viewport.h > 0 ? boxStyle(bbox, viewport) : null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Open ${alt} larger`}
          className="group relative block w-full overflow-hidden rounded-lg border transition hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt} className="block w-full" />
          {style && <Highlight style={style} />}
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:bg-foreground/10 group-hover:opacity-100">
            <span className="inline-flex items-center gap-1 rounded-pill bg-background/90 px-2 py-1 text-[10.5px] font-medium text-foreground shadow-card">
              <Maximize2 className="h-3 w-3" /> Expand
            </span>
          </span>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-3.5 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-primary text-[10px] font-bold text-primary">
              {stepNumber}
            </span>
            <span className="truncate">{instruction || alt}</span>
          </DialogTitle>
        </DialogHeader>
        {/* Scroll box caps the height; the inner relative wrapper is sized to the image so the
            highlight percentages stay aligned even when the shot is taller than the viewport. */}
        <div className="max-h-[72vh] overflow-y-auto bg-[color:var(--paper-2)]">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={alt} className="block w-full" />
            {style && <Highlight style={style} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
