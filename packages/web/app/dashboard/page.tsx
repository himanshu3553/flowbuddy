import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';
import { signOutAction } from '@/lib/actions';
import { CreateToken } from './create-token';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  const ctx = await getCurrentWorkspace();
  if (!ctx) redirect('/signin');
  const { workspace } = ctx;

  const [sessions, articles] = await Promise.all([
    prisma.knowledgeSource.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { _count: { select: { articles: true } } },
    }),
    prisma.article.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { updatedAt: 'desc' },
      take: 25,
      include: { _count: { select: { steps: true } } },
    }),
  ]);

  return (
    <main style={{ maxWidth: 720 }}>
      <h1>Sync Studio</h1>
      <p className="sub">{session.user.email} · {workspace.name}</p>

      <div className="card">
        <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>Extension API token</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {/* tokens are write-only; generate one to paste into the recorder */}
          Generate a token and paste it into the Sync Recorder extension.
        </p>
        <CreateToken />
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15, margin: '0 0 2px' }}>Recordings &amp; Knowledge Base</h2>
        <p className="muted" style={{ marginTop: 0 }}>Click a recording to see the knowledge extracted from it (transcript + items).</p>
        {sessions.length === 0 ? (
          <p className="muted">No recordings yet. Record one with the extension.</p>
        ) : (
          <ul className="list">
            {sessions.map((s) => (
              <li key={s.id}>
                <span className={`pill pill-${s.status}`}>{s.status}</span>
                <Link className="grow" href={`/dashboard/kb/${s.id}`}>{s.appBaseUrl || '(unknown app)'}</Link>
                <span className="muted">{s.kind} · {s._count.articles} article(s)</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15, margin: '0 0 10px' }}>Articles</h2>
        {articles.length === 0 ? (
          <p className="muted">No articles yet. They appear after a recording is synthesized.</p>
        ) : (
          <ul className="list">
            {articles.map((a) => (
              <li key={a.id}>
                <span className={`pill pill-${a.status}`}>{a.status}</span>
                <Link className="grow" href={`/dashboard/articles/${a.id}`}>{a.title}</Link>
                <span className="muted">{a._count.steps} steps</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form action={signOutAction}>
        <button type="submit" className="secondary">Sign out</button>
      </form>
    </main>
  );
}
