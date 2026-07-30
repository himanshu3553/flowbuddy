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

interface WorkflowCoord {
  sourceId: string;
  segmentIndex: number;
}

/** Every coordinate must belong to the caller's workspace before anything is written. */
async function assertOwned(workspaceId: string, coords: WorkflowCoord[]): Promise<void> {
  const ids = [...new Set(coords.map((c) => c.sourceId))];
  const owned = await prisma.knowledgeSource.findMany({
    where: { id: { in: ids }, workspaceId },
    select: { id: true },
  });
  if (owned.length !== ids.length) throw new Error('Recording not found');
}

function revalidate(coords: WorkflowCoord[]): void {
  for (const id of new Set(coords.map((c) => c.sourceId))) {
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
  retired: WorkflowCoord;
  replacement: WorkflowCoord & { segmentTitle?: string | null };
}): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const workspaceId = ctx.workspace.id;

  const { retired, replacement } = input;
  if (retired.sourceId === replacement.sourceId && retired.segmentIndex === replacement.segmentIndex) {
    throw new Error('A workflow cannot replace itself');
  }
  await assertOwned(workspaceId, [retired, replacement]);

  await prisma.$transaction(async (tx) => {
    const current = await tx.copilotApproval.upsert({
      where: {
        sourceId_segmentIndex: {
          sourceId: replacement.sourceId,
          segmentIndex: replacement.segmentIndex,
        },
      },
      create: {
        workspaceId,
        sourceId: replacement.sourceId,
        segmentIndex: replacement.segmentIndex,
        segmentTitle: replacement.segmentTitle ?? null,
        approvedById: ctx.userId,
      },
      // The replacement becomes current even if it had been superseded by something earlier.
      update: { supersededById: null, supersededAt: null },
      select: { id: true },
    });

    // Only an APPROVED workflow can be superseded — an unapproved one answers nothing already.
    await tx.copilotApproval.updateMany({
      where: { workspaceId, sourceId: retired.sourceId, segmentIndex: retired.segmentIndex },
      data: { supersededById: current.id, supersededAt: new Date() },
    });
  });

  revalidate([retired, replacement]);
}

/** Undo a supersession — the retired workflow becomes current again. */
export async function undoSupersede(input: WorkflowCoord): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const workspaceId = ctx.workspace.id;
  await assertOwned(workspaceId, [input]);

  await prisma.copilotApproval.updateMany({
    where: { workspaceId, sourceId: input.sourceId, segmentIndex: input.segmentIndex },
    data: { supersededById: null, supersededAt: null },
  });

  revalidate([input]);
}

/**
 * "Both are real." Records the decision so the pair is never raised again.
 *
 * In this cut that memo is ALL it does — both workflows stay approved exactly as they were. The
 * value is that keeping both becomes a decision the founder made, rather than a duplicate nobody
 * was told about. Teaching the copilot to CHOOSE between two live routes is the next cut.
 */
export async function keepBothWorkflows(input: { x: WorkflowCoord; y: WorkflowCoord }): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const workspaceId = ctx.workspace.id;
  await assertOwned(workspaceId, [input.x, input.y]);

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

  revalidate([input.x, input.y]);
}
