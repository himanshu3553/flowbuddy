'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@flowbuddy/db';
import { createLogger } from '@flowbuddy/logger';
import { getCurrentWorkspace } from '@/lib/session';
import { enqueueRenderVideo } from '@/lib/queue';

const log = createLogger('web:video');

/**
 * Request (or re-request) a demo-video render for a workflow. The DemoVideo row is the durable
 * request — upserted to `queued` FIRST so the UI shows progress immediately; the enqueue is
 * best-effort, same contract as reprocessRecording.
 *
 * Founder-facing only: the video is generated for and served to the Studio, never to end users,
 * so this deliberately does not consult CopilotApproval.
 */
export async function generateDemoVideo(workflowId: string): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  // The feature flag gates the action too, not just the card — the UI check alone would leave a
  // stale tab able to enqueue renders after the founder turned the feature off.
  if (!ctx.workspace.demoVideosEnabled) throw new Error('Demo videos are turned off in Copilot settings');
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, workspaceId: ctx.workspace.id },
    select: { id: true, sourceId: true, _count: { select: { items: { where: { kind: 'step' } } } } },
  });
  if (!workflow) throw new Error('Workflow not found');
  if (workflow._count.items === 0) throw new Error('This workflow has no steps yet');

  const existing = await prisma.demoVideo.findUnique({ where: { workflowId }, select: { status: true } });
  if (existing && (existing.status === 'queued' || existing.status === 'processing')) {
    throw new Error('A render is already in progress');
  }

  await prisma.demoVideo.upsert({
    where: { workflowId },
    create: { workflowId, workspaceId: ctx.workspace.id, status: 'queued' },
    // The finished file (if any) stays referenced until the new render replaces it, so a founder
    // can keep watching the old video while the new one cooks — only status/error reset.
    update: { status: 'queued', error: null },
  });
  revalidatePath(`/dashboard/kb/${workflow.sourceId}`);
  try {
    await enqueueRenderVideo({ workflowId, workspaceId: ctx.workspace.id });
  } catch (err) {
    // Redis may be down in local dev — the row stays `queued`; a later regenerate re-enqueues.
    log.error({ workflowId, err: err instanceof Error ? err.message : String(err) }, 'failed to enqueue render job');
  }
}
