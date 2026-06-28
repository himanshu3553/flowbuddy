/* Studio shell — wires the sidebar, screens, workflow drill-in and help dialogs.
   Runs after all primitives + screens are defined (single combined bundle). */
function Studio() {
  const [screen, setScreen] = React.useState('Home');
  const [wf, setWf] = React.useState('Reset a password');
  const [dialog, setDialog] = React.useState(null);
  const [firstRun, setFirstRun] = React.useState(false);

  const navActive = screen === 'WorkflowDetail' ? 'Knowledge Base' : screen;

  let view;
  if (screen === 'Home') view = <Home firstRun={firstRun} setFirstRun={setFirstRun} openDialog={setDialog} />;
  else if (screen === 'Recordings') view = <Recordings />;
  else if (screen === 'Knowledge Base') view = <KnowledgeBase onOpenWorkflow={(n) => { setWf(n); setScreen('WorkflowDetail'); }} />;
  else if (screen === 'WorkflowDetail') view = <WorkflowDetail name={wf} onBack={() => setScreen('Knowledge Base')} />;
  else if (screen === 'Copilot') view = <Copilot />;
  else if (screen === 'Analytics') view = <Analytics />;
  else view = <Settings />;

  return (
    <div className="window">
      <Sidebar active={navActive} onNavigate={setScreen} />
      {view}
      {dialog === 'how' && <HowItWorksDialog onClose={() => setDialog(null)} />}
      {dialog === 'record' && <HowToRecordDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<Studio />);
