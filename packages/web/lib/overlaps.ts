import { prisma } from '@flowbuddy/db';
import { findWorkflowOverlaps, workflowKey } from '@flowbuddy/synthesis/overlap';

/**
 * P3-M0 — server-only reads for duplicate-workflow warnings in Studio.
 *
 * Subpath import (`@flowbuddy/synthesis/overlap`), not the barrel: the barrel pulls the whole
 * capture→KB pipeline (and `openai`) into Studio's server bundle for what is one SQL query.
 *
 * ONE SURFACE, because Studio's approval screen is workspace-wide rather than per-recording:
 * comparing EVERY workflow against everything currently live catches both cases at once — a new
 * recording duplicating something approved, AND a pair that was already both approved before this
 * existed. Unapproved-vs-unapproved is deliberately not compared: neither is answering anyone yet,
 * so there is nothing to resolve.
 *
 * Pairs the founder already settled are hidden: a superseded workflow is resolved by definition, and
 * a "keep both" memo means the question was asked and answered.
 */

export interface OverlapSide {
  /** P3-M1 — the durable identity every mutation keys on. */
  workflowId: string;
  sourceId: string;
  segmentIndex: number;
  segmentTitle: string | null;
  approvedAt: Date | null;
  stepCount: number;
  /** Step instructions in order — the founder decides by READING both, so the comparison ships with the warning. */
  steps: string[];
}

export interface WorkflowOverlap {
  /** Live for the copilot and there first — the one a replacement would retire. */
  incumbent: OverlapSide;
  /** The newer telling of the same task. */
  challenger: OverlapSide;
  similarity: number;
}

/**
 * Map every workflow involved in a duplicate to the pairs it belongs to. BOTH sides are indexed: an
 * unapproved workflow that duplicates a live one needs the warning just as much as the live one
 * does — arguably more, since approving it is the action that would create the problem.
 */
export function duplicatesByWorkflow(overlaps: WorkflowOverlap[]): Map<string, WorkflowOverlap[]> {
  const out = new Map<string, WorkflowOverlap[]>();
  const add = (key: string, o: WorkflowOverlap) => out.set(key, [...(out.get(key) ?? []), o]);
  for (const o of overlaps) {
    add(workflowKey(o.incumbent.sourceId, o.incumbent.segmentIndex), o);
    add(workflowKey(o.challenger.sourceId, o.challenger.segmentIndex), o);
  }
  return out;
}

/** The subset of overlaps involving one workflow — for that workflow's own page. */
export function overlapsInvolving(
  overlaps: WorkflowOverlap[],
  sourceId: string,
  segmentIndex: number,
): WorkflowOverlap[] {
  const key = workflowKey(sourceId, segmentIndex);
  return overlaps.filter(
    (o) =>
      workflowKey(o.incumbent.sourceId, o.incumbent.segmentIndex) === key ||
      workflowKey(o.challenger.sourceId, o.challenger.segmentIndex) === key,
  );
}


/**
 * Suspected duplicate workflows in a workspace, strongest first.
 *
 * Advisory: detection degrades to an empty list on any failure, so this can never stop the KB page
 * rendering or a workflow being approved.
 */
export async function listWorkflowOverlaps(workspaceId: string): Promise<WorkflowOverlap[]> {
  const [items, grouped, approvals, dismissals] = await Promise.all([
    prisma.knowledgeItem.findMany({
      where: { workspaceId, segmentIndex: { not: null } },
      select: { workflowId: true, sourceId: true, segmentIndex: true, segmentTitle: true },
    }),
    prisma.workflow.findMany({
      where: { workspaceId, NOT: { taskId: null } },
      select: { id: true, taskId: true },
    }),
    prisma.copilotApproval.findMany({
      where: { workspaceId },
      select: {
        createdAt: true,
        inactiveReason: true,
        workflow: { select: { sourceId: true, segmentIndex: true } },
      },
    }),
    prisma.workflowOverlapDismissal.findMany({
      where: { workspaceId },
      select: { aWorkflowId: true, bWorkflowId: true },
    }),
  ]);

  const taskByWorkflowId = new Map(grouped.map((w) => [w.id, w.taskId as string]));

  const stepCount = new Map<string, number>();
  const titles = new Map<string, string | null>();
  const workflowIdByKey = new Map<string, string>();
  for (const it of items) {
    if (it.segmentIndex == null) continue;
    const k = workflowKey(it.sourceId, it.segmentIndex);
    stepCount.set(k, (stepCount.get(k) ?? 0) + 1);
    if (!titles.has(k)) titles.set(k, it.segmentTitle);
    workflowIdByKey.set(k, it.workflowId);
  }
  const allKeys = [...stepCount.keys()];

  const liveKeys: string[] = [];
  const approvedAt = new Map<string, Date>();
  for (const a of approvals) {
    if (a.workflow.segmentIndex == null) continue; // detached: no position to key a signal on
    const k = workflowKey(a.workflow.sourceId, a.workflow.segmentIndex);
    approvedAt.set(k, a.createdAt);
    if (a.inactiveReason == null) liveKeys.push(k);
  }
  if (allKeys.length === 0 || liveKeys.length === 0) return [];

  const pairs = await findWorkflowOverlaps(prisma, workspaceId, {
    leftKeys: allKeys,
    rightKeys: liveKeys,
  });
  if (pairs.length === 0) return [];

  // Pairs the founder has settled, by workflow identity. Two ways to be settled:
  //  · dismissed  — "not duplicates", the detector was wrong
  //  · grouped    — already two routes to one task, so there is nothing left to ask about
  const settled = new Set(dismissals.map((d) => `${d.aWorkflowId}|${d.bWorkflowId}`));
  const isSettled = (aId: string, bId: string) => {
    const [x, y] = [aId, bId].sort();
    if (settled.has(`${x}|${y}`)) return true;
    const ta = taskByWorkflowId.get(aId);
    return ta != null && ta === taskByWorkflowId.get(bId);
  };

  // Steps are fetched ONLY for workflows that actually turned out to be in a pair — the founder
  // cannot judge "replace or keep both" without reading both step lists, but loading every step in
  // the workspace to show two of them would not scale.
  const involved = new Set(pairs.flatMap((p) => [p.a, p.b]).map((w) => workflowKey(w.sourceId, w.segmentIndex)));
  const stepRows = await prisma.knowledgeItem.findMany({
    where: {
      workspaceId,
      OR: [...involved].map((k) => {
        const idx = k.lastIndexOf(':');
        return { sourceId: k.slice(0, idx), segmentIndex: Number(k.slice(idx + 1)) };
      }),
    },
    select: { sourceId: true, segmentIndex: true, orderIndex: true, data: true },
    orderBy: { orderIndex: 'asc' },
  });
  const stepsByKey = new Map<string, string[]>();
  for (const r of stepRows) {
    if (r.segmentIndex == null) continue;
    const k = workflowKey(r.sourceId, r.segmentIndex);
    const instruction = (r.data as { instruction?: unknown } | null)?.instruction;
    if (typeof instruction !== 'string') continue;
    stepsByKey.set(k, [...(stepsByKey.get(k) ?? []), instruction]);
  }

  const side = (w: { sourceId: string; segmentIndex: number; segmentTitle: string | null }): OverlapSide => {
    const k = workflowKey(w.sourceId, w.segmentIndex);
    return {
      workflowId: workflowIdByKey.get(k) ?? '',
      sourceId: w.sourceId,
      segmentIndex: w.segmentIndex,
      segmentTitle: w.segmentTitle ?? titles.get(k) ?? null,
      approvedAt: approvedAt.get(k) ?? null,
      stepCount: stepCount.get(k) ?? 0,
      steps: stepsByKey.get(k) ?? [],
    };
  };

  // The INCUMBENT is whichever side has been answering questions longer. An unapproved side is
  // never the incumbent — it has never answered anything.
  const rank = (w: { sourceId: string; segmentIndex: number }) =>
    approvedAt.get(workflowKey(w.sourceId, w.segmentIndex))?.getTime() ?? Number.MAX_SAFE_INTEGER;

  return pairs
    .filter((p) => {
      const aId = workflowIdByKey.get(workflowKey(p.a.sourceId, p.a.segmentIndex));
      const bId = workflowIdByKey.get(workflowKey(p.b.sourceId, p.b.segmentIndex));
      return !aId || !bId ? true : !isSettled(aId, bId);
    })
    .map((p) => {
      const aFirst = rank(p.a) <= rank(p.b);
      return {
        incumbent: side(aFirst ? p.a : p.b),
        challenger: side(aFirst ? p.b : p.a),
        similarity: p.similarity,
      };
    });
}
