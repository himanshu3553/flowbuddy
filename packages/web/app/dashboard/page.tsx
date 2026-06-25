import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';
import { signOutAction } from '@/lib/actions';
import { resolveCoverageGap } from '@/lib/copilot-actions';
import { CreateToken } from './create-token';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  const ctx = await getCurrentWorkspace();
  if (!ctx) redirect('/signin');
  const { workspace } = ctx;

  const [sessions, openGaps] = await Promise.all([
    prisma.knowledgeSource.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.coverageGap.findMany({
      where: { workspaceId: workspace.id, status: 'open' },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
  ]);

  return (
    <main style={{ maxWidth: 720 }}>
      <h1>Sync Studio</h1>
      <p className="sub">{session.user.email} · {workspace.name}</p>

      <div className="card" style={{ borderLeft: '3px solid #1a8a4f' }}>
        <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>Copilot</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Embed the in-app copilot in your product — it answers only from workflows you approve.{' '}
          <Link href="/dashboard/copilot">Set up the copilot →</Link>
        </p>
      </div>

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
        <p className="muted" style={{ marginTop: 0 }}>Click a recording to see the knowledge extracted from it (transcript + items) and approve workflows for the copilot.</p>
        {sessions.length === 0 ? (
          <p className="muted">No recordings yet. Record one with the extension.</p>
        ) : (
          <ul className="list">
            {sessions.map((s) => (
              <li key={s.id}>
                <span className={`pill pill-${s.status}`}>{s.status}</span>
                <Link className="grow" href={`/dashboard/kb/${s.id}`}>{s.appBaseUrl || '(unknown app)'}</Link>
                <span className="muted">{s.kind}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15, margin: '0 0 2px' }}>Coverage gaps — record these next</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Questions your copilot couldn&apos;t answer from approved workflows. Record (and approve) these to close the gap.
        </p>
        {openGaps.length === 0 ? (
          <p className="muted">No open gaps. Once the copilot is live, questions it can&apos;t answer show up here.</p>
        ) : (
          <ul className="list">
            {openGaps.map((g) => (
              <li key={g.id}>
                <span className="pill pill-draft">{g.source}</span>
                <span className="grow">
                  <strong>{g.prompt}</strong>
                  {g.reason && <span className="muted"> — {g.reason}</span>}
                </span>
                <form action={resolveCoverageGap.bind(null, g.id)}>
                  <button type="submit" className="secondary">Dismiss</button>
                </form>
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
