'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Copy, Pencil } from 'lucide-react';

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
import { supersedeWorkflow, keepExistingWorkflow, dismissOverlap, groupAsOneTask } from '@/lib/overlap-actions';
import { planEditCarryover, type CarryoverPlan } from '@/lib/edit-actions';

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
  description: string | null;
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
const keyOf = (o: OverlapView) =>
  `${o.incumbent.sourceId}:${o.incumbent.segmentIndex}|${o.challenger.sourceId}:${o.challenger.segmentIndex}`;


/** Marks wording the founder's edit will carry over — a preview, nothing written yet. The pencil
 *  reopens the chooser: the way back into the selection after choosing. */
function Carried({ onEdit }: { onEdit?: () => void }) {
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 align-middle">
      <span className="inline-flex rounded-pill bg-brand-100 px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-wide text-primary">
        carried
      </span>
      {onEdit && (
        <button
          type="button"
          aria-label="Change carried edits"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand-100 text-primary hover:bg-brand-200"
          onClick={onEdit}
        >
          <Pencil className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

/** The side label — "Already approved" / "Newer recording" — identical on the card and in the dialog. */
function SideLabel({ label, tone }: { label: string; tone: 'incumbent' | 'challenger' }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide',
        tone === 'incumbent'
          ? 'border border-brand-100 bg-brand-50 text-primary'
          : 'border border-warning-border bg-warning-bg text-warning-text',
      )}
    >
      {label}
    </span>
  );
}

function SideLine({ label, tone, title }: { label: string; tone: 'incumbent' | 'challenger'; title: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <SideLabel label={label} tone={tone} />
      <span className="truncate text-[13.5px] font-semibold text-ink">{title}</span>
    </span>
  );
}

function StepColumn({
  side,
  label,
  tone,
  preview,
  selected,
  onSelect,
}: {
  side: OverlapSideView;
  label: string;
  tone: 'incumbent' | 'challenger';
  /** Edit carry-over preview: the founder's wording shown IN PLACE of the new workflow's, so the
   *  compare dialog reflects what Replace will produce before anything is written. */
  preview?: { steps: Map<number, string>; title?: string; description?: string; onEdit?: () => void };
  /** The column is one of the four resolutions ("keep THIS one") — the radio sits on the evidence. */
  selected: boolean;
  onSelect: () => void;
}) {
  // `contents` so the header and the list are direct grid children of the two-column container:
  // the header row takes the taller of the two, and both step lists start on the same line. The two
  // cells are styled as ONE card (top half / bottom half) so the selection ring reads as "this
  // column", and the step list scrolls inside its own half so nothing is clipped.
  const shell = cn(
    'min-w-0 cursor-pointer border transition-colors',
    selected ? 'border-primary bg-brand-50/40' : 'border-border bg-card hover:bg-muted/40',
  );
  return (
    <div className="contents">
      <div className={cn(shell, 'mt-3 rounded-t-tile border-b-0 px-3.5 pt-3 first:mt-0 sm:mt-0')} onClick={onSelect}>
        <p className="mb-2 flex items-center justify-between gap-2">
          <SideLabel label={label} tone={tone} />
          {/* A button rather than a visible radio — the card is the radio; this is its state. */}
          <button
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className={cn(
              'rounded-md px-2.5 py-1 text-[11px] font-bold tracking-wide transition-colors',
              selected
                ? 'bg-primary text-primary-foreground'
                : 'bg-brand-50 text-primary hover:bg-brand-100',
            )}
          >
            {selected ? 'SELECTED' : 'Select'}
          </button>
        </p>
        <p className="text-[13.5px] font-semibold text-ink">
          {preview?.title ?? titleOf(side)}
          {preview?.title && <Carried onEdit={preview.onEdit} />}
        </p>
        <p className="mb-1.5 font-mono text-[10px] text-faint">{side.stepCount} steps</p>
        {/* Two workflows can have near-identical step lists and still be different tasks — the plan is
            often the only place that shows. Clamped: it is context for the step lists, not the thing
            being compared, and at full length it pushed the steps off-screen. */}
        {(preview?.description ?? side.description) && (
          <p className="mb-2 line-clamp-3 text-[12px] leading-relaxed text-muted-foreground" title={preview?.description ?? side.description ?? undefined}>
            {preview?.description ?? side.description}
            {preview?.description && <Carried onEdit={preview.onEdit} />}
          </p>
        )}
      </div>
      <div className={cn(shell, 'rounded-b-tile border-t-0 px-3.5 pb-3')} onClick={onSelect}>
        <ol
          className={cn(
            'max-h-[34vh] space-y-1.5 overflow-y-auto rounded-tile border px-3 py-2.5',
            tone === 'incumbent' ? 'border-brand-100 bg-brand-50/50' : 'border-warning-border bg-warning-bg/60',
          )}
        >
          {side.steps.length === 0 ? (
            <li className="text-[12px] text-muted-foreground">No steps recorded.</li>
          ) : (
            side.steps.map((s, i) => {
              const carried = preview?.steps.get(i);
              return (
                <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-secondary-foreground">
                  <span className="mt-px shrink-0 font-mono text-[10px] text-faint">{i + 1}</span>
                  <span className="min-w-0">
                    {carried ?? s}
                    {carried !== undefined && <Carried onEdit={preview?.onEdit} />}
                  </span>
                </li>
              );
            })
          )}
        </ol>
      </div>
    </div>
  );
}

/** What the founder may decide about a pair. The first two name a winner; the last two keep both. */
export type Resolution = 'keepOld' | 'keepNew' | 'group' | 'dismiss';

/** What Replace will carry over — confirmed in the chooser, previewed in the compare dialog,
 *  applied by the supersede. */
type CarrySelection = {
  steps: { newItemId: string; instruction: string; detail: string }[];
  title?: string;
  description?: string;
};

const isCarryable = (plan: CarryoverPlan): plan is Extract<CarryoverPlan, { ok: true }> =>
  plan.ok && (plan.steps.some((st) => st.newItemId) || plan.title !== null || plan.description !== null);

/**
 * The four resolutions, offered in ONE place — the comparison dialog — so the founder always has
 * both step lists in front of them when they decide.
 */
function useResolveOverlap(
  overlap: OverlapView,
  onDone: () => void,
  opts: {
    /** A CONFIRMED carry selection: Replace commits it. Absent = not yet decided. */
    selection?: CarrySelection;
    /** Called with the plan when Replace finds edits worth carrying and no selection exists yet —
     *  the caller asks the founder (the chooser). Absent = no review surface here, hand off. */
    onCarryNeeded?: (plan: Extract<CarryoverPlan, { ok: true }>) => void;
  } = {},
) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { incumbent, challenger } = overlap;

  function run(fn: () => Promise<string>) {
    start(async () => {
      try {
        const success = await fn();
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

  function replace(withCarry?: CarrySelection) {
    const carryArg =
      withCarry && (withCarry.steps.length > 0 || withCarry.title || withCarry.description) ? withCarry : undefined;
    run(async () => {
      const r = await supersedeWorkflow({
        retiredWorkflowId: incumbent.workflowId,
        replacementWorkflowId: challenger.workflowId,
        replacementTitle: carryArg?.title ?? challenger.segmentTitle,
        ...(carryArg ? { carry: carryArg } : {}),
      });
      const base = `“${carryArg?.title ?? titleOf(challenger)}” replaced “${titleOf(incumbent)}”`;
      if (r.carried === 0 && r.failed === 0) return base;
      return `${base} · ${r.carried} edit${r.carried === 1 ? '' : 's'} carried over${r.failed ? `, ${r.failed} could not be` : ''}`;
    });
  }

  /** The Replace flow: a confirmed selection commits; otherwise ask first when there is anything to ask. */
  function replaceNow() {
    if (opts.selection) {
      replace(opts.selection);
      return;
    }
    start(async () => {
      const plan = await planEditCarryover({ fromWorkflowId: incumbent.workflowId, toWorkflowId: challenger.workflowId });
      if (isCarryable(plan) && opts.onCarryNeeded) opts.onCarryNeeded(plan);
      else replace();
    });
  }

  function resolve(choice: Resolution) {
    switch (choice) {
      case 'keepNew':
        replaceNow();
        return;
      case 'keepOld':
        run(async () => {
          await keepExistingWorkflow({ keptWorkflowId: incumbent.workflowId, discardedWorkflowId: challenger.workflowId });
          return `Kept “${titleOf(incumbent)}” — “${titleOf(challenger)}” moved to Not answering`;
        });
        return;
      case 'group':
        run(async () => {
          await groupAsOneTask({ aWorkflowId: incumbent.workflowId, bWorkflowId: challenger.workflowId });
          return 'Grouped — the copilot will answer with whichever route fits';
        });
        return;
      case 'dismiss':
        run(async () => {
          await dismissOverlap({ aWorkflowId: incumbent.workflowId, bWorkflowId: challenger.workflowId });
          return 'Dismissed — this pair won’t be raised again';
        });
        return;
    }
  }

  return { resolve, pending };
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
  const { incumbent, challenger } = overlap;

  // Edit carry-over, in three beats: Replace asks (the chooser, consent first) → the founder's
  // ticks become the selection and the "Newer recording" column previews it, tagged "carried" →
  // Replace again commits. The chooser never writes; only the final Replace does.
  const [plan, setPlan] = useState<Extract<CarryoverPlan, { ok: true }> | null>(null);
  const [selection, setSelection] = useState<CarrySelection | undefined>(undefined);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [draftTicked, setDraftTicked] = useState<Set<string>>(new Set());
  // Nothing pre-selected: the dialog exists to get a founder's decision, and a pre-ticked radio is a
  // decision they did not make.
  const [choice, setChoice] = useState<Resolution | null>(null);

  const { resolve, pending } = useResolveOverlap(overlap, () => onOpenChange(false), {
    ...(selection ? { selection } : {}),
    onCarryNeeded: (p) => {
      setPlan(p);
      const all = new Set<string>();
      p.steps.forEach((st) => {
        if (st.newItemId) all.add(`step:${st.oldItemId}`);
      });
      if (p.title) all.add('title');
      if (p.description) all.add('description');
      setDraftTicked(all);
      setChooserOpen(true);
    },
  });

  // A closed dialog forgets its carry selection — reopening must start from the chooser again.
  useEffect(() => {
    if (!open) {
      setSelection(undefined);
      setChoice(null);
    }
  }, [open]);

  const preview =
    selection && plan
      ? {
          steps: new Map(
            plan.steps
              .filter((st) => st.newStepIndex !== null && selection.steps.some((c) => c.newItemId === st.newItemId))
              .map((st) => [st.newStepIndex!, st.instruction] as const),
          ),
          ...(selection.title ? { title: selection.title } : {}),
          ...(selection.description ? { description: selection.description } : {}),
          onEdit: reopenChooser,
        }
      : undefined;

  const toggleDraft = (key: string) =>
    setDraftTicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const row = (key: string, primary: string, secondary: string) => (
    <label key={key} className="flex cursor-pointer items-start gap-2.5 rounded-lg border px-2.5 py-2 text-sm">
      <input type="checkbox" className="mt-1" checked={draftTicked.has(key)} onChange={() => toggleDraft(key)} />
      <span className="min-w-0">
        <span className="block font-medium">{primary}</span>
        <span className="block text-[11px] text-muted-foreground">{secondary}</span>
      </span>
    </label>
  );

  /** Reopen the chooser with the CURRENT selection ticked — the way back in after choosing. */
  function reopenChooser() {
    if (!plan || !selection) return;
    const ticked = new Set<string>();
    plan.steps.forEach((st) => {
      if (st.newItemId && selection.steps.some((c) => c.newItemId === st.newItemId)) ticked.add(`step:${st.oldItemId}`);
    });
    if (selection.title) ticked.add('title');
    if (selection.description) ticked.add('description');
    setDraftTicked(ticked);
    setChooserOpen(true);
  }

  function confirmChooser() {
    if (!plan) return;
    setSelection({
      steps: plan.steps
        .filter((st) => st.newItemId && draftTicked.has(`step:${st.oldItemId}`))
        .map((st) => ({ newItemId: st.newItemId!, instruction: st.instruction, detail: st.detail })),
      ...(plan.title && draftTicked.has('title') ? { title: plan.title.value } : {}),
      ...(plan.description && draftTicked.has('description') ? { description: plan.description.value } : {}),
    });
    setChooserOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* No description by design — the two columns ARE the explanation; `aria-describedby`
          cleared so Radix does not warn about the missing one. */}
      <DialogContent className="max-w-4xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Duplicate workflows</DialogTitle>
        </DialogHeader>

        <div>
          <div className="grid gap-x-4 sm:grid-flow-col sm:grid-cols-2 sm:grid-rows-[auto_auto]">
            <StepColumn
              side={incumbent}
              label="Already approved"
              tone="incumbent"
              selected={choice === 'keepOld'}
              onSelect={() => setChoice('keepOld')}
            />
            <StepColumn
              side={challenger}
              label="Newer recording"
              tone="challenger"
              preview={preview}
              selected={choice === 'keepNew'}
              onSelect={() => setChoice('keepNew')}
            />
          </div>
        </div>

        {/* The two "keep both" outcomes — OUTSIDE the scrolling step lists, so every resolution is on
            screen at once; a sixteen-step column must never hide half the decision. */}
        <div className="space-y-1.5">
            {(
              [
                ['group', 'Both are right — two routes to the same goal'],
                ['dismiss', 'These aren’t duplicates'],
              ] as const
            ).map(([key, primary]) => (
              <label
                key={key}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors',
                  choice === key ? 'border-primary bg-brand-50/40' : 'hover:bg-muted/50',
                )}
              >
                <input
                  type="radio"
                  name="duplicate-resolution"
                  className="accent-[hsl(var(--primary))]"
                  checked={choice === key}
                  onChange={() => setChoice(key)}
                />
                <span className="text-[13px] font-medium text-ink">{primary}</span>
              </label>
            ))}
        </div>

        <DialogFooter className="items-center gap-2">
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending || choice === null} onClick={() => choice && resolve(choice)}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>

        <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Carry your edits to the new workflow</DialogTitle>
              <DialogDescription>
                You previously edited this step. Would you like to carry those changes over to the new
                workflow?
              </DialogDescription>
            </DialogHeader>
            {plan && (
              <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                {plan.title && row('title', `Title: “${plan.title.value}”`, `replaces “${plan.title.newValue ?? '—'}”`)}
                {plan.description &&
                  row('description', 'Description: your edited text', 'replaces the generated description')}
                {plan.steps.map((st) =>
                  st.newItemId ? (
                    row(`step:${st.oldItemId}`, `“${st.instruction}”`, `replaces “${st.newInstruction ?? ''}”`)
                  ) : (
                    <div
                      key={`step:${st.oldItemId}`}
                      className="rounded-lg border border-dashed px-2.5 py-2 text-[12px] text-muted-foreground"
                    >
                      “{st.instruction}” — no matching step on the new workflow; this part of the product
                      may have changed.
                    </div>
                  ),
                )}
              </div>
            )}
            <DialogFooter className="items-center gap-3">
              {/* "No" is an answer, not a cancel: an EMPTY selection is recorded, so the next Save
                  replaces without carrying instead of asking the same question again. */}
              <Button
                variant="outline"
                onClick={() => {
                  setSelection({ steps: [] });
                  setChooserOpen(false);
                }}
              >
                No
              </Button>
              <Button onClick={confirmChooser}>Yes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
 * One duplicate, with its evidence and one way in. Rendered both in the Knowledge Base list and on
 * a single workflow's page — a founder who lands on a workflow directly must be able to see and
 * settle the duplicate there, without first knowing to go back to the list.
 *
 * The card deliberately offers NO resolution of its own: the three outcomes live only in the
 * comparison, where both step lists are on screen. Several cards each carrying a Replace / Two
 * routes / Not duplicates row read as a wall of near-identical buttons, and the one that matters
 * (Replace) was a single click away from a decision the founder had not looked at yet.
 */
export function DuplicateCard({ overlap, index }: { overlap: OverlapView; index?: number }) {
  const [open, setOpen] = useState(false);
  const { incumbent, challenger } = overlap;

  return (
    <div className="rounded-list border border-warning-border bg-card px-[15px] py-[13px]">
      <div className="flex flex-wrap items-center gap-3">
        {/* Numbered inside a list, so "the second one" is something a founder can say out loud;
            on a workflow's own page there is no list to count, so the icon stays. */}
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border border-warning-border bg-warning-bg font-mono text-[11px] font-bold text-warning-text">
          {index !== undefined ? index + 1 : <Copy className="h-3.5 w-3.5 text-warning-dot" />}
        </span>
        {/* The same two labels the comparison uses, so the card and the dialog name the sides the
            same way — approved on top, the newer one under it. */}
        <span className="min-w-0 flex-1 space-y-1.5">
          <SideLine label="Already approved" tone="incumbent" title={titleOf(incumbent)} />
          <SideLine label="Newer recording" tone="challenger" title={titleOf(challenger)} />
        </span>
        <span className="flex shrink-0 flex-col items-center gap-1">
          <Button variant="soft" size="sm" onClick={() => setOpen(true)}>
            Compare workflows
          </Button>
          <span className="font-mono text-[10px] text-faint">
            {Math.round(overlap.similarity * 100)}% similar
          </span>
        </span>
      </div>

      <CompareDialog overlap={overlap} open={open} onOpenChange={setOpen} />
    </div>
  );
}

/**
 * The Knowledge Base list's duplicates, in one box. Collapsed by default to the first pair so a
 * list with several near-identical pairs does not open on a stack of warnings; the header's count
 * says how many more are folded away, and the chevron unfolds them.
 */
export function DuplicateWorkflows({ overlaps }: { overlaps: OverlapView[] }) {
  const [expanded, setExpanded] = useState(false);
  if (overlaps.length === 0) return null;
  const shown = expanded ? overlaps : overlaps.slice(0, 1);
  const hidden = overlaps.length - shown.length;

  return (
    <section className="rounded-card border border-warning-border bg-warning-bg2 p-3">
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-warning-dot" />
        <span className="text-[12.5px] font-semibold text-[#4a3e1e]">Duplicate workflows</span>
      </div>
      <ul className="space-y-2.5">
        {shown.map((o, i) => (
          <li key={keyOf(o)}>
            <DuplicateCard overlap={o} index={i} />
          </li>
        ))}
      </ul>
      {overlaps.length > 1 && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Show fewer duplicates' : `Show all ${overlaps.length} duplicates`}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-warning-text transition-colors hover:bg-warning-bg"
          >
            {hidden > 0 ? `${hidden} more` : 'Show less'}
            <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>
      )}
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
