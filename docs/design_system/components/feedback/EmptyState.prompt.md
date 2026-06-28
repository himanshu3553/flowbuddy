A centered first-run / no-data state. Powers the Recordings, Knowledge Base and Analytics empties.

```jsx
<EmptyState media={true}
  title="No recordings yet"
  desc="Install the Sync Recorder, click Connect with Sync, and narrate a real workflow."
  actions={<><Button>Install the recorder</Button><Button variant="secondary">How it works</Button></>}
  chips={['Screen','Voice','DOM','Events','Routes']}
  footnote="Captured in sync · PII masked in your browser before upload" />
```

- `media={true}` shows the striped placeholder; pass a node for a custom illustration/icon.
