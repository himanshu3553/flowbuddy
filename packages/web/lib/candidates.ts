import { prisma } from '@flowbuddy/db';
import { approvedSegmentKeys } from './copilot-approvals';

/** A workflow candidate = one persisted segment (Option C) — the unit the founder approves for
 *  the copilot (P1-M5). Server-only.
 *  Phase 2 note: this same unit becomes a portal help article when approved for that audience
 *  (workflows-as-articles, 2026-07-07). See docs/phase-2-portal.md §7. */
export interface Candidate {
  sourceId: string;
  appBaseUrl: string | null;
  segmentIndex: number;
  segmentTitle: string;
  itemCount: number;
  copilotApproved: boolean;
}

/** List workflow candidates for a workspace, optionally scoped to one recording (KB page).
 *  Candidates come from KnowledgeItem segmentation tags; approval status from CopilotApproval. */
export async function listCandidates(workspaceId: string, sourceId?: string): Promise<Candidate[]> {
  const items = await prisma.knowledgeItem.findMany({
    where: { workspaceId, segmentIndex: { not: null }, ...(sourceId ? { sourceId } : {}) },
    select: { sourceId: true, segmentIndex: true, segmentTitle: true },
  });

  const grouped = new Map<string, { sourceId: string; segmentIndex: number; segmentTitle: string; itemCount: number }>();
  for (const it of items) {
    if (it.segmentIndex == null) continue;
    const key = `${it.sourceId}:${it.segmentIndex}`;
    const g = grouped.get(key);
    if (g) g.itemCount++;
    else
      grouped.set(key, {
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
  const approved = await approvedSegmentKeys(workspaceId);

  return [...grouped.values()]
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.segmentIndex - b.segmentIndex)
    .map((c) => ({
      ...c,
      appBaseUrl: appById.get(c.sourceId) ?? null,
      copilotApproved: approved.has(`${c.sourceId}:${c.segmentIndex}`),
    }));
}
