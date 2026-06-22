import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';
import { getOrCreateCopilotKey } from '@/lib/copilot-settings';
import { CopilotSettingsClient } from '../copilot-settings-client';

export const dynamic = 'force-dynamic';

export default async function CopilotSettingsPage() {
  const ctx = await getCurrentWorkspace();
  if (!ctx) redirect('/signin');

  const { publicKey, allowedOrigins } = await getOrCreateCopilotKey(ctx.workspace.id);
  const wsId = ctx.workspace.id;
  const [approvedCount, qTotal, qAnswered, qUp, qDown, recent] = await Promise.all([
    prisma.copilotApproval.count({ where: { workspaceId: wsId } }),
    prisma.copilotQuery.count({ where: { workspaceId: wsId } }),
    prisma.copilotQuery.count({ where: { workspaceId: wsId, answered: true } }),
    prisma.copilotQuery.count({ where: { workspaceId: wsId, feedback: 'up' } }),
    prisma.copilotQuery.count({ where: { workspaceId: wsId, feedback: 'down' } }),
    prisma.copilotQuery.findMany({ where: { workspaceId: wsId }, orderBy: { createdAt: 'desc' }, take: 12 }),
  ]);
  const answeredPct = qTotal ? Math.round((qAnswered / qTotal) * 100) : 0;

  const apiBase = process.env.SYNC_API_URL || 'http://localhost:8787';
  const widgetSrc = process.env.SYNC_WIDGET_URL || 'https://YOUR_WIDGET_HOST/sync-copilot.js';
  const snippet = `<script src="${widgetSrc}"
  data-sync-api="${apiBase}"
  data-sync-key="${publicKey}"
  data-sync-title="Help"></script>`;

  return (
    <main style={{ maxWidth: 760 }}>
      <p className="muted"><Link href="/dashboard">← Studio</Link></p>
      <h1>Copilot</h1>
      <p className="sub muted">Embed the in-app copilot in your product. It answers only from workflows you’ve approved for the copilot.</p>

      <div className="card">
        <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>1. Approve what it can answer</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {approvedCount} workflow(s) approved for the copilot. Approve more on each recording’s{' '}
          <Link href="/dashboard">Knowledge Base page</Link>. The copilot answers from these only — nothing else leaks.
        </p>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>2. Your public embeddable key</h2>
        <p className="selector"><code>{publicKey}</code></p>
        <p className="muted" style={{ marginTop: 0 }}>Safe to put in your app’s HTML (it’s not your secret recorder token).</p>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>3. Embed snippet</h2>
        <pre style={{ background: '#1c1c1c', color: '#e8e8e8', padding: 12, borderRadius: 8, overflowX: 'auto', fontSize: 12 }}>{snippet}</pre>
        <CopilotSettingsClient snippet={snippet} allowedOrigins={allowedOrigins} />
        {widgetSrc.includes('YOUR_WIDGET_HOST') && (
          <p className="muted" style={{ marginTop: 10 }}>
            ℹ️ The <code>src</code> points to a placeholder — it’s set once the widget is deployed (P1-M4). For local testing, load <code>packages/widget/demo/index.html</code> with this key.
          </p>
        )}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>Copilot activity</h2>
        {qTotal === 0 ? (
          <p className="muted" style={{ marginTop: 0 }}>No questions yet. Once embedded, end-user questions + feedback show here.</p>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>{qTotal} question(s) · {answeredPct}% answered · 👍 {qUp} · 👎 {qDown}</p>
            <ul className="list">
              {recent.map((r) => (
                <li key={r.id}>
                  <span className={`pill ${r.answered ? 'pill-done' : 'pill-draft'}`}>{r.answered ? 'answered' : 'declined'}</span>
                  <span className="grow">{r.question}</span>
                  {r.feedback && <span className="muted">{r.feedback === 'up' ? '👍' : '👎'}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="muted" style={{ marginTop: 8 }}>
          Questions the copilot can’t answer become <Link href="/dashboard">coverage gaps</Link> (“record this next”).
        </p>
      </div>
    </main>
  );
}
