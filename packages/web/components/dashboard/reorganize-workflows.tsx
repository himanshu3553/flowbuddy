'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Scissors, Undo2 } from 'lucide-react';

import { resetWorkflowBoundaries, saveWorkflowBoundaries } from '@/lib/recording-actions';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * The boundary editor: every step of the recording in timeline order, sectioned by workflow, with
 * exactly two moves — "Split here" between two steps, "Merge with previous" on a boundary. Edits
 * are local until Rebuild, which saves the COMPLETE boundary list and re-runs the pipeline in
 * exhaustive mode (each section = exactly one workflow; the model only names new ones).
 *
 * Boundaries land only BETWEEN steps on purpose: a step is one control interaction, so a cut
 * inside one is meaningless — and steps are the unit the founder already recognizes.
 */

export interface ReorganizeGroup {
  title: string;
  approved: boolean;
  steps: {
    itemId: string;
    instruction: string;
    /** Where a workflow starting at this step begins on the cleaned timeline; null = pre-anchor
     *  row, cannot host a cut. */
    startEventId: string | null;
    screenshotUrl: string | null;
  }[];
}

type FlatStep = ReorganizeGroup['steps'][number] & {
  /** Index of the original group this step came from — titles follow sections whose first step
   *  still matches an original boundary. */
  groupIdx: number;
  flatIdx: number;
};

export function ReorganizeWorkflows({
  sourceId,
  groups,
  hasOverrides,
}: {
  sourceId: string;
  groups: ReorganizeGroup[];
  /** Whether founder-drawn boundaries are already stored — enables "Reset to automatic". */
  hasOverrides: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [confirm, setConfirm] = useState<'none' | 'rebuild' | 'reset'>('none');

  const flat: FlatStep[] = useMemo(() => {
    const out: FlatStep[] = [];
    groups.forEach((g, groupIdx) =>
      g.steps.forEach((s) => out.push({ ...s, groupIdx, flatIdx: out.length })),
    );
    return out;
  }, [groups]);

  // The cuts the CURRENT layout implies: each original workflow's first step, except the very first.
  const originalCuts = useMemo(() => {
    const set = new Set<string>();
    groups.forEach((g, i) => {
      if (i > 0 && g.steps[0]?.startEventId) set.add(g.steps[0].startEventId);
    });
    return set;
  }, [groups]);

  const [cuts, setCuts] = useState<Set<string>>(() => new Set(originalCuts));

  // Derived sections: split the flat step list at the cuts.
  const sections = useMemo(() => {
    const out: { steps: FlatStep[]; title: string; approved: boolean; isNew: boolean }[] = [];
    let current: FlatStep[] = [];
    const flush = () => {
      if (current.length === 0) return;
      const head = current[0]!;
      // A section keeps its original identity card when it starts where an original workflow did.
      const original = head.flatIdx === flat.findIndex((s) => s.groupIdx === head.groupIdx);
      const g = groups[head.groupIdx]!;
      out.push({
        steps: current,
        title: original ? g.title : 'New workflow',
        approved: original ? g.approved : false,
        isNew: !original,
      });
      current = [];
    };
    for (const s of flat) {
      if (current.length > 0 && s.startEventId && cuts.has(s.startEventId)) flush();
      current.push(s);
    }
    flush();
    return out;
  }, [flat, cuts, groups]);

  const changes = useMemo(() => {
    let n = 0;
    for (const id of cuts) if (!originalCuts.has(id)) n += 1;
    for (const id of originalCuts) if (!cuts.has(id)) n += 1;
    return n;
  }, [cuts, originalCuts]);

  function toggleCut(id: string, on: boolean) {
    setCuts((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function rebuild() {
    // The saved list is ORDERED by timeline, derived from the flat steps — never from set order.
    const boundaryEventIds = flat
      .filter((s) => s.startEventId && cuts.has(s.startEventId))
      .map((s) => s.startEventId!);
    start(async () => {
      const res = await saveWorkflowBoundaries({ sourceId, boundaryEventIds: [...new Set(boundaryEventIds)] });
      if (res.ok) {
        toast.success('Rebuilding workflows with your boundaries');
        router.push(`/dashboard/kb/${sourceId}`);
        router.refresh();
      } else {
        toast.error(res.error);
        setConfirm('none');
      }
    });
  }

  function reset() {
    start(async () => {
      const res = await resetWorkflowBoundaries(sourceId);
      if (res.ok) {
        toast.success('Back to automatic segmentation — rebuilding');
        router.push(`/dashboard/kb/${sourceId}`);
        router.refresh();
      } else {
        toast.error(res.error);
        setConfirm('none');
      }
    });
  }

  return (
    <div className="space-y-4 pb-20">
      {sections.map((section, si) => (
        <div key={section.steps[0]!.itemId}>
          {si > 0 && (
            /* The boundary bar between two workflows — removing it merges them. */
            <div className="flex items-center gap-3 py-2">
              <span className="h-px flex-1 bg-border" />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                disabled={busy || !section.steps[0]!.startEventId}
                onClick={() => toggleCut(section.steps[0]!.startEventId!, false)}
              >
                <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                Merge with previous
              </Button>
              <span className="h-px flex-1 bg-border" />
            </div>
          )}
          <Card className={section.isNew ? 'border-primary/40' : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                {section.isNew ? (
                  <span className="text-primary">New workflow</span>
                ) : (
                  section.title
                )}
                {section.approved && (
                  <span className="inline-flex items-center gap-1 rounded-pill border border-success-border bg-success-bg px-2 py-0.5 text-[10px] font-medium text-success-text2">
                    <CheckCircle2 className="h-3 w-3" /> Approved
                  </span>
                )}
                {section.isNew && (
                  <span className="text-[11px] font-normal text-muted-foreground">
                    — named when rebuilt
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              {section.steps.map((s, i) => (
                <div key={s.itemId}>
                  {i > 0 && (
                    /* The gap between two steps — the only place a workflow may start. */
                    <div className="group flex items-center gap-2 py-0.5">
                      <span className="h-px flex-1 bg-transparent group-hover:bg-brand-100" />
                      {s.startEventId ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px] text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                          disabled={busy}
                          onClick={() => toggleCut(s.startEventId!, true)}
                        >
                          <Scissors className="mr-1 h-3 w-3" />
                          Split here
                        </Button>
                      ) : null}
                      <span className="h-px flex-1 bg-transparent group-hover:bg-brand-100" />
                    </div>
                  )}
                  <div className="flex items-center gap-3 py-1.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/60 text-[10px] font-bold text-primary">
                      {i + 1}
                    </span>
                    {s.screenshotUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- presigned URL */
                      <img
                        src={s.screenshotUrl}
                        alt=""
                        className="h-10 w-16 shrink-0 rounded border object-cover object-top"
                      />
                    ) : (
                      <span className="h-10 w-16 shrink-0 rounded border bg-media" />
                    )}
                    <span className="min-w-0 truncate text-sm">{s.instruction}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ))}

      {/* Sticky footer: pending changes + the two ways out. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {changes === 0
              ? `${sections.length} workflow${sections.length === 1 ? '' : 's'} — no boundary changes yet`
              : `${changes} boundary change${changes === 1 ? '' : 's'} · ${sections.length} workflow${sections.length === 1 ? '' : 's'} after rebuild`}
          </span>
          <span className="flex items-center gap-2">
            {hasOverrides && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm('reset')}>
                Reset to automatic
              </Button>
            )}
            <Button size="sm" disabled={busy || changes === 0} onClick={() => setConfirm('rebuild')}>
              Rebuild workflows
            </Button>
          </span>
        </div>
      </div>

      <Dialog open={confirm !== 'none'} onOpenChange={(o) => !o && setConfirm('none')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm === 'reset' ? 'Back to automatic segmentation?' : 'Rebuild with your boundaries?'}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {confirm === 'reset'
                    ? 'Your drawn boundaries are cleared and FlowBuddy re-splits the recording itself (recording-time markers still count). The rebuild takes a few minutes.'
                    : 'FlowBuddy rebuilds this recording’s workflows using exactly these boundaries. The rebuild takes a few minutes.'}
                </p>
                <p>
                  Approval follows content it can verify: workflows that stay recognizably the same
                  keep their approval; new or substantially changed ones come back for your review —
                  nothing your customers see changes without you having seen it.
                </p>
                <p>
                  Your edited step wording and images ride along to wherever their steps end up.
                  Acting-enabled workflows recompile their run plan (or park for re-review); demo
                  videos stay until you regenerate them.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirm('none')}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={confirm === 'reset' ? reset : rebuild}>
              {busy ? 'Starting…' : confirm === 'reset' ? 'Reset and rebuild' : 'Rebuild workflows'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
