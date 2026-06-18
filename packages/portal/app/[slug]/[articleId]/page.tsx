import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@sync/db';
import { signedUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string; articleId: string }>;
}) {
  const { slug, articleId } = await params;

  // Only published articles for this workspace are visible.
  const article = await prisma.article.findFirst({
    where: { id: articleId, status: 'published', workspace: { slug } },
    include: { steps: { orderBy: { orderIndex: 'asc' } }, workspace: true },
  });
  if (!article) notFound();

  const steps = await Promise.all(
    article.steps.map(async (s) => ({
      id: s.id,
      instruction: s.instruction,
      rationale: s.rationale,
      expectedOutcome: s.expectedOutcome,
      highlight: (s.highlight as { x: number; y: number; w: number; h: number } | null) ?? null,
      screenshotUrl: s.screenshotKey ? await signedUrl(s.screenshotKey) : null,
    })),
  );

  return (
    <>
      <header className="site">
        <div className="bar">
          <Link className="brand" href={`/${slug}`}>{article.workspace.name}</Link>
          <span className="tag">Help Center</span>
        </div>
      </header>
      <main className="wrap">
        <p className="back"><Link href={`/${slug}`}>← All articles</Link></p>
        <h1>{article.title}</h1>
        {article.intent && <p className="lead">{article.intent}</p>}
        {article.preconditions.length > 0 && (
          <p className="pre"><strong>Before you start:</strong> {article.preconditions.join('; ')}</p>
        )}
        <ol className="steps">
          {steps.map((s) => (
            <li key={s.id}>
              <p className="instruction">{s.instruction}</p>
              {s.rationale && <p className="rationale">{s.rationale}</p>}
              {s.screenshotUrl && (
                <a className="shot" href={s.screenshotUrl} target="_blank" rel="noreferrer">
                  <span className="shot-frame">
                    <img src={s.screenshotUrl} alt="" />
                    {s.highlight && (
                      <span
                        className="hl"
                        style={{
                          left: `${s.highlight.x * 100}%`,
                          top: `${s.highlight.y * 100}%`,
                          width: `${s.highlight.w * 100}%`,
                          height: `${s.highlight.h * 100}%`,
                        }}
                      />
                    )}
                  </span>
                </a>
              )}
              {s.expectedOutcome && <p className="outcome">→ {s.expectedOutcome}</p>}
            </li>
          ))}
        </ol>
      </main>
      <footer className="site">Powered by Sync</footer>
    </>
  );
}
