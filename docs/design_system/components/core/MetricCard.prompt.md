A dashboard stat tile (big value + caption). Lay several across a flex row.

```jsx
<div style={{ display: 'flex', gap: 10 }}>
  <MetricCard value="1,284" label="Questions · 7d" />
  <MetricCard value="86%" label="Answered" />
  <MetricCard value="~340" label="Tickets deflected" tone="success" hint="≈ tickets your team didn't touch" />
</div>
```

- **tone** `success` tints the tile green — use it on exactly one tile (the ROI / deflection stat) to anchor the value story.
- **delta** adds a small green change chip; **hint** adds a helper line.
