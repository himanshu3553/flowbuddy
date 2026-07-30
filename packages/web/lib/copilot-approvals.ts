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

/**
 * Set of `"sourceId:segmentIndex"` keys the copilot may answer from — approved AND still current.
 * P3-M0: a superseded workflow was approved and then replaced by a re-recording; it is NOT live, so
 * it must not read as approved anywhere. `supersededWorkflows` below is what tells the two apart.
 */
export async function approvedSegmentKeys(workspaceId: string): Promise<Set<string>> {
  const rows = await prisma.copilotApproval.findMany({
    where: { workspaceId, supersededById: null },
    select: { sourceId: true, segmentIndex: true },
  });
  return new Set(rows.map((r) => keyOf(r.sourceId, r.segmentIndex)));
}

/**
 * P3-M0 — retired workflows mapped to the title of whatever replaced them, so Studio can say
 * "replaced by X" rather than silently showing them as unapproved (which would look like the
 * founder's approval had been lost).
 */
export async function supersededWorkflows(workspaceId: string): Promise<Map<string, string | null>> {
  const rows = await prisma.copilotApproval.findMany({
    where: { workspaceId, NOT: { supersededById: null } },
    select: { sourceId: true, segmentIndex: true, supersededBy: { select: { segmentTitle: true } } },
  });
  return new Map(rows.map((r) => [keyOf(r.sourceId, r.segmentIndex), r.supersededBy?.segmentTitle ?? null]));
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

