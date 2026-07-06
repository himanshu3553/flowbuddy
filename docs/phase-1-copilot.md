# Sync — Phase 1: Copilot (Plan · Spec · As-Built)

> **Phase 1 is the copilot, end-to-end — and it ships as the Version 1 release.** A SaaS records its product, **approves workflows for the copilot**, drops a `<script>` into its app, and its end-users get a chat widget that answers **grounded only in approved Knowledge Base content**, with citations and honest declines. **Decoupled** from the human-facing portal/articles (those are [Phase 2](phase-2-portal.md)). This doc is the build plan, the acceptance spec, and the as-built record in one place.

- **Status:** **Built, verified locally, and deployed** — foundation **P1-M0…P1-M3** + copilot **P1-M5…P1-M12** built/core-done (per-module table in §5). **P1-M4 cloud deploy is done** — the stack runs on Render (Dockerized api + worker + web) + Cloudflare R2 (dev deploy at `https://sync-web-uir8.onrender.com`; reset/test guide → [`e2e-testing.md`](e2e-testing.md) **Level 2**). Remaining Phase-1 work: the **P1-M3 pgvector retrieval upgrade** and **P1-M12 PII Cut 2** (deferred to Phase 2). The **P1-M11 capture-reliability backlog is complete** (§8 — **R13 ranked locators shipped 2026-07-06**, closing the list; **R5** + the recorder UX parking lot → **V2·D3**).
- **Last updated:** 2026-07-06 · **Branch:** `dev`
- **Companion docs:** why copilot-first → [`product.md`](product.md) §5 · roadmap/status → [`roadmap.md`](roadmap.md) · technical model → [`architecture.md`](architecture.md) · Phase 1 visual → [`phase-1-modules-map.md`](phase-1-modules-map.md) · KB step distillation → [`kb-step-distillation.md`](kb-step-distillation.md) · manual E2E test plan → [`e2e-testing.md`](e2e-testing.md) · Phase 2 by-products → [`phase-2-portal.md`](phase-2-portal.md) · local dev → [`dev-setup.md`](dev-setup.md)
- **Grounding (Stage A):** the copilot grounds on **approved-KB** (`KnowledgeItem`s behind a per-workflow approval flag), **not** published articles. **Stage B** (also cite a published article when one exists) is **deferred**. *(These grounding "Stages" are within Phase 1 — not the product Phases 1/2/3.)*

---

## Table of contents
1. [Overview](#1-overview)
2. [Scope & definition of done](#2-scope--definition-of-done)
3. [Locked decisions & assumptions](#3-locked-decisions--assumptions)
4. [The four surfaces (as built)](#4-the-four-surfaces-as-built)
5. [Modules P1-M0…P1-M12](#5-modules-p1-m0p1-m12)
6. [The capture contract (session bundle)](#6-the-capture-contract-session-bundle)
7. [Data model](#7-data-model)
8. [Capture reliability & PII backlog (P1-M11 / P1-M12)](#8-capture-reliability--pii-backlog-p1-m11--p1-m12)
9. [Privacy & redaction](#9-privacy--redaction)
10. [Non-functional requirements](#10-non-functional-requirements)
11. [Risks / decisions to finalize](#11-risks--decisions-to-finalize)
12. [End-to-end journey](#12-end-to-end-journey)

---

## 1. Overview

**Sync adds a trustworthy AI help copilot to your SaaS — grounded only in workflows you recorded and approved.**

```
Record (Chrome extension) → Knowledge Base (auto) → Approve for copilot (one click) → Embed one <script> → In-app Copilot answers your customers (cited; declines honestly)
                                                                                                                    └─► feedback + coverage gaps ("record this next")
```

A founder installs the **Sync Recorder**, connects it to their account, and records themselves clicking through a workflow while narrating *what* and *why*. Sync captures the session in synchronized layers (events, DOM, screenshots, narration audio), builds an explicit **Knowledge Base**, and lets the founder **approve** which workflows the copilot may use. The founder pastes **one `<script>`** into their product, and their customers get an **in-app copilot** that answers from the approved knowledge — in context, with citations, declining honestly on gaps.

**Grounded authorship (the guiding principle).** Everything the copilot says is synthesized **only** from the customer's own approved recordings — never the model's general knowledge. If a question isn't covered, the copilot **declines and flags a coverage gap** instead of inventing an answer. The KB is the **substrate**; a one-click **per-workflow approval flag is the trust gate** — so no un-approved or raw knowledge ever reaches an end-user (the **no-leak** guarantee).

The foundation (P1-M0…P1-M3) shipped first as a thin slice (record → KB → retrieval/grounding engine); the copilot delivery layer (P1-M5…P1-M12) was built on top.

---

## 2. Scope & definition of done

**In (Phase 1 — copilot):** Chrome-extension capture; ingestion/processing into the KB; **per-workflow approval gate**; **copilot answer endpoint** (conversational RAG over approved-KB; cite or decline → coverage gap); **embeddable widget + JS SDK**; **context API**; **embed auth & tenant scoping** (public key, origin allowlist, rate limit); **feedback loop & analytics**; **capture reliability** + **client-side PII redaction**; cloud deploy (last); workspace/auth baseline.

**Out (other phases / deferred):**
- **Help portal + article authoring/publishing** → **Phase 2** ([`phase-2-portal.md`](phase-2-portal.md)) — decoupled by-products; the editor + curated generation exist in Studio, the public portal app returns in Phase 2.
- **Grounding Stage B** (also cite a published article) — deferred (distinct from product Phase 2).
- **In-app actionability** ("show me" — highlight the real element / deep-link a route via captured selectors) — future; the data exists.
- **Self-validation / sandbox / drift** → **Phase 3**.
- **Narration-only & video capture** → **Version 2**.
- Integrations & public API; i18n; multi-seat/roles; billing (free invite-only beta).

**Definition of done (= the Version 1 release):**
- [ ] End-to-end: install → record → process → **approve for copilot** → embed snippet → end-user asks → grounded answer.
- [ ] **Grounded answer with a citation** (source workflow/step) when approved-KB covers it; **honest decline + logged coverage gap** when it doesn't — **no hallucinations**.
- [ ] **No-leak:** never retrieves/answers from un-approved or raw KB, even when asked directly.
- [ ] **Scoped to the correct workspace** (public embeddable key + origin allowlist) and **rate-limited**.
- [ ] **Context-aware** (biases to the host route; degrades gracefully) and **multi-turn**.
- [ ] **PII-safe:** passwords never captured; input values masked by default **before upload**.
- [ ] Every Q&A **logged** with answered/hit-miss + 👍/👎; Studio surfaces top questions + coverage gaps.
- [ ] Works **without touching the portal/articles** (Phase 2, frozen).
- [ ] **Cloud deploy is the final step:** whole copilot built & verified locally first, then deployed.

---

## 3. Locked decisions & assumptions

| # | Decision |
|---|---|
| Capture model | **Event/DOM-primary.** Per-interaction event + DOM snapshot + hi-res screenshot + post-action snapshot (`expected_outcome`) + continuous audio. Events = ground truth. |
| Grounding substrate | The copilot grounds on **approved-KB** (`KnowledgeItem`s behind a per-workflow flag), **not** published articles. |
| Trust gate | A lightweight **per-workflow "approve for copilot"** flag (one click; reversible; audited) defines the answerable corpus. |
| Decline behavior | Conservative: when retrieval/grounding confidence is low, **decline + log a coverage gap** rather than guess. |
| Retrieval | Keyword/LLM shortlist over `KnowledgeItem.text` now → pgvector embeddings later (the P1-M3 upgrade). |
| Embed identity | Per-workspace **public embeddable key** (`pk_…`, safe in client HTML), distinct from the recorder's secret token; **origin allowlist** (empty = any) + **rate limit** (per key). |
| Widget | Single `<script>` → shadow-DOM chat (launcher + panel); no host-framework lock-in; config via `data-sync-*` attrs. |
| Redaction | Client-side **before upload**; mask password/email/tel, sensitive `autocomplete`, card/CVV/SSN-like patterns, and host-marked `data-sync-redact`. Server backstop → backlog. |
| Recording scope | Primary tab **+ tabs opened from it** (R9 Option A, 2026-07-02); survives same-tab navigations incl. **cross-origin** (R1); upload retry on failure (R2). |
| Deploy | Render (Dockerized: api + worker + web) + Cloudflare R2; **executed last**, after the copilot works locally. |
| Workspace | Single-user = single-workspace in V1; multi-seat/roles later. Browser: Chrome-only (MV3). Beta: free, invite-only. |

**Cadence:** one module at a time, each verified end-to-end, with a stop for review.

---

## 4. The four surfaces (as built)

### 4.1 Sync Recorder (Chrome extension) — Module 1: Capture
*UI restyled repeatedly: 2026-06-26 (neutral shadcn) → 2026-06-28 (indigo brand) → **2026-07-01 full rebuild to the [`docs/design_system/design_handoff_recorder_extension`](design_system/design_handoff_recorder_extension/README.md) handoff (F10–F13), with the placeholders replaced by real capabilities.** The popup is a state machine — **disconnected · idle · recording (+paused) · uploading · retry** — 360px on the canonical indigo design system, with **bundled** Plus Jakarta Sans + JetBrains Mono (variable woff2, so the brand faces render under MV3 CSP). Formerly-placeholder features are **now real:** a **live mic meter** (WebAudio `AnalyserNode` off the popup's own `getUserMedia`), **working Pause/Resume** (event timestamps are active-time so audio stays aligned), and **determinate upload %** — streamed over HTTP/2 (byte-progress caps at 90% + a "Finishing…" tail; 100% only on the server's OK), with a plain-POST **indeterminate** fallback on HTTP/1.1 (Chrome only allows a streamed request body over HTTP/2). Workspace **name + initial avatar** ride the connect handshake; the toolbar action icon **blinks a red dot** while recording (steady when paused); "Start fresh" discards a failed recording; the CAPTURES chips were removed. Vanilla CSS (no Tailwind in the esbuild bundle); class/element hooks preserved.*
**Connect with Sync** — the popup's **Connect** opens Studio's `/connect` (already signed in); one click mints a workspace token **server-side** and hands it + the API URL **+ the workspace name** back via a content-script bridge — **no tokens/URLs typed**. The popup then shows the connected **workspace (name + avatar) and "Connected as you@email"**; recording is disabled until connected.

**Recording controls** — **Start/Stop** the active tab; **Mark new workflow** drops a marker (one recording → multiple workflows; the strongest segmentation signal); **Grant microphone** via a guided flow.

**What gets captured (event/DOM-primary)** — for each meaningful interaction (click, input, submit, SPA nav, **plus (R10) a debounced significant page scroll, a menu-opening hover, and richer keyboard: Enter/Escape + app-command shortcuts like Cmd+K / Ctrl+S**): the **event** (type, timestamp, masked value), **element semantics** (role, accessible name, text, tag, CSS path, XPath, bbox, attributes), **route** (URL/path/hash/title — *also powers context awareness*), a **hi-res screenshot**, a **DOM snapshot** (scripts/styles stripped, size-capped), a **post-action snapshot** after the page settles (the basis for `expected_outcome` and future self-validation), and **continuous narration audio**.

**Recording feedback (no silent failures)** — toolbar badge cycles **`REC` → `↑` → `✓`/`!`** with a **blinking red-dot action icon** while recording. **No passive *status* is drawn on the recorded page** (the on-page toasts were removed 2026-07-01); every *upload outcome* surfaces **in the popup** as a **one-time, self-clearing** bottom status bar — green **✓ Uploaded** / red **Error <message>** (success auto-dismisses; both clear from storage so they don't persist across reopens) — including **zero interaction events** (e.g. an iframe-only UI). Retryable failures use the retry screen (Retry / Start fresh); hard failures (no events) show the error bar. **2026-07-03 (R7):** while recording, a **draggable on-page control bar** *is* shown — an interactive control surface (Stop / Pause / Mark + live timer, step count, mic meter), distinct from the removed passive toasts (§8, §4.1 recorder).

**Capture reliability (P1-M11 core)** — survives *same-tab* full-page navigations **including cross-origin** (R1 — hardened 2026-07-01 with a deterministic **pull-based self-arm handshake**, §8), keeps the bundle + offers **Retry** on upload failure (R2), longer finalize fallback so long recordings keep narration (R3), a (2026-07-01) **hardened finalize lifecycle** — the stop→finalize fallback timer is tracked + cancelled and finalize never runs against an active recording, so a stale timer can't corrupt a later session — and (2026-07-03, R4) **survives service-worker eviction**: a 20s keepalive ping keeps the MV3 worker warm during quiet narration, and captured events are buffered + the capture port reconnects on demand, so an eviction can't silently drop events. *(Backlog: §8.)*

**PII redaction by default (P1-M12 core)** — before upload, masks `password` values/regions (never captured), plus `email`/`tel`, sensitive `autocomplete` (cc-*, current/new-password, one-time-code), card/CVV/SSN/secret/token field patterns, and any host-marked **`data-sync-redact`** field. *(Backlog: §8.)*

**Known limits (Phase 1):** a tab opened **manually** (not *from* the recording tab) isn't followed (R9 Option B not built); **cross-origin iframe** events are captured but omit `bbox` (no highlight crop, screenshot still shows the pixels — the offset is unknowable across the origin boundary); screenshot/DOM **pixel** PII redaction (Cut 2) deferred to Phase 2. *(Now captured (2026-07): same-tab **cross-origin** navigation — R1 — **new tabs / popups opened from** the recording tab — R9 Option A — and **events inside iframes** — R8.)*

### 4.2 Knowledge Base — Module 2
**One cumulative KB per workspace** (not per recording) — every recording compounds into the same KB; each item links to both its source recording (provenance) and its workspace.

Stores **`KnowledgeSource`** (one per recording: kind, app URL, status, persisted transcript, raw manifest) and **`KnowledgeItem`** (the normalized, indexed unit — in V1 a **distilled step item**: a clean imperative `instruction` (+ optional `detail`), `route`, attributed `narration`, one curated `screenshotFile` + element `bbox`, and searchable `text`).

**The worker** (on upload): transcribes narration (`whisper-1`, persisted) → aligns narration to events → **cleans** the raw events (deterministic dedupe/merge of mechanical duplicates) → **segments** into candidate workflows (markers → route changes → narration cues → LLM) → **distills** each workflow (LLM) into clean, user-facing steps — dropping stray clicks, merging low-level interactions, attributing narration, and keeping one curated screenshot per step — then persists those distilled steps tagged by workflow and sets status **`ready`**. Raw events are **not** persisted as items (only the distilled steps are; the raw log stays in the manifest). It **stops at `ready`** (curated model; approval and article generation are separate explicit steps). Items are indexed by text for **keyword/LLM retrieval**, workspace-wide. See [`kb-step-distillation.md`](kb-step-distillation.md) (2026-06-26).

### 4.3 In-App Copilot ⭐ — the primary KB consumer (the headline)
*Grounds directly on the approved subset of the KB (Module 2) — parallel to, and independent of, Module 3 article creation (Phase 2).*
- **Approval gate (P1-M5):** a per-**workflow** "approve for copilot" toggle in the KB browser; the **enforcement seam** — retrieval filters to approved items only.
- **Answer endpoint (P1-M6):** `POST /v1/copilot/answer` retrieves over **approved-KB**, returns a structured **grounded answer + citations** or an **honest decline** (→ `CoverageGap`, `source=copilot`); multi-turn.
- **Widget & SDK (P1-M7):** `sync-copilot.js` (esbuild → ~7 kB IIFE); shadow-DOM launcher + chat panel; **Sync-indigo default theme** (`--sc-accent:#3b50e0`, indigo citations + terracotta declines — aligned to the design system, 2026-06-28) that stays **host-rebrandable** via `data-sync-accent` + `data-sync-position` (plus `data-sync-title`/`-greeting`); renders answers + citations + decline/error states; `demo/index.html` for local testing.
- **Context API (P1-M8):** the widget sends `location.pathname`; retrieval **boosts** items whose captured route matches the page; **soft boost** — biases, never excludes.
- **Embed auth (P1-M9):** the API authenticates via **`X-Sync-Key`** → resolve key → workspace; enforce **origin allowlist** (CORS + server, empty=any — **origins normalized on save** to exact `Origin`-header form since 2026-07-06, with a Studio warning when the widget is live but the list is empty); **rate-limit** 30/min/key on **all three copilot routes** (`/answer`, `/feedback`, `/seen` — one shared gate, per-route buckets, 2026-07-06). Unknown/missing → 401, disallowed origin → 403, over limit → 429; key rotatable in Studio. Question capped at 2000 chars (+ widget `maxlength` 400) and the answer call pins `max_completion_tokens`/low temperature — the cheap cost ceiling from the review (§2.4).
- **Feedback & analytics (P1-M10):** every question is logged with its outcome (`CopilotQuery`: question + answered + thumbs; returns `queryId`); widget renders **👍/👎** → `POST /v1/copilot/feedback` (tenant-scoped); Studio shows **Copilot activity** + unified **coverage gaps** ("record this next").

### 4.4 Studio (Dashboard) — the builder's console
*Redesigned across three passes: 2026-06-26 (`f5197c0`) onto **Tailwind + shadcn/ui** (neutral); 2026-06-28 (`8bc2e1f`) rebuilt under the **indigo brand** with a 6-item nav + empty/loading/error states on every screen; then a 2026-06-28 **design-system alignment pass** (branch `ui-change-copilot`) brought every surface to the canonical [`docs/design_system/`](design_system/README.md) tokens — cool-gray shadcn neutrals, the low-saturation status palette (mono status pills + an indigo "approved · live" tone), the radii + soft-shadow ramps, the indigo-gradient primary CTA, and Plus Jakarta Sans + JetBrains Mono. **All three client surfaces — Studio, recorder, widget — now share the one indigo design system** (the widget keeps host re-branding via `data-sync-accent`).*
- **Accounts:** email+password (self-hosted, JWT); sign-up auto-creates the workspace; single-user = single-workspace; full tenant isolation.
- **Shell & IA:** persistent sidebar (Sync mark, workspace switcher, user footer w/ sign-out) over a 6-item nav — **Home · Recordings · Knowledge Base · Copilot · Analytics · Settings** — + a **per-page header** (title + subtitle + actions); responsive (mobile drawer + mobile top bar).
  - **Home** (`/dashboard`): **first-run** = a live activation checklist (token → recording ready → workflow approved → copilot embedded) with a progress ring + two help dialogs (How it works / How to record); flips to a **steady-state dashboard** once a workflow is approved or a question arrives — metric tiles, "record this next" gaps, recent questions, pending approvals, copilot-health bars, weekly questions chart.
  - **Recordings** (`/dashboard/recordings`): filter tabs (All/Ready/Processing) + search over recording rows (status, workflow count, processing/failed states) + empty state; row → a recording's detail.
  - **Knowledge Base** (`/dashboard/kb`): top-level **workflows list** (the trust gate) — pending-approvals callout + **Approve all** + per-workflow **one-click "In copilot" toggle**; row → the source detail (`/kb/[id]`: distilled steps by workflow w/ screenshots — **click → a same-page lightbox, with the clicked element highlighted from the captured `bbox`** (2026-07-03) — approve toggles, transcript, a "Used by the copilot" citation-stats placeholder). *(Workflows = segments within a source; approval is per-`(sourceId, segmentIndex)`. No standalone Workflow entity/route, no "Draft" state, no per-step selector/expected_outcome in the data — those parts of the design are placeholders.)*
  - **Copilot** (`/dashboard/copilot`): **tabs** (Install / Settings / Appearance) — embed snippet + copy (with a **local-testing hint** when the widget URL is a placeholder), "not detected yet" listening state + checklist, public key + rotate, origin allowlist, grounding & trust controls (**Cite the workflow used** now persists + is enforced on both the embedded widget and the preview; **decline-threshold** remains a UI-only preview — persistence/enforcement → **Version 2 · D2**, 2026-07-06) — plus a **live in-Studio copilot preview** and real Copilot activity. *(An **Approach B real-widget tester** — the preview embedding the actual `sync-copilot.js` bundle with the real key/API in a `data-sync-preview` mode — was **prototyped 2026-07-07 on the unmerged experiment branch `dev-feature-copilot-preview`** (`af7d043`); `dev` keeps the Approach-A session-auth tester.)* *(Embed-detection is **wired** (2026-06-30): the widget pings on mount + every `/answer` → `Workspace.widgetLastSeenAt` (`recordWidgetSeen` in `copilot-auth.ts`), read via `lib/embed-status.ts` for the live/idle state. The **F17 origin-blocked** error state → **Version 2 · D2** (2026-07-06; needs a blocked-origin signal).)*
  - **Analytics** (`/dashboard/analytics`): 7-day answer-quality metrics, answered-vs-declined chart, coverage-gaps "record this next" table (each row: **Record** + **Dismiss**), recent declines, "resolved without a human" + empty state. *(Citation logging **shipped** (2026-06-30) via the **`QueryCitation`** model — **top workflows by citations is now real**. Still backlog: a real deflection metric (tickets-deflected still shown as ≈answered), 👎-feedback drill-down, period deltas, query log/export, citation backfill.)*
  - **Settings** (`/dashboard/settings`): extension API token + workspace details.
- **By-product (Phase 2 — parked):** Auto Generate Articles, Text → Article, and the article editor — **UI removed from Studio**, engine dormant in-tree — see [`phase-2-portal.md`](phase-2-portal.md) §6.

> **Help Portal** is a **Phase 2 by-product** (decoupled) — [`phase-2-portal.md`](phase-2-portal.md).

---

## 5. Modules P1-M0…P1-M12

| # | Module | Done when | Status (build) |
|---|---|---|---|
| **P1-M0** | Monorepo, infra & auth | Postgres/R2/Redis/Auth.js/api/worker + multi-tenancy in place | ✅ (legacy M0/M1) |
| **P1-M1** | Recorder / workflow capture | extension emits the full session bundle (§6) with client redaction | ✅ (legacy M2) |
| **P1-M2** | Knowledge Base | captures normalize → `KnowledgeSource`+`KnowledgeItem` + transcript + segmentation + keyword index | ✅ (legacy M3/M6) |
| **P1-M3** | Retrieval & grounding engine | shared retrieve → ground → answer-or-decline engine | ✅ built; 🔄 pgvector upgrade pending (legacy M7/M11-retrieval) |
| **P1-M4** | **Cloud deploy** (Render + R2) | the stack is live; copilot API + widget serve from the deployed origin | ✅ **deployed** — Render (Dockerized api + worker + web) + Cloudflare R2; dev deploy at `sync-web-uir8.onrender.com` (reset/test → `e2e-testing.md` Level 2) |
| **P1-M5** | **Approval gate** | builder marks a workflow "approved for copilot"; only approved items are eligible; reversible + audited; survives reprocess | ✅ **built** 2026-06-23 |
| **P1-M6** | **Answer endpoint** | grounded answer (cite workflow/step) from **only** approved-KB, or honest decline → `CoverageGap`; multi-turn | ✅ **built** 2026-06-23 — verified incl. no-leak |
| **P1-M7** | **Embeddable widget & SDK** | one `<script>` renders a working chat that talks to P1-M6 + shows citations | ✅ **built** 2026-06-23 — first end-to-end demo |
| **P1-M8** | **Context API** | widget reports host route; copilot biases to "where the user is"; degrades gracefully | ✅ **built** 2026-06-23 |
| **P1-M9** | **Embed auth & tenant scoping** | public key + origin allowlist; scoped, rate-limited; end-user sessions | ✅ **built** 2026-06-23 — 401/403/429 verified |
| **P1-M10** | **Feedback loop & analytics** | every Q&A logged + thumbs; Studio surfaces top questions + coverage gaps | ✅ **built** 2026-06-23 |
| **P1-M11** | **Capture reliability** | no recording the user made is silently lost (nav/upload/audio) | ✅ **done** — core (R1/R2/R3) + **R6, Pause/Resume, R1 cross-origin re-arm (2026-07-01), R9 multi-tab Option A & R8 iframe (2026-07-02), R4 SW-eviction resilience, R7 on-page control bar, R10 scroll/hover/keyboard & R12 screenshot timing/cost (2026-07-03), R13 ranked locators (2026-07-06) shipped**; R5 → V2·D3 |
| **P1-M12** | **PII redaction** | passwords never captured; values masked by default before upload; copilot-facing text scrubbed server-side | 🔄 client masking 2026-06-23 + **server text-scrub (Cut 1) 2026-06-26**; screenshot OCR/blur (Cut 2) → Phase 2 (§8) |

**Package layout:** `packages/api` (Fastify ingestion + copilot routes + the BullMQ worker), `packages/synthesis` (the shared `answerFromKB` engine + capture synthesis), `packages/widget` (the embeddable copilot, esbuild), `packages/web` (Studio: approval toggle, copilot settings, analytics), plus `shared`/`db`/`extension`.

---

## 6. The capture contract (session bundle)

The most important interface in Phase 1: exactly what the extension emits. Copilot retrieval, grounding, citations, and (later) self-validation all depend on this shape.

```jsonc
Session {
  id, workspace_id, created_by, started_at, ended_at,
  app_meta: { base_url, user_agent, viewport, device_pixel_ratio },
  markers: [ { t, label } ],            // user "new workflow" markers (ms from start)
  audio:   { ref, format, duration_ms, sample_rate },
  events:  [ Event ]
}
Event {
  id, t,                                // ms from session start (sync key for audio)
  type,                                 // click | input | submit | nav | keydown(Enter/Escape/Cmd+K…) | scroll | hover  (R10; markers ride in markers[], not as events)
  target: { role, accessible_name, text, tag, attributes_subset,
            css_path, xpath,            // positional fallbacks
            locators: [ { strategy, value, unique } ],  // R13 — ranked stable-first
                                        //   testid|id|aria|name|placeholder|href|text|css|xpath;
                                        //   uniqueness verified against the live doc at capture
            bbox: { x, y, w, h },       // viewport coords -> crop + highlight
            frame_path? },              // iframe chain, if applicable
  value?,                               // redacted/masked input value
  route: { url, path, hash, title },    // powers the copilot context bias
  dom_snapshot_ref, screenshot_ref,
  post_action?: { screenshot_ref, dom_snapshot_ref, route,
                  settle_reason }       // mutation_quiet | timeout  (network_idle = planned)
}
```

- **Selectors are multi-signal**; brittle CSS alone is never the only signal — since R13 (2026-07-06) the target also carries a ranked, capture-time-uniqueness-verified `locators` set for Phase-3 replay.
- **DOM snapshots are sanitized + size-capped** at capture (redaction first).
- **`route`** is matched against the host's current page for context bias (§4.3).
- **`post_action`** makes `expected_outcome` possible and seeds Phase 3 validation — do not skip it.

---

## 7. Data model

All **additive** on the foundation schema (`Workspace / ApiToken / KnowledgeSource / KnowledgeItem / Article / Step / CoverageGap`):

- **KB:** `KnowledgeSource` (kind, appBaseUrl, status, persisted `transcript`, manifest) → `KnowledgeItem[]` (kind `step|topic`, `text` index field, `data` payload — for `step`, the **distilled** `{ instruction, detail, route, narration, screenshotFile, bbox }` (2026-06-26), `segmentIndex`/`segmentTitle`). The copilot retrieves over `KnowledgeItem`s, not articles.
- **Approval (P1-M5):** a first-class **`CopilotApproval`** row keyed by `(sourceId, segmentIndex)` (with a `workspaceId` scoping column) — **survives** the worker's item delete+recreate on reprocess. (The enforcement seam P1-M6 retrieves through.)
- **Copilot embed/config (on `Workspace`):** `copilotPublicKey` (unique, `pk_…`) + `copilotAllowedOrigins[]`. *(The widget's title, greeting, accent, and position are client-side `data-sync-*` embed attributes — not stored server-side; theming is host-driven, not a Studio setting.)*
- **Copilot logs (P1-M10):** **`CopilotQuery`** (question, answered, feedback `up|down|null` — the question + outcome + thumbs; the answer text and citations are returned to the widget but **not** persisted) + **`CoverageGap.source`** discriminator (`prompt | copilot`).
- **Optional:** `KnowledgeItem.embedding vector` (pgvector) for the P1-M3 semantic-retrieval upgrade.
- **Binary artifacts** (screenshots, audio, DOM snapshots) in S3-compatible storage (MinIO local / R2 prod) under `workspaces/<ws>/sessions/<id>/…`; per-workspace isolation; signed, expiring URLs; the api auto-creates the bucket on boot.

**Async processing:** uploads enqueued (Redis + BullMQ) → background worker (transcribe → clean → segment → distill → `ready`). The copilot answers **synchronously** over the answer endpoint.

---

## 8. Capture reliability & PII backlog (P1-M11 / P1-M12)

Brought into Phase 1 because **copilot answer quality = capture quality**, and PII is elevated (end-user-facing). The **core shipped**; the rest is the recorder/PII backlog below. Effort key: **S** ≈ <½ day, **M** ≈ 1–2 days, **L** ≈ 3+ days.

### P1-M11 — Capture reliability (recorder backlog R1–R13)

**A. No silent data loss** *(lose nothing the user recorded — highest priority)*
- **R1 — Survive full-page navigations** *(✅ core shipped; ✅ cross-origin re-arm fixed 2026-07-01)* — **M.** A hard nav re-injects a fresh content script that nothing re-armed, so events after the nav were lost while audio kept going. **Fix (shipped):** a background `tabs.onUpdated` listener scoped to the recording tab re-arms `content.js` with the **original** `startTime` (+ `pausedTotal`) so the `t` timeline stays continuous.
  - **Cross-origin same-tab re-arm — ✅ fixed 2026-07-01.** Repro (before): start recording on a marketing site, click **Sign in**, land on the app's auth page **in the same tab but a different origin** (e.g. `scribe.com` → `scribehow.com/signin`) → capture silently stopped after the hop; only first-origin actions were recorded. **Cause:** the re-arm was **push-based** — the freshly-loaded content script is entirely passive and only starts when the background's `startCapture` lands; on a full cross-origin load that push is racy (the new page's content script may not be listening at `tabs.onUpdated` `complete`, and the fallback `chrome.scripting.executeScript` can collide with Chrome's own auto-injection) → the new page ended up **loaded-but-not-recording**. Same-origin SPA route changes don't reload the document, so they never hit it (which is why it looked domain-specific). **Fix:** flipped re-arm **push → pull** — on every page load the content script sends the background a `hello`; the background answers from `sender.tab.id` + `rec` (`{ record, startTime, pausedTotal }`), so every freshly loaded page (any origin) **self-arms deterministically**; the `onUpdated` push re-arm is kept as a backup. *(Distinct from R9, which is a **new tab/window**, not same-tab.)*
- **R2 — Don't destroy the bundle on upload failure; retry** *(✅ core shipped)* — **S.** `finalize()` used to `kvClear()` unconditionally, wiping the IDB buffer before the upload result. **Fix (shipped):** only clear on a **successful** upload; otherwise keep the buffer, set the `fail` badge, and offer **Retry** in the popup (bounded to one pending bundle).
- **R3 — Protect audio on long recordings** *(✅ core shipped)* — **S/M.** A fixed 5s finalize fallback could run before MediaRecorder finished encoding, dropping narration (the moat). **Fix (shipped):** a longer bounded wait (30–60s) + "still finalizing…" state; consider chunked audio-to-IDB so partial audio survives a crash.
- **R4 — Service-worker-eviction resilience (MV3)** *(✅ shipped 2026-07-03)* — **M.** During quiet narration (no interaction → no port traffic) the MV3 service worker can be evicted after ~30s idle, which silently drops the capture port so every event after it is lost while audio keeps going. **Fix (shipped):** two defenses in the content script, no new manifest permission. **(1) Keepalive** — while recording, the **top frame** pings the port every **20s** (`{ kind: 'keepalive' }`, a no-op the background just receives), resetting the idle timer so the worker stays warm for the recording's duration. **(2) Reconnect + buffer** — captured messages go through an in-memory **`outbox`**; `flush()` drains it over a live port and, if a post fails on a stale port (evicted-but-`onDisconnect`-not-yet-fired), **reconnects and retries within the same call** so the event *and the screenshot the background takes on receipt* land immediately rather than one interaction late; `port.onDisconnect` nulls the dead port so the next `send()`/keepalive reconnects (which wakes a fresh worker — recording state lives in `chrome.storage.session` + `idToKey` rebuilds from IDB, so a revived worker resumes cleanly). The outbox is bounded (`OUTBOX_CAP`) and drained best-effort on stop. *(Chose the content-script keepalive over a `chrome.alarms` heartbeat to avoid adding the `alarms` permission; sub-frames (R8) skip the keepalive but still reconnect-on-send.)*

**B. Coverage** *(capture more app types — backlog)*
- **R8 — iframe / cross-frame capture** *(✅ shipped 2026-07-02)* — **L.** Content scripts were `all_frames:false`, so iframe UIs (Stripe, embedded editors, chat widgets) captured nothing. **Fix (shipped):** `manifest` → `all_frames:true` (inject into every http(s) frame); each frame **self-arms via the existing `hello` handshake** (R1), and stop/pause/resume already broadcast to all frames. `content.ts` translates the element bbox into **top-document viewport coords** (`frameOffset()` walks the ancestor iframe chain) so highlights line up with the full-tab screenshot; a **cross-origin** frame omits `bbox` (offset unknowable — no wrong crop) but still captures the event + screenshot, and records `framePath` (the sub-frame URL). `appMeta` is **gated to the top frame** so a sub-frame can't clobber the session's origin/viewport; the background drops events while paused (multi-frame safety). *(Remaining constraint: cross-origin frames have no highlight bbox — same-origin chains are fully resolved.)*
- **R9 — Multi-tab / popup workflows** *(✅ shipped 2026-07-02 — Option A)* — **L.** Capture was bound to one `tabId`; OAuth popups / "open in new tab" lost capture (**distinct from R1**, same-tab nav). **Fix (shipped):** `Rec.tabIds` tracks a **set** of session tabs; `tabs.onCreated` + `openerTabId` **adopts tabs opened FROM a recording tab** (Option A — never unrelated tabs), which self-arm via the `hello` handshake (R1); `hello` / re-arm / stop / pause / resume span the whole set; screenshots use the **event tab's `windowId`** (multi-window / popup safe); closed tabs pruned via `tabs.onRemoved`. *(Option B — follow any tab you manually switch to — not built; that's the remaining known limit.)*
- **R10 — Scroll / hover / richer keyboard** *(✅ shipped 2026-07-03)* — **M.** Only click/change/submit/Enter/popstate were handled. **Fix (shipped):** three low-noise additions in `content.ts`. **(1) Scroll** — a **debounced** (`450ms` idle) **page-level** scroll (inner scroll containers ignored) emits ONE `scroll` event only when the delta clears **35% of the viewport**, with a minimal target (no bbox → the screenshot shows the revealed viewport) and the scroll depth as `value`. **(2) Hover** — a `mouseover` on an **`aria-haspopup`** trigger, **dwell-gated** (`450ms`) + a `:hover` re-check + 4s repeat-suppression, emits a `hover` event that highlights the menu trigger (captures the revealed submenu — a real step). **(3) Richer keyboard** — `shortcutCombo()` captures bare **Enter/Escape** and **app-command modifier combos** (Cmd+K, Ctrl+S, Cmd+Enter…) as `keydown` events with a normalized combo `value`, while dropping plain typing (already covered by `input`), lone modifiers, and clipboard/undo edits (Cmd+A/C/V/X/Z/Y). Downstream is unaffected: ingest validates `type` as a free string, `cleanEvents` collapses bursts, and the LLM segmenter/distiller (`eventLabel` is type-agnostic) drops stray scrolls/hovers unless narration makes them a step. `hover` added to the shared `CaptureEventType`.

**C. Recorder UX & segmentation** *(ride-along — backlog)*
- **R5 — Marker hotkey + labels** *(→ **Version 2 · D3**, scope decision 2026-07-06; was deferred 2026-07-03)* — **S.** Architecture calls the marker hotkey "the main segmentation-quality lever," but there's no hotkey and markers carry no label. **Fix (if built):** a `commands` entry (e.g. `Alt+Shift+M`) + optional one-line label, surfaced to the worker's segmentation. **Deferred** — markers are already droppable from the popup and the R7 on-page bar (⚑ Mark), so the hotkey/labels are a nice-to-have; revisit only if segmentation quality needs the extra signal.
- **R6 — Live mic level meter + pre-flight** *(✅ shipped 2026-07-01)* — **S.** Users record blind; a dead mic is found only after a wasted session. **Fix (shipped):** a WebAudio `AnalyserNode` drives the recording-view mic meter live from the popup's own `getUserMedia` stream; mic permission is surfaced pre-record (Grant-microphone flow). *(A hard "block loudly on denial" pre-flight is only partial — a dead mic shows as flat bars rather than a hard block.)*
- **R7 — On-page floating control bar** *(✅ shipped 2026-07-03)* — **M.** Stop/marker/status used to require opening the popup. **Fix (shipped):** a draggable **shadow-DOM bar** (`controlbar.ts`) mounted in the **top frame** of each recording tab, showing a pause-aware **timer**, current **Workflow N + step count**, a **live mic meter**, and **⚑ Mark / Pause·Resume / Stop** — each reusing the same background commands as the popup. Design-system styled (indigo/terracotta, pill radius, soft frame shadow; system UI font cross-site). State is polled from the background's `getState` (so the bar **survives Pause** and **re-appears after a full-page nav** via the R1 self-arm), and it unmounts itself when the session ends. The bar is real page DOM, so its own clicks would be captured — the recorder drops any event whose `composedPath()` contains the bar host (a capture-phase `stopPropagation` would be too late). The **mic meter** is fed **offscreen recorder → background → top frame** at ~8 fps (a second `AnalyserNode` on the existing recording stream — no extra `getUserMedia`, no host-page mic prompt), dropping to idle while paused so a dead mic reads as flat bars. *(Reuses the R6 mic-meter approach; the bar's ⚑ Mark drops an unlabelled marker — the R5 hotkey + labels are deferred (build TBD). The on-page bar does not replace the popup.)*
- **Pause / resume** *(✅ shipped 2026-07-01)* — **S/M.** Pause for sensitive screens/breaks. **Fix (shipped):** Pause detaches page listeners + pauses narration (`MediaRecorder.pause()`) + freezes the timer; event timestamps are **active-time** (`pausedTotal`) so audio and events stay aligned across pauses (0 pauses = byte-identical to before). Pairs with R7 (on-page bar — still backlog).
- **Stop→upload feedback & resilience** *(✅ shipped 2026-07-06, **v0.3.0**)* — **M.** After Stop, the pipeline had **no persisted state and no deadline**: the control bar vanished silently, a reopened popup claimed **idle** mid-upload, a worker eviction or a fetch hung on a cold-starting server stranded the recording with a stuck `↑` badge and no outcome (hit in the first store-install E2E), and nothing reported server-side processing. **Fix (shipped) — four parts:** **(1)** a **persisted `phase`** (`recording → saving → uploading → done/failed` in `storage.local`) as the pipeline's single truth — the popup routes on it at open with stage-true labels (*Saving narration… / Uploading… N% / Finishing… /* after ~8 s stalled, *Waking the Sync server…*); **(2) resilience** — a `chrome.alarms` twin of the 30 s finalize fallback (survives eviction; adds the `alarms` permission), boot-time recovery (a fresh worker resumes an upload its predecessor died holding; an orphaned buffer surfaces as a retryable interruption), and an **upload watchdog** (abort at 2 min stalled streaming / 4 min plain → retryable timeout instead of an eternal `↑`); **(3)** a persistent popup **Recent** row polling `GET /v1/sessions/:id` while open (`uploaded · queued → processing… → ready/failed`) + a **View in Studio** deep link; **(4)** the control bar collapses into an on-page **status pill** (*Saving → Uploading → ✓ Uploaded / ⚠ failed*) instead of vanishing — it deliberately reverses the earlier "outcomes never render on the page" decision for the stop moment. Mechanics: [`internals/recorder-capture.md`](internals/recorder-capture.md) §4.6/4.8/4.9. *(Deliberately excluded: `chrome.notifications` desktop alerts.)*

**D. Capture quality** *(accuracy & Phase-3 enablers — backlog)*
- **R12 — Screenshot timing & cost** *(✅ shipped 2026-07-03)* — **M.** Shots are taken after the event round-trips a ~700 ms-spaced queue, so the frame is late (a click that opens a modal / navigates / changes state in place gets captured *after* its side effect — the target ends up occluded/changed under a correct box), and PNGs are heavy. **Fix (shipped) — three parts:** **(1) Cost** — capture **JPEG** (`captureVisibleTab {format:'jpeg', quality:80}`) instead of PNG (~5–10× smaller for UI screenshots; two shots/step); files are `shots/<id>.jpg`/`-post.jpg`, uploaded `image/jpeg` (the API stores by the multipart mimetype, so it flows through; the parked Phase-2 article engine still hardcodes an `image/png` data-URL — harmless, not in the live path). **(2) Snapshot closer to the event** — on **`pointerdown`** (before the click fires and triggers its side effect) the content script sends a `preCapture`; the background starts the snapshot *then* and stashes the **promise** by id; the `click` **awaits** it via `preShotId` (awaiting, not polling, avoids a race where `captureVisibleTab`'s 100–300 ms finishes after the ~150 ms click), so the target is still visible under the highlight. **The last input step reuses it too:** a text field's `change` fires on blur — caused by clicking the next control / the final submit — so the input event references that same click's pre-shot (peek, don't consume; both claim the one frame), fixing the "last field before the submit shows the *post*-submit state" case. No pointerdown (keyboard/Tab) → capture at event time; a stale id self-clears after 1.2 s; works across frames (R8), fixing e.g. an in-`iframe` "Pay" button. **(3) bbox↔scroll re-validation** — for the *fallback* (delayed) capture, the content script tags the event with the **scroll at bbox time**; the background re-checks the top frame's **current scroll** and **shifts the bbox by the delta** (or **omits** it if the element scrolled out of frame). A pre-click shot skips this (it already matches the bbox's moment). *(A further DPR-downscale via OffscreenCanvas would shrink Retina captures more — not done; JPEG is the bulk of the win.)*
- **R12 follow-ups — ⏸️ parked (not building now; revisit if needed).** R12 covers deliberate mouse-driven recording; two known boundaries remain, both fine for normal walkthroughs:
  - **(a) Keyboard/Tab pre-capture** — **S/M.** The pre-capture is triggered by **`pointerdown`**, so a field left via **Tab** or a form submitted via **Enter** gets no pre-shot and falls back to the (late) event-time capture. The browser order is symmetric — `keydown` (Tab/Enter) fires *before* the blur/submit — so the fix is to also fire a `preCapture` on `keydown`, **gated to navigation/action keys only** (Tab/Enter/Escape; never printable keys, or it floods the capture queue), and let the field's `change` + the keydown event reuse it via the existing machinery. **Low payoff:** intermediate Tab-hops are already fine (no side effect); realistically this only rescues *Enter-to-submit on the last field*.
  - **(b) Rate limit / rapid-fire clicks** — **M–L.** `chrome.tabs.captureVisibleTab` is hard-capped at **~2 shots/s**, so clicking faster than the queue drains still lags. Two levels: **(i) cheaper** — cut capture load (we snap an action **and** a post-action shot per click, but the post-action frame is only *rendered* for a workflow's **last** step; deferring/skipping non-terminal post-action screenshots ~halves the load and raises the ceiling — a heuristic, doesn't remove the cap); **(ii) proper fix** — replace `captureVisibleTab` with a **`chrome.tabCapture` video stream** (run in the offscreen doc alongside the mic) and **grab frames on demand** from it — no per-frame limit, exact-moment frames at pointerdown/click/keydown. This **supersedes most of the R12 pre-capture machinery** (with exact frames you don't need the pointerdown/await/reuse dance) but is a real rebuild (live stream = CPU/mem, `tabCapture` permission + user gesture, offscreen coordination). Only worth it if rapid-fire recording becomes real.
- **R13 — Ranked, multi-signal selectors** *(✅ shipped 2026-07-06)* — **M.** The slice captured only brittle positional `cssPath`/`xpath`; Phase 3 self-validation depends on resolving these months later. **Fix (shipped):** every event target now carries a **ranked `locators` set** (`{ strategy, value, unique }`), built **and uniqueness-verified against the live document at capture time** — the one moment both are knowable. Strategies best-first: `testid` (`data-testid`/`data-test-id`/`data-test`/`data-cy`/`data-qa`) → human-authored `id` (framework-generated ids — `ember123`, React `:r5:`, uuid/long-digit patterns — are **rejected**; they churn per deploy, so anchoring to one is worse than nothing) → `aria-label` → `name` → `placeholder` → `href` (links) → visible **text** (≤60 chars — the signal that survives redesigns); ranked **unique-first** (ambiguous locators kept lower as healing signals), with `cssPath`/`xpath` appended as last resorts (≤8 entries). Every value except `text` is a ready-to-run, escaped CSS selector; a selector that fails to match its own element at capture time is dropped rather than shipped broken. The `locators` field is **additive** on the capture contract (`shared` capture types + zod schema, mirrored in the extension's `types.ts`) so old bundles still validate; locator-healing/replay itself stays **Phase 3** (walk the list in order, first locator that still resolves wins). Logic verified against a real DOM (31 checks: ranking order, generated-id rejection, quote escaping, selector round-trip); **user-verified E2E 2026-07-06** (real recording → `manifest` events carry ranked `locators`).

**Recorder parking lot (→ Version 2 · D3, scope decision 2026-07-06):** pre-upload review (event count/thumbnails, discard); local draft/crash recovery (overlaps R2/R4); undo last event; per-workspace capture profile (event types + redaction list, fetched at connect); network/console capture (likely out of scope).

### P1-M12 — PII redaction (the B2B trust gate)
- **Client-side, before upload (R11) — ✅ core shipped.** Masks password values/regions (never captured) + `email`/`tel`, sensitive `autocomplete`, card/CVV/SSN/secret/token patterns, and host-marked `data-sync-redact`. *(Backlog: a "mask-all-by-default + per-field opt-in" pre-record toggle; pause-and-skip for sensitive screens.)*
- **Studio review-time redaction — backlog.** One-click blur of any screenshot region or text span, persisted to the artifact (e.g. a `redactions Json` on `Step`/`KnowledgeItem`).
- **Server-side backstop — split into two cuts:**
  - **Cut 1 (copilot-facing text) — ✅ shipped 2026-06-26.** At KB build the worker scrubs high-confidence structured PII (email / phone / card-with-Luhn / SSN) from everything the copilot reads — the persisted **transcript**, each **`KnowledgeItem.text`**, and the aligned **narration** — replacing it with typed placeholders (`[redacted-email]` …). Plus a **guardrail in the answer-engine prompt** (never emit personal data; the rule does **not** change coverage). High-PRECISION patterns (Luhn for cards, separator-required phones) so prices/dates/IDs/versions are never touched — no answer-quality regression. Impl: `@sync/synthesis` `redactText` (`src/redact.ts`), applied in `buildKB`. This closes the **end-user answer-leak** path.
  - **Cut 2 (pixels/DOM at rest) — deferred to Phase 2.** OCR screenshots + region-blur + DOM-attribute scrub for PII *displayed* on the page (captured in screenshot pixels / DOM, which the copilot does **not** surface but the **Phase-2 portal renders publicly**). See [`phase-2-portal.md`](phase-2-portal.md) §7. **Until Cut 2 lands, screenshots/DOM still hold pixels — test-account guidance remains the primary protection for those artifacts.**
- **Onboarding nudge:** "use a test/dummy account."

---

## 9. Privacy & redaction

A B2B sales gate — **elevated** in Phase 1 because the copilot speaks to the customer's end-users.

- **Never captured:** `type=password` values and their on-screen regions.
- **Masked by default (client-side, before upload):** input values; `email`/`tel`; sensitive `autocomplete` (cc-*, current/new-password, one-time-code); card/CVV/SSN/secret/token patterns; any host-marked **`data-sync-redact`** field.
- **PII in answers:** client masking is the first line; the **server text-scrub (P1-M12 Cut 1, §8)** is the second — it strips high-confidence structured PII from the transcript/KB-text/narration the copilot reads, so the **answer path is protected**. PII *displayed* in screenshots/DOM is scrubbed by **Cut 2 (Phase 2)**; until then test-account guidance covers those at-rest artifacts.
- **Data handling:** encryption at rest + in transit; per-workspace isolation; signed, expiring URLs. The **public embeddable key** is a separate, safe-in-client credential (origin allowlist + rate limit), distinct from the recorder's hashed secret token.

---

## 10. Non-functional requirements

- **Capture performance:** no visible jank on the host page; DOM snapshots sanitized + size-capped.
- **Copilot latency/cost:** quick answers for an end-user-facing surface; per-workspace LLM ceilings; consider streaming/caching; rate-limit per key to bound abuse/cost.
- **Embed isolation:** widget runs in shadow DOM (no style/JS collision); CORS scoped to the allowlist.
- **Reliability:** uploads retryable (no silent data loss); processing idempotent per session; approvals survive reprocess.
- **Security/tenancy:** per-workspace isolation; least-privilege artifact access.
- **Browser:** Chrome (MV3), current stable; graceful messaging on unsupported browsers.
- **Deploy:** runs locally via docker-compose (Postgres + Redis + MinIO) identically to prod (Render + R2); api binds `0.0.0.0`.

---

## 11. Risks / decisions to finalize

- **Grounding strictness (P1-M6):** tuning the decline threshold (honest vs. uselessly cautious) is the core quality knob; confidently-wrong answers are the trust-killer.
- **Decline threshold — settings control (PENDING / deferred 2026-06-29):** the Settings → "Grounding & trust" slider is UI-only and does **not** persist or affect answers yet. To make it real: (1) add `copilotDeclineThreshold Int @default(50)` to `Workspace`; (2) have `answerFromKB` emit a `confidence` (0–100) in its JSON schema + a prompt line rating how well the items cover the question, accept a `declineThreshold` input, and convert `covered && confidence < threshold` into a friendly decline; (3) persist via a `setCopilotDeclineThreshold` action + wire the slider (drop the "preview" note); (4) pass the value through **both** answer paths — `server.ts` (via `resolveCopilotKey`) and `copilot-preview-actions.ts`. Caveats: confidence is **model self-reported** (a heuristic dial, not a calibrated probability); a threshold-decline should still log a coverage gap. This mirrors the **"Cite the workflow used"** control shipped 2026-06-29 (same wiring pattern, plus the engine `confidence` addition).
- **Retrieval quality (P1-M6 / P1-M3 upgrade):** keyword-first vs. pgvector; embedding model + dimensions; folding conversation history + page context into retrieval. Deploy-target support is settled: **Render Postgres supports the `vector` extension (confirmed 2026-07-06)**.
- **Citation UX without leaking structure (P1-M6/M7):** Stage A has no articles to link, so a citation points to the workflow/step (e.g. a step thumbnail).
- **PII in answers (P1-M12):** **Cut 1 done** — the server text-scrub protects the copilot answer path; **Cut 2 (screenshot/DOM pixel redaction)** is the remaining piece, deferred to Phase 2 (needed before the public portal renders screenshots).
- **Embed security & cost (P1-M9):** public key + origin allowlist + rate limiting; per-workspace LLM ceilings; anonymous end-user session model.
- **Context mapping (P1-M8):** host routes vs. captured routes when paths differ (params/hashes); privacy of host-sent context.
- **Capture reliability internals (P1-M11):** nav re-arm + buffer durability; upload-retry bounds; audio finalize race; SW reconnect; iframe/multi-tab scope; event-vocabulary noise; selector robustness (defer healing to Phase 3).
- **Segmentation accuracy:** drives both the approval unit and retrieval grouping; markers + route boundaries reduce reliance on the LLM.
- **Cloud deploy (P1-M4):** validate the Dockerfiles/blueprint on the first real `docker build`/deploy; on deploy add the prod Studio origin to the extension manifest and set `STUDIO_URL`/`SYNC_API_URL`; host the widget bundle + set `SYNC_WIDGET_URL`.

---

## 12. End-to-end journey

1. **Sign up** at Studio → your workspace is created.
2. **Install** the Sync Recorder, click **Connect** → one click links it to your account.
3. **Record:** open your product, **Start**, narrate while clicking a workflow (use **Mark new workflow** between tasks), **Stop** — the recorder shows **REC → ↑ → ✓** and uploads (PII masked first; retry if it hiccups).
4. **Knowledge Base:** the worker transcribes, normalizes, and **segments**; the recording turns **`ready`**. Browse the KB page (transcript + items grouped by workflow).
5. **Approve for the copilot:** toggle **"approve for copilot"** on the workflows worth answering (one click each).
6. **Embed:** copy the **public key** + `<script>` snippet from Studio's copilot settings into your product; set the origin allowlist.
7. **Customers self-serve in-app:** an end-user opens the widget and asks; the copilot returns a **grounded, cited answer** biased to their current screen — or an **honest decline** that becomes a coverage gap.
8. **The loop compounds:** 👍/👎 + coverage gaps ("record this next") + more recordings grow the same workspace KB. *(The same KB also feeds articles + a portal as a Phase-2 by-product, and — later — self-validation.)*
