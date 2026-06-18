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
    prisma.recSession.findMany({
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
        <h2 style={{ fontSize: 15, margin: '0 0 10px' }}>Recordings</h2>
        {sessions.length === 0 ? (
          <p className="muted">No recordings yet. Record one with the extension.</p>
        ) : (
          <ul className="list">
            {sessions.map((s) => (
              <li key={s.id}>
                <span className={`pill pill-${s.status}`}>{s.status}</span>
                <span className="grow">{s.appBaseUrl || '(unknown app)'}</span>
                <span className="muted">{s._count.articles} article(s)</span>
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
