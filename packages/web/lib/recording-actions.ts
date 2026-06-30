'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';
import { deleteSessionPrefix } from '@/lib/storage';
import { enqueueSynthesis } from '@/lib/queue';

/** Confirm a recording exists in the caller's workspace; throws otherwise. Returns its id. */
async function ownRecording(id: string): Promise<{ workspaceId: string }> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const rec = await prisma.knowledgeSource.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    select: { id: true },
  });
  if (!rec) throw new Error('Recording not found');
  return { workspaceId: ctx.workspace.id };
}

/** Rename a recording (null/empty clears it, falling back to the app URL). */
export async function renameRecording(id: string, title: string): Promise<void> {
  const { workspaceId } = await ownRecording(id);
  const clean = title.trim().slice(0, 120);
  await prisma.knowledgeSource.update({
    where: { id },
    data: { title: clean || null },
  });
  revalidatePath('/dashboard/recordings');
  revalidatePath(`/dashboard/recordings/${id}`);
  void workspaceId;
}

/** Delete a recording: its DB rows (steps + approvals cascade) AND its stored artifacts. */
export async function deleteRecording(id: string): Promise<void> {
  const { workspaceId } = await ownRecording(id);
  // Storage first — if the DB row is gone we'd lose the key prefix; orphaned objects are worse
  // than a failed-then-retried delete.
  await deleteSessionPrefix(workspaceId, id);
  await prisma.knowledgeSource.delete({ where: { id } });
  revalidatePath('/dashboard/recordings');
}

/** Re-run a recording through synthesis (retry a failure / regenerate workflows). */
export async function reprocessRecording(id: string): Promise<void> {
  const { workspaceId } = await ownRecording(id);
  await prisma.knowledgeSource.update({
    where: { id },
    data: { status: 'uploaded', error: null },
  });
  await enqueueSynthesis({ sessionId: id, workspaceId });
  revalidatePath('/dashboard/recordings');
  revalidatePath(`/dashboard/recordings/${id}`);
}
