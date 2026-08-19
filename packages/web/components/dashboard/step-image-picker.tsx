'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, ImageIcon } from 'lucide-react';

import { listRecordingFrames, updateStepImage, type RecordingFrames } from '@/lib/edit-actions';
import { boxStyle, Highlight } from '@/components/dashboard/screenshot-highlight';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * "Change image" for one step: a carousel over the frames THIS recording captured, nothing else —
 * the trust boundary is that everything a step shows is real capture, so there is no upload here
 * and the server re-validates the pick against the manifest. The highlight follows the picture: an
 * action frame brings its own target rect, an "after" frame clears it. The step's event citation
 * is untouched either way.
 *
 * The carousel opens ON the step's current frame and steps outward — the founder is almost always
 * picking a slightly earlier/later shot of the same moment. Loading follows the same shape: the
 * server signs only a window around the anchor (±5 to open), and reaching a loaded edge offers a
 * "Load earlier/more" CTA that extends the run in chunks — never the whole recording at once.
 */

/** Center slide width as a fraction of the viewport — 60% shows exactly one third of each
 *  neighbor peeking at the edges. (The track's translateX percentages resolve against the track's
 *  own box width, which equals the viewport's, so the same number drives both.) */
const SLIDE_PCT = 60;
/** How many more frames an edge CTA pulls in. */
const LOAD_CHUNK = 10;

type LoadedFrames = Extract<RecordingFrames, { ok: true }>;
type Frame = LoadedFrames['frames'][number];

export function StepImagePicker({
  itemId,
  instruction,
  detail,
}: {
  itemId: string;
  /** The step's saved instruction — the dialog's title, so the founder picks with the step in mind. */
  instruction: string;
  /** The step's saved detail, shown under the title when present. */
  detail: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<RecordingFrames | null>(null);
  /** GLOBAL frame index (on the recording's whole axis), not an index into the loaded window. */
  const [index, setIndex] = useState(0);

  function openPicker() {
    setOpen(true);
    setData(null);
    start(async () => {
      const res = await listRecordingFrames({ itemId });
      setData(res);
      if (res.ok) {
        const local = res.frames.findIndex((f) => f.file === res.current);
        setIndex(res.start + Math.max(0, local));
      }
    });
  }

  /** Extend the loaded run at one end. The new window anchors on the edge frame, so the ranges
   *  overlap there and merge into one contiguous run — the carousel axis never gets holes. */
  function loadMore(dir: 'before' | 'after') {
    if (!data?.ok || data.frames.length === 0) return;
    const anchor = dir === 'before' ? data.frames[0]!.file : data.frames[data.frames.length - 1]!.file;
    start(async () => {
      const res = await listRecordingFrames({
        itemId,
        anchorFile: anchor,
        before: dir === 'before' ? LOAD_CHUNK : 0,
        after: dir === 'after' ? LOAD_CHUNK : 0,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setData((prev) => {
        if (!prev || !prev.ok) return res;
        const byIdx = new Map<number, Frame>();
        prev.frames.forEach((f, i) => byIdx.set(prev.start + i, f));
        res.frames.forEach((f, i) => byIdx.set(res.start + i, f));
        const mergedStart = Math.min(prev.start, res.start);
        const merged: Frame[] = [];
        for (let i = mergedStart; byIdx.has(i); i++) merged.push(byIdx.get(i)!);
        return { ...prev, start: mergedStart, frames: merged };
      });
    });
  }

  function stepBy(delta: number) {
    setIndex((i) => {
      if (!data?.ok || data.frames.length === 0) return i;
      const lo = data.start;
      const hi = data.start + data.frames.length - 1;
      return Math.min(Math.max(i + delta, lo), hi);
    });
  }

  function pick(file: string) {
    start(async () => {
      const res = await updateStepImage({ itemId, screenshotFile: file });
      if (res.ok) {
        toast.success('Step image updated');
        if (res.actingParked) {
          toast.error(
            'Acting was parked for re-review — with this change the steps no longer compile to a runnable plan.',
          );
        }
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" disabled={busy} onClick={openPicker}>
        <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
        Change image
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-[80vw]"
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') stepBy(-1);
            if (e.key === 'ArrowRight') stepBy(1);
          }}
        >
          <DialogHeader>
            <DialogTitle>{instruction || 'Choose a frame for this step'}</DialogTitle>
            {detail ? <DialogDescription>{detail}</DialogDescription> : null}
          </DialogHeader>
          {data == null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading frames…</p>
          ) : !data.ok ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{data.error}</p>
          ) : data.frames.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              This recording captured no frames.
            </p>
          ) : (() => {
            const { frames: all, start: first, total, viewport: vp } = data;
            const stageRatio = vp && vp.w > 0 && vp.h > 0 ? `${vp.w} / ${vp.h}` : '16 / 10';
            const active = all[Math.min(Math.max(index - first, 0), all.length - 1)]!;
            const activeIsCurrent = active.file === data.current;
            const atLoadedLeft = index <= first;
            const atLoadedRight = index >= first + all.length - 1;
            const moreBefore = first > 0;
            const moreAfter = first + all.length < total;
            return (
              /* min-w-0 is load-bearing: DialogContent is a GRID, and a grid item's min-width:auto
                 lets the track's intrinsic width (N slides × full-size images) blow the item out
                 past the dialog — peeks and CTA float over the page. Zeroing the minimum pins the
                 carousel to the dialog's width so overflow-hidden actually clips. */
              <div className="min-w-0">
                <div className="relative overflow-hidden">
                  <div
                    className="flex"
                    style={{
                      transform: `translateX(calc(50% - ${(index - first + 0.5) * SLIDE_PCT}%))`,
                      transition: 'transform 200ms ease',
                    }}
                  >
                    {all.map((f, i) => {
                      const globalIdx = first + i;
                      const isCurrent = f.file === data.current;
                      const isActive = globalIdx === index;
                      const highlight = f.bbox && vp && vp.w > 0 && vp.h > 0 ? boxStyle(f.bbox, vp) : null;
                      return (
                        <div
                          key={f.file}
                          className="min-w-0 px-1.5"
                          style={{ flex: `0 0 ${SLIDE_PCT}%` }}
                          onClick={() => !isActive && setIndex(globalIdx)}
                        >
                          <span
                            className={`relative block w-full overflow-hidden rounded-lg border bg-media transition-opacity ${
                              isActive ? '' : 'cursor-pointer opacity-50 hover:opacity-80'
                            } ${isCurrent ? 'border-primary ring-2 ring-primary/40' : ''}`}
                            style={{ aspectRatio: stageRatio }}
                          >
                            {/* Only mount nearby images — far ones load as the founder arrows over. */}
                            {Math.abs(globalIdx - index) <= 3 && (
                              /* eslint-disable-next-line @next/next/no-img-element -- presigned URL, not an optimizable asset */
                              <img src={f.url} alt={f.label || 'Captured frame'} className="h-full w-full object-contain" />
                            )}
                            {highlight && <Highlight style={highlight} />}
                            {isCurrent && (
                              <span className="absolute left-2 top-2 rounded-pill bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                                Current image
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center">
                    {atLoadedLeft && moreBefore ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="pointer-events-auto shadow-card"
                        disabled={busy}
                        onClick={() => loadMore('before')}
                      >
                        {busy ? 'Loading…' : 'Load earlier'}
                      </Button>
                    ) : (
                      <Button
                        size="icon"
                        variant="outline"
                        className="pointer-events-auto h-8 w-8 rounded-full shadow-card"
                        aria-label="Previous frame"
                        disabled={busy || atLoadedLeft}
                        onClick={() => stepBy(-1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    )}
                  </span>
                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                    {atLoadedRight && moreAfter ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="pointer-events-auto shadow-card"
                        disabled={busy}
                        onClick={() => loadMore('after')}
                      >
                        {busy ? 'Loading…' : 'Load more'}
                      </Button>
                    ) : (
                      <Button
                        size="icon"
                        variant="outline"
                        className="pointer-events-auto h-8 w-8 rounded-full shadow-card"
                        aria-label="Next frame"
                        disabled={busy || atLoadedRight}
                        onClick={() => stepBy(1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    )}
                  </span>
                </div>
                <div className="mt-3 flex flex-col items-center gap-2 text-center">
                  <div className="min-w-0 max-w-full">
                    <p className="truncate text-xs font-medium">{active.label || 'Captured frame'}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      {active.route || '—'} · {index + 1} of {total}
                    </p>
                  </div>
                  {activeIsCurrent ? (
                    <Button size="sm" variant="outline" disabled>
                      Current image
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busy} onClick={() => pick(active.file)}>
                      Choose this image
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
