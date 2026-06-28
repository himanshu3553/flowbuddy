/* Home — activation (first-run) + overview (steady-state). The hi-fi showcase. */
function Home({ firstRun, setFirstRun, openDialog }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Header title="Home" subtitle="Let's get your copilot live.">
        <button onClick={() => setFirstRun(!firstRun)} style={{ background: 'transparent', border: '1px dashed var(--gray-200)', color: 'var(--text-faint)', borderRadius: 'var(--radius-sm)', padding: '7px 11px', font: '600 11px var(--font-mono)', cursor: 'pointer' }}>{firstRun ? 'view steady state' : 'view first run'}</button>
        <Btn variant="secondary" icon="help" onClick={() => openDialog('how')}>How it works</Btn>
        <Btn variant="primary" icon="fiber_manual_record" iconFill={1} onClick={() => openDialog('record')}>How to Record</Btn>
      </Header>

      <div style={{ flex: 1, padding: '22px 24px', background: 'var(--paper)', overflow: 'auto' }}>
        {firstRun ? <FirstRun openDialog={openDialog} /> : <SteadyState />}
      </div>
    </div>
  );
}

function FirstRun({ openDialog }) {
  return (
    <Card pad="22px 24px" style={{ borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-card)' }}>
      <Eyebrow style={{ marginBottom: 11 }}>Get started</Eyebrow>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, marginBottom: 18 }}>
        <div>
          <div style={{ font: '800 21px var(--font-sans)', color: 'var(--ink)', letterSpacing: '-.02em' }}>Get your copilot live</div>
          <div style={{ font: '13px/1.55 var(--font-sans)', color: 'var(--text-body)', marginTop: 4, maxWidth: 480 }}>Record once, approve the workflows it may use, paste one snippet. Your customers get grounded in-app answers in about half an hour.</div>
        </div>
        <div style={{ position: 'relative', width: 54, height: 54, flex: '0 0 auto' }}>
          <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'conic-gradient(var(--primary) 0 25%, #e9ebf4 25% 100%)' }} />
          <div style={{ position: 'absolute', inset: 5, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 13px var(--font-sans)', color: 'var(--ink)' }}>1/4</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Step state="done" title="Install the Sync Recorder" desc="Chrome extension · one-click “Connect with Sync”" statusLabel="DONE" />
        <Step state="active" index={2} title="Record your product" desc="Narrate a real workflow — “reset a password… now upgrade a plan…”" action={<Btn onClick={() => openDialog('record')}>Open recorder</Btn>} />
        <Step state="locked" index={3} title="Approve workflows for the copilot" desc="One click each — the copilot answers only from what you approve" />
        <Step state="locked" index={4} title="Embed the copilot" desc="Paste one snippet into your product — go live for your customers" />
      </div>
    </Card>
  );
}

function SteadyState() {
  return (
    <div>
      {/* live strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', border: '1px solid var(--success-border)', background: 'var(--success-bg)', borderRadius: 'var(--radius-md)', marginBottom: 13 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--success-dot)', flex: '0 0 auto' }} />
        <div style={{ font: '600 12.5px var(--font-sans)', color: 'var(--success-text-2)' }}>Copilot is live</div>
        <div style={{ font: '12.5px var(--font-sans)', color: 'var(--text-secondary)' }}>on app.acme.com · 1,284 questions answered this week</div>
        <div style={{ marginLeft: 'auto', font: '600 11.5px var(--font-mono)', color: 'var(--text-muted)', cursor: 'pointer' }}>View install ▸</div>
      </div>

      {/* metrics */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <Metric value="12" label="Recordings" />
        <Metric value="37" label="Workflows" />
        <Metric value="29" label="Approved · live" />
        <Metric value="1,284" label="Questions · 7d" />
        <Metric value="86%" label="Answered" />
        <Metric value="72%" label="Helpful" />
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {/* left */}
        <div style={{ flex: 1.7, display: 'flex', flexDirection: 'column', gap: 13, minWidth: 0 }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              <div style={{ font: '700 14px var(--font-sans)', color: 'var(--ink)' }}>Record this next</div>
              <Badge tone="danger">3 GAPS</Badge>
            </div>
            <div style={{ font: '12px var(--font-sans)', color: 'var(--text-muted)', marginBottom: 11 }}>Questions the copilot couldn’t fully answer. Record these to close the gap.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Gap question="How do I export a report to CSV?" meta="asked 14× · no workflow covers this" tone="gap" action={<Btn size="sm">Record</Btn>} />
              <Gap question="Can I add a teammate to a project?" meta="asked 9× · partial coverage" tone="partial" action={<Btn size="sm">Record</Btn>} />
              <Gap question="Where do I change my billing email?" meta="asked 6× · declined honestly" tone="decline" action={<Btn size="sm">Record</Btn>} />
            </div>
          </Card>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ font: '700 14px var(--font-sans)', color: 'var(--ink)' }}>Recent copilot questions</div>
              <div style={{ font: '600 11px var(--font-mono)', color: 'var(--text-muted)', cursor: 'pointer' }}>View all ▸</div>
            </div>
            <QRow q="How do I reset a customer’s password?" meta="/settings/security · cited “Reset a password”" tone="success" up />
            <QRow q="How do I upgrade to the Pro plan?" meta="/billing · cited “Upgrade a plan”" tone="success" up />
            <QRow q="Do you support SAML SSO?" meta="/settings · no coverage — flagged as gap" tone="danger" last />
          </Card>
        </div>

        {/* right */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 13, minWidth: 0 }}>
          <Card style={{ background: '#fbfcff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <div style={{ font: '700 14px var(--font-sans)', color: 'var(--ink)' }}>Pending approvals</div>
              <div style={{ font: '700 10px var(--font-mono)', color: '#fff', background: 'var(--warning-dot)', borderRadius: 'var(--radius-pill)', padding: '1px 7px' }}>5</div>
            </div>
            <div style={{ font: '12.5px/1.5 var(--font-sans)', color: 'var(--text-muted)', marginBottom: 12 }}>5 new workflows from your last recording are waiting to go live.</div>
            <Btn fullWidth>Review &amp; approve</Btn>
          </Card>
          <Card>
            <div style={{ font: '700 14px var(--font-sans)', color: 'var(--ink)', marginBottom: 11 }}>Copilot health</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Bar value={86} label="Answered" valueLabel="86%" />
              <Bar value={11} tone="danger" label="Honest declines" valueLabel="11%" />
              <Bar value={72} tone="success" label="Helpful (👍)" valueLabel="72%" />
            </div>
          </Card>
          <Card>
            <div style={{ font: '700 13px var(--font-sans)', color: 'var(--ink)', marginBottom: 10 }}>Questions · this week</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 48 }}>
              {[40, 55, 48, 70, 62, 85, 78].map((h, i) => <div key={i} style={{ flex: 1, height: `${h}%`, background: h >= 78 ? 'var(--primary)' : h >= 62 ? '#cdd5f2' : '#e2e6f7', borderRadius: '3px 3px 0 0' }} />)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', font: '10px var(--font-mono)', color: 'var(--gray-300)', marginTop: 6 }}><span>Mon</span><span>Sun</span></div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function QRow({ q, meta, tone, up, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 2px', borderBottom: last ? 'none' : '1px solid var(--gray-100)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '13px var(--font-sans)', color: 'var(--gray-700)' }}>{q}</div>
        <div style={{ font: '10.5px var(--font-mono)', color: 'var(--text-faint)', marginTop: 2 }}>{meta}</div>
      </div>
      <Badge tone={tone === 'success' ? 'success' : 'danger'}>{tone === 'success' ? 'ANSWERED' : 'DECLINED'}</Badge>
      <span style={{ font: '13px', color: up ? 'var(--success-dot)' : 'var(--gray-300)', width: 16, textAlign: 'center' }}>{up ? '▲' : '▽'}</span>
    </div>
  );
}

/* Help dialogs (rendered by the shell over any screen) */
function HowItWorksDialog({ onClose }) {
  return (
    <Dialog title="How Sync works" subtitle="From one recording to live, trustworthy answers — in five steps." onClose={onClose}
      footer={<div style={{ display: 'flex', alignItems: 'center', gap: 13, border: '1.5px dashed var(--indigo-200)', background: '#f4f6ff', borderRadius: 13, padding: '14px 16px' }}><div style={{ width: 34, height: 34, borderRadius: 10, background: '#fff', border: '1px solid var(--indigo-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Glyph name="autorenew" fill={1} color="var(--primary)" size={19} /></div><div style={{ font: '12.5px/1.5 var(--font-sans)', color: '#3a4a7a' }}><b>It gets better on its own.</b> Every question the copilot can’t answer becomes a “record this next” tip so your help section keeps improving.</div></div>}>
      <StepItem index={1} icon="videocam" title="Record your product" desc="Click through your product while talking out loud. The Sync browser extension captures the screen, your voice and every click." />
      <StepItem index={2} icon="menu_book" title="Sync builds your knowledge base" desc="It automatically turns that recording into clean, step-by-step workflows. No manual writing required." />
      <StepItem index={3} icon="task_alt" title="Approve what the copilot can use" desc="Review the workflows and approve them with one click. The copilot only ever answers from what you approve." />
      <StepItem index={4} icon="code" title="Add the copilot to your app" desc="Copy one line of code and paste it into your product." />
      <StepItem index={5} icon="forum" title="Your customers get instant answers" desc="The copilot answers questions right inside your app — with sources and an honest “I don’t know yet” when it’s unsure." last />
    </Dialog>
  );
}

function HowToRecordDialog({ onClose }) {
  return (
    <Dialog title="How to record" subtitle="Capture a workflow with the Sync Recorder — about 15 minutes." width={470} onClose={onClose}
      footer={<div style={{ display: 'flex', alignItems: 'center', gap: 13, border: '1.5px dashed var(--indigo-200)', background: '#f4f6ff', borderRadius: 13, padding: '14px 16px' }}><div style={{ width: 34, height: 34, borderRadius: 10, background: '#fff', border: '1px solid var(--indigo-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Glyph name="tips_and_updates" fill={1} color="var(--primary)" size={19} /></div><div style={{ font: '12.5px/1.5 var(--font-sans)', color: '#3a4a7a' }}><b>Narrate as you go.</b> Saying what you’re doing and why is what makes the copilot’s answers accurate — and it’s masked for PII before upload.</div></div>}>
      <StepItem index={1} icon="extension" title="Install & connect the recorder" desc="Add the Sync Recorder to Chrome, then click “Connect with Sync” to link it to your workspace." />
      <StepItem index={2} icon="fiber_manual_record" tone="danger" title="Open your product and press Start" desc="Go to your live product, open the extension, and hit Start recording." />
      <StepItem index={3} icon="mic" title="Click through a workflow, narrating" desc="Do the task for real while talking out loud — what you’re doing and why. Sync captures the screen, your voice, clicks and pages." />
      <StepItem index={4} icon="flag" title="Mark each new workflow" desc="Starting a different task? Hit “Mark new workflow” so Sync keeps them as separate, clean guides." />
      <StepItem index={5} icon="cloud_upload" title="Stop, and it uploads itself" desc="Press “Stop & upload.” Your session uploads securely and Sync turns it into your Knowledge Base." last />
    </Dialog>
  );
}
