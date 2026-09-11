import { prisma } from '@flowbuddy/db';
import { displayRoute } from '@flowbuddy/shared/route-pattern';

/**
 * User onboarding — the Studio overview: every workflow the founder FLAGGED, and whether it will
 * actually fire. Server-only (Prisma); the Copilot page fetches it and hands rows to the client.
 *
 * Deliberately an ALL-APPROVALS read, not live-only — the same choice the workflow page makes
 * (see CLAUDE.md, the liveness trap). This view exists to show the founder the flagged workflows
 * that are SILENT: retired, parked by a reprocess, detached, or missing a first page. A live-only
 * read would hide exactly the rows that need attention. Liveness is re-derived per row from the
 * one column, so "fires" here means what the widget's live-only reader would serve.
 */
export type OnboardingRowStatus = 'fires' | 'retired' | 'needs_review' | 'detached' | 'no_page';

export interface OnboardingOverviewRow {
  workflowId: string;
  title: string;
  /** Link target: the workflow's own page. */
  href: string;
  /** The first step's page, shown through displayRoute (ids elided); null when unknown. */
  page: string | null;
  status: OnboardingRowStatus;
}

export async function getOnboardingOverview(workspaceId: string): Promise<OnboardingOverviewRow[]> {
  const flagged = await prisma.copilotApproval.findMany({
    where: { workspaceId, onboardingEnabled: true },
    select: {
      inactiveReason: true,
      segmentTitle: true,
      workflow: { select: { id: true, sourceId: true, segmentIndex: true, title: true } },
    },
    orderBy: { onboardingEnabledAt: 'asc' },
  });
  if (flagged.length === 0) return [];
  const firstSteps = await prisma.knowledgeItem.findMany({
    where: { workspaceId, kind: 'step', workflowId: { in: flagged.map((f) => f.workflow.id) } },
    select: { workflowId: true, orderIndex: true, data: true },
    orderBy: { orderIndex: 'asc' },
  });
  const firstByWorkflow = new Map<string, string>();
  for (const it of firstSteps) {
    if (firstByWorkflow.has(it.workflowId)) continue;
    firstByWorkflow.set(it.workflowId, (((it.data as { route?: unknown } | null)?.route as string | undefined) ?? '').trim());
  }
  return flagged.map((f) => {
    const w = f.workflow;
    const route = firstByWorkflow.get(w.id) ?? '';
    const status: OnboardingRowStatus =
      f.inactiveReason === 'needs_review'
        ? 'needs_review'
        : f.inactiveReason != null
          ? 'retired'
          : w.segmentIndex == null
            ? 'detached'
            : route === ''
              ? 'no_page'
              : 'fires';
    return {
      workflowId: w.id,
      title: w.title || f.segmentTitle || 'Untitled workflow',
      href: w.segmentIndex == null ? `/dashboard/kb/${w.sourceId}` : `/dashboard/kb/${w.sourceId}?wf=${w.segmentIndex}`,
      page: route ? displayRoute(route) : null,
      status,
    };
  });
}
