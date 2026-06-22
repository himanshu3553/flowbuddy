import { prisma } from '@sync/db';
import { approvedSegmentKeys } from './copilot-approvals';

/** A workflow candidate = one persisted segment (Option C). It's both the unit the user can
 *  generate into an article (Phase 2) AND the unit approved for the copilot (P1-M5). Server-only. */
export interface Candidate {
  sourceId: string;
  appBaseUrl: string | null;
  segmentIndex: number;
  segmentTitle: string;
  itemCount: number;
  generatedArticleId: string | null;
  copilotApproved: boolean;
}

/** List workflow candidates for a workspace, optionally scoped to one recording (KB page).
 *  Candidates come from KnowledgeItem segmentation tags; generation status from linked Articles. */
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

  const articles = await prisma.article.findMany({
    where: { workspaceId, segmentIndex: { not: null }, ...(sourceId ? { sessionId: sourceId } : {}) },
    select: { id: true, sessionId: true, segmentIndex: true },
  });
  const genByKey = new Map<string, string>();
  for (const a of articles) {
    if (a.sessionId != null && a.segmentIndex != null) genByKey.set(`${a.sessionId}:${a.segmentIndex}`, a.id);
  }

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
      generatedArticleId: genByKey.get(`${c.sourceId}:${c.segmentIndex}`) ?? null,
      copilotApproved: approved.has(`${c.sourceId}:${c.segmentIndex}`),
    }));
}
