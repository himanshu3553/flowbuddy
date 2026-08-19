'use client';

import { Maximize2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import { boxStyle, Highlight, type Bbox, type Viewport } from '@/components/dashboard/screenshot-highlight';

interface StepScreenshotProps {
  url: string;
  alt: string;
  stepNumber: number;
  instruction?: string;
  /** The clicked element's rect, in capture-time viewport pixels (may be absent for some steps). */
  bbox?: Bbox | null;
  /** The capture-time viewport, used to express the bbox as DPR-independent percentages. */
  viewport?: Viewport | null;
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
