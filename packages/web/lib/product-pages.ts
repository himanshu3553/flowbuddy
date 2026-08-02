import { prisma } from '@flowbuddy/db';

/**
 * AIL slice 2 — the KB page's read of PRODUCT PAGES (docs/build/application-intelligence.md).
 *
 * Deliberately ALL pages, not live-only: this is the review surface, the one reader that must see
 * drafts, retired pages and parked updates. The live-only reader is retrieval
 * (`synthesis/retrieval.ts`) — any new consumer picks one of those two postures on purpose.
 */

export interface ProductPageProvenanceView {
  sourceId: string;
  quote: string;
  recordingTitle: string;
}

export interface ProductPageView {
  id: string;
  type: string; // overview | area | concept
  title: string;
  content: string;
  /** Serving right now: approved AND live. */
  live: boolean;
  /** Ever approved — a retired page is not the same thing as a never-reviewed draft. */
  everApproved: boolean;
  inactiveReason: string | null;
  pendingContent: string | null;
  pendingAt: string | null; // ISO — dates cross the server→client boundary as strings
  provenance: ProductPageProvenanceView[];
  /** Slice 3 — the workflows this page points at (display titles; resolution/serving is retrieval's job). */
  relatedWorkflows: string[];
}

export async function listProductPages(workspaceId: string): Promise<ProductPageView[]> {
  const pages = await prisma.productPage.findMany({
    where: { workspaceId },
    select: {
      id: true,
      type: true,
      title: true,
      content: true,
      approvedAt: true,
      inactiveReason: true,
      pendingContent: true,
      pendingAt: true,
      provenance: true,
      links: true,
    },
  });

  // Resolve provenance sourceIds to recording titles once, for every page together.
  const entriesOf = (raw: unknown): Array<{ sourceId: string; quote: string }> =>
    (Array.isArray(raw) ? raw : []).filter(
      (e): e is { sourceId: string; quote: string } =>
        !!e &&
        typeof (e as { sourceId?: unknown }).sourceId === 'string' &&
        typeof (e as { quote?: unknown }).quote === 'string',
    );
  const sourceIds = [...new Set(pages.flatMap((p) => entriesOf(p.provenance).map((e) => e.sourceId)))];
  const sources = sourceIds.length
    ? await prisma.knowledgeSource.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, title: true, appBaseUrl: true },
      })
    : [];
  const titleBySource = new Map(sources.map((s) => [s.id, s.title || s.appBaseUrl || 'a recording']));

  const views = pages.map((p) => ({
    id: p.id,
    type: p.type,
    title: p.title,
    content: p.content,
    live: p.approvedAt !== null && p.inactiveReason === null,
    everApproved: p.approvedAt !== null,
    inactiveReason: p.inactiveReason,
    pendingContent: p.pendingContent,
    pendingAt: p.pendingAt?.toISOString() ?? null,
    provenance: entriesOf(p.provenance).map((e) => ({
      sourceId: e.sourceId,
      quote: e.quote,
      recordingTitle: titleBySource.get(e.sourceId) ?? 'a recording',
    })),
    relatedWorkflows: (Array.isArray(p.links) ? p.links : [])
      .filter(
        (l): l is { kind: string; title: string } =>
          !!l &&
          (l as { kind?: unknown }).kind === 'workflow' &&
          typeof (l as { title?: unknown }).title === 'string',
      )
      .map((l) => l.title),
  }));
  // Overview, then areas, then concepts, A→Z inside each — orientation before geography before vocabulary.
  const rank = (t: string) => (t === 'overview' ? 0 : t === 'area' ? 1 : 2);
  return views.sort((a, b) => rank(a.type) - rank(b.type) || a.title.localeCompare(b.title));
}
