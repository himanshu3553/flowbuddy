import { prisma } from '@flowbuddy/db';
import { approvedSegmentKeys, inactiveWorkflows } from './copilot-approvals';

/** A workflow candidate = one persisted segment (Option C) — the unit the founder approves for
 *  the copilot (P1-M5). Server-only.
 *  Phase 2 note: this same unit becomes a portal help article when approved for that audience
 *  (workflows-as-articles, 2026-07-07). See docs/phase-2-portal.md §7. */
export interface Candidate {
  /** P3-M1 — the workflow's durable identity. What every mutation keys on. */
  workflowId: string;
  sourceId: string;
  appBaseUrl: string | null;
  segmentIndex: number;
  segmentTitle: string;
  itemCount: number;
  /** P3-M1 — the workflow's PLAN in prose. Carried here because this is what feeds the APPROVAL
   *  surfaces, and the description is model output entering approved knowledge: steps are anchored to
   *  captured events, this is not, and the copilot reads it in both answer modes. A founder who
   *  cannot see it where the switch is has not approved everything the copilot may say. `null` is a
   *  real state (the narration revealed nothing beyond the steps) and must be SHOWN as one, not
   *  rendered as blank — it tells the founder this workflow answers from steps alone. */
  description: string | null;
  copilotApproved: boolean;
  /** P3-M0/M1 — why this workflow stopped answering, if it did. Distinct from "never approved": it
   *  WAS approved. `"superseded"` = the founder replaced it; `"needs_review"` = a reprocess could
   *  not confirm the content is still what they approved. */
  inactiveReason: string | null;
  /** The replacement's title — only meaningful when `inactiveReason === "superseded"`. */
  supersededByTitle?: string | null;
}

/** List workflow candidates for a workspace, optionally scoped to one recording (KB page).
 *  Candidates come from KnowledgeItem segmentation tags; approval status from CopilotApproval. */
export async function listCandidates(workspaceId: string, sourceId?: string): Promise<Candidate[]> {
  const items = await prisma.knowledgeItem.findMany({
    where: { workspaceId, segmentIndex: { not: null }, ...(sourceId ? { sourceId } : {}) },
    select: { workflowId: true, sourceId: true, segmentIndex: true, segmentTitle: true },
  });

  const grouped = new Map<
    string,
    { workflowId: string; sourceId: string; segmentIndex: number; segmentTitle: string; itemCount: number }
  >();
  for (const it of items) {
    if (it.segmentIndex == null) continue;
    const key = `${it.sourceId}:${it.segmentIndex}`;
    const g = grouped.get(key);
    if (g) g.itemCount++;
    else
      grouped.set(key, {
        workflowId: it.workflowId,
        sourceId: it.sourceId,
        segmentIndex: it.segmentIndex,
        segmentTitle: it.segmentTitle ?? `Workflow ${it.segmentIndex + 1}`,
        itemCount: 1,
      });
  }
  if (grouped.size === 0) return [];

  const sourceIds = [...new Set([...grouped.values()].map((c) => c.sourceId))];
  const sources = await prisma.knowledgeSource.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, appBaseUrl: true },
  });
  const appById = new Map(sources.map((s) => [s.id, s.appBaseUrl]));
  // The description lives on `Workflow`, not `KnowledgeItem` — which is why the approval surfaces
  // never had it. Scoped by workspaceId as well as id: the ids come from this workspace's items, so
  // it is redundant, but every tenant read in here states its own scope rather than inheriting one.
  const [approved, inactive, described] = await Promise.all([
    approvedSegmentKeys(workspaceId),
    inactiveWorkflows(workspaceId),
    prisma.workflow.findMany({
      where: { workspaceId, id: { in: [...new Set([...grouped.values()].map((c) => c.workflowId))] } },
      select: { id: true, description: true },
    }),
  ]);
  const descriptionById = new Map(described.map((w) => [w.id, w.description]));

  return [...grouped.values()]
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.segmentIndex - b.segmentIndex)
    .map((c) => {
      const key = `${c.sourceId}:${c.segmentIndex}`;
      const retired = inactive.get(key);
      return {
        ...c,
        appBaseUrl: appById.get(c.sourceId) ?? null,
        description: descriptionById.get(c.workflowId) ?? null,
        copilotApproved: approved.has(key),
        inactiveReason: retired?.reason ?? null,
        supersededByTitle: retired?.replacedByTitle ?? null,
      };
    });
}
