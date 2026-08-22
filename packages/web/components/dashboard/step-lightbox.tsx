'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { boxStyle, Highlight, type Bbox, type Viewport } from '@/components/dashboard/screenshot-highlight';

/**
 * One lightbox for a whole workflow. Every step thumbnail opens the SAME dialog at its own index, and
 * the dialog walks the full step list with prev/next — so "expand" is a way into the workflow, not a
 * dead-end view of one picture. Steps without a screenshot are still in the sequence (with a
 * placeholder), because skipping them would make "Step 7 of 16" lie about the count.
 */
export interface LightboxStep {
  number: number;
  instruction: string;
  detail?: string;
  url: string | null;
  bbox?: Bbox | null;
}

/** Center slide width as a fraction of the stage — 80% leaves a 10% peek of each neighbour, the
 *  same shape as the step image picker so the two carousels feel like one control. */
const SLIDE_PCT = 80;

interface Ctx {
  open: (index: number) => void;
}
const LightboxContext = createContext<Ctx | null>(null);

export function useStepLightbox(): Ctx {
  const ctx = useContext(LightboxContext);
  if (!ctx) throw new Error('useStepLightbox must be used inside <StepLightbox>');
  return ctx;
}

export function StepLightbox({
  steps,
  viewport,
  children,
}: {
  steps: LightboxStep[];
  viewport: Viewport | null;
  children: ReactNode;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const open = useCallback((i: number) => setIndex(i), []);
  const count = steps.length;
  const prev = useCallback(() => setIndex((i) => (i === null ? i : Math.max(0, i - 1))), []);
  const next = useCallback(() => setIndex((i) => (i === null ? i : Math.min(count - 1, i + 1))), [count]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, prev, next]);

  const step = index === null ? null : steps[index];
  const vpOk = viewport != null && viewport.w > 0 && viewport.h > 0;
  // Every slide gets the capture viewport's aspect ratio so the track does not jump between steps.
  const stageRatio = vpOk ? `${viewport.w} / ${viewport.h}` : '16 / 10';

  return (
    <LightboxContext.Provider value={{ open }}>
      {children}
      <Dialog open={index !== null} onOpenChange={(o) => !o && setIndex(null)}>
        <DialogContent className="max-w-[80vw] gap-0 overflow-hidden p-0" aria-describedby={undefined}>
          {step && (
            <>
              {/* The header is the step's identity — tinted so it reads as a caption bar, not page chrome. */}
              <div className="flex items-start gap-3 border-b border-brand-100 bg-brand-50 px-5 py-3.5 pr-12">
                <span className="mt-px inline-flex h-6 shrink-0 items-center rounded-full bg-primary px-2.5 text-[11px] font-bold text-primary-foreground">
                  Step {step.number} of {count}
                </span>
                <span className="min-w-0 flex-1">
                  <DialogTitle className="truncate text-[15px] font-semibold text-ink">
                    {step.instruction}
                  </DialogTitle>
                  {step.detail && (
                    <p className="mt-0.5 text-[13px] leading-relaxed text-secondary-foreground">{step.detail}</p>
                  )}
                </span>
              </div>

              {/* min-w-0 is load-bearing: DialogContent is a GRID, and a grid item's min-width:auto
                  lets the track's intrinsic width blow the item out past the dialog. */}
              <div className="min-w-0 bg-[color:var(--paper-2)] py-4">
                <div className="relative overflow-hidden">
                  <div
                    className="flex"
                    style={{
                      transform: `translateX(calc(50% - ${(index! + 0.5) * SLIDE_PCT}%))`,
                      transition: 'transform 200ms ease',
                    }}
                  >
                    {steps.map((st, i) => {
                      const isActive = i === index;
                      const highlight = st.url && st.bbox && vpOk ? boxStyle(st.bbox, viewport) : null;
                      return (
                        <div
                          key={st.number}
                          className="min-w-0 px-1.5"
                          style={{ flex: `0 0 ${SLIDE_PCT}%` }}
                          onClick={() => !isActive && setIndex(i)}
                        >
                          <span
                            className={`relative block w-full overflow-hidden rounded-lg border bg-media transition-opacity ${
                              isActive ? '' : 'cursor-pointer opacity-50 hover:opacity-80'
                            }`}
                            style={{ aspectRatio: stageRatio }}
                          >
                            {/* Only mount nearby images — far ones load as the reader arrows over. */}
                            {Math.abs(i - index!) <= 2 &&
                              (st.url ? (
                                /* eslint-disable-next-line @next/next/no-img-element -- presigned URL */
                                <img src={st.url} alt={`Step ${st.number}`} className="h-full w-full object-contain" />
                              ) : (
                                <span className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                                  <ImageOff className="h-6 w-6" />
                                  <span className="text-sm">No screenshot for this step</span>
                                </span>
                              ))}
                            {highlight && <Highlight style={highlight} />}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {count > 1 && (
                    <>
                      <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center">
                        <NavButton side="left" label="Previous step" disabled={index === 0} onClick={prev} />
                      </span>
                      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                        <NavButton side="right" label="Next step" disabled={index === count - 1} onClick={next} />
                      </span>
                    </>
                  )}
                </div>
              </div>

            </>
          )}
        </DialogContent>
      </Dialog>
    </LightboxContext.Provider>
  );
}

function NavButton({
  side,
  label,
  disabled,
  onClick,
}: {
  side: 'left' | 'right';
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-card transition hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
