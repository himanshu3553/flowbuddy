'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pencil } from 'lucide-react';

import { updateWorkflowDescription, updateWorkflowTitle, type EditResult } from '@/lib/edit-actions';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * "What this workflow is" — the workflow's title + description, now founder-editable.
 *
 * The description is model output inside approved knowledge; a founder rewriting it replaces model
 * words with their own, which is strictly better for the trust boundary. The one rule it must keep
 * (schema.prisma `Workflow.description`): describe the task and its choices — never restate a click
 * target, because no overlap with the steps is what makes the two unable to contradict each other.
 * The helper line under the editor carries that rule to the person typing.
 */
export function WorkflowContentCard({
  workflowId,
  title,
  description,
  ready,
}: {
  workflowId: string;
  title: string;
  description: string | null;
  /** False while the recording is still building — the rows are about to be rebuilt under the edit. */
  ready: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, start] = useTransition();
  const [editing, setEditing] = useState<'none' | 'title' | 'description'>('none');
  const [draft, setDraft] = useState('');

  // A step deletion may flag a description sentence that still teaches the deleted step
  // (step-text-editor puts it in the URL). Highlight it until the founder edits — the system
  // never rewrites founder-approvable prose on a heuristic; it points, the founder decides.
  const mentionParam = searchParams.get('descMention');
  const mention = description && mentionParam && description.includes(mentionParam) ? mentionParam : null;

  function clearMention() {
    if (!mentionParam) return;
    const params = new URLSearchParams(window.location.search);
    params.delete('descMention');
    router.replace(params.size > 0 ? `?${params.toString()}` : window.location.pathname);
  }

  function save(action: () => Promise<EditResult>, done: string) {
    start(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(done);
        setEditing('none');
        clearMention();
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const pencil = (target: 'title' | 'description', current: string, label: string) =>
    ready ? (
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-1.5 text-muted-foreground"
        aria-label={label}
        disabled={busy}
        onClick={() => {
          setDraft(current);
          setEditing(target);
        }}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    ) : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">What this workflow is</CardTitle>
        <CardDescription>
          Written from your narration — it explains the task and what’s optional. The copilot reads
          it alongside the steps, so it is part of what you approve. You can rewrite both.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Title
          </div>
          {editing === 'title' ? (
            <div className="mt-1.5 space-y-2">
              <Input
                value={draft}
                maxLength={160}
                disabled={busy}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="soft"
                  disabled={busy || !draft.trim()}
                  onClick={() => save(() => updateWorkflowTitle({ workflowId, title: draft }), 'Title updated')}
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing('none')}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-0.5 flex items-center gap-1">
              <span className="text-sm font-medium">{title}</span>
              {pencil('title', title, 'Edit the workflow title')}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Description
            </span>
            {editing !== 'description' && pencil('description', description ?? '', 'Edit the workflow description')}
          </div>
          {editing === 'description' ? (
            <div className="mt-1.5 space-y-2">
              <Textarea
                value={draft}
                rows={5}
                maxLength={4000}
                disabled={busy}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Describe the task and what’s optional — the steps already say what to click, so the
                description shouldn’t repeat them.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="soft"
                  disabled={busy}
                  onClick={() =>
                    save(
                      () => updateWorkflowDescription({ workflowId, description: draft }),
                      draft.trim() ? 'Description updated' : 'Description cleared',
                    )
                  }
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing('none')}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : description ? (
            mention ? (
              <>
                <p className="mt-1 text-[13.5px] leading-relaxed text-secondary-foreground">
                  {description.slice(0, description.indexOf(mention))}
                  <mark className="rounded bg-brand-100 px-0.5 text-secondary-foreground">{mention}</mark>
                  {description.slice(description.indexOf(mention) + mention.length)}
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  The highlighted sentence may still describe the step you just deleted — edit the
                  description to remove it, or leave it if the concept should stay.
                </p>
              </>
            ) : (
              <p className="mt-1 text-[13.5px] leading-relaxed text-secondary-foreground">{description}</p>
            )
          ) : (
            /* Absence is a REAL state, not an empty slot: the narration said nothing beyond the
               clicks. Rendering nothing here would let a founder assume they had read everything
               the copilot will say — and writing one by hand is now the fastest fix. */
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              No description — your narration didn’t say anything about this task beyond the actions
              themselves, so the copilot answers from the steps alone. Write one here, or re-record
              while saying what the task is for and what’s optional.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
