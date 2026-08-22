'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { addStepFromEvent, listAddableEvents, type AddableEvents } from '@/lib/edit-actions';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * "Add a step from the recording" — restore a captured moment the distiller pruned (or the founder
 * deleted). The choices are ONLY this workflow's span events that aren't currently steps: the
 * anchor, screenshot and route come from the real event, the founder types only the words. A step
 * with no captured event cannot be created here or anywhere — that is the trust boundary.
 */
export function AddStepFromRecording({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AddableEvents | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [detail, setDetail] = useState('');

  function openDialog() {
    setOpen(true);
    setData(null);
    setSelected(null);
    setInstruction('');
    setDetail('');
    start(async () => {
      setData(await listAddableEvents({ workflowId }));
    });
  }

  function add() {
    if (!selected) return;
    start(async () => {
      const res = await addStepFromEvent({ workflowId, eventId: selected, instruction, detail });
      if (res.ok) {
        toast.success('Step added');
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
      <Button size="sm" variant="outline" disabled={busy} onClick={openDialog}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add a step from the recording
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Restore a captured action as a step</DialogTitle>
            <DialogDescription>
              This recording captured actions that are not currently part of the workflow. Select
              one to restore as a step, then add its instruction. The screenshot and evidence will
              be taken from the original recording.
            </DialogDescription>
          </DialogHeader>
          {data == null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading captured actions…</p>
          ) : !data.ok ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{data.error}</p>
          ) : data.candidates.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Every captured action in this workflow is already a step.
            </p>
          ) : (
            <div className="min-w-0 space-y-3">
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {data.candidates.map((c) => (
                  <button
                    key={c.eventId}
                    type="button"
                    disabled={busy}
                    onClick={() => setSelected(c.eventId)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-2.5 py-1.5 text-left transition ${
                      selected === c.eventId
                        ? 'border-primary ring-2 ring-primary/40'
                        : 'hover:border-brand-200'
                    }`}
                  >
                    {c.url ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- presigned URL */
                      <img src={c.url} alt="" className="h-10 w-16 shrink-0 rounded border object-cover object-top" />
                    ) : (
                      <span className="h-10 w-16 shrink-0 rounded border bg-media" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{c.label}</span>
                      <span className="block truncate font-mono text-[10.5px] text-muted-foreground">
                        {c.route || '—'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <Input
                  value={instruction}
                  maxLength={400}
                  disabled={busy || !selected}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Step instruction — e.g. Click ‘Invite teammate’"
                  aria-label="Step instruction"
                />
                <Textarea
                  value={detail}
                  rows={2}
                  maxLength={1000}
                  disabled={busy || !selected}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="Optional detail shown under the instruction"
                  aria-label="Step detail"
                />
                <div className="flex justify-end">
                  <Button size="sm" disabled={busy || !selected || !instruction.trim()} onClick={add}>
                    Add step
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
