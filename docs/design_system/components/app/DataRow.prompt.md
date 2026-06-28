A flexible list/table row — media thumbnail + title/meta + a composable trailing region. Builds recordings, workflows, and origin lists.

```jsx
<DataRow
  media={true}
  title="Billing & account flows"
  meta={<span style={{font:'10px var(--font-mono)',color:'var(--text-faint)'}}>Jun 26 · screen·voice·DOM · PII masked</span>}
  trailing={<>
    <span style={{font:'12.5px var(--font-mono)',color:'var(--text-secondary)'}}>08:42</span>
    <StatusBadge tone="success">READY</StatusBadge>
    <span style={{cursor:'pointer',color:'var(--gray-300)'}}>⋯</span>
  </>}
/>
```

- `media={true}` = striped placeholder; or pass a custom node (an icon tile), or omit.
- `highlighted` for the active/processing row (indigo border + lift); `muted` for drafts.
