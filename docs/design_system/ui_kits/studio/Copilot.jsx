/* Copilot — install, key, allowlist, grounding + the end-user widget preview. */
function Copilot() {
  const [tab, setTab] = React.useState('Install');
  const [cite, setCite] = React.useState(true);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Header title="Copilot" tabs={['Install', 'Settings', 'Appearance']} activeTab={tab} onTab={setTab} status="Live" />
      <div style={{ flex: 1, padding: '18px 24px', background: 'var(--paper)', overflow: 'auto', display: 'flex', gap: 16 }}>
        {/* left settings */}
        <div style={{ flex: 1.55, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ font: '700 13.5px var(--font-sans)', color: 'var(--ink)' }}>Embed snippet</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success-dot)' }} /><span style={{ font: '11px var(--font-mono)', color: 'var(--success-text-2)' }}>detected on app.acme.com · 6m ago</span></div>
            </div>
            <div style={{ font: '12px var(--font-sans)', color: 'var(--text-muted)', marginBottom: 10 }}>Paste once before <code style={{ font: '11px var(--font-mono)', background: 'var(--paper)', padding: '1px 5px', borderRadius: 4 }}>&lt;/body&gt;</code>. That’s the whole install.</div>
            <Code code={'<script src="https://cdn.getsync.app/copilot.js"\n        data-key="pk_live_8f2a…d41"></script>'} />
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div><div style={{ font: '700 13.5px var(--font-sans)', color: 'var(--ink)' }}>Public key</div><div style={{ font: '12px var(--font-sans)', color: 'var(--text-muted)', marginTop: 2 }}>Safe to expose in your front-end. Rotate any time.</div></div>
              <Btn variant="secondary" size="sm">Rotate key</Btn>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 11, background: 'var(--paper)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 12px' }}>
              <code style={{ flex: 1, font: '12px var(--font-mono)', color: 'var(--gray-700)' }}>pk_live_8f2a3c9b7e1d4a6f…d41</code><span style={{ font: '11px var(--font-mono)', color: 'var(--gray-300)', cursor: 'pointer' }}>copy</span>
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
              <div><div style={{ font: '700 13.5px var(--font-sans)', color: 'var(--ink)' }}>Origin allowlist</div><div style={{ font: '12px var(--font-sans)', color: 'var(--text-muted)', marginTop: 2 }}>The copilot only runs on origins you list here.</div></div>
              <Btn variant="soft" size="sm">+ Add origin</Btn>
            </div>
            {['app.acme.com', 'staging.acme.com'].map((o) => (
              <div key={o} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 7 }}>
                <code style={{ flex: 1, font: '12px var(--font-mono)', color: 'var(--gray-700)' }}>{o}</code><Badge tone="success">VERIFIED</Badge><span style={{ font: '14px', color: 'var(--gray-300)', cursor: 'pointer' }}>×</span>
              </div>
            ))}
          </Card>

          <Card>
            <div style={{ font: '700 13.5px var(--font-sans)', color: 'var(--ink)', marginBottom: 3 }}>Grounding & trust</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--gray-100)' }}><div style={{ font: '12.5px var(--font-sans)', color: 'var(--gray-700)' }}>Answer only from approved workflows</div><span style={{ font: '11px var(--font-mono)', color: 'var(--text-muted)' }}>locked on</span></div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--gray-100)' }}><div style={{ font: '12.5px var(--font-sans)', color: 'var(--gray-700)' }}>Cite the workflow used</div><Switch checked={cite} size="sm" onChange={setCite} /></div>
            <div style={{ padding: '11px 0 2px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', font: '12.5px var(--font-sans)', color: 'var(--gray-700)', marginBottom: 7 }}><span>Decline threshold</span><span style={{ font: '11px var(--font-mono)', color: 'var(--text-muted)' }}>balanced</span></div>
              <div style={{ height: 5, background: 'var(--gray-100)', borderRadius: 3, position: 'relative' }}><div style={{ width: '55%', height: '100%', background: 'var(--primary)', borderRadius: 3 }} /><div style={{ width: 15, height: 15, borderRadius: '50%', background: '#fff', border: '2px solid var(--primary)', position: 'absolute', top: -5, left: 'calc(55% - 7px)' }} /></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', font: '10px var(--font-mono)', color: 'var(--gray-300)', marginTop: 6 }}><span>answer more</span><span>decline more (safer)</span></div>
            </div>
          </Card>
        </div>

        {/* right widget preview */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ font: '10px var(--font-mono)', color: 'var(--gray-300)', letterSpacing: '.05em', marginBottom: 8 }}>END-USER PREVIEW — IN YOUR APP</div>
          <div style={{ flex: 1, border: '1px solid #e7eafb', borderRadius: 14, background: '#f4f6fd', padding: 16, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, background: '#fff', border: '1px solid var(--media-border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-widget)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', font: '12px' }}>◆</div>
                <div style={{ flex: 1 }}><div style={{ font: '700 13px var(--font-sans)', color: 'var(--ink)' }}>Acme Copilot</div><div style={{ font: '10px var(--font-mono)', color: 'var(--text-faint)' }}>grounded in Acme’s own docs</div></div>
                <div style={{ font: '16px', color: 'var(--gray-300)' }}>×</div>
              </div>
              <div style={{ flex: 1, padding: 13, display: 'flex', flexDirection: 'column', gap: 10, background: '#fcfcfd', overflow: 'hidden' }}>
                <Msg from="user">How do I reset a customer’s password?</Msg>
                <Msg from="bot" citation="Reset a password" feedback>Open the account menu, go to <b>Security</b>, then click <b>Reset password</b> and confirm. They’ll get a reset email.</Msg>
                <Msg from="user">Do you support SAML SSO?</Msg>
                <Msg from="bot" decline>I don’t have that in my approved sources yet, so I won’t guess. I’ve flagged it for the Acme team.</Msg>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderTop: '1px solid var(--border)' }}><div style={{ flex: 1, font: '12px var(--font-sans)', color: 'var(--gray-300)' }}>Ask anything…</div><div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', font: '13px' }}>↑</div></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, font: '10px var(--font-mono)', color: '#8b93b4', marginTop: 11 }}><span>context-aware</span><span>·</span><span>cites sources</span><span>·</span><span>declines honestly</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
