import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';
import { signOutAction } from '@/lib/actions';
import { listCandidates } from '@/lib/candidates';
import { resolveCoverageGap } from '@/lib/prompt-actions';
import { CreateToken } from './create-token';
import { GeneratePanel } from './generate-panel';
import { PromptBox } from './prompt-box';

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

  const openGaps = await prisma.coverageGap.findMany({
    where: { workspaceId: workspace.id, status: 'open' },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });

  // Workspace-wide "opportunities": un-generated workflow candidates across all recordings.
  const opportunities = (await listCandidates(workspace.id)).filter((c) => !c.generatedArticleId);
  const oppBySource = new Map<string, { appBaseUrl: string | null; items: typeof opportunities }>();
  for (const c of opportunities) {
    const g = oppBySource.get(c.sourceId) ?? { appBaseUrl: c.appBaseUrl, items: [] };
    g.items.push(c);
    oppBySource.set(c.sourceId, g);
  }

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
        <h2 style={{ fontSize: 15, margin: '0 0 2px' }}>Auto Generate Articles — opportunities</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Workflows captured in your recordings that don&apos;t have an article yet. Pick the helpful ones and generate them as drafts.
        </p>
        {opportunities.length === 0 ? (
          <p className="muted">No un-generated workflows. Record more, or you&apos;ve generated everything captured so far.</p>
        ) : (
          [...oppBySource.entries()].map(([sourceId, group]) => (
            <section key={sourceId} style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 13, margin: '0 0 6px' }}>
                <Link href={`/dashboard/kb/${sourceId}`}>{group.appBaseUrl || '(unknown app)'}</Link>{' '}
                <span className="muted" style={{ fontWeight: 400 }}>· {group.items.length} workflow(s)</span>
              </h3>
              <GeneratePanel sourceId={sourceId} candidates={group.items} />
            </section>
          ))
        )}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15, margin: '0 0 2px' }}>Text → Article (generate from a prompt)</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Describe a topic. The AI assembles a draft grounded only in your recordings — or declines and logs a coverage gap if nothing covers it.
        </p>
        <PromptBox />
        {openGaps.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <h3 style={{ fontSize: 13, margin: '0 0 6px' }}>Coverage gaps — record these next</h3>
            <ul className="list">
              {openGaps.map((g) => (
                <li key={g.id}>
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
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15, margin: '0 0 10px' }}>Articles</h2>
        {articles.length === 0 ? (
          <p className="muted">No articles yet. Use “Auto Generate Articles” above to create them from your recordings.</p>
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
