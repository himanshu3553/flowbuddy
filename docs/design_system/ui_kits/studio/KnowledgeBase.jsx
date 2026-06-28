/* Knowledge Base — workflows list + the one-click approval gate. */
function KnowledgeBase({ onOpenWorkflow }) {
  const initial = [
    { name: 'Reset a password', meta: '6 steps · /settings/security · from “Billing & account flows”', status: 'approved' },
    { name: 'Upgrade a plan', meta: '8 steps · /billing/plans · from “Billing & account flows”', status: 'approved' },
    { name: 'Cancel a subscription', meta: '5 steps · /billing · from “Billing & account flows”', status: 'approved' },
    { name: 'Invite a teammate', meta: '5 steps · /team · from “Team & permissions” · new', status: 'pending' },
    { name: 'Create your first project', meta: '9 steps · /projects/new · from “Onboarding & first project” · new', status: 'pending' },
    { name: 'Connect Slack', meta: '4 steps · /integrations · needs review — 1 step missing outcome', status: 'draft' },
  ];
  const [rows, setRows] = React.useState(initial.map((r) => ({ ...r, on: r.status === 'approved' })));
  const [tab, setTab] = React.useState('All');
  const toggle = (i) => setRows((rs) => rs.map((r, j) => j === i ? { ...r, on: !r.on, status: !r.on ? 'approved' : 'pending' } : r));

  const tabs = ['All 37', 'Approved 29', 'Pending 5', 'Draft 3'];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Header title="Knowledge Base">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', padding: '6px 11px', width: 190, background: '#fff' }}>
          <Glyph name="search" color="var(--gray-300)" size={16} /><div style={{ font: '12px var(--font-sans)', color: 'var(--gray-300)' }}>Search workflows</div>
        </div>
      </Header>
      <div style={{ flex: 1, padding: '18px 24px', background: 'var(--paper)', overflow: 'auto' }}>
        {/* approval callout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', border: '1px solid var(--warning-border)', background: 'var(--warning-bg-2)', borderRadius: 'var(--radius-md)', marginBottom: 14 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--warning-dot)', flex: '0 0 auto' }} />
          <div style={{ flex: 1, font: '13px/1.5 var(--font-sans)', color: 'var(--warning-text)' }}><b style={{ color: '#4a3e1e' }}>5 workflows awaiting approval.</b> Approving puts them live in the copilot — one click each, no article to write.</div>
          <Btn variant="secondary" size="sm">Review each</Btn>
          <Btn size="sm" onClick={() => setRows((rs) => rs.map((r) => r.status !== 'draft' ? { ...r, on: true, status: 'approved' } : r))}>Approve all</Btn>
        </div>
        {/* filter tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, borderBottom: '1px solid var(--gray-100)', marginBottom: 12 }}>
          {tabs.map((t) => { const key = t.split(' ')[0]; const on = key === tab; return <div key={t} onClick={() => setTab(key)} style={{ font: '600 12.5px var(--font-sans)', color: on ? 'var(--ink)' : 'var(--text-muted)', padding: '0 2px 10px', borderBottom: on ? '2px solid var(--primary)' : '2px solid transparent', cursor: 'pointer' }}>{t}</div>; })}
        </div>
        {/* rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {rows.map((r, i) => {
            const draft = r.status === 'draft';
            const tile = r.status === 'approved' ? ['var(--indigo-50)', 'var(--indigo-100)', 'var(--primary)'] : r.status === 'pending' ? ['var(--warning-bg)', 'var(--warning-border)', 'var(--warning-dot)'] : ['var(--paper)', 'var(--border)', 'var(--gray-300)'];
            return (
              <Row key={r.name} muted={draft}
                media={<div style={{ width: 30, height: 30, borderRadius: 7, background: tile[0], border: `1px solid ${tile[1]}`, display: 'flex', alignItems: 'center', justifyContent: 'center', font: '10px var(--font-mono)', color: tile[2] }}>WF</div>}
                title={<span onClick={() => onOpenWorkflow && onOpenWorkflow(r.name)} style={{ cursor: 'pointer' }}>{r.name}</span>}
                meta={<span style={{ font: '10px var(--font-mono)', color: 'var(--text-faint)' }}>{r.meta}</span>}
                highlighted={r.status === 'pending'}
                trailing={<>
                  <Badge tone={r.status === 'approved' ? 'live' : r.status === 'pending' ? 'pending' : 'neutral'}>{r.status === 'approved' ? 'APPROVED · LIVE' : r.status.toUpperCase()}</Badge>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ font: '11px var(--font-sans)', color: draft ? 'var(--gray-300)' : 'var(--text-secondary)' }}>{draft ? 'Review first' : 'In copilot'}</span>
                    <Switch checked={r.on} disabled={draft} onChange={() => toggle(i)} />
                  </div>
                </>} />
            );
          })}
        </div>
      </div>
    </div>
  );
}
