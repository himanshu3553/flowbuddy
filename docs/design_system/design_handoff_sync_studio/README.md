# Handoff: Sync Studio — full UI rebuild (shadcn · indigo rebrand)

## Overview
Sync Studio is the **builder-facing web app** of Sync (copilot-first, Phase 1): record your product → Sync builds a Knowledge Base → approve workflows for the copilot → embed it → answer customers in-app, with a feedback loop telling you what to record next. This handoff covers the **entire Studio UI** (every screen + states), plus the **Sync Recorder** (Chrome extension) and **onboarding** — to be rebuilt in `@sync/web` (Next.js 15 + Tailwind + shadcn/ui) under a new **indigo** brand.

## Files in this bundle
- **`prototype_full.html`** — self-contained prototype of **every screen** (scroll/pan the canvas). The visual source of truth.
- **`f1_home_states.html`** — Home in **hi-fi** (3 states), the pixel target for visual fidelity.
- **`theme-indigo.css`** — brand token overrides to paste into `app/globals.css`.
- **`README.md`** — this spec.

## About the design files & fidelity
These are **design references**, not production code — recreate them in `packages/web` with your shadcn components and conventions.
- **Home is high-fidelity** (use `f1_home_states.html` as the pixel target).
- **All other screens are mid-fidelity wireframes**: use them for structure, layout, IA, copy, and the full set of states; apply the indigo shadcn system for final styling. (They already use a near-indigo accent and the same component shapes, so the jump is small.)

## Theme — adopt the indigo brand
- Paste `theme-indigo.css` into `app/globals.css` (overrides `--primary`, `--primary-foreground`, `--ring` in `:root` + `.dark`). New primary = **`232 73% 56%` (#3b50e0)**.
- Derive every indigo surface from the token via opacity — no extra tokens: active nav/selected `bg-primary/10 text-primary`; soft tiles/chips `bg-primary/10 text-primary border-primary/20`; primary button `bg-primary` (optional flourish `bg-gradient-to-b from-[#4a63e8] to-[#3a50dd]`); focus rings inherit `--ring`.
- Neutrals stay your current values (`muted`, `border`, `secondary`, `card`). Status colors follow your `status-badge.tsx`: success `green-100/800` + `emerald-500` dot, warning `amber-100/800`, error/record `red-100/600` (or `destructive`).
- Radius: your `--radius` is `0.5rem` → `rounded-md` (buttons/nav), `rounded-xl` (Card), `rounded-2xl` (Dialog).
- Fonts (optional, part of rebrand): **Plus Jakarta Sans** (`--font-sans`) + **JetBrains Mono** (`--font-mono`) via `next/font`; add to `tailwind.config` `fontFamily`. Colors carry the rebrand even if you keep your current font.

## Information architecture (update your nav)
The prototype promotes the full IA — **grow your nav from 4 → 6 items** (KB graduates from a sub-route to top-level; Analytics is new):

| Nav | lucide | Route |
|---|---|---|
| Home | `Home` | `/dashboard` |
| Recordings | `Video` | `/dashboard/recordings` (+ `/[id]`) |
| Knowledge Base | `BookOpen` | `/dashboard/kb` (+ `/[workflowId]`) |
| Copilot | `Bot` | `/dashboard/copilot` |
| Analytics | `BarChart3` | `/dashboard/analytics` |
| Settings | `Settings` | `/dashboard/settings` |

Update `navItems` in `components/dashboard/nav.tsx`; active state → `bg-primary/10 text-primary`.

## Shared shell & components
- **App shell** = `Sidebar` (`components/dashboard/sidebar.tsx`: `w-60`, `h-14` header, "S" mark + "Sync Studio", indigo active, lucide `h-4 w-4`; optional workspace switcher + user footer via `user-menu.tsx`) + a per-page **Header** (title + subtitle + right-aligned actions) + a content container.
- **Add these shadcn components** (you don't have them yet): `dialog` (`@radix-ui/react-dialog` already a dep), `avatar`, `progress`, `tabs`, `table` (or keep list rows), `tooltip`, `scroll-area`. Most used: **Dialog, Tabs, Avatar, Table**.
- **Reusable patterns**: `StatusBadge` (extend the existing one), `EmptyState` (you have it), **MetricCard** (stat tile: value + label + optional delta), **ToggleRow** (Switch — you have it), code block + copy button, **DataRow** (list/table row with thumbnail/title/meta/status/actions).

---

## Screens (every surface in the prototype)

### 1 · Home — activation + overview  *(hi-fi)*
- **First-run** (`f1_home_states.html` State 1): activation `Card` with the **4-step checklist** — Install the Sync Recorder *(done)* → Record your product *(active, "Open recorder")* → Approve workflows *(locked)* → Embed the copilot *(locked)*; a **1/4 progress ring**; header buttons **How it works** + **How to Record**.
- **Two dialogs** (states 2 & 3, full copy + lucide icons in `f1_home_states.html` and the F1 detail): "How Sync works" (5 steps + "gets better on its own" footer) and "How to record" (5 steps + "narrate as you go" footer). Build as shadcn `Dialog`.
- **Steady-state** (prototype F2): live "Copilot is live" strip; **MetricCards** (Recordings, Workflows, Approved·live, Questions·7d, Answered %, Helpful %); the **"Record this next" coverage panel** (the feedback loop — keep it first-class); recent copilot questions list; pending-approvals card; copilot-health bars; weekly questions chart.
- **States:** first-run / steady-state. **Data:** activation signals (see Data contract); metrics; coverage gaps; recent Q&A.

### 2 · Recordings — capture sessions  *(wireframe)*
- **List** (F4): filter tabs (All / Ready / Processing) + search + **Record** button; rows = thumbnail, title, date, captured layers (screen·voice·DOM·events·routes), duration, # workflows extracted, **status** (Ready / Processing / Failed→**Retry upload**), "PII masked". A processing row shows an inline progress bar; a failed row shows "narration preserved".
- **Empty** (F3): illustration + "No recordings yet" + **Install the recorder** / How it works; captured-layers chips; "PII masked in your browser before upload".
- Row → recording detail → its extracted workflows (links into KB).
- **Data:** recordings[{title, date, layers, duration, workflowCount, status, piiMasked}].

### 3 · Knowledge Base & approvals  *(wireframe)*
- **Workflows list** (F5): pending-approvals callout ("N workflows awaiting approval — one click each, no article to write") + bulk **Approve all**; filter tabs (All / Approved / Pending / Draft); rows = workflow name, source recording, # steps, route, status badge (**Approved·Live** / Pending / Draft), and the **one-click "In copilot" approve toggle** (the trust gate — `Switch`). This is the core moment: approval = a single toggle, not authoring.
- **Empty** (F14): "Your Knowledge Base is empty" + record CTA + a ghost row preview.
- **Workflow detail** (F6): header = title + route chip + #steps + source + **Approved-for-copilot toggle**; **steps list** each showing screenshot + narration + **selector** + **route** + **expected outcome** (this richness is what makes answers context-aware); right rail **"Used by the copilot"** = citation preview (how it appears as a source chip), cited count, last cited, helpful %, freshness ("Selectors healthy").
- **Data:** workflows[{name, source, steps:[{selector, route, expected_outcome, screenshot, narration}], route, status, approvedForCopilot, citationStats}].

### 4 · Copilot — install, settings & widget  *(wireframe)*
- **Install/Settings** (F7) with `Tabs` (Install / Settings / Appearance): **embed snippet** code block + Copy + detection status ("detected on app.acme.com · 6m ago"); **public key** + **Rotate**; **origin allowlist** (rows with Verified badge + Add origin); **Grounding & trust** — "Answer only from approved workflows" (locked on), "Cite the workflow used" (toggle), **decline-threshold slider** (answer-more ↔ decline-more).
- **End-user widget preview** (F7 right rail): launcher + chat panel showing a **grounded answer + citation chip**, an **honest decline** ("I don't have that in my approved sources yet… flagged"), and 👍/👎. This is the embeddable widget (separate runtime deliverable) — shown here as the target.
- **Not-installed** (F15): snippet prominent + "Listening for the copilot on app.acme.com… not detected yet" + checklist (key ready ✓, origin allowlisted ✓, snippet pasted ◯).
- **Error — origin blocked** (F17): red banner "Copilot blocked on an un-allowlisted origin" (dev.acme.com) + **Add origin** / Ignore; allowlist showing the blocked origin.
- **Data:** publicKey; origins[{host, status: live|blocked, requestCount}]; embedDetected; grounding{citeSources, declineThreshold}.

### 5 · Analytics & the feedback loop  *(wireframe)*
- **Metrics** (F8): MetricCards — Questions, Answered %, Honest declines %, Helpful %, Resolved-without-handoff %, **Tickets deflected** (the ROI tile, tinted). Date-range control.
- **Trend chart**: questions with answered vs declined.
- **Coverage gaps — "record this next"**: ranked table of uncovered/declined questions (asked N×, status) → **Record** action / "RECORDING" state. This is the feedback loop, fuller than Home's panel.
- **Top workflows by citations** (bar list) + **Recent declines**.
- **Empty** (F16): "No questions yet — copilot went live N min ago".
- **Data:** time-series metrics; coverageGaps[{question, count, status}]; topWorkflows[{name, citations}]; recentDeclines[].

### 6 · Onboarding modals  *(wireframe)*
- **Welcome** (F18): "Welcome to Sync" + 3-step path (Install ~2m / Record ~15m / Approve & embed ~5m) + **Install the recorder** / later; reassurance "answers come only from what you record & approve".
- **Recording processed** (F19): "Your recording is ready — Sync found N workflows" + checklist of found workflows (all checked) + **Approve all & go live** / Review first. The key activation beat.
- Build both as shadcn `Dialog`.

### 7 · Sync Recorder — Chrome extension  *(wireframe; separate package)*
Not part of `@sync/web`, but specified for completeness (the capture surface). Extension popup states (F10–F13):
- **Idle / ready**: connected as Fiona, **Start recording**, Mask-PII toggle, captured-layers chips, recent sessions.
- **Recording**: REC + timer, current workflow card, **+ Mark new workflow**, mic level, **Pause** / **Stop & upload**, "PII masked · survives navigation".
- **Uploading**: "Recording complete — N workflows", secure-upload progress, "resumes if your connection drops".
- **Retry**: "Upload interrupted — narration safe", **Retry upload** / Resume later, "3 of 5 uploaded".

---

## Cross-cutting requirements
- **Every list/data view** needs **empty**, **loading** (`Skeleton` — you have it), and **error** variants.
- **Interactions:** dialogs (Radix: Esc / backdrop / focus-trap / scroll-lock), toggles (`Switch`), copy-to-clipboard, tabs, filters, sliders.
- **A11y:** dialogs labelled; toggles have labels; status never color-only (always paired with text); focus rings use indigo `--ring`.

## Data model (high level — see repo `architecture.md` for the real one)
`Recording → (synthesis) → Workflow{ steps:[{selector, route, expected_outcome, screenshot, narration}], route, approvedForCopilot, citationStats }`. `Copilot{ publicKey, origins[], grounding{citeSources, declineThreshold} }`. Analytics events `{ question, answered|declined, citedWorkflow, thumb, route, ts }` → aggregated metrics + `CoverageGap{ question, count, status }`. Both Home help dialogs and onboarding modals are static content.

## Build order
1. Theme tokens + (optional) fonts + 6-item nav + indigo active state.
2. App shell + shared components (Dialog, Tabs, Avatar, Progress, MetricCard, StatusBadge, DataRow, EmptyState).
3. **Home** (hi-fi) + the two help dialogs + onboarding modals.
4. **Recordings** (list + detail) + empty.
5. **Knowledge Base** (list + approval toggle + workflow detail) + empty.
6. **Copilot** (install/settings + not-installed + origin-blocked) + widget preview.
7. **Analytics** + empty.
8. **Recorder** extension (separate package) — if in scope.

## Acceptance
Each surface matches `prototype_full.html`; Home matches `f1_home_states.html` in the indigo theme; nav has 6 items; every list has empty/loading/error; dialogs behave per Radix; brand applied via tokens (`primary`, `muted-foreground`, `border`) with no stray hardcoded hex where a token applies.
