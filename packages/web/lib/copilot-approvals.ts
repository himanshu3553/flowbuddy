import { prisma } from '@sync/db';

/**
 * P1-M5 — copilot trust gate (server-only).
 *
 * A workflow is "approved for the copilot" when a `CopilotApproval` row exists for its
 * `(sourceId, segmentIndex)`. Approval is keyed by the workflow, NOT the KnowledgeItem rows,
 * because the worker deletes+recreates items on every (re)process — a per-item flag would be
 * silently wiped. Absence of a row = not approved.
 *
 * `listApprovedItems` is the single enforcement seam: the copilot answer endpoint (P1-M6)
 * retrieves through it, so the copilot can only ever ground on approved-KB ("no-leak").
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

/**
 * The copilot-ELIGIBLE KnowledgeItems for a workspace = items whose `(sourceId, segmentIndex)`
 * is approved. This is the enforcement point for "the copilot answers only from approved-KB".
 * P1-M6 (answer endpoint) retrieves over the result of this; nothing else should query the KB
 * for the copilot directly.
 */
export async function listApprovedItems(workspaceId: string) {
  const keys = await approvedSegmentKeys(workspaceId);
  if (keys.size === 0) return [];
  const items = await prisma.knowledgeItem.findMany({
    where: { workspaceId, segmentIndex: { not: null } },
    orderBy: [{ sourceId: 'asc' }, { segmentIndex: 'asc' }, { orderIndex: 'asc' }],
  });
  return items.filter((i) => i.segmentIndex != null && keys.has(keyOf(i.sourceId, i.segmentIndex)));
}
