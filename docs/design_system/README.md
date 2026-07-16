# FlowBuddy Studio — Design System

A design system for **FlowBuddy**, an in-app AI help **copilot** for SaaS products. This system codifies the **indigo brand** the team is rebuilding Studio in — colors, type, components, and full-screen UI kits — so any new Studio surface, marketing asset, or prototype lands on-brand from the first pixel.

> **Product in one line:** Record your product once → FlowBuddy builds a structured Knowledge Base → you approve which workflows the copilot may use → paste one `<script>` → your customers get grounded, in-context answers with citations and honest "I don't know yet" declines. A feedback loop tells you what to record next.

---

## Sources this system was built from

Everything here was distilled from the **FlowBuddy Studio handoff bundle** (in `design_handoff_sync_studio/` and `uploads/` at the time of authoring):

- **`prototype_full.html`** — the canvas prototype of *every* Studio screen + state (the structural / IA source of truth, mid-fidelity).
- **`f1_home_states.html`** — Home in **hi-fi**, 3 states. The **pixel target** for visual fidelity.
- **`theme-indigo.css`** — the brand token overrides (`--primary: 232 73% 56%` → `#3b50e0`).
- **`README.md`** (in the handoff) — the full screen-by-screen spec, IA, data contract, and build order.
- **`FlowBuddy Studio Wireframes.dc.html`** — the 20-frame wireframe canvas (F1–F20).
- **`uploads/product.md`** — product narrative, personas, principles, the four surfaces.

**Two fidelities existed in the source.** The grayscale wireframes carry **structure, IA, copy, and the full set of states**; the hi-fi Home carries **visual fidelity**. This design system makes the **hi-fi indigo brand canonical** and elevates the wireframe structures into it — exactly the jump the handoff asks production to make ("apply the indigo system for final styling").

---

## Product context

FlowBuddy ships as **four surfaces** over one shared Knowledge Base. This system covers the builder-facing ones; the copilot widget is represented as a preview.

| Surface | Who | In this system |
|---|---|---|
| **FlowBuddy Recorder** (Chrome extension) | the builder | Recorder popup states (idle / recording / uploading / retry) |
| **Studio** (web app) ⭐ | the builder | **Primary focus** — full UI kit (Home, Recordings, KB, Copilot, Analytics) |
| **In-App Copilot** (embeddable widget) | the builder's customers | `CopilotMessage` component + widget preview |
| **Help Portal** (Phase 2) | the builder's customers | *out of scope — frozen by-product* |

**Audience / persona.** "Founder Fiona" — a time-starved early-stage B2B SaaS founder who hates writing docs. The product's whole promise is *near-zero-effort, trust-by-default*. That shapes the UI: calm, dense-but-legible, one confident accent, and a relentless focus on the **approve-in-one-click** moment and the **record-this-next** loop.

**Information architecture — 6 nav items:** Home · Recordings · Knowledge Base · Copilot · Analytics · Settings.

---

## CONTENT FUNDAMENTALS — how FlowBuddy writes

The voice is **plain, calm, second-person, and trustworthy**. It explains the *why*, never hypes.

- **Person & address.** Talk to the builder as **"you"** ("Get *your* copilot live", "Record once, approve the workflows it may use"). The copilot refers to itself as **"I"** when it speaks to end-users ("**I** don't have that in my approved sources yet").
- **Casing.** **Sentence case everywhere** — headings, buttons, nav. The only uppercase is the **mono micro-label** voice: eyebrows (`GET STARTED`), status pills (`APPROVED · LIVE`, `PENDING`, `DECLINED`), and field keys (`SELECTOR`, `ROUTE`, `EXPECTED`).
- **Tone.** Reassuring and concrete. Lead with the benefit, name the safeguard. e.g. *"One click each — the copilot answers only from what you approve."* / *"PII is masked in your browser before upload."*
- **Honesty as a feature.** Declines are framed as a strength, never an error: *"I won't guess. I've flagged it for the team to cover."* Coverage gaps are an opportunity (`Record this next`), not a failure.
- **Numbers earn their place.** Metrics are specific and outcome-shaped — *"≈ 340 tickets your team didn't have to touch this week"* beats a raw count. The ROI tile (tickets deflected) is the one stat that gets a tinted (green) surface.
- **Verbs over nouns in actions.** Buttons are imperatives: *Record*, *Approve all*, *Open recorder*, *Rotate key*, *Retry upload*, *Add origin*.
- **No emoji in chrome.** The one sanctioned glyph is 👍 / 👎 for end-user feedback (helpfulness). Everything else is a Material Symbol or a mono character. No decorative emoji in Studio UI.
- **Em-dash asides** and **"…" ellipses** carry the conversational rhythm (*"reset a password… now upgrade a plan…"*). Curly quotes throughout.

---

## VISUAL FOUNDATIONS

**The feel:** a quiet, modern SaaS console — cool-gray paper, crisp white cards, soft low shadows, and a single confident **indigo** that means *approved / live / primary action*. Density is high but never cramped; whitespace and hairline borders do the separating, not heavy fills.

### Color
- **One accent, used with discipline.** Indigo `#3b50e0` (`--primary`) is the *only* chromatic UI color and it carries meaning: brand, primary action, active nav, "approved / live", citations. The primary CTA uses a subtle vertical gradient `linear-gradient(180deg,#4a63e8,#3a50dd)` with an indigo-tinted shadow; the logo mark uses the same gradient at 150°.
- **Tinted brand surfaces are derived, not invented.** Active nav and step tiles are `--indigo-50` (`#eef0fe`) fills with `--indigo-100/200` borders and `--primary` text/icon. No extra brand hexes.
- **Neutrals are cool with a warm-white paper.** Canvas `#f6f7f9`, cards pure white, hairlines `#eceef3`. Text ramps from `#14161f` (headings) through `#6b7180` (secondary) to `#9a9faf` (faint).
- **Status is a 3-color system, always paired with text** (never color-only): **success/live** green (`#4e8d6e` dot, `#f3faf6` bg), **warning/pending** amber (`#b89030`, `#f8f2e3`), **danger/decline/record** terracotta-red (`#cc4a3a`/`#b06a5a`, `#fbf0ed`). Saturations stay low so they sit calmly next to the indigo.
- **Imagery / capture** is represented by a **45° diagonal-stripe placeholder** (`--media-fill`) with a `#e4e4e4` border and a mono caption (`recording`, `step shot`) — never a fake photo. Drop real screenshots into these slots.

### Type
- **Plus Jakarta Sans** for all UI; **JetBrains Mono** for the "technical/system" voice (eyebrows, status pills, code, selectors, routes, metric units). See `tokens/typography.css` for the ramp.
- Display runs **heavy (800)** with tight tracking (`-0.02em`); titles 700 at `-0.01em`; body 12.5–13px at 1.5; mono micro-labels 9.5–10.5px **uppercase** with `+0.06–0.1em` tracking.

### Shape, elevation & borders
- **Radii climb with surface scale:** controls `9px` → tiles `11–13px` → cards `16px` → dialogs `18px` → pills `999px`. Logo mark `6–8px`.
- **Shadows are soft and low-contrast** on the gray paper: cards get a near-flat contact shadow plus a gentle lift (`--shadow-card`); screen frames float higher (`--shadow-frame`); dialogs sit on a deep `--shadow-dialog`. The *only* tinted shadow is indigo under the primary CTA.
- **Hairline borders do most of the work.** `1px` `#eceef3` separates almost everything; an emphasized/selected card steps up to `1.5px` indigo border + a soft indigo lift.

### Layout
- **Fixed app shell:** `230px` sidebar (white, hairline right border) + `62px` header (title + subtitle left, actions right) + `#f6f7f9` content with `~22px` padding. Content maxes ~1180px.
- **Cards over a sunken canvas.** Sections are white cards on the gray paper; multi-column dashboards use a `~1.6 : 1` split (main feed : rail).

### Motion & states
- Gentle ease-out (`--ease`, ~180ms). **Hover** = subtle fill/border darken or tint (e.g. ghost button → `--indigo-50`). **Active/press** = slight darken (`--indigo-700`). **Focus** = `--focus-ring` (3px indigo glow). **Toggles** slide with the same ease; on = `--primary`, off = gray. No bounce, no flourish — the product's tone is *calm and trustworthy*.

---

## ICONOGRAPHY

- **Primary set: Material Symbols Outlined** (Google), variable font, loaded via `tokens/fonts.css`. Used inline as a glyph font: `<span class="ms">home</span>` with `font-variation-settings: 'FILL' 0/1, 'opsz' 20`. **FILL 1** marks the *active* nav item; **FILL 0** for the rest. In-app optical size ~20px.
  - Nav glyphs: `home`, `videocam`, `menu_book`, `smart_toy`, `bar_chart`, `settings`.
  - Step/flow glyphs: `videocam`, `task_alt`, `code`, `forum`, `autorenew`, `extension`, `mic`, `flag`, `cloud_upload`, `tips_and_updates`, `fiber_manual_record` (record), `check`, `lock`, `help`.
  - *(Production parity note: the handoff's Next.js app uses **lucide-react** with the same metaphors — `Home, Video, BookOpen, Bot, BarChart3, Settings`. Either set is on-brand; Material Symbols is the canonical in these specimens because the hi-fi target uses it.)*
- **Mono characters as micro-glyphs.** The dense wireframe voice uses monospace characters where an icon would be overkill: `▾` (disclosure), `⋯` (row menu), `×` (close/remove), `→` (flow), `▲ / ▽` (thumb up/down in lists), `●` (step bullet). Keep these in `--font-mono`.
- **Emoji:** only 👍 / 👎 for end-user helpfulness feedback. Never decorative.
- **Logo:** `assets/logo-mark.svg` (gradient rounded square + white "S") and `assets/logo-wordmark.svg` (mark + "FlowBuddy"). The in-app sidebar often shows the bare gradient mark beside the "FlowBuddy" wordmark.
- **Never hand-draw icons.** Use Material Symbols (or lucide in production). Diagonal-stripe placeholders stand in for any real imagery.

---

## INDEX — what's in this system

**Foundations**
- `styles.css` — root entry (link this). Imports everything below.
- `tokens/` — `fonts.css` · `colors.css` · `typography.css` · `spacing.css` · `elevation.css`
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Brand) rendered in the Design System tab.
- `assets/` — `logo-mark.svg`, `logo-wordmark.svg`.

**Components** (`components/`, React + tokens, each with `.d.ts` + `.prompt.md`)
- `core/` — `Button`, `StatusBadge`, `Tag`, `Toggle`, `MetricCard`, `ProgressBar`
- `app/` — `Sidebar`, `PageHeader`, `DataRow`, `ChecklistStep`, `CodeBlock`, `CoverageGapRow`
- `feedback/` — `Dialog`, `EmptyState`
- `copilot/` — `CopilotMessage`

**UI kit** (`ui_kits/studio/`)
- `index.html` — interactive Studio (nav between screens, open dialogs, flip the approval toggle).
- Screens: `Home`, `Recordings`, `KnowledgeBase`, `WorkflowDetail`, `Copilot`, `Analytics`.

**Skill**
- `SKILL.md` — makes this downloadable as an Agent Skill.

---

## Using it

- **Prototypes / assets:** link `styles.css`, pull values from the tokens, copy components or whole screens out of the UI kit. The specimen cards are copy-paste-able reference.
- **Production:** the tokens map 1:1 onto the handoff's shadcn theme (`--primary: 232 73% 56%`, `--ring` inherits). Treat the components here as the *visual* contract; wire them to your real Radix/shadcn primitives.

> **Sharing:** set this file's type to **Design System** in the Share menu so others in your org can browse the Design System tab.
