import { notFound, redirect } from 'next/navigation';
import { prisma } from '@sync/db';
import type { Highlight } from '@sync/shared';
import { getCurrentWorkspace } from '@/lib/session';
import { signedUrl } from '@/lib/storage';
import { ArticleEditor, type EditorArticle } from './editor';

export const dynamic = 'force-dynamic';

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCurrentWorkspace();
  if (!ctx) redirect('/signin');

  const article = await prisma.article.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { steps: { orderBy: { orderIndex: 'asc' } } },
  });
  if (!article) notFound();

  const steps = await Promise.all(
    article.steps.map(async (s) => ({
      id: s.id,
      instruction: s.instruction,
      rationale: s.rationale ?? '',
      selector: s.selector ?? '',
      route: s.route ?? '',
      expectedOutcome: s.expectedOutcome ?? '',
      uncertain: s.uncertain,
      highlight: (s.highlight as Highlight | null) ?? null,
      screenshotUrl: s.screenshotKey ? await signedUrl(s.screenshotKey) : null,
    })),
  );

  const data: EditorArticle = {
    id: article.id,
    title: article.title,
    intent: article.intent ?? '',
    status: article.status === 'published' ? 'published' : 'draft',
    tags: article.tags,
    routes: article.routes,
    steps,
  };

  return <ArticleEditor article={data} />;
}
