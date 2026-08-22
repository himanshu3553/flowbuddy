'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@flowbuddy/db';
import { getCurrentWorkspace } from '@/lib/session';
import { updateStepText, updateWorkflowDescription, updateWorkflowTitle } from '@/lib/edit-actions';

/**
 * P3-M0 — resolving a duplicate-workflow warning. Four outcomes, all founder-chosen: "the new one
 * replaces the old" (supersede) · "keep the old, the new one was a mistake" (the reverse) · "two
 * routes to one goal" (group) · "not duplicates at all" (a memo so the pair stops being raised).
 *
 * NOTHING here deletes. A superseded workflow keeps its recording, its steps and its analytics
 * history; it simply stops being current. That is what makes a wrong call one click to reverse, and
 * reversibility is the reason the founder can be asked to decide quickly.
 */

/**
 * Every workflow must belong to the caller's workspace before anything is written. Returns the
 * recordings involved, which is all the revalidation below needs.
 */
async function assertOwned(workspaceId: string, workflowIds: string[]): Promise<string[]> {
  const ids = [...new Set(workflowIds)];
  const owned = await prisma.workflow.findMany({
    where: { id: { in: ids }, workspaceId },
    select: { sourceId: true },
  });
  if (owned.length !== ids.length) throw new Error('Workflow not found');
  return [...new Set(owned.map((w) => w.sourceId))];
}

function revalidate(sourceIds: string[]): void {
  for (const id of sourceIds) {
    revalidatePath(`/dashboard/kb/${id}`);
    revalidatePath(`/dashboard/recordings/${id}`);
  }
  revalidatePath('/dashboard/kb');
  revalidatePath('/dashboard');
}

/**
 * "This replaces the old one." Approves the replacement (if it isn't already) and points the retired
 * workflow at it. Both steps are one transaction: a workspace must never end up with the old one
 * retired and the new one unapproved — that is a silent coverage hole.
 */
export async function supersedeWorkflow(input: {
  retiredWorkflowId: string;
  replacementWorkflowId: string;
  replacementTitle?: string | null;
  /** Reviewed edit carry-over (edit-actions `planEditCarryover`): applied AFTER the supersede
   *  through the same save machinery as a hand edit — re-embed-or-fail per step, ownership stamps,
   *  rebuild survival. Never inferred: the founder ticked each one. */
  carry?: {
    steps: { newItemId: string; instruction: string; detail: string }[];
    title?: string;
    description?: string;
  };
}): Promise<{ carried: number; failed: number }> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const workspaceId = ctx.workspace.id;

  const { retiredWorkflowId, replacementWorkflowId, replacementTitle } = input;
  if (retiredWorkflowId === replacementWorkflowId) {
    throw new Error('A workflow cannot replace itself');
  }
  const sourceIds = await assertOwned(workspaceId, [retiredWorkflowId, replacementWorkflowId]);

  await prisma.$transaction(async (tx) => {
    const current = await tx.copilotApproval.upsert({
      where: { workflowId: replacementWorkflowId },
      create: {
        workspaceId,
        workflowId: replacementWorkflowId,
        segmentTitle: replacementTitle ?? null,
        approvedById: ctx.userId,
      },
      // The replacement becomes live even if it had previously been retired for any reason.
      update: { inactiveReason: null, inactiveAt: null, supersededById: null },
      select: { id: true },
    });

    // Only an APPROVED workflow can be superseded — an unapproved one answers nothing already.
    await tx.copilotApproval.updateMany({
      where: { workspaceId, workflowId: retiredWorkflowId },
      data: { inactiveReason: 'superseded', inactiveAt: new Date(), supersededById: current.id },
    });
  });

  revalidate(sourceIds);

  // Carry-over: every item is re-validated to belong to the REPLACEMENT workflow (the plan was
  // computed for this pair, but the founder's ticks are client input). Failures are counted, not
  // thrown — the supersede itself already happened and must not read as undone.
  let carried = 0;
  let failed = 0;
  if (input.carry) {
    const owned = new Set(
      (
        await prisma.knowledgeItem.findMany({
          where: { workflowId: replacementWorkflowId, workspaceId, kind: 'step' },
          select: { id: true },
        })
      ).map((i) => i.id),
    );
    for (const step of input.carry.steps) {
      if (!owned.has(step.newItemId)) {
        failed += 1;
        continue;
      }
      const res = await updateStepText({ itemId: step.newItemId, instruction: step.instruction, detail: step.detail });
      if (res.ok) carried += 1;
      else failed += 1;
    }
    if (input.carry.title) {
      const res = await updateWorkflowTitle({ workflowId: replacementWorkflowId, title: input.carry.title });
      if (res.ok) carried += 1;
      else failed += 1;
    }
    if (input.carry.description) {
      const res = await updateWorkflowDescription({
        workflowId: replacementWorkflowId,
        description: input.carry.description,
      });
      if (res.ok) carried += 1;
      else failed += 1;
    }
  }
  return { carried, failed };
}

/**
 * "Keep the one I already approved." The mirror of `supersedeWorkflow`: the approved workflow is
 * untouched and the NEWER recording is recorded as superseded by it — so it leaves Pending, leaves
 * the duplicate detector (a retired workflow is a resolved duplicate), and sits under "Not
 * answering" with a Restore, like every other resolution.
 *
 * The newer one usually has NO approval row yet, so one is created already-inactive with
 * `approvedById: null` — the mark that no human ever approved it. `undoSupersede` reads that mark:
 * restoring such a row DELETES it (back to Pending) rather than clearing `inactiveReason`, which
 * would quietly approve a workflow nobody reviewed.
 */
export async function keepExistingWorkflow(input: {
  keptWorkflowId: string;
  discardedWorkflowId: string;
}): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const workspaceId = ctx.workspace.id;
  const { keptWorkflowId, discardedWorkflowId } = input;
  if (keptWorkflowId === discardedWorkflowId) throw new Error('A workflow cannot replace itself');
  const sourceIds = await assertOwned(workspaceId, [keptWorkflowId, discardedWorkflowId]);

  const kept = await prisma.copilotApproval.findFirst({
    where: { workspaceId, workflowId: keptWorkflowId, inactiveReason: null },
    select: { id: true },
  });
  if (!kept) throw new Error('The workflow to keep is not live — approve it first');

  const discarded = await prisma.workflow.findFirst({
    where: { id: discardedWorkflowId, workspaceId },
    select: { title: true },
  });
  const retired = { inactiveReason: 'superseded', inactiveAt: new Date(), supersededById: kept.id };
  await prisma.copilotApproval.upsert({
    where: { workflowId: discardedWorkflowId },
    create: {
      workspaceId,
      workflowId: discardedWorkflowId,
      segmentTitle: discarded?.title ?? null,
      approvedById: null,
      ...retired,
    },
    update: retired,
  });

  revalidate(sourceIds);
}

/**
 * Bring a retired workflow back — whether it was replaced, or suspended because a reprocess could
 * not confirm its content. One action for both: from the founder's side the decision is identical
 * ("I've looked, this should answer again"), and the reason it stopped is already on screen.
 */
export async function undoSupersede(input: { workflowId: string }): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const workspaceId = ctx.workspace.id;
  const sourceIds = await assertOwned(workspaceId, [input.workflowId]);

  // A row nobody approved (see `keepExistingWorkflow`) goes back to Pending, never to live.
  const row = await prisma.copilotApproval.findFirst({
    where: { workspaceId, workflowId: input.workflowId },
    select: { id: true, approvedById: true },
  });
  if (!row) return;
  if (row.approvedById == null) {
    await prisma.copilotApproval.delete({ where: { id: row.id } });
  } else {
    await prisma.copilotApproval.update({
      where: { id: row.id },
      data: { inactiveReason: null, inactiveAt: null, supersededById: null },
    });
  }

  revalidate(sourceIds);
}

/**
 * "These are NOT duplicates" — the detector was wrong. Remembers the pair so it stops being raised,
 * and changes NOTHING else: both workflows stay approved and both keep answering.
 *
 * ⚠️ Deliberately separate from `groupAsOneTask` below. The old single "Both are real" button
 * conflated them, and the two outcomes are not interchangeable: grouping makes the copilot answer
 * from only ONE of the pair, so recording a false positive as a grouping would silence half of what
 * a workspace knows. Detection has already produced a real false positive between two unrelated
 * tasks that shared their opening navigation — this is the button for that, and it must stay cheap
 * and consequence-free.
 */
export async function dismissOverlap(input: {
  aWorkflowId: string;
  bWorkflowId: string;
}): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const workspaceId = ctx.workspace.id;
  const sourceIds = await assertOwned(workspaceId, [input.aWorkflowId, input.bWorkflowId]);

  const [a, b] = [input.aWorkflowId, input.bWorkflowId].sort();
  await prisma.workflowOverlapDismissal.upsert({
    where: { aWorkflowId_bWorkflowId: { aWorkflowId: a as string, bWorkflowId: b as string } },
    create: { workspaceId, aWorkflowId: a as string, bWorkflowId: b as string, decidedById: ctx.userId },
    update: {},
  });

  revalidate(sourceIds);
}

/**
 * "Two routes to the same thing." Groups both workflows under one task, which is what lets the
 * copilot answer from ONE of them instead of splitting its attention across both.
 *
 * Grouping is TRANSITIVE and merges: if either side already belongs to a task, the other joins it,
 * and if both already belong to different tasks the two tasks become one. Otherwise a founder could
 * group A with B, then B with C, and end up with a copilot that thinks A and C are unrelated.
 */
export async function groupAsOneTask(input: {
  aWorkflowId: string;
  bWorkflowId: string;
}): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const workspaceId = ctx.workspace.id;
  const sourceIds = await assertOwned(workspaceId, [input.aWorkflowId, input.bWorkflowId]);

  const pair = await prisma.workflow.findMany({
    where: { id: { in: [input.aWorkflowId, input.bWorkflowId] } },
    select: { id: true, taskId: true },
  });
  const existing = pair.map((w) => w.taskId).filter((t): t is string => t != null);
  // Reuse an existing task where there is one, so joining a group never renames it.
  const taskId = existing[0] ?? `task_${input.aWorkflowId}`;

  await prisma.$transaction([
    // Absorb any other task the pair already belonged to.
    ...(existing.length > 1
      ? [
          prisma.workflow.updateMany({
            where: { workspaceId, taskId: { in: existing.filter((t) => t !== taskId) } },
            data: { taskId },
          }),
        ]
      : []),
    prisma.workflow.updateMany({
      where: { id: { in: [input.aWorkflowId, input.bWorkflowId] } },
      data: { taskId },
    }),
  ]);

  revalidate(sourceIds);
}

/** Ungroup a workflow — it becomes its own task again and answers on its own merits. */
export async function ungroupWorkflow(input: { workflowId: string }): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const workspaceId = ctx.workspace.id;
  const sourceIds = await assertOwned(workspaceId, [input.workflowId]);

  await prisma.workflow.updateMany({
    where: { workspaceId, id: input.workflowId },
    data: { taskId: null },
  });

  revalidate(sourceIds);
}
