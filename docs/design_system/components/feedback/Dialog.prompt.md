A centered modal on a dim backdrop — the help dialogs ("How FlowBuddy works", "How to record") and onboarding. Renders absolutely inside a positioned app frame.

```jsx
<Dialog open={open} onClose={close} title="How FlowBuddy works"
  subtitle="From one recording to live, trustworthy answers — in five steps."
  footer={<Callout>It gets better on its own…</Callout>}>
  <StepItem index={1} icon="videocam" title="Record your product" desc="…" />
  <StepItem index={2} icon="menu_book" title="FlowBuddy builds your knowledge base" desc="…" last />
</Dialog>
```

- Backdrop click and the × both call `onClose`. Set `width` for wider dialogs (default 466).
- Its parent must be `position: relative` (the screen frame) so it overlays that screen, not the page.
