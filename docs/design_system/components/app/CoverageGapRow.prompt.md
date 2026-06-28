A row in the "record this next" coverage panel — the product's compounding feedback loop made first-class.

```jsx
<CoverageGapRow question="How do I export a report to CSV?"
  meta="asked 14× · no coverage" tone="gap"
  action={<Button size="sm">Record</Button>} />

<CoverageGapRow question="Where do I change my billing email?"
  meta="asked 6× · recording in progress"
  status={<StatusBadge tone="pending">RECORDING</StatusBadge>} />
```

- `action` (a Record Button) renders the leading status dot and is for open gaps; use `status` for in-progress rows.
- `tone` sets the dot: gap/decline (red) · partial (amber).
