The approval switch — the product's core "approve for copilot" trust gate. On = indigo, off = gray, knob slides on the system ease.

```jsx
const [on, setOn] = React.useState(true);
<Toggle checked={on} onChange={setOn} ariaLabel="Approve for copilot" />
<Toggle checked={false} size="sm" onChange={...} />   // dense settings row
```

- Controlled: pass **checked** + **onChange(next)**.
- **size** `md` (38×22, list rows) or `sm` (34×20, settings). Always sits beside a visible label ("In copilot", "Approve for copilot").
