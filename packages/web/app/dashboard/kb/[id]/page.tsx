import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';
import { signedUrl, sessionObjectKey } from '@/lib/storage';
import { listCandidates } from '@/lib/candidates';
import { CopilotApprovalPanel } from '../../copilot-approval-panel';

export const dynamic = 'force-dynamic';

type EventData = {
  type?: string;
  target?: { cssPath?: string; xpath?: string };
  route?: { path?: string };
  screenshot?: { file?: string };
};

export default async function KbSourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCurrentWorkspace();
  if (!ctx) redirect('/signin');

  const source = await prisma.knowledgeSource.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: {
      items: { orderBy: [{ segmentIndex: 'asc' }, { orderIndex: 'asc' }] },
    },
  });
  if (!source) notFound();

  const candidates = await listCandidates(ctx.workspace.id, source.id);

  const transcript = (source.transcript as { text?: string; segments?: unknown[] } | null) ?? null;

  const items = await Promise.all(
    source.items.map(async (it) => {
      const d = (it.data as unknown as { event?: EventData; narration?: string | null }) ?? {};
      const ev = d.event ?? {};
      const file = ev.screenshot?.file;
      return {
        id: it.id,
        kind: it.kind,
        orderIndex: it.orderIndex,
        segmentIndex: it.segmentIndex,
        segmentTitle: it.segmentTitle,
        text: it.text,
        narration: d.narration ?? null,
        selector: ev.target?.cssPath ?? ev.target?.xpath ?? '',
        route: ev.route?.path ?? '',
        screenshotUrl: file ? await signedUrl(sessionObjectKey(ctx.workspace.id, source.id, file)) : null,
      };
    }),
  );

  // Group items by the workflow segment they belong to (Path 2 — persisted grouping).
  const groups: { key: string; title: string; items: typeof items }[] = [];
  for (const it of items) {
    const key = it.segmentIndex == null ? 'ungrouped' : String(it.segmentIndex);
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = {
        key,
        title:
          it.segmentTitle ??
          (it.segmentIndex == null ? 'Other / ungrouped' : `Workflow ${it.segmentIndex + 1}`),
        items: [],
      };
      groups.push(g);
    }
    g.items.push(it);
  }

  return (
    <main style={{ maxWidth: 820 }}>
      <p className="muted"><Link href="/dashboard">← Studio</Link></p>
      <h1>Knowledge Base</h1>
      <p className="sub">
        <span className={`pill pill-${source.status}`}>{source.status}</span>{' '}
        <span className="muted">{source.kind} · {source.appBaseUrl || '(unknown app)'} · {items.length} items · {groups.length} workflow(s)</span>
      </p>

      <div className="card">
        <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>Transcript (narration)</h2>
        {transcript?.text ? (
          <details>
            <summary className="muted">{transcript.segments?.length ?? 0} segments — click to expand</summary>
            <p style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{transcript.text}</p>
          </details>
        ) : (
          <p className="muted">No transcript (no narration captured).</p>
        )}
      </div>

      <h2 style={{ fontSize: 15, marginBottom: 0 }}>Knowledge items by workflow</h2>
      <p className="muted" style={{ marginTop: 4 }}>What the system extracted, grouped by workflow. Read-only — edit happens at the article level.</p>

      {groups.map((group) => (
        <section key={group.key} style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 10px', paddingBottom: 6, borderBottom: '2px solid #e3e3e3' }}>
            {group.title} <span className="muted" style={{ fontWeight: 400 }}>· {group.items.length} items</span>
          </h3>
          {group.items.map((it) => (
            <div key={it.id} className="card kb-item">
              <div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>#{it.orderIndex + 1} <span className="pill pill-draft">{it.kind}</span></strong>
                  {it.route && <span className="muted">{it.route}</span>}
                </div>
                <p className="instruction" style={{ marginTop: 6 }}>{it.text}</p>
                {it.narration && <p className="rationale">🗣 {it.narration}</p>}
                {it.selector && <p className="selector"><code>{it.selector}</code></p>}
              </div>
              {it.screenshotUrl && (
                <a className="thumb" href={it.screenshotUrl} target="_blank" rel="noreferrer">
                  <img src={it.screenshotUrl} alt={`item ${it.orderIndex + 1}`} />
                </a>
              )}
            </div>
          ))}
        </section>
      ))}

      <div className="card" style={{ marginTop: 24, borderLeft: '3px solid #1a8a4f' }}>
        <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>Copilot — approve workflows</h2>
        {candidates.length === 0 ? (
          <p className="muted">
            {source.status === 'ready' || source.status === 'done'
              ? 'No workflows found in this recording.'
              : 'Knowledge Base is still building — workflows appear once it is ready.'}
          </p>
        ) : (
          <CopilotApprovalPanel candidates={candidates} />
        )}
      </div>
    </main>
  );
}
