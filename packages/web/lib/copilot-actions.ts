'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@flowbuddy/db';
import { getCurrentWorkspace } from '@/lib/session';

/**
 * P1-M5 — approve or un-approve a workflow for the copilot.
 * Auth-checked: the workflow must belong to the signed-in user's workspace.
 * Approve = upsert a `CopilotApproval` row; un-approve = delete it (absence = not approved).
 *
 * P3-M1: keyed on the workflow's IDENTITY, never its position. Studio must not be able to approve
 * "whatever is at index 2" any more than the copilot may answer from it.
 */
export async function setCopilotApproval(input: {
  workflowId: string;
  segmentTitle?: string | null;
  approved: boolean;
}): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const workspaceId = ctx.workspace.id;

  // Ownership + identity in one read: a workflow row IS the thing being approved, and it carries
  // the workspace, so there is nothing left to resolve from a position.
  const workflow = await prisma.workflow.findFirst({
    where: { id: input.workflowId, workspaceId },
    select: { id: true, sourceId: true },
  });
  if (!workflow) throw new Error('Workflow not found');

  if (input.approved) {
    await prisma.copilotApproval.upsert({
      where: { workflowId: input.workflowId },
      create: {
        workspaceId,
        workflowId: input.workflowId,
        segmentTitle: input.segmentTitle ?? null,
        approvedById: ctx.userId,
      },
      // Re-approving clears any retirement: this IS the founder saying it should answer again.
      update: {
        segmentTitle: input.segmentTitle ?? null,
        approvedById: ctx.userId,
        inactiveReason: null,
        inactiveAt: null,
        supersededById: null,
      },
    });
  } else {
    await prisma.copilotApproval.deleteMany({ where: { workspaceId, workflowId: input.workflowId } });
  }

  revalidatePath(`/dashboard/kb/${workflow.sourceId}`);
  revalidatePath('/dashboard');
}

/**
 * Approve many workflows at once (the "Approve all" button) in ONE round-trip + ONE DB
 * transaction. Replaces a client-side loop of N separate server actions, which stalled the whole
 * transition (and exhausted free-tier DB connections) leaving the button stuck disabled.
 */
export async function setCopilotApprovalsBulk(
  workflows: { workflowId: string; segmentTitle?: string | null }[],
): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const workspaceId = ctx.workspace.id;
  if (workflows.length === 0) return;

  // Ownership: keep only workflows in this workspace. One id from elsewhere is dropped rather than
  // failing the batch — "Approve all" is a bulk convenience, and a visible partial beats an error.
  const owned = await prisma.workflow.findMany({
    where: { id: { in: workflows.map((w) => w.workflowId) }, workspaceId },
    select: { id: true, sourceId: true },
  });
  const ownedIds = new Set(owned.map((w) => w.id));
  const valid = workflows.filter((w) => ownedIds.has(w.workflowId));
  if (valid.length === 0) return;

  await prisma.$transaction(
    valid.map((w) =>
      prisma.copilotApproval.upsert({
        where: { workflowId: w.workflowId },
        create: {
          workspaceId,
          workflowId: w.workflowId,
          segmentTitle: w.segmentTitle ?? null,
          approvedById: ctx.userId,
        },
        update: {
          segmentTitle: w.segmentTitle ?? null,
          approvedById: ctx.userId,
          inactiveReason: null,
          inactiveAt: null,
          supersededById: null,
        },
      }),
    ),
  );

  for (const id of new Set(owned.map((w) => w.sourceId))) revalidatePath(`/dashboard/kb/${id}`);
  revalidatePath('/dashboard/kb');
  revalidatePath('/dashboard');
}

/**
 * P1-M10 — dismiss a copilot coverage gap ("record this next"). When the copilot declines a
 * question it logs a `CoverageGap` (source=copilot); the founder dismisses it from the dashboard
 * once recorded/handled. (The Phase 2 prompt-to-article path also logs gaps — same dismiss action.)
 */
export async function resolveCoverageGap(gapId: string): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const gap = await prisma.coverageGap.findUnique({ where: { id: gapId } });
  if (!gap || gap.workspaceId !== ctx.workspace.id) throw new Error('Not found');
  await prisma.coverageGap.update({ where: { id: gapId }, data: { status: 'resolved' } });
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/analytics');
}
