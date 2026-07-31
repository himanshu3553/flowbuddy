import { prisma } from '@flowbuddy/db';

/**
 * P1-M5 — copilot trust gate (server-only): approval bookkeeping for Studio dashboards.
 *
 * A workflow is "approved for the copilot" when a `CopilotApproval` row names its `workflowId` and
 * that row is LIVE (`inactiveReason` null). Keyed by the workflow's IDENTITY, not by KnowledgeItem
 * rows (the worker deletes+recreates those on every reprocess, so a per-item flag would be wiped)
 * and no longer by its POSITION (a re-split moved positions, which walked approvals onto unreviewed
 * content — P3-M1). Absence of a row = never approved; a non-null `inactiveReason` = retired since.
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
    // The position lives on the workflow now; an approval only names the workflow.
    select: { workflow: { select: { sourceId: true, segmentIndex: true } } },
  });
  return new Set(
    rows
      .filter((r) => r.workflow.segmentIndex !== null)
      .map((r) => keyOf(r.workflow.sourceId, r.workflow.segmentIndex as number)),
  );
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
      inactiveReason: true,
      supersededBy: { select: { segmentTitle: true } },
      workflow: { select: { sourceId: true, segmentIndex: true } },
    },
  });
  return new Map(
    rows
      .filter((r) => r.workflow.segmentIndex !== null)
      .map((r) => [
        keyOf(r.workflow.sourceId, r.workflow.segmentIndex as number),
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

/** Approved workflows for a workspace (for counts / dashboards). Live ones only. */
export async function listApprovedWorkflows(workspaceId: string): Promise<ApprovedWorkflow[]> {
  const rows = await prisma.copilotApproval.findMany({
    where: { workspaceId, inactiveReason: null },
    select: { segmentTitle: true, workflow: { select: { sourceId: true, segmentIndex: true } } },
    orderBy: [{ workflow: { sourceId: 'asc' } }, { workflow: { segmentIndex: 'asc' } }],
  });
  return rows
    .filter((r) => r.workflow.segmentIndex !== null)
    .map((r) => ({
      sourceId: r.workflow.sourceId,
      segmentIndex: r.workflow.segmentIndex as number,
      segmentTitle: r.segmentTitle,
    }));
}

