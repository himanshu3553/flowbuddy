'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { supersedeWorkflow, keepBothWorkflows } from '@/lib/overlap-actions';

/**
 * P3-M0 — "you already have a workflow for this."
 *
 * The founder is the one who decides, because the system cannot: a similarity score proves two
 * workflows OVERLAP, never which KIND of overlap it is. Only they know whether the product changed
 * (so the old telling is now wrong) or whether both routes are genuinely real. So this component's
 * job is to make the evidence readable in about five seconds — both step lists, side by side — and
 * then get out of the way.
 */

export interface OverlapSideView {
  workflowId: string;
  sourceId: string;
  segmentIndex: number;
  segmentTitle: string | null;
  stepCount: number;
  steps: string[];
  approvedAt: string | null;
}

export interface OverlapView {
  incumbent: OverlapSideView;
  challenger: OverlapSideView;
  similarity: number;
}

const titleOf = (s: OverlapSideView) => s.segmentTitle ?? `Workflow ${s.segmentIndex + 1}`;
const coord = (s: OverlapSideView) => ({
  workflowId: s.workflowId,
  sourceId: s.sourceId,
  segmentIndex: s.segmentIndex,
});
const keyOf = (o: OverlapView) =>
  `${o.incumbent.sourceId}:${o.incumbent.segmentIndex}|${o.challenger.sourceId}:${o.challenger.segmentIndex}`;


function StepColumn({
  side,
  label,
  tone,
}: {
  side: OverlapSideView;
  label: string;
  tone: 'incumbent' | 'challenger';
}) {
  return (
    <div className="min-w-0 flex-1">
      <p
        className={cn(
          'mb-1 inline-flex rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide',
          tone === 'incumbent'
            ? 'border border-brand-100 bg-brand-50 text-primary'
            : 'border border-warning-border bg-warning-bg text-warning-text',
        )}
      >
        {label}
      </p>
      <p className="text-[13.5px] font-semibold text-ink">{titleOf(side)}</p>
      <p className="mb-2 font-mono text-[10px] text-faint">{side.stepCount} steps</p>
      <ol
        className={cn(
          'space-y-1.5 rounded-tile border px-3 py-2.5',
          tone === 'incumbent' ? 'border-brand-100 bg-brand-50/50' : 'border-warning-border bg-warning-bg/60',
        )}
      >
        {side.steps.length === 0 ? (
          <li className="text-[12px] text-muted-foreground">No steps recorded.</li>
        ) : (
          side.steps.map((s, i) => (
            <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-secondary-foreground">
              <span className="mt-px shrink-0 font-mono text-[10px] text-faint">{i + 1}</span>
              <span className="min-w-0">{s}</span>
            </li>
          ))
        )}
      </ol>
    </div>
  );
}

/**
 * The two resolutions, shared by every surface that offers them. One implementation so the card, the
 * modal and the list-tile chip can never drift into offering different outcomes for the same pair.
 */
function useResolveOverlap(overlap: OverlapView, onDone: () => void) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { incumbent, challenger } = overlap;

  function run(fn: () => Promise<void>, success: string) {
    start(async () => {
      try {
        await fn();
        // Dismiss first: leaving the comparison up after resolving it invites a second click on a
        // decision that has already been made.
        onDone();
        toast.success(success);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not save that — please try again');
      }
    });
  }

  return (
    <>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          run(
            () =>
              supersedeWorkflow({
                retiredWorkflowId: incumbent.workflowId,
                replacementWorkflowId: challenger.workflowId,
                replacementTitle: challenger.segmentTitle,
              }),
            `“${titleOf(challenger)}” replaced “${titleOf(incumbent)}”`,
          )
        }
      >
        Replace the old one
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          run(
            () => keepBothWorkflows({ x: coord(incumbent), y: coord(challenger) }),
            'Both kept — this pair won’t be raised again',
          )
        }
      >
        Both are real
      </Button>
    </>
  );
}

/** The side-by-side comparison. The one decision surface, opened from anywhere a duplicate appears. */
export function CompareDialog({
  overlap,
  open,
  onOpenChange,
}: {
  overlap: OverlapView;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const actions = useResolveOverlap(overlap, () => onOpenChange(false));
  const { incumbent, challenger } = overlap;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Are these the same workflow?</DialogTitle>
          <DialogDescription>
            {Math.round(overlap.similarity * 100)}% similar overall, and they finish in the same
            place. FlowBuddy can tell they overlap — only you know whether your product changed.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 max-h-[60vh] overflow-y-auto px-1">
          <div className="flex flex-col gap-4 sm:flex-row">
            <StepColumn side={incumbent} label="Already approved" tone="incumbent" />
            <StepColumn side={challenger} label="Newer recording" tone="challenger" />
          </div>
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-[11px] leading-relaxed text-muted-foreground">
            Replacing never deletes anything — it can be restored.
          </span>
          <span className="flex shrink-0 flex-wrap gap-2">{actions}</span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The compact marker on a Knowledge Base list tile. Opens the same comparison the cards do — a
 * founder should never have to work out that the warning they can see and the place they resolve it
 * are two different things.
 */
export function DuplicateChip({
  overlap,
  selfSourceId,
  selfSegmentIndex,
}: {
  overlap: OverlapView;
  selfSourceId: string;
  selfSegmentIndex: number;
}) {
  const [open, setOpen] = useState(false);
  // Name the OTHER workflow — the chip sits on one side of the pair, and "possible duplicate of
  // itself" is what you get if this is assumed rather than derived.
  const isIncumbent =
    overlap.incumbent.sourceId === selfSourceId && overlap.incumbent.segmentIndex === selfSegmentIndex;
  const other = isIncumbent ? overlap.challenger : overlap.incumbent;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 flex w-fit max-w-full items-center gap-1.5 rounded-md border border-warning-border bg-warning-bg px-1.5 py-0.5 text-[10.5px] font-medium text-warning-text transition-colors hover:bg-warning-bg2"
      >
        <Copy className="h-3 w-3 shrink-0" />
        <span className="truncate">Possible duplicate of “{titleOf(other)}”</span>
      </button>
      <CompareDialog overlap={overlap} open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * One duplicate, with its evidence and its two resolutions. Rendered both in the Knowledge Base
 * list and on a single workflow's page — a founder who lands on a workflow directly must be able to
 * see and settle the duplicate there, without first knowing to go back to the list.
 */
export function DuplicateCard({ overlap }: { overlap: OverlapView }) {
  const [open, setOpen] = useState(false);
  const actions = useResolveOverlap(overlap, () => setOpen(false));
  const { incumbent, challenger } = overlap;

  return (
    <div className="rounded-list border border-warning-border bg-card px-[15px] py-[13px]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border border-warning-border bg-warning-bg text-warning-dot">
          <Copy className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-ink">
            “{titleOf(challenger)}” looks like “{titleOf(incumbent)}”
          </span>
          <span className="mt-0.5 block truncate font-mono text-[10px] text-faint">
            {Math.round(overlap.similarity * 100)}% similar · {challenger.stepCount} steps vs{' '}
            {incumbent.stepCount}
          </span>
        </span>
        <Button variant="soft" size="sm" onClick={() => setOpen(true)} className="shrink-0">
          Compare
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        {actions}
        <span className="text-[11px] text-muted-foreground">
          Replacing never deletes anything — the old workflow keeps its recording and can be restored.
        </span>
      </div>

      <CompareDialog overlap={overlap} open={open} onOpenChange={setOpen} />
    </div>
  );
}

export function DuplicateWorkflows({ overlaps }: { overlaps: OverlapView[] }) {
  if (overlaps.length === 0) return null;

  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-3 rounded-tile border border-warning-border bg-warning-bg2 px-4 py-3.5">
        <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-warning-dot" />
        <p className="flex-1 text-[13px] leading-relaxed text-warning-text">
          <b className="font-semibold text-[#4a3e1e]">
            {overlaps.length} possible duplicate{overlaps.length === 1 ? '' : 's'}.
          </b>{' '}
          When two workflows cover the same task, the copilot has to answer from both — so it splits
          its attention between two versions of one thing.
        </p>
      </div>
      <ul className="space-y-2.5">
        {overlaps.map((o) => (
          <li key={keyOf(o)}>
            <DuplicateCard overlap={o} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The same warning, and the same Compare modal, on ONE workflow's page. */
export function WorkflowDuplicates({ overlaps }: { overlaps: OverlapView[] }) {
  if (overlaps.length === 0) return null;

  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-3 rounded-tile border border-warning-border bg-warning-bg2 px-4 py-3.5">
        <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-warning-dot" />
        <p className="flex-1 text-[13px] leading-relaxed text-warning-text">
          <b className="font-semibold text-[#4a3e1e]">
            This workflow looks like {overlaps.length === 1 ? 'another one' : `${overlaps.length} others`} in
            your Knowledge Base.
          </b>{' '}
          Decide which is current — or say both are real — so the copilot answers from one.
        </p>
      </div>
      {overlaps.map((o) => (
        <DuplicateCard key={keyOf(o)} overlap={o} />
      ))}
    </section>
  );
}
