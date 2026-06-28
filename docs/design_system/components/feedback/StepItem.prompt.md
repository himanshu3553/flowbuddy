One node of a vertical numbered timeline. Stack inside a Dialog body or the core-loop strip.

```jsx
<StepItem index={1} icon="videocam" title="Record your product"
  desc="Click through your product while talking out loud." />
<StepItem index={2} icon="fiber_manual_record" tone="danger"
  title="Open your product and press Start" desc="…" />
<StepItem index={5} icon="cloud_upload" title="Stop, and it uploads itself" desc="…" last />
```

- `tone="danger"` tints the tile red (the record step). Always set `last` on the final item to drop the connector.
