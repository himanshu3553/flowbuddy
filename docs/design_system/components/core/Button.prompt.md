The primary FlowBuddy Studio button — an indigo CTA plus neutral/soft/ghost variants, with optional Material-Symbol icon or record dot.

```jsx
<Button variant="primary" icon="fiber_manual_record" iconFill={1}>How to Record</Button>
<Button variant="secondary" icon="help">How it works</Button>
<Button variant="soft" size="sm">Rotate key</Button>
<Button variant="primary" dot>Record</Button>
```

- **variant**: `primary` (gradient + tinted shadow) · `secondary` (white + hairline) · `soft` (indigo-50 tint) · `ghost`.
- **size**: `sm` | `md`. **fullWidth** stretches it (used on the "Review & approve" card button).
- **dot** shows the white record pulse; **icon** takes a Material Symbols name with **iconFill** 0/1.
