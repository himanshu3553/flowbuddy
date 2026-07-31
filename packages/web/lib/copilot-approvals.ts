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
 * Set of `"sourceId:segmentIndex"` keys the copilot may answer from — approved AND live.
 * An approval that was later retired (replaced, or unverifiable after a reprocess) is NOT live and
 * must not read as approved anywhere. `inactiveWorkflows` below is what tells them apart.
 */
export async function approvedSegmentKeys(workspaceId: string): Promise<Set<string>> {
  const rows = await prisma.copilotApproval.findMany({
    where: { workspaceId, inactiveReason: null },
    select: { sourceId: true, segmentIndex: true },
  });
  return new Set(rows.map((r) => keyOf(r.sourceId, r.segmentIndex)));
}

/** Why a workflow stopped answering, and what replaced it (when anything did). */
export interface InactiveWorkflow {
  reason: string;
  replacedByTitle: string | null;
}

/**
 * Retired workflows and WHY, so Studio can say "replaced by X" or "needs re-review" rather than
 * showing them as unapproved — which would look like the founder's approval had been lost.
 */
export async function inactiveWorkflows(
  workspaceId: string,
): Promise<Map<string, InactiveWorkflow>> {
  const rows = await prisma.copilotApproval.findMany({
    where: { workspaceId, NOT: { inactiveReason: null } },
    select: {
      sourceId: true,
      segmentIndex: true,
      inactiveReason: true,
      supersededBy: { select: { segmentTitle: true } },
    },
  });
  return new Map(
    rows.map((r) => [
      keyOf(r.sourceId, r.segmentIndex),
      { reason: r.inactiveReason as string, replacedByTitle: r.supersededBy?.segmentTitle ?? null },
    ]),
  );
}

/**
 * P3-M1 — the durable workflow identities at the given positions, keyed `"sourceId:segmentIndex"`.
 *
 * Every approval carries its `workflowId` — the column is required, so an approval cannot be written
 * without one. A position with no identity is absent from the map, and callers must FAIL rather than
 * invent a fallback: the worker mints an identity for every workflow it distils, so a missing one
 * means the KB and the approval screen disagree about what exists, which is not something to paper
 * over by approving something we cannot name.
 */
export async function workflowIdsAt(
  positions: { sourceId: string; segmentIndex: number }[],
): Promise<Map<string, string>> {
  if (positions.length === 0) return new Map();
  const rows = await prisma.workflow.findMany({
    // `segmentIndex: null` means DETACHED — a reprocess left this workflow with no position in its
    // recording. It is deliberately unreachable here: nothing at a position can resolve to it.
    where: { OR: positions.map((p) => ({ sourceId: p.sourceId, segmentIndex: p.segmentIndex })) },
    select: { id: true, sourceId: true, segmentIndex: true },
  });
  return new Map(
    rows
      .filter((r): r is typeof r & { segmentIndex: number } => r.segmentIndex !== null)
      .map((r) => [keyOf(r.sourceId, r.segmentIndex), r.id]),
  );
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

