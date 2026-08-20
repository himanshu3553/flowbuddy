'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@flowbuddy/db';
import type { SessionManifest } from '@flowbuddy/shared';
import { cleanEvents } from '@flowbuddy/synthesis/clean';
import { createLogger } from '@flowbuddy/logger';
import { getCurrentWorkspace } from '@/lib/session';
import { deleteSessionPrefix } from '@/lib/storage';
import { enqueueSynthesis } from '@/lib/queue';

const log = createLogger('web:recordings');

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

/**
 * Save the founder's workflow boundaries for a recording and rebuild it (item 4, the Reorganize
 * surface). `boundaryEventIds` is the FULL list of workflow-start event ids on the recording's
 * cleaned timeline — `[]` means one single workflow; use `resetWorkflowBoundaries` for automatic.
 * Ids are validated against a server-side re-run of the SAME deterministic cleaning the pipeline
 * uses — never trusted from the client, same posture as the frame picker's manifest check.
 */
export async function saveWorkflowBoundaries(input: {
  sourceId: string;
  boundaryEventIds: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) return { ok: false, error: 'Not authenticated' };
  const rec = await prisma.knowledgeSource.findFirst({
    where: { id: input.sourceId, workspaceId: ctx.workspace.id },
    select: { id: true, manifest: true },
  });
  if (!rec) return { ok: false, error: 'Recording not found' };
  const manifest = rec.manifest as unknown as SessionManifest | null;
  if (!manifest?.events?.length) {
    return { ok: false, error: 'The recording’s raw capture is missing, so its workflows cannot be reorganized.' };
  }
  if (input.boundaryEventIds.length > 200) {
    return { ok: false, error: 'Too many boundaries — a recording cannot hold that many workflows.' };
  }
  const cleanedIds = new Set(cleanEvents(manifest.events).map((e) => e.id));
  const boundaries = [...new Set(input.boundaryEventIds)];
  const unknown = boundaries.filter((id) => !cleanedIds.has(id));
  if (unknown.length > 0) {
    return { ok: false, error: 'Some boundaries no longer match this recording — reload the page and try again.' };
  }
  await prisma.knowledgeSource.update({
    where: { id: rec.id },
    data: { boundaryOverrides: boundaries },
  });
  await reprocessRecording(rec.id);
  revalidatePath(`/dashboard/kb/${rec.id}`);
  return { ok: true };
}

/** Clear the founder's boundaries — back to automatic segmentation (markers + model) — and rebuild. */
export async function resetWorkflowBoundaries(sourceId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) return { ok: false, error: 'Not authenticated' };
  const rec = await prisma.knowledgeSource.findFirst({
    where: { id: sourceId, workspaceId: ctx.workspace.id },
    select: { id: true },
  });
  if (!rec) return { ok: false, error: 'Recording not found' };
  // Json? can't take a bare null through Prisma's typed update — raw SQL clears it (the worker's
  // pendingProvenance precedent).
  await prisma.$executeRaw`UPDATE "RecSession" SET "boundaryOverrides" = NULL WHERE id = ${rec.id}`;
  await reprocessRecording(rec.id);
  revalidatePath(`/dashboard/kb/${rec.id}`);
  return { ok: true };
}

/** Re-run a recording through synthesis (retry a failure / regenerate workflows). */
export async function reprocessRecording(id: string): Promise<void> {
  const { workspaceId } = await ownRecording(id);
  // Flip status + revalidate FIRST so the UI reflects "Processing" immediately and the action
  // returns promptly — the enqueue is best-effort and must not block or hang the response.
  await prisma.knowledgeSource.update({
    where: { id },
    data: { status: 'uploaded', error: null },
  });
  revalidatePath('/dashboard/recordings');
  revalidatePath(`/dashboard/recordings/${id}`);
  try {
    await enqueueSynthesis({ sessionId: id, workspaceId });
  } catch (err) {
    // Redis/worker may be down in local dev — the recording is marked Processing; the job is
    // picked up once the worker is running. Don't fail the whole action over this.
    log.error({ recordingId: id, err: err instanceof Error ? err.message : String(err) }, 'failed to enqueue synthesis job');
  }
}
