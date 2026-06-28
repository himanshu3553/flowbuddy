/* Analytics — answer quality, deflection (ROI) + the feedback loop. */
function Analytics() {
  const bars = [[8, 60], [10, 68], [9, 55], [12, 78], [11, 72], [9, 88], [10, 82]];
  const top = [['Reset a password', 100, 212], ['Upgrade a plan', 79, 168], ['Cancel a subscription', 45, 96], ['Invite a teammate', 22, 47]];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Header title="Analytics">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', background: '#fff' }}><span style={{ font: '12px var(--font-sans)', color: 'var(--text-body)' }}>Last 7 days</span><span style={{ font: '10px', color: 'var(--gray-300)' }}>▾</span></div>
      </Header>
      <div style={{ flex: 1, padding: '18px 24px', background: 'var(--paper)', overflow: 'auto' }}>
        <div style={{ display: 'flex', gap: 9, marginBottom: 14 }}>
          <Metric value="1,284" label="Questions" />
          <Metric value="86%" label="Answered" />
          <Metric value="11%" label="Honest declines" />
          <Metric value="72%" label="Helpful 👍" />
          <Metric value="~340" label="Tickets deflected" tone="success" />
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: 13, minWidth: 0 }}>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 }}>
                <div style={{ font: '700 13.5px var(--font-sans)', color: 'var(--ink)' }}>Questions & answer rate</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, font: '10px var(--font-mono)', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--primary)' }} />answered</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: '#e6c89a' }} />declined</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, height: 96 }}>
                {bars.map(([d, a], i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                    <div style={{ height: `${d}%`, background: '#e6c89a', borderRadius: '3px 3px 0 0' }} />
                    <div style={{ height: `${a}%`, background: 'var(--primary)' }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', font: '10px var(--font-mono)', color: 'var(--gray-300)', marginTop: 7 }}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d}>{d}</span>)}</div>
            </Card>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                <div style={{ font: '700 13.5px var(--font-sans)', color: 'var(--ink)' }}>Coverage gaps — record this next</div>
                <Badge tone="danger">8 OPEN</Badge>
              </div>
              <div style={{ font: '12px var(--font-sans)', color: 'var(--text-muted)', marginBottom: 11 }}>Ranked by how often the copilot was asked and couldn’t answer.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <Gap question="How do I export a report to CSV?" meta="asked 14× · no coverage" action={<Btn size="sm">Record</Btn>} />
                <Gap question="Can I add a teammate to a project?" meta="asked 9× · partial coverage" tone="partial" action={<Btn size="sm">Record</Btn>} />
                <Gap question="Where do I change my billing email?" meta="asked 6× · recording in progress" status={<Badge tone="pending">RECORDING</Badge>} />
              </div>
            </Card>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 13, minWidth: 0 }}>
            <Card style={{ border: '1px solid var(--success-border)', background: 'var(--success-bg)' }}>
              <div style={{ font: '12px var(--font-sans)', color: 'var(--success-text-2)' }}>Resolved without a human</div>
              <div style={{ font: '800 28px var(--font-sans)', color: 'var(--success-text-2)', letterSpacing: '-.02em', marginTop: 2 }}>81%</div>
              <div style={{ font: '11px/1.5 var(--font-sans)', color: 'var(--success-dot)', marginTop: 3 }}>≈ 340 tickets your team didn’t have to touch this week.</div>
            </Card>
            <Card>
              <div style={{ font: '700 13.5px var(--font-sans)', color: 'var(--ink)', marginBottom: 11 }}>Top workflows by citations</div>
              {top.map(([n, w, c]) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                  <div style={{ flex: 1, font: '12.5px var(--font-sans)', color: 'var(--gray-700)' }}>{n}</div>
                  <div style={{ width: 70, height: 6, background: 'var(--gray-100)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${w}%`, height: '100%', background: 'var(--primary)' }} /></div>
                  <div style={{ font: '11px var(--font-mono)', color: 'var(--text-secondary)', width: 30, textAlign: 'right' }}>{c}</div>
                </div>
              ))}
            </Card>
            <Card>
              <div style={{ font: '700 12.5px var(--font-sans)', color: 'var(--ink)', marginBottom: 9 }}>Recent declines</div>
              <div style={{ font: '12px var(--font-sans)', color: 'var(--gray-700)', padding: '5px 0', borderBottom: '1px solid var(--gray-100)' }}>SAML SSO support? <span style={{ font: '10px var(--font-mono)', color: 'var(--text-faint)' }}>/settings</span></div>
              <div style={{ font: '12px var(--font-sans)', color: 'var(--gray-700)', padding: '5px 0' }}>Bulk-delete records? <span style={{ font: '10px var(--font-mono)', color: 'var(--text-faint)' }}>/data</span></div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Settings — light placeholder (kept minimal; not in the source spec detail). */
function Settings() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Header title="Settings" />
      <div style={{ flex: 1, background: 'var(--paper)', display: 'flex' }}>
        <Empty media={<div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--indigo-50)', border: '1px solid var(--indigo-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Glyph name="settings" color="var(--primary)" size={30} /></div>}
          title="Workspace settings" desc="Members, billing, and workspace preferences live here. Out of scope for this kit." />
      </div>
    </div>
  );
}
