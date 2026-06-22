'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';

/**
 * P1-M5 — approve or un-approve a workflow `(sourceId, segmentIndex)` for the copilot.
 * Auth-checked: the recording must belong to the signed-in user's workspace.
 * Approve = upsert a `CopilotApproval` row; un-approve = delete it (absence = not approved).
 */
export async function setCopilotApproval(input: {
  sourceId: string;
  segmentIndex: number;
  segmentTitle?: string | null;
  approved: boolean;
}): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const workspaceId = ctx.workspace.id;

  // Ownership check: the workflow's recording must belong to this workspace.
  const source = await prisma.knowledgeSource.findFirst({
    where: { id: input.sourceId, workspaceId },
    select: { id: true },
  });
  if (!source) throw new Error('Recording not found');

  if (input.approved) {
    await prisma.copilotApproval.upsert({
      where: { sourceId_segmentIndex: { sourceId: input.sourceId, segmentIndex: input.segmentIndex } },
      create: {
        workspaceId,
        sourceId: input.sourceId,
        segmentIndex: input.segmentIndex,
        segmentTitle: input.segmentTitle ?? null,
        approvedById: ctx.userId,
      },
      update: { segmentTitle: input.segmentTitle ?? null, approvedById: ctx.userId },
    });
  } else {
    await prisma.copilotApproval.deleteMany({
      where: { workspaceId, sourceId: input.sourceId, segmentIndex: input.segmentIndex },
    });
  }

  revalidatePath(`/dashboard/kb/${input.sourceId}`);
  revalidatePath('/dashboard');
}
