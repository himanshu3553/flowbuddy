The per-screen header bar: title/subtitle (or a breadcrumb) and optional inline tabs on the left; live status + action buttons on the right.

```jsx
<PageHeader title="Home" subtitle="Let's get your copilot live.">
  <Button variant="secondary" icon="help">How it works</Button>
  <Button variant="primary" icon="fiber_manual_record" iconFill={1}>How to Record</Button>
</PageHeader>

<PageHeader title="Copilot" tabs={['Install','Settings','Appearance']} activeTab={tab} onTab={setTab} status="Live" />

<PageHeader breadcrumb={<span>Knowledge Base <span style={{color:'var(--gray-300)'}}>/</span> <b>Reset a password</b></span>}>…</PageHeader>
```

- 62px tall, hairline bottom. `status` renders a green dot + label. Right-side `children` are your actions.
