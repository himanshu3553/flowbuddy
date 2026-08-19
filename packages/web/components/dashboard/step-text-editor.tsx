'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';

import { updateStepText } from '@/lib/edit-actions';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  const [ins, setIns] = useState('');
  const [det, setDet] = useState('');

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
          <span className="ml-auto">
            <StepImagePicker itemId={itemId} instruction={instruction} detail={detail} />
          </span>
        </div>
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
