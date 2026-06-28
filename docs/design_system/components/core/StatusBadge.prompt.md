A mono status pill that always carries a text label — the universal state marker across recordings, workflows, copilot answers and origins.

```jsx
<StatusBadge tone="live">APPROVED · LIVE</StatusBadge>
<StatusBadge tone="success">READY</StatusBadge>
<StatusBadge tone="pending">PENDING</StatusBadge>
<StatusBadge tone="danger" dot>DECLINED</StatusBadge>
<StatusBadge tone="neutral">DRAFT</StatusBadge>
```

- **tone**: `success` (green — ready/answered/done/verified) · `live` (indigo — approved & live in copilot) · `pending` (amber) · `danger` (red — declined/failed) · `neutral` (gray — draft).
- Labels are UPPERCASE mono. Add **dot** when a leading status dot helps (live strips, list rows).
