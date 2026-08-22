'use client';

import { Maximize2 } from 'lucide-react';

import { boxStyle, Highlight, type Bbox, type Viewport } from '@/components/dashboard/screenshot-highlight';
import { useStepLightbox } from '@/components/dashboard/step-lightbox';

interface StepScreenshotProps {
  url: string;
  alt: string;
  /** Position in the workflow's step list — what the shared lightbox opens on. */
  index: number;
  /** The clicked element's rect, in capture-time viewport pixels (may be absent for some steps). */
  bbox?: Bbox | null;
  /** The capture-time viewport, used to express the bbox as DPR-independent percentages. */
  viewport?: Viewport | null;
}

/**
 * A workflow-step screenshot: a clickable thumbnail that opens the workflow's shared lightbox
 * (`StepLightbox`) on this step. The thumbnail overlays the captured element's bbox as an indigo
 * highlight so the reader sees where to click. Renders without a highlight when no bbox exists.
 */
export function StepScreenshot({ url, alt, index, bbox, viewport }: StepScreenshotProps) {
  const { open } = useStepLightbox();
  const style =
    bbox && viewport && viewport.w > 0 && viewport.h > 0 ? boxStyle(bbox, viewport) : null;

  return (
    <button
      type="button"
      aria-label={`Open ${alt} larger`}
      onClick={() => open(index)}
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
  );
}
