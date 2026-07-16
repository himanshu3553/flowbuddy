One row of the Home activation checklist. Three states: done, active, locked.

```jsx
<div style={{ display:'flex', flexDirection:'column', gap:10 }}>
  <ChecklistStep state="done" title="Install the FlowBuddy Recorder" desc="Chrome extension · one-click Connect with FlowBuddy" statusLabel="DONE" />
  <ChecklistStep state="active" index={2} title="Record your product"
    desc="Narrate a real workflow" action={<Button>Open recorder</Button>} />
  <ChecklistStep state="locked" index={3} title="Approve workflows for the copilot" desc="One click each" />
  <ChecklistStep state="locked" index={4} title="Embed the copilot" desc="Paste one snippet" />
</div>
```

- `done` = green check + tinted row; `active` = indigo number + soft lift + an action; `locked` = dim with a lock glyph.
