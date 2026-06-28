/* Recordings — capture sessions list (+ empty state). */
function Recordings() {
  const [empty, setEmpty] = React.useState(false);
  const [tab, setTab] = React.useState('All');
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Header title="Recordings">
        <button onClick={() => setEmpty(!empty)} style={{ background: 'transparent', border: '1px dashed var(--gray-200)', color: 'var(--text-faint)', borderRadius: 'var(--radius-sm)', padding: '7px 11px', font: '600 11px var(--font-mono)', cursor: 'pointer' }}>{empty ? 'view populated' : 'view empty'}</button>
        <Btn variant="primary" dot>Record</Btn>
      </Header>
      <div style={{ flex: 1, background: 'var(--paper)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {empty ? (
          <Empty media={true}
            title="No recordings yet"
            desc="Install the Sync Recorder, click “Connect with Sync,” and narrate your way through a real workflow. Sync turns the session into a structured Knowledge Base."
            actions={<><Btn>Install the recorder</Btn><Btn variant="secondary">How it works</Btn></>}
            chips={['Screen', 'Voice', 'DOM', 'Events', 'Routes']}
            footnote="Captured in sync · PII masked in your browser before upload" />
        ) : (
          <div style={{ flex: 1, padding: '18px 24px', overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15 }}>
              <div style={{ display: 'flex', gap: 3, background: 'var(--paper-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 3 }}>
                {['All 12', 'Ready 10', 'Processing 1'].map((t) => {
                  const key = t.split(' ')[0]; const on = key === tab;
                  return <span key={t} onClick={() => setTab(key)} style={{ font: '600 12px var(--font-sans)', color: on ? 'var(--ink)' : 'var(--text-muted)', background: on ? '#fff' : 'transparent', borderRadius: 6, padding: '5px 12px', boxShadow: on ? '0 1px 2px rgba(0,0,0,.06)' : 'none', cursor: 'pointer' }}>{t}</span>;
                })}
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', padding: '6px 11px', width: 200, background: '#fff' }}>
                <Glyph name="search" color="var(--gray-300)" size={16} />
                <div style={{ font: '12px var(--font-sans)', color: 'var(--gray-300)' }}>Search recordings</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <Row media={true} title="Billing & account flows"
                meta={<span style={{ font: '10px var(--font-mono)', color: 'var(--text-faint)' }}>Jun 26 · screen·voice·DOM·events·routes · PII masked</span>}
                trailing={<><Mono>08:42</Mono><span style={{ font: '12.5px var(--font-sans)', color: 'var(--ink)', width: 84 }}>5 extracted</span><Badge tone="success">READY</Badge><Dots /></>} />
              <Row highlighted title="Onboarding & first project"
                meta={<div style={{ height: 4, background: 'var(--gray-100)', borderRadius: 2, marginTop: 6, width: 160, overflow: 'hidden' }}><div style={{ width: '64%', height: '100%', background: 'var(--warning-dot)' }} /></div>}
                trailing={<><Mono>12:10</Mono><span style={{ font: '12.5px var(--font-sans)', color: 'var(--text-faint)', width: 84 }}>distilling…</span><Badge tone="pending">PROCESSING</Badge><Dots /></>} />
              <Row media={true} title="Team & permissions"
                meta={<span style={{ font: '10px var(--font-mono)', color: 'var(--text-faint)' }}>Jun 20 · screen·voice·DOM·events·routes · PII masked</span>}
                trailing={<><Mono>05:31</Mono><span style={{ font: '12.5px var(--font-sans)', color: 'var(--ink)', width: 84 }}>3 extracted</span><Badge tone="success">READY</Badge><Dots /></>} />
              <Row media={true} title="Integrations setup"
                meta={<span style={{ font: '10px var(--font-mono)', color: 'var(--danger-ink)' }}>Jun 18 · upload interrupted — narration preserved</span>}
                trailing={<><Mono>09:58</Mono><span style={{ font: '600 11px var(--font-sans)', color: 'var(--primary)', width: 84, cursor: 'pointer' }}>Retry upload</span><Badge tone="danger">FAILED</Badge><Dots /></>} />
              <Row media={true} title="Reports & exports"
                meta={<span style={{ font: '10px var(--font-mono)', color: 'var(--text-faint)' }}>Jun 15 · screen·voice·DOM·events·routes · PII masked</span>}
                trailing={<><Mono>06:47</Mono><span style={{ font: '12.5px var(--font-sans)', color: 'var(--ink)', width: 84 }}>4 extracted</span><Badge tone="success">READY</Badge><Dots /></>} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Mono({ children }) { return <span style={{ font: '12.5px var(--font-mono)', color: 'var(--text-secondary)', width: 56 }}>{children}</span>; }
function Dots() { return <span style={{ color: 'var(--gray-300)', fontSize: 15, cursor: 'pointer', width: 16, textAlign: 'center' }}>⋯</span>; }
