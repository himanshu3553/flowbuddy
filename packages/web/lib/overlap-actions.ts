'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@flowbuddy/db';
import { canonicalPair } from '@flowbuddy/synthesis/overlap';
import { getCurrentWorkspace } from '@/lib/session';

/**
 * P3-M0 — resolving a duplicate-workflow warning. Two outcomes, both founder-chosen:
 * "this replaces the old one" (supersede) and "both are real" (a memo so the pair stops being raised).
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
}): Promise<void> {
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

  await prisma.copilotApproval.updateMany({
    where: { workspaceId, workflowId: input.workflowId },
    data: { inactiveReason: null, inactiveAt: null, supersededById: null },
  });

  revalidate(sourceIds);
}

/**
 * "Both are real." Records the decision so the pair is never raised again.
 *
 * In this cut that memo is ALL it does — both workflows stay approved exactly as they were. The
 * value is that keeping both becomes a decision the founder made, rather than a duplicate nobody
 * was told about. Teaching the copilot to CHOOSE between two live routes is the next cut.
 */
export async function keepBothWorkflows(input: {
  x: { workflowId: string; sourceId: string; segmentIndex: number };
  y: { workflowId: string; sourceId: string; segmentIndex: number };
}): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const workspaceId = ctx.workspace.id;
  const sourceIds = await assertOwned(workspaceId, [input.x.workflowId, input.y.workflowId]);

  const { a, b } = canonicalPair(input.x, input.y);
  await prisma.workflowOverlapDecision.upsert({
    where: {
      aSourceId_aSegmentIndex_bSourceId_bSegmentIndex: {
        aSourceId: a.sourceId,
        aSegmentIndex: a.segmentIndex,
        bSourceId: b.sourceId,
        bSegmentIndex: b.segmentIndex,
      },
    },
    create: {
      workspaceId,
      aSourceId: a.sourceId,
      aSegmentIndex: a.segmentIndex,
      bSourceId: b.sourceId,
      bSegmentIndex: b.segmentIndex,
      decidedById: ctx.userId,
    },
    update: {},
  });

  revalidate(sourceIds);
}
