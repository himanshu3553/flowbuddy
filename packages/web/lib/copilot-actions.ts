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
