/* Workflow detail — steps with selector · route · expected outcome + citation rail. */
function WorkflowDetail({ name = 'Reset a password', onBack }) {
  const [approved, setApproved] = React.useState(true);
  const steps = [
    { narration: '“Open the account menu in the top-right.”', selector: "button[data-test='acct-menu']", route: '/app', expected: 'Account dropdown opens' },
    { narration: '“Click Security settings, then scroll to Password.”', selector: "a[href='/settings/security']", route: '/settings/security', expected: 'Security page loads' },
    { narration: '“Hit Reset password and confirm in the dialog.”', selector: 'button.reset-pw', route: '/settings/security', expected: 'Reset email is sent' },
  ];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Header breadcrumb={<span style={{ cursor: 'pointer' }} onClick={onBack}>Knowledge Base <span style={{ color: 'var(--gray-300)' }}>/</span> <b style={{ color: 'var(--ink)' }}>{name}</b></span>}>
        <span style={{ font: '12px var(--font-sans)', color: approved ? 'var(--success-text-2)' : 'var(--text-muted)', fontWeight: 600 }}>Approved for copilot</span>
        <Switch checked={approved} onChange={setApproved} />
      </Header>
      <div style={{ flex: 1, padding: '18px 24px', background: 'var(--paper)', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ font: '800 18px var(--font-sans)', color: 'var(--ink)', letterSpacing: '-.01em' }}>{name}</div>
          <Chip tone="brand">/settings/security</Chip>
          <Chip>6 steps</Chip>
          <span style={{ font: '11px var(--font-mono)', color: 'var(--text-faint)' }}>from “Billing & account flows” · updated Jun 26 · PII masked</span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* steps */}
          <div style={{ flex: 1.65, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            {steps.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, padding: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: '#fff' }}>
                <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 12px var(--font-sans)' }}>{i + 1}</div>
                  <div style={{ width: 118, height: 74, borderRadius: 7, background: 'var(--media-fill)', border: '1px solid var(--media-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '9px var(--font-mono)', color: 'var(--text-faint)' }}>step shot</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '13px/1.5 var(--font-sans)', color: 'var(--gray-700)' }}>{s.narration}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
                    <KV k="SELECTOR" v={<code style={codeStyle}>{s.selector}</code>} />
                    <KV k="ROUTE" v={<code style={codeStyle}>{s.route}</code>} />
                    <KV k="EXPECTED" v={<span style={{ font: '11.5px var(--font-sans)', color: 'var(--success-text-2)' }}>{s.expected}</span>} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* citation rail */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 13 }}>
            <Card style={{ background: '#fbfcff' }}>
              <div style={{ font: '700 13.5px var(--font-sans)', color: 'var(--ink)', marginBottom: 3 }}>Used by the copilot</div>
              <div style={{ font: '12px/1.5 var(--font-sans)', color: 'var(--text-muted)', marginBottom: 11 }}>How this workflow appears as a source when the copilot answers.</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--indigo-50)', border: '1px solid var(--indigo-100)', borderRadius: 'var(--radius-pill)', padding: '4px 10px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }} />
                <span style={{ font: '10.5px var(--font-mono)', color: 'var(--primary)' }}>Source: {name}</span>
              </div>
            </Card>
            <Card>
              <div style={{ font: '700 13.5px var(--font-sans)', color: 'var(--ink)', marginBottom: 11 }}>Citation stats</div>
              {[['Cited', '212×'], ['Last cited', '4m ago'], ['Helpful', '88%']].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: k === 'Helpful' ? 'none' : '1px solid var(--gray-100)', font: '12.5px var(--font-sans)' }}><span style={{ color: 'var(--text-secondary)' }}>{k}</span><span style={{ color: 'var(--ink)', fontWeight: 600 }}>{v}</span></div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 11, padding: '9px 11px', background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-sm)' }}>
                <Glyph name="check_circle" fill={1} color="var(--success-dot)" size={16} />
                <span style={{ font: '11.5px var(--font-sans)', color: 'var(--success-text-2)' }}>Selectors healthy · last validated today</span>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

const codeStyle = { font: '11px var(--font-mono)', color: 'var(--gray-700)', background: 'var(--paper)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px' };
function KV({ k, v }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span style={{ font: '700 9.5px var(--font-mono)', color: 'var(--gray-300)', width: 62, flex: '0 0 62px', letterSpacing: '.03em' }}>{k}</span>{v}
    </div>
  );
}
