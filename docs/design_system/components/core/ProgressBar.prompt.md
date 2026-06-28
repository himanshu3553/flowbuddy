A thin proportion bar — inline progress, or a labeled row for the Copilot-health breakdown.

```jsx
<ProgressBar value={25} />                                  // bare
<ProgressBar value={86} label="Answered" valueLabel="86%" />
<ProgressBar value={11} tone="danger" label="Honest declines" valueLabel="11%" />
<ProgressBar value={72} tone="success" label="Helpful (👍)" valueLabel="72%" />
```

- **tone**: `brand` (default indigo) · `success` · `warning` · `danger`.
- Pass **label** + **valueLabel** to render the caption row above the track; omit both for a bare bar.
