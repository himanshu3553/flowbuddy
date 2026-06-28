---
name: sync-studio-design
description: Use this skill to generate well-branded interfaces and assets for Sync (the in-app AI help copilot for SaaS) and its builder-facing Studio web app — for production code or throwaway prototypes/mocks. Contains the indigo brand foundations (colors, type, fonts), iconography, reusable components, and a full Studio UI kit.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files.

This is the **Sync Studio design system** — the indigo brand the team is rebuilding Studio in. Key locations:
- `styles.css` (root) — link this one file to inherit all tokens + webfonts.
- `tokens/` — colors, typography, spacing, elevation as CSS custom properties.
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Brand).
- `components/` — React primitives (`core/`, `app/`, `feedback/`, `copilot/`), each with a `.d.ts` contract and a `.prompt.md` usage note.
- `ui_kits/studio/` — the full interactive Studio (Home, Recordings, Knowledge Base, Workflow detail, Copilot, Analytics); `index.html` is a working click-through.
- `assets/` — the logo mark + wordmark.

If creating **visual artifacts** (slides, mocks, throwaway prototypes), copy assets out and produce static HTML that links `styles.css` and reuses the token values + component patterns. The `ui_kits/studio` screens are the best starting point for any new Studio surface.

If working on **production code**, the tokens map 1:1 onto the shadcn theme (`--primary: 232 73% 56%` → `#3b50e0`); treat the `components/` files as the visual contract and wire them to your real Radix/shadcn primitives.

Stay true to the voice (plain, calm, second-person; sentence case; mono for status/technical labels; honesty-as-a-feature) and the one-accent discipline (indigo means brand / primary action / approved-live). Never invent new brand colors — derive tinted surfaces from the indigo ramp.

If invoked without other guidance, ask what the user wants to build, ask a few focused questions, then act as an expert Sync designer who outputs HTML artifacts **or** production code depending on the need.
