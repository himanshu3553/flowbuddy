'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@flowbuddy/db';
import { getCurrentWorkspace } from '@/lib/session';

/**
 * User onboarding — the per-workflow flag ("start this walkthrough by itself for a new user who
 * lands on its first page?").
 *
 * Two rules, both borrowed from the acting flag beside it on the approval row:
 *  - onboarding rides the approval: no LIVE approval, no onboarding (the flag is refused, never
 *    silently stored to fire later when the workflow is re-approved);
 *  - the one precondition is checked at the toggle, where the founder can read the refusal: the
 *    workflow's FIRST step must carry a route, or the widget has no page to recognise. The config
 *    reader re-derives the same check at serve time from the live steps, so this is a courtesy to
 *    the founder, not the enforcement.
 */
export type OnboardingToggleResult =
  | { ok: true; enabled: boolean }
  | { ok: false; issue: string };

export async function setWorkflowOnboarding(input: {
  workflowId: string;
  enabled: boolean;
}): Promise<OnboardingToggleResult> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const workspaceId = ctx.workspace.id;

  const workflow = await prisma.workflow.findFirst({
    where: { id: input.workflowId, workspaceId },
    select: { id: true, sourceId: true },
  });
  if (!workflow) throw new Error('Workflow not found');

  if (!input.enabled) {
    await prisma.copilotApproval.updateMany({
      where: { workspaceId, workflowId: workflow.id },
      data: { onboardingEnabled: false, onboardingEnabledAt: null, onboardingEnabledById: null },
    });
    revalidatePath(`/dashboard/kb/${workflow.sourceId}`);
    return { ok: true, enabled: false };
  }

  const approval = await prisma.copilotApproval.findUnique({
    where: { workflowId: workflow.id },
    select: { inactiveReason: true },
  });
  if (!approval || approval.inactiveReason !== null) {
    return { ok: false, issue: 'Approve this workflow for Copilot first.' };
  }

  const first = await prisma.knowledgeItem.findFirst({
    where: { workspaceId, workflowId: workflow.id, kind: 'step' },
    orderBy: { orderIndex: 'asc' },
    select: { data: true },
  });
  const route = ((first?.data as { route?: unknown } | null)?.route ?? '') as string;
  if (!first) return { ok: false, issue: 'This workflow has no steps yet.' };
  if (typeof route !== 'string' || route.trim() === '') {
    return {
      ok: false,
      issue: 'The first step has no recorded page, so there is nothing for the widget to recognise. Re-record it starting on the page the task begins on.',
    };
  }

  await prisma.copilotApproval.update({
    where: { workflowId: workflow.id },
    data: {
      onboardingEnabled: true,
      onboardingEnabledAt: new Date(),
      onboardingEnabledById: ctx.userId,
    },
  });
  revalidatePath(`/dashboard/kb/${workflow.sourceId}`);
  return { ok: true, enabled: true };
}
