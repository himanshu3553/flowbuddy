A centered first-run / no-data state. Powers the Recordings, Knowledge Base and Analytics empties.

```jsx
<EmptyState media={true}
  title="No recordings yet"
  desc="Install the FlowBuddy Recorder, click Connect with FlowBuddy, and narrate a real workflow."
  actions={<><Button>Install the recorder</Button><Button variant="secondary">How it works</Button></>}
  chips={['Screen','Voice','DOM','Events','Routes']}
  footnote="Captured in FlowBuddy · PII masked in your browser before upload" />
```

- `media={true}` shows the striped placeholder; pass a node for a custom illustration/icon.
