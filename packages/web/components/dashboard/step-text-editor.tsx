'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';

import { checkDescriptionMention, deleteStep, updateStepText } from '@/lib/edit-actions';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StepImagePicker } from '@/components/dashboard/step-image-picker';

/**
 * Inline editor for ONE step's instruction + detail — the founder's prose, nothing else.
 *
 * The anchor fields (screenshot, route, the captured event the step cites) are deliberately not
 * here: they are what makes a step evidence rather than prose, and no edit surface may touch them
 * (edit-actions.ts owns the rule). The save re-indexes the text and, on an acting-enabled
 * workflow, re-pins the run plan — both handled server-side; failure leaves everything unchanged.
 */
export function StepTextEditor({
  itemId,
  instruction,
  detail,
  ready,
}: {
  itemId: string;
  instruction: string;
  detail: string;
  /** False while the recording is still building — the rows are about to be rebuilt under the edit. */
  ready: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mention, setMention] = useState<string | null>(null);
  const [ins, setIns] = useState('');
  const [det, setDet] = useState('');

  function openDeleteConfirm() {
    setMention(null);
    setConfirmDelete(true);
    // Best-effort: does the workflow's description still describe this step? Shown in the dialog
    // when it does — deleting removes the click instruction, never the prose that teaches it.
    start(async () => {
      const res = await checkDescriptionMention({ itemId });
      if (res.ok) setMention(res.mention);
    });
  }

  function removeStep() {
    start(async () => {
      const res = await deleteStep({ itemId });
      if (res.ok) {
        toast.success('Step deleted');
        if (res.actingParked) {
          toast.error(
            'Acting was parked for re-review — without this step the workflow no longer compiles to a runnable plan.',
          );
        }
        setConfirmDelete(false);
        setEditing(false);
        // Hand the flagged description sentence to the description card (same page) via the URL,
        // so it can highlight what still teaches the deleted step until the founder edits it.
        if (mention && mention.length <= 300) {
          const params = new URLSearchParams(window.location.search);
          params.set('descMention', mention);
          router.replace(`?${params.toString()}`);
        }
        router.refresh();
      } else {
        toast.error(res.error);
        setConfirmDelete(false);
      }
    });
  }

  function saveEdit() {
    start(async () => {
      const res = await updateStepText({ itemId, instruction: ins, detail: det });
      if (res.ok) {
        toast.success('Step updated');
        if (res.actingParked) {
          toast.error(
            'Acting was parked for re-review — with this text the steps no longer compile to a runnable plan.',
          );
        }
        setEditing(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  if (editing) {
    return (
      <div className="mt-2 space-y-2">
        <Input
          value={ins}
          maxLength={400}
          disabled={busy}
          onChange={(e) => setIns(e.target.value)}
          aria-label="Step instruction"
          autoFocus
        />
        <Textarea
          value={det}
          rows={2}
          maxLength={1000}
          disabled={busy}
          onChange={(e) => setDet(e.target.value)}
          aria-label="Step detail"
          placeholder="Optional detail shown under the instruction"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="soft" disabled={busy || !ins.trim()} onClick={saveEdit}>
            Save
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <span className="ml-auto flex items-center gap-2">
            <StepImagePicker itemId={itemId} instruction={instruction} detail={detail} />
            <Button
              size="sm"
              variant="ghost"
              className="text-danger-text hover:text-danger-text"
              disabled={busy}
              onClick={openDeleteConfirm}
            >
              Delete step
            </Button>
          </span>
        </div>
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this step?</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    The copilot stops citing it immediately, and rebuilds of this recording keep it
                    deleted. Nothing is lost for good — the captured action stays in the recording,
                    and “Add a step from the recording” restores it any time.
                  </p>
                  <p>
                    If the AI Agent may run this workflow, its plan is recompiled — a workflow that
                    no longer compiles cleanly without this step parks acting for your review.
                  </p>
                  {mention && (
                    <p className="rounded-control border border-brand-100 bg-brand-50 px-2.5 py-2 text-[12px] leading-relaxed text-secondary-foreground">
                      The workflow description also mentions this: <span className="font-medium">“{mention}”</span>{' '}
                      — deleting the step won’t remove that sentence, and the copilot reads both.
                      Edit the description too if the concept should go entirely.
                    </p>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={busy} onClick={removeStep}>
                {busy ? 'Deleting…' : 'Delete step'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <>
      <p className="mt-2 text-sm font-medium">
        {instruction}
        {ready && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-1 h-6 px-1.5 align-middle text-muted-foreground"
            aria-label="Edit this step"
            disabled={busy}
            onClick={() => {
              setIns(instruction);
              setDet(detail);
              setEditing(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </p>
      {detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}
    </>
  );
}
