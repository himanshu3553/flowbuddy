import { prisma } from '@flowbuddy/db';

/**
 * P1-M5 — copilot trust gate (server-only): approval bookkeeping for Studio dashboards.
 *
 * A workflow is "approved for the copilot" when a `CopilotApproval` row exists for its
 * `(sourceId, segmentIndex)`. Approval is keyed by the workflow, NOT the KnowledgeItem rows,
 * because the worker deletes+recreates items on every (re)process — a per-item flag would be
 * silently wiped. Absence of a row = not approved.
 *
 * NOTE: the RETRIEVAL enforcement seam ("the copilot grounds only on approved-KB") no longer
 * lives here — it's the shared `retrieveApprovedKBItems` in `@flowbuddy/synthesis` (retrieval.ts),
 * used by both the public answer endpoint and the Studio preview. The helpers below only feed
 * Studio UI (candidate lists / counts).
 */

const keyOf = (sourceId: string, segmentIndex: number) => `${sourceId}:${segmentIndex}`;

/** Set of approved `"sourceId:segmentIndex"` keys for a workspace. */
export async function approvedSegmentKeys(workspaceId: string): Promise<Set<string>> {
  const rows = await prisma.copilotApproval.findMany({
    where: { workspaceId },
    select: { sourceId: true, segmentIndex: true },
  });
  return new Set(rows.map((r) => keyOf(r.sourceId, r.segmentIndex)));
}

export interface ApprovedWorkflow {
  sourceId: string;
  segmentIndex: number;
  segmentTitle: string | null;
}

/** Approved workflows for a workspace (for counts / dashboards). */
export async function listApprovedWorkflows(workspaceId: string): Promise<ApprovedWorkflow[]> {
  return prisma.copilotApproval.findMany({
    where: { workspaceId },
    select: { sourceId: true, segmentIndex: true, segmentTitle: true },
    orderBy: [{ sourceId: 'asc' }, { segmentIndex: 'asc' }],
  });
}

