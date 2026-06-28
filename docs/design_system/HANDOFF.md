# Developer Handoff — Sync Studio (indigo rebrand) → Claude Code

This package is the **Sync Studio design system**. It is meant to be dropped into the
`@sync/web` repo (Next.js 15 + Tailwind + shadcn/ui) and used by Claude Code to rebuild
Studio in the indigo brand. Everything here is **design reference** — recreate each screen
with the repo's existing shadcn/Radix primitives and Tailwind patterns; do **not** ship the
HTML or copy the inline styles literally.

> Pair this with **`design_handoff_sync_studio/README.md`** (in this same package): that file
> carries the *what to build* — full IA, every screen's states, the data contract, and the
> original build order. This file carries the *how it looks* and the developer mapping.

---

## How to use this with Claude Code

1. **Install it as a skill in the repo:** copy this whole folder to
   `.claude/skills/sync-studio-design/`. `SKILL.md` is already Agent-Skills-compatible, so
   Claude Code can invoke it by name in any session and treat it as the source of truth.
   (Alternatively drop it at `design-system/` and reference it by path.)
2. **First prompt (scoped, one screen at a time):**
   > Read `.claude/skills/sync-studio-design/README.md` and `SKILL.md`. Apply the indigo tokens
   > to `app/globals.css`, grow the dashboard nav to 6 items, then rebuild **Home** to match
   > `ui_kits/studio/Home.jsx` using our existing shadcn components. Don't touch other screens yet.
3. **Reference files while implementing:** `tokens/*.css` (values), `components/*/<Name>.d.ts`
   (the API contract for each primitive), `components/*/<Name>.prompt.md` (usage), and
   `ui_kits/studio/*.jsx` (the pixel-target screens).
4. **Verify against** `ui_kits/studio/index.html` (open in a browser — it's an interactive
   click-through of all six screens, the approval toggle, workflow drill-in, and help dialogs).

---

## Fidelity

- **Canonical = hi-fi indigo brand.** Final colors, type, spacing, radii, shadows are all
  tokenized and real. Recreate the UI to match, using the repo's component library.
- The grayscale wireframes in `design_handoff_sync_studio/` were the **structural** source
  (IA, copy, the full set of states). They've already been elevated into the indigo brand here —
  build to *this*, not to the wireframes.

---

## Design tokens → shadcn mapping

Source of truth: `tokens/colors.css`, `typography.css`, `spacing.css`, `elevation.css`.
Map onto the existing shadcn theme — only the three brand lines change; keep your neutrals.

### Brand (the only override needed — same as `theme-indigo.css`)
| shadcn var | value | notes |
|---|---|---|
| `--primary` | `232 73% 56%` (`#3b50e0`) | the one accent: brand · primary action · approved/live · active nav · citations |
| `--primary-foreground` | `0 0% 100%` | white on primary |
| `--ring` | `232 73% 56%` | focus rings inherit this |
| primary CTA flourish | `bg-gradient-to-b from-[#4a63e8] to-[#3a50dd]` | optional; solid `bg-primary` is also fine |

**Derive every indigo-tinted surface from the token, no new hexes:** active nav / step tiles
`bg-primary/10 text-primary` with `border-primary/20`; soft buttons `bg-primary/10`; the dark
code surface stays `#1f2330`.

### Neutrals (keep your current values; these are the design's reference hexes)
canvas `#f6f7f9` · card `#fff` · hairline border `#eceef3` · strong border `#e6e8ee` ·
text: ink `#14161f` → strong `#3a3f4d` → secondary `#6b7180` → muted `#7a808e` → faint `#9a9faf`.

### Status (map to your existing `status-badge.tsx`)
| tone | text | bg | border | dot/mark |
|---|---|---|---|---|
| success / live (green) | `#127249` | `#eef5f0` | `#cfe9da` | `#4e8d6e` |
| approved·live (indigo) | `var(--primary)` | `primary/10` | `primary/20` | `--primary` |
| pending (amber) | `#8a6d2e` | `#f8f2e3` | `#ecdfc2` | `#b89030` |
| danger / decline (red) | `#9c5c4d` | `#fbf0ed` | `#f0ddd7` | `#cc4a3a` |

Status is **always paired with a text label**, never color-only.

### Type · radius · elevation
- Fonts: **Plus Jakarta Sans** (`--font-sans`) + **JetBrains Mono** (`--font-mono`), via `next/font`.
  Mono carries the "technical/system" voice: eyebrows, status pills, selectors, routes, code.
- Radius (your `--radius` = 0.5rem): controls `rounded-md` (9px) · cards `rounded-xl` (16px) ·
  dialogs `rounded-2xl` (18px) · pills `rounded-full`.
- Shadows (`elevation.css`): `--shadow-card` (cards), `--shadow-frame` (screen frame),
  `--shadow-dialog` (modals); the only *tinted* shadow is indigo under the primary CTA.

---

## Component API (the contract)

Each lives in `components/<group>/<Name>.{jsx,d.ts,prompt.md}`. The `.jsx` is a token-styled
reference; build the real one on your shadcn primitive with the **same props**. Full props in the
`.d.ts`; one-line usage in the `.prompt.md`.

| Component | group | shadcn base | key props |
|---|---|---|---|
| `Button` | core | Button | `variant: primary\|secondary\|soft\|ghost`, `size`, `icon`, `iconFill`, `dot`, `fullWidth` |
| `StatusBadge` | core | Badge | `tone: success\|live\|pending\|danger\|neutral`, `dot` |
| `Tag` | core | Badge (outline) | `tone: neutral\|brand` |
| `Toggle` | core | **Switch** | `checked`, `onChange`, `size` |
| `MetricCard` | core | Card | `value`, `label`, `tone: default\|success`, `hint` |
| `ProgressBar` | core | Progress | `value`, `tone`, `label`, `valueLabel` |
| `Sidebar` | app | nav.tsx + lucide | `items`, `active`, `workspace`, `user`, `onNavigate`; `defaultNavItems` (6) |
| `PageHeader` | app | — (layout) | `title`/`breadcrumb`, `subtitle`, `tabs`, `status`, actions via children |
| `DataRow` | app | Table row / list | `media`, `title`, `meta`, `trailing`, `highlighted`, `muted` |
| `ChecklistStep` | app | Card | `state: done\|active\|locked`, `index`, `title`, `desc`, `action` |
| `CodeBlock` | app | — (+ copy) | `code`, `onCopy` |
| `CoverageGapRow` | app | list row | `question`, `meta`, `tone`, `action`/`status` |
| `Dialog` | feedback | **Dialog** (Radix) | `open`, `onClose`, `title`, `subtitle`, `footer` |
| `StepItem` | feedback | — (timeline) | `index`, `icon`, `title`, `desc`, `tone`, `last` |
| `EmptyState` | feedback | EmptyState | `media`, `title`, `desc`, `actions`, `chips`, `footnote` |
| `CopilotMessage` | copilot | — (widget) | `from: user\|bot`, `citation`, `decline`, `feedback` |

Icons: **Material Symbols Outlined** in these references; the repo uses **lucide-react** with
the same metaphors (`Home, Video, BookOpen, Bot, BarChart3, Settings`). Either is on-brand — use
lucide in production. Active nav glyph = filled.

---

## Screens (build targets)

Reference `ui_kits/studio/<Screen>.jsx` for layout + exact copy; states/data come from
`design_handoff_sync_studio/README.md`.

1. **Home** (`Home.jsx`) — first-run activation checklist (4 steps + 1/4 ring) ↔ steady-state
   (live strip, 6 MetricCards, "Record this next" coverage panel, recent questions, pending
   approvals, copilot-health bars, weekly chart). Two help dialogs (`HowItWorksDialog`,
   `HowToRecordDialog`).
2. **Recordings** (`Recordings.jsx`) — list (filter tabs, search, DataRows with status:
   READY/PROCESSING-with-progress/FAILED→retry) + empty state.
3. **Knowledge Base** (`KnowledgeBase.jsx`) — approval callout + bulk Approve all, filter tabs,
   workflow rows with the **one-click "In copilot" Toggle** (the trust gate), status badges.
4. **Workflow detail** (`WorkflowDetail.jsx`) — breadcrumb + approved Toggle; step list each with
   narration · `SELECTOR` · `ROUTE` · `EXPECTED`; right rail "Used by the copilot" citation preview.
5. **Copilot** (`Copilot.jsx`) — Install/Settings/Appearance tabs; embed `CodeBlock` + detection,
   public key + rotate, origin allowlist, grounding toggles + decline-threshold slider; right rail
   end-user widget preview (grounded answer + citation, honest decline, 👍/👎).
6. **Analytics** (`Analytics.jsx`) — MetricCards incl. the tinted "Tickets deflected" ROI tile;
   answered/declined chart; coverage-gaps "record this next" table; top workflows by citations;
   recent declines.

**Every list/data view needs empty, loading (Skeleton), and error variants.** Dialogs behave per
Radix (Esc / backdrop / focus-trap). A11y: label dialogs + toggles; status never color-only;
focus rings use indigo `--ring`.

---

## Suggested build order (checklist)

- [ ] Paste indigo tokens into `app/globals.css`; add Plus Jakarta Sans + JetBrains Mono via `next/font`.
- [ ] Grow `navItems` in `components/dashboard/nav.tsx` to 6; active = `bg-primary/10 text-primary`.
- [ ] App shell + shared primitives (Button, StatusBadge, MetricCard, Toggle/Switch, DataRow, Dialog, Tabs).
- [ ] **Home** (hi-fi) + the two help dialogs + onboarding modals.
- [ ] Recordings (list + detail) + empty.
- [ ] Knowledge Base (list + approval Toggle + workflow detail) + empty.
- [ ] Copilot (install/settings + not-installed + origin-blocked) + widget preview.
- [ ] Analytics + empty.

## Assets
`assets/logo-mark.svg` (gradient rounded-square + "S") and `assets/logo-wordmark.svg`. The
striped diagonal placeholder (`--media-fill`) stands in for screenshots/media — wire real
captures into those slots.

## Package contents
`styles.css` · `tokens/` · `guidelines/` (specimen cards) · `components/` (16 primitives, typed) ·
`ui_kits/studio/` (interactive screens) · `assets/` · `README.md` · `SKILL.md` · this file ·
`design_handoff_sync_studio/` (the original product/IA/data spec).
