import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@sync/db';

export const dynamic = 'force-dynamic';

export default async function WorkspaceHelp({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const workspace = await prisma.workspace.findUnique({ where: { slug } });
  if (!workspace) notFound();

  const articles = await prisma.article.findMany({
    where: { workspaceId: workspace.id, status: 'published' },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { steps: true } } },
  });

  return (
    <>
      <header className="site">
        <div className="bar">
          <Link className="brand" href={`/${slug}`}>{workspace.name}</Link>
          <span className="tag">Help Center</span>
        </div>
      </header>
      <main className="wrap">
        <h1>How can we help?</h1>
        <p className="lead">Guides for using {workspace.name}.</p>
        {articles.length === 0 ? (
          <p className="empty">No published articles yet.</p>
        ) : (
          <ul className="articles">
            {articles.map((a) => (
              <li key={a.id}>
                <Link href={`/${slug}/${a.id}`}>{a.title}</Link>
                <div className="meta">{a._count.steps} steps</div>
              </li>
            ))}
          </ul>
        )}
      </main>
      <footer className="site">Powered by Sync</footer>
    </>
  );
}
