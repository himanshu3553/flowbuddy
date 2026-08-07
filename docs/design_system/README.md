# FlowBuddy Studio — Design System

A design system for **FlowBuddy**, an in-app AI help **copilot** for SaaS products. This system codifies the **indigo brand** the team is rebuilding Studio in — colors, type, components, and full-screen UI kits — so any new Studio surface, marketing asset, or prototype lands on-brand from the first pixel.

> **Product in one line:** Record your product once → FlowBuddy builds a structured Knowledge Base → you approve which workflows the copilot may use → paste one `<script>` → your customers get grounded, in-context answers with citations and honest "I don't know yet" declines. A feedback loop tells you what to record next.

---

## What this folder is

**A design-tool export, not hand-written prose — don't tidy it.** `support.js` is a generated
runtime (it says so on its first line), and every `guidelines/*.html` and `components/*/*.card.html`
carries `@dsCard` annotations the tool parses at render time. The per-component `.prompt.md`,
`.d.ts` and `.jsx` files sit inside that export. Consolidating, renaming or reflowing them risks a
pipeline nobody has documented; this README is the index, and it is the only file here meant to be
read as a document.

---

## Sources this system was built from

Everything here was distilled from the **FlowBuddy Studio handoff bundle**, which still sits beside
this file in `design_handoff_sync_studio/`:

- **`prototype_full.html`** — the canvas prototype of *every* Studio screen + state (the structural / IA source of truth, mid-fidelity).
- **`f1_home_states.html`** — Home in **hi-fi**, 3 states. The **pixel target** for visual fidelity.
- **`theme-indigo.css`** — the brand token overrides (`--primary: 232 73% 56%` → `#3b50e0`).
- **`README.md`** (in the handoff) — the full screen-by-screen spec, IA, data contract, and build order.
- **`Sync Studio Wireframes.dc.html`** *(the on-disk filename — predates the rename)* — the 20-frame wireframe canvas (F1–F20).

**Two fidelities existed in the source.** The grayscale wireframes carry **structure, IA, copy, and the full set of states**; the hi-fi Home carries **visual fidelity**. This design system makes the **hi-fi indigo brand canonical** and elevates the wireframe structures into it — exactly the jump the handoff asks production to make ("apply the indigo system for final styling").

### The two handoff briefs — why they stay

Both `design_handoff_*` folders are **completed build briefs for surfaces that have shipped**. They
are kept, and kept *here* rather than filed away, because each sits beside the HTML it annotates and
carries things nothing else records:

- **`design_handoff_sync_studio/`** — the *what to build*: full IA, every screen's states, the data
  contract, and the original build order. It is also **the only index into the 20-frame wireframe
  canvas** — F1 Home · F2 steady state · F3/F4 Recordings · F5/F6 Knowledge Base · F7 Copilot ·
  F8 Analytics · F14 KB empty · F15 copilot not-installed · F16 Analytics empty · F17 origin blocked ·
  F18/F19 onboarding. Frames are unlabelled in the canvas itself, so losing this list loses the map.
  It also specifies **five states that appear never to have been built** — F15's install checklist,
  F17's origin-blocked banner with inline "Add origin" recovery, F16's analytics empty state, F18's
  Welcome modal, and F19 ("Your recording is ready — FlowBuddy found N workflows" → **Approve all &
  go live**), which the brief names *the key activation beat*.
- **`design_handoff_recorder_extension/`** — the four recorder popup states and their triggers
  (F10 idle · F11 recording + mark workflow · F12 uploading · F13 upload interrupted). The recorder's
  own source cites these frame IDs by bare number, so this brief is what makes them resolvable.
  It also carries the **corrections to its own reference HTML** — the file uses the literal wireframe
  hex `#3a5bd9`, which is *not* the brand (`--primary` = `#3b50e0`), and its `system-ui` type, 20×20
  indigo square, grey circle and `⚙ ↻ ⚠` glyphs are placeholders. Those notes are worthless
  separated from the HTML they correct, which is why the pair is not split.
  Its `tokens/` subfolder is a byte-identical copy of `tokens/` here; the originals win.

The recorder brief also makes one **voice** decision found nowhere else: an interrupted upload is a
**warning, not an error** — the progress fill turns amber rather than indigo to say *stalled, not
failed*, and the copy reassures ("Your narration is safe — nothing is lost" · "Retries automatically
when you're back online"). That is a different register from the copilot's honest decline, and the
only place the product states it.

---

## Product context

FlowBuddy ships as **four surfaces** over one shared Knowledge Base. This system covers the builder-facing ones; the copilot widget is represented as a preview.

| Surface | Who | In this system |
|---|---|---|
| **FlowBuddy Recorder** (Chrome extension) | the builder | Recorder popup states (idle / recording / uploading / retry) |
| **Studio** (web app) ⭐ | the builder | **Primary focus** — full UI kit (Home, Recordings, KB, Copilot, Analytics) |
| **In-App Copilot** (embeddable widget) | the builder's customers | `CopilotMessage` component + widget preview |
| **Help Portal** (Version 2) | the builder's customers | *out of scope — V2 by-product* |

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
- **One accent, used with discipline.** Indigo `#3b50e0` (`--primary`) is the *only* chromatic UI color and it carries meaning: brand, primary action, active nav, "approved / live", citations. The primary CTA uses a subtle vertical gradient `linear-gradient(180deg,#4a63e8,#3a50dd)` with an indigo-tinted shadow — an optional flourish; a solid `--primary` fill is equally on-brand. The logo mark uses the same gradient at 150°.
- **Tinted brand surfaces are derived, not invented.** Active nav and step tiles are `--indigo-50` (`#eef0fe`) fills with `--indigo-100/200` borders and `--primary` text/icon. No extra brand hexes.
- **Neutrals are cool with a warm-white paper.** Canvas `#f6f7f9`, cards pure white, hairlines `#eceef3`. Text ramps from `#14161f` (headings) through `#6b7180` (secondary) to `#9a9faf` (faint).
- **Status is a 3-color system, always paired with text** (never color-only): **success/live** green (`#4e8d6e` dot, `#eef5f0` bg), **warning/pending** amber (`#b89030`, `#f8f2e3`), **danger/decline/record** terracotta-red (`#cc4a3a`/`#b06a5a`, `#fbf0ed`). Saturations stay low so they sit calmly next to the indigo.
  - Green has **two** surfaces and they are not interchangeable: the status *pill* uses `--success-bg-2` (`#eef5f0`), the lighter `--success-bg` (`#f3faf6`) is for full-width success *panels* and banners. Reading the pill off the wrong one is the easy mistake.
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
- **Logo:** `assets/logo-mark.svg` (gradient rounded square; the brand glyph is the white **"F"** since the 2026-07-17 rename — ⚠️ the SVG asset itself still renders the old "S" and needs regenerating) and `assets/logo-wordmark.svg` (mark + "FlowBuddy"). The in-app sidebar often shows the bare gradient mark beside the "FlowBuddy" wordmark.
- **Never hand-draw icons.** Use Material Symbols (or lucide in production). Diagonal-stripe placeholders stand in for any real imagery.

---

## INDEX — what's in this system

**Foundations**
- `styles.css` — root entry (link this). Imports everything below.
- `tokens/` — `fonts.css` · `colors.css` · `typography.css` · `spacing.css` · `elevation.css`
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Brand) rendered in the Design System tab.
- `assets/` — `logo-mark.svg`, `logo-wordmark.svg`.

**Components** (`components/`, React + tokens, each with `.d.ts` + `.prompt.md`)

The `.jsx` is a token-styled *reference*; the `.d.ts` is the prop contract and the `.prompt.md` the
one-line usage note. In production, build the real one on the base primitive named here **with the
same props**.

| Component | Group | Base primitive |
|---|---|---|
| `Button` | core | Button |
| `StatusBadge` | core | Badge |
| `Tag` | core | Badge (outline) |
| `Toggle` | core | **Switch** |
| `MetricCard` | core | Card |
| `ProgressBar` | core | Progress |
| `Sidebar` | app | nav + lucide icons |
| `DataRow` | app | Table row / list row |
| `ChecklistStep` | app | Card |
| `CoverageGapRow` | app | list row |
| `Dialog` | feedback | **Radix Dialog** |
| `EmptyState` | feedback | EmptyState |
| `PageHeader` | app | **none — layout only** |
| `CodeBlock` | app | **none — custom, plus a copy button** |
| `StepItem` | feedback | **none — timeline** |
| `CopilotMessage` | copilot | **none — widget surface** |

**The last four have no base primitive and must be hand-built** — nothing to `shadcn add`.

**UI kit** (`ui_kits/studio/`)
- `index.html` — interactive Studio (nav between screens, open dialogs, flip the approval toggle).
- Screens: `Home`, `Recordings`, `KnowledgeBase`, `WorkflowDetail`, `Copilot`, `Analytics`.

**Skill**
- `SKILL.md` — makes this downloadable as an Agent Skill.

---

## Using it

- **Prototypes / assets:** link `styles.css`, pull values from the tokens, copy components or whole screens out of the UI kit. The specimen cards are copy-paste-able reference.
- **Production:** the tokens map 1:1 onto the handoff's shadcn theme (`--primary: 232 73% 56%`, `--ring` inherits). Treat the components here as the *visual* contract; wire them to your real Radix/shadcn primitives.
- **Adopting the brand changes exactly three lines** — `--primary`, `--primary-foreground` and `--ring`, in both `:root` and `.dark`. **Keep your own neutrals.** Every indigo-tinted surface then derives from that one token by opacity (active nav and soft tiles `bg-primary/10 text-primary` with `border-primary/20`); no new brand hexes, ever.
- **⚠️ Everything under `ui_kits/`, `guidelines/` and the two handoff folders is a design *reference*, never production code.** Do not ship the reference HTML and do not copy its inline styles literally — recreate each surface on the repo's own primitives. The references also predate parts of the brand in places (see the recorder brief's corrections), so a literal paste imports mistakes that look correct.

> **Sharing:** set this file's type to **Design System** in the Share menu so others in your org can browse the Design System tab.
