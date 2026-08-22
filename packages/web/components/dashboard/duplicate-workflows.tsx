'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Pencil } from 'lucide-react';

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
import { supersedeWorkflow, dismissOverlap, groupAsOneTask } from '@/lib/overlap-actions';
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

function StepColumn({
  side,
  label,
  tone,
  preview,
}: {
  side: OverlapSideView;
  label: string;
  tone: 'incumbent' | 'challenger';
  /** Edit carry-over preview: the founder's wording shown IN PLACE of the new workflow's, so the
   *  compare dialog reflects what Replace will produce before anything is written. */
  preview?: { steps: Map<number, string>; title?: string; description?: string; onEdit?: () => void };
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
      <p className="text-[13.5px] font-semibold text-ink">
        {preview?.title ?? titleOf(side)}
        {preview?.title && <Carried onEdit={preview.onEdit} />}
      </p>
      <p className="mb-2 font-mono text-[10px] text-faint">{side.stepCount} steps</p>
      {/* Two workflows can have near-identical step lists and still be different tasks — the plan is
          often the only place that shows. It is also part of what approving them approves. */}
      {(preview?.description ?? side.description) && (
        <p className="mb-2 text-[12px] leading-relaxed text-muted-foreground">
          {preview?.description ?? side.description}
          {preview?.description && <Carried onEdit={preview.onEdit} />}
        </p>
      )}
      <ol
        className={cn(
          'space-y-1.5 rounded-tile border px-3 py-2.5',
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
  );
}

/**
 * The two resolutions, shared by every surface that offers them. One implementation so the card, the
 * modal and the list-tile chip can never drift into offering different outcomes for the same pair.
 */
/** What Replace will carry over — confirmed in the chooser, previewed in the compare dialog,
 *  applied by the supersede. */
type CarrySelection = {
  steps: { newItemId: string; instruction: string; detail: string }[];
  title?: string;
  description?: string;
};

const isCarryable = (plan: CarryoverPlan): plan is Extract<CarryoverPlan, { ok: true }> =>
  plan.ok && (plan.steps.some((st) => st.newItemId) || plan.title !== null || plan.description !== null);

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

  const actions = (
    <>
      <Button size="sm" disabled={pending} onClick={replaceNow}>
        Replace the old one
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          run(async () => {
            await groupAsOneTask({ aWorkflowId: incumbent.workflowId, bWorkflowId: challenger.workflowId });
            return 'Grouped — the copilot will answer with whichever route fits';
          })
        }
      >
        Two routes, same goal
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          run(async () => {
            await dismissOverlap({ aWorkflowId: incumbent.workflowId, bWorkflowId: challenger.workflowId });
            return 'Dismissed — this pair won’t be raised again';
          })
        }
      >
        Not duplicates
      </Button>
    </>
  );
  return { actions, replaceNow };
}

/** The side-by-side comparison. The one decision surface, opened from anywhere a duplicate appears. */
export function CompareDialog({
  overlap,
  open,
  onOpenChange,
  replaceOnOpen = false,
}: {
  overlap: OverlapView;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** A surface without its own review step (the card) hands its Replace click here: the dialog
   *  opens and immediately runs the Replace flow, so the chooser appears on top of the comparison. */
  replaceOnOpen?: boolean;
}) {
  const { incumbent, challenger } = overlap;

  // Edit carry-over, in three beats: Replace asks (the chooser, consent first) → the founder's
  // ticks become the selection and the "Newer recording" column previews it, tagged "carried" →
  // Replace again commits. The chooser never writes; only the final Replace does.
  const [plan, setPlan] = useState<Extract<CarryoverPlan, { ok: true }> | null>(null);
  const [selection, setSelection] = useState<CarrySelection | undefined>(undefined);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [draftTicked, setDraftTicked] = useState<Set<string>>(new Set());

  const { actions, replaceNow } = useResolveOverlap(overlap, () => onOpenChange(false), {
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

  const [handedOff, setHandedOff] = useState(false);
  useEffect(() => {
    if (open && replaceOnOpen && !handedOff) {
      setHandedOff(true);
      replaceNow();
    }
    if (!open) {
      setHandedOff(false);
      setSelection(undefined);
    }
    // replaceNow is recreated each render; the flags are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, replaceOnOpen]);

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
            <StepColumn side={challenger} label="Newer recording" tone="challenger" preview={preview} />
          </div>
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-[11px] leading-relaxed text-muted-foreground">
            Replacing never deletes anything. <b className="font-semibold">Two routes</b> makes the
            copilot answer from one of them; <b className="font-semibold">Not duplicates</b> changes
            nothing.
          </span>
          <span className="flex shrink-0 flex-wrap gap-2">{actions}</span>
        </DialogFooter>

        <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Carry your edits to the new workflow?</DialogTitle>
              <DialogDescription>
                These edits on “{titleOf(incumbent)}” match steps on “{titleOf(challenger)}”. Untick
                anything your product changed. Image choices never carry — frames belong to their
                recording.
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
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => setChooserOpen(false)}
              >
                Cancel
              </button>
              <Button onClick={confirmChooser}>Replace</Button>
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
 * One duplicate, with its evidence and its two resolutions. Rendered both in the Knowledge Base
 * list and on a single workflow's page — a founder who lands on a workflow directly must be able to
 * see and settle the duplicate there, without first knowing to go back to the list.
 */
export function DuplicateCard({ overlap }: { overlap: OverlapView }) {
  const [open, setOpen] = useState(false);
  const [replaceOnOpen, setReplaceOnOpen] = useState(false);
  // No review step on the card itself: when the old workflow carries edits worth carrying, Replace
  // opens the comparison with the chooser on top (consent first, preview second, then the final
  // Replace there) instead of replacing blind.
  const { actions } = useResolveOverlap(overlap, () => setOpen(false), {
    onCarryNeeded: () => {
      setReplaceOnOpen(true);
      setOpen(true);
    },
  });
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
          Replacing never deletes anything. <b className="font-semibold">Two routes</b> makes the
          copilot answer from one of them; <b className="font-semibold">Not duplicates</b> changes
          nothing and just stops the warning.
        </span>
      </div>

      <CompareDialog
        overlap={overlap}
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setReplaceOnOpen(false);
        }}
        replaceOnOpen={replaceOnOpen}
      />
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
