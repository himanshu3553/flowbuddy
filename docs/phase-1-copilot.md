# Sync — Phase 1: Copilot (Plan · Spec · As-Built)

> **Phase 1 is the copilot, end-to-end — and it ships as the Version 1 release.** A SaaS records its product, **approves workflows for the copilot**, drops a `<script>` into its app, and its end-users get a chat widget that answers **grounded only in approved Knowledge Base content**, with citations and honest declines. **Decoupled** from the human-facing portal/articles (those are [Phase 2](phase-2-portal.md)). This doc is the build plan, the acceptance spec, and the as-built record in one place.

- **Status:** **Built & verified locally** — foundation **P1-M0…P1-M3** + copilot **P1-M5…P1-M12** built/core-done (per-module table in §5). The one remaining step is **P1-M4 cloud deploy** — config-ready, executed last, gated on the user's Render/R2 accounts.
- **Last updated:** 2026-06-25 · **Branch:** `copilot`
- **Companion docs:** why copilot-first → [`product.md`](product.md) §5 · roadmap/status → [`roadmap.md`](roadmap.md) · technical model → [`architecture.md`](architecture.md) · Phase 2 by-products → [`phase-2-portal.md`](phase-2-portal.md) · local dev → [`dev-setup.md`](dev-setup.md)
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
| Recording scope | Single tab; survives same-tab navigations (R1); upload retry on failure (R2). |
| Deploy | Render (Dockerized: api + worker + web) + Cloudflare R2; **executed last**, after the copilot works locally. |
| Workspace | Single-user = single-workspace in V1; multi-seat/roles later. Browser: Chrome-only (MV3). Beta: free, invite-only. |

**Cadence:** one module at a time, each verified end-to-end, with a stop for review.

---

## 4. The four surfaces (as built)

### 4.1 Sync Recorder (Chrome extension) — Module 1: Capture
**Connect with Sync** — the popup's **Connect** opens Studio's `/connect` (already signed in); one click mints a workspace token **server-side** and hands it + the API URL back via a content-script bridge — **no tokens/URLs typed**. The popup then shows **"✓ Connected as you@email"**; recording is disabled until connected.

**Recording controls** — **Start/Stop** the active tab; **Mark new workflow** drops a marker (one recording → multiple workflows; the strongest segmentation signal); **Grant microphone** via a guided flow.

**What gets captured (event/DOM-primary)** — for each meaningful interaction (click, input, submit, Enter, SPA nav): the **event** (type, timestamp, masked value), **element semantics** (role, accessible name, text, tag, CSS path, XPath, bbox, attributes), **route** (URL/path/hash/title — *also powers context awareness*), a **hi-res screenshot**, a **DOM snapshot** (scripts/styles stripped, size-capped), a **post-action snapshot** after the page settles (the basis for `expected_outcome` and future self-validation), and **continuous narration audio**.

**Recording feedback (no silent failures)** — toolbar badge cycles **`REC` → `↑` → `✓`/`!`**; popup shows a blinking **REC**; a non-blocking on-page toast for *started/uploaded/failed*; and every outcome surfaces — including **zero interaction events** (e.g. an iframe-only UI).

**Capture reliability (P1-M11 core)** — survives full-page navigations (R1), keeps the bundle + offers **Retry** on upload failure (R2), longer finalize fallback so long recordings keep narration (R3). *(Backlog: §8.)*

**PII redaction by default (P1-M12 core)** — before upload, masks `password` values/regions (never captured), plus `email`/`tel`, sensitive `autocomplete` (cc-*, current/new-password, one-time-code), card/CVV/SSN/secret/token field patterns, and any host-marked **`data-sync-redact`** field. *(Backlog: §8.)*

**Known limits (Phase 1):** single active tab; top frame only (iframe UIs surfaced as a zero-event failure, not silent); server-side PII backstop not yet built.

### 4.2 Knowledge Base — Module 2
**One cumulative KB per workspace** (not per recording) — every recording compounds into the same KB; each item links to both its source recording (provenance) and its workspace.

Stores **`KnowledgeSource`** (one per recording: kind, app URL, status, persisted transcript, raw manifest) and **`KnowledgeItem`** (the normalized, indexed unit — in V1 a **step item** per interaction, with searchable text, the captured event, selector/route/screenshot/expected-outcome, and aligned narration).

**The worker** (on upload): transcribes narration (`whisper-1`, persisted) → normalizes each interaction into a `KnowledgeItem` with aligned narration → **segments** into candidate workflows (markers → route changes → narration cues → LLM) and tags each item with its workflow title → sets status **`ready`**. It **stops at `ready`** (curated model; approval and article generation are separate explicit steps). Items are indexed by text for **keyword/LLM retrieval**, workspace-wide.

### 4.3 In-App Copilot ⭐ — the primary KB consumer (the headline)
*Grounds directly on the approved subset of the KB (Module 2) — parallel to, and independent of, Module 3 article creation (Phase 2).*
- **Approval gate (P1-M5):** a per-**workflow** "approve for copilot" toggle in the KB browser; the **enforcement seam** — retrieval filters to approved items only.
- **Answer endpoint (P1-M6):** `POST /v1/copilot/answer` retrieves over **approved-KB**, returns a structured **grounded answer + citations** or an **honest decline** (→ `CoverageGap`, `source=copilot`); multi-turn.
- **Widget & SDK (P1-M7):** `sync-copilot.js` (esbuild → ~5 kB IIFE); shadow-DOM launcher + chat panel; config via `data-sync-*`; renders answers + citations + decline/error states; `demo/index.html` for local testing.
- **Context API (P1-M8):** the widget sends `location.pathname`; retrieval **boosts** items whose captured route matches the page; **soft boost** — biases, never excludes.
- **Embed auth (P1-M9):** the API authenticates via **`X-Sync-Key`** → resolve key → workspace; enforce **origin allowlist** (CORS + server, empty=any); **rate-limit** 30/min/key. Unknown/missing → 401, disallowed origin → 403, over limit → 429; key rotatable in Studio.
- **Feedback & analytics (P1-M10):** every question is logged with its outcome (`CopilotQuery`: question + answered + thumbs; returns `queryId`); widget renders **👍/👎** → `POST /v1/copilot/feedback` (tenant-scoped); Studio shows **Copilot activity** + unified **coverage gaps** ("record this next").

### 4.4 Studio (Dashboard + Editor) — the builder's console
- **Accounts:** email+password (self-hosted, JWT); sign-up auto-creates the workspace; single-user = single-workspace; full tenant isolation.
- **Dashboard:** Recordings & KB (status `uploaded → processing → ready` → KB page with transcript, items by workflow, **approve-for-copilot** toggles); **Copilot** (`/dashboard/copilot`: public key, copyable embed snippet, origin allowlist + rotate, Copilot activity + coverage gaps).
- **By-product (Phase 2):** Auto Generate Articles, Text → Article, and the article editor — see [`phase-2-portal.md`](phase-2-portal.md).

> **Help Portal** is a **Phase 2 by-product** (decoupled) — [`phase-2-portal.md`](phase-2-portal.md).

---

## 5. Modules P1-M0…P1-M12

| # | Module | Done when | Status (build) |
|---|---|---|---|
| **P1-M0** | Monorepo, infra & auth | Postgres/R2/Redis/Auth.js/api/worker + multi-tenancy in place | ✅ (legacy M0/M1) |
| **P1-M1** | Recorder / workflow capture | extension emits the full session bundle (§6) with client redaction | ✅ (legacy M2) |
| **P1-M2** | Knowledge Base | captures normalize → `KnowledgeSource`+`KnowledgeItem` + transcript + segmentation + keyword index | ✅ (legacy M3/M6) |
| **P1-M3** | Retrieval & grounding engine | shared retrieve → ground → answer-or-decline engine | ✅ built; 🔄 pgvector upgrade pending (legacy M7/M11-retrieval) |
| **P1-M4** | **Cloud deploy** (Render + R2) | the stack is live; copilot API + widget serve from the deployed origin | 🔄 **config ready** (Dockerfiles + `render.yaml`, 2026-06-23); deploy = user's Render/R2 accounts; **executed last** |
| **P1-M5** | **Approval gate** | builder marks a workflow "approved for copilot"; only approved items are eligible; reversible + audited; survives reprocess | ✅ **built** 2026-06-23 |
| **P1-M6** | **Answer endpoint** | grounded answer (cite workflow/step) from **only** approved-KB, or honest decline → `CoverageGap`; multi-turn | ✅ **built** 2026-06-23 — verified incl. no-leak |
| **P1-M7** | **Embeddable widget & SDK** | one `<script>` renders a working chat that talks to P1-M6 + shows citations | ✅ **built** 2026-06-23 — first end-to-end demo |
| **P1-M8** | **Context API** | widget reports host route; copilot biases to "where the user is"; degrades gracefully | ✅ **built** 2026-06-23 |
| **P1-M9** | **Embed auth & tenant scoping** | public key + origin allowlist; scoped, rate-limited; end-user sessions | ✅ **built** 2026-06-23 — 401/403/429 verified |
| **P1-M10** | **Feedback loop & analytics** | every Q&A logged + thumbs; Studio surfaces top questions + coverage gaps | ✅ **built** 2026-06-23 |
| **P1-M11** | **Capture reliability** | no recording the user made is silently lost (nav/upload/audio) | 🔄 **core** (R1/R2/R3) 2026-06-23; R4/iframe/multi-tab → §8 backlog |
| **P1-M12** | **PII redaction** | passwords never captured; values masked by default before upload | 🔄 **core** (client masking) 2026-06-23; review-time + server backstop → §8 backlog |

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
  type,                                 // click | input | submit | nav | keydown(Enter)  (scroll/hover = R10 backlog; markers ride in markers[], not as events)
  target: { role, accessible_name, text, tag, attributes_subset,
            css_path, xpath,            // multi-signal selector
            bbox: { x, y, w, h },       // viewport coords -> crop + highlight
            frame_path? },              // iframe chain, if applicable
  value?,                               // redacted/masked input value
  route: { url, path, hash, title },    // powers the copilot context bias
  dom_snapshot_ref, screenshot_ref,
  post_action?: { screenshot_ref, dom_snapshot_ref, route,
                  settle_reason }       // mutation_quiet | timeout  (network_idle = planned)
}
```

- **Selectors are multi-signal**; brittle CSS alone is never the only signal.
- **DOM snapshots are sanitized + size-capped** at capture (redaction first).
- **`route`** is matched against the host's current page for context bias (§4.3).
- **`post_action`** makes `expected_outcome` possible and seeds Phase 3 validation — do not skip it.

---

## 7. Data model

All **additive** on the foundation schema (`Workspace / ApiToken / KnowledgeSource / KnowledgeItem / Article / Step / CoverageGap`):

- **KB:** `KnowledgeSource` (kind, appBaseUrl, status, persisted `transcript`, manifest) → `KnowledgeItem[]` (kind `step|topic`, `text` index field, `data` payload, `segmentIndex`/`segmentTitle`). The copilot retrieves over `KnowledgeItem`s, not articles.
- **Approval (P1-M5):** a first-class **`CopilotApproval`** row keyed by `(sourceId, segmentIndex)` (with a `workspaceId` scoping column) — **survives** the worker's item delete+recreate on reprocess. (The enforcement seam P1-M6 retrieves through.)
- **Copilot embed/config (on `Workspace`):** `copilotPublicKey` (unique, `pk_…`) + `copilotAllowedOrigins[]`. *(The widget's title + greeting are client-side `data-sync-title` / `data-sync-greeting` embed attributes — not stored server-side; there is no theme setting.)*
- **Copilot logs (P1-M10):** **`CopilotQuery`** (question, answered, feedback `up|down|null` — the question + outcome + thumbs; the answer text and citations are returned to the widget but **not** persisted) + **`CoverageGap.source`** discriminator (`prompt | copilot`).
- **Optional:** `KnowledgeItem.embedding vector` (pgvector) for the P1-M3 semantic-retrieval upgrade.
- **Binary artifacts** (screenshots, audio, DOM snapshots) in S3-compatible storage (MinIO local / R2 prod) under `workspaces/<ws>/sessions/<id>/…`; per-workspace isolation; signed, expiring URLs; the api auto-creates the bucket on boot.

**Async processing:** uploads enqueued (Redis + BullMQ) → background worker (transcribe → KB → segment → `ready`). The copilot answers **synchronously** over the answer endpoint.

---

## 8. Capture reliability & PII backlog (P1-M11 / P1-M12)

Brought into Phase 1 because **copilot answer quality = capture quality**, and PII is elevated (end-user-facing). The **core shipped**; the rest is the recorder/PII backlog below. Effort key: **S** ≈ <½ day, **M** ≈ 1–2 days, **L** ≈ 3+ days.

### P1-M11 — Capture reliability (recorder backlog R1–R13)

**A. No silent data loss** *(lose nothing the user recorded — highest priority)*
- **R1 — Survive full-page navigations** *(✅ core shipped)* — **M.** A hard nav re-injected a fresh content script that nothing re-armed, so events after the nav were lost while audio kept going. **Fix (shipped):** a background `tabs.onUpdated`/`webNavigation` listener scoped to the recording tab re-arms `content.js` with the **original** `startTime` so the `t` timeline stays continuous; optional synthetic `nav` event at the boundary.
- **R2 — Don't destroy the bundle on upload failure; retry** *(✅ core shipped)* — **S.** `finalize()` used to `kvClear()` unconditionally, wiping the IDB buffer before the upload result. **Fix (shipped):** only clear on a **successful** upload; otherwise keep the buffer, set the `fail` badge, and offer **Retry** in the popup (bounded to one pending bundle).
- **R3 — Protect audio on long recordings** *(✅ core shipped)* — **S/M.** A fixed 5s finalize fallback could run before MediaRecorder finished encoding, dropping narration (the moat). **Fix (shipped):** a longer bounded wait (30–60s) + "still finalizing…" state; consider chunked audio-to-IDB so partial audio survives a crash.
- **R4 — Service-worker-eviction resilience (MV3)** — **M.** *(backlog)* During quiet narration the MV3 SW can be evicted and the capture port drops. **Fix:** detect `port.onDisconnect` in the content script and reconnect, buffering events locally and flushing on reconnect; optionally a `chrome.alarms` keep-warm heartbeat.

**B. Coverage** *(capture more app types — backlog)*
- **R8 — iframe / cross-frame capture** — **L.** Content scripts are `all_frames:false`, so iframe UIs (Stripe, embedded editors, chat widgets) capture nothing. **Fix:** `all_frames:true`, coordinate per-frame events with the top frame (frame id + offset), populate `target.frame_path`, resolve bbox/screenshot coords across the chain (cross-origin frames are constrained — prioritize same-origin).
- **R9 — Multi-tab / popup workflows** — **L.** Capture is bound to one `tabId`; OAuth popups / "open in new tab" lose capture. **Fix:** track a set of tabs in the session and merge their events; or detect + cleanly message the limit (no silent loss).
- **R10 — Scroll / hover / richer keyboard** — **M.** Only click/change/submit/Enter/popstate are handled. **Fix:** a debounced scroll event, optional hover capture for menus, a small shortcut allowlist — kept semantic/low-noise.

**C. Recorder UX & segmentation** *(ride-along — backlog)*
- **R5 — Marker hotkey + labels** — **S.** Architecture calls the marker hotkey "the main segmentation-quality lever," but there's no hotkey and markers carry no label. **Fix:** a `commands` entry (e.g. `Alt+Shift+M`) + optional one-line label, surfaced to the worker's segmentation.
- **R6 — Live mic level meter + pre-flight** — **S.** Users record blind; a dead mic is found only after a wasted session. **Fix:** a WebAudio `AnalyserNode` level streamed to a meter; block/warn loudly on `getUserMedia` denial.
- **R7 — On-page floating control bar** — **M.** Stop/marker/status require opening the popup. **Fix:** a draggable shadow-DOM bar (timer, event count, mic meter R6, Marker R5, Pause/Resume, Stop).
- **Pause / resume** — **S/M.** Pause for sensitive screens/breaks; needs timeline-gap handling; pairs with R7.

**D. Capture quality** *(accuracy & Phase-3 enablers — backlog)*
- **R12 — Screenshot timing & cost** — **M.** Shots are taken after the event round-trips a 700ms-spaced queue, so on rapid clicks/scroll the bbox can mismatch; PNGs are heavy. **Fix:** snapshot scroll+bbox closer to the event; DPR-aware JPEG/WebP for non-highlight context; re-validate bbox against scroll.
- **R13 — Ranked, multi-signal selectors** — **M.** The slice captures brittle positional `cssPath`/`xpath`; Phase 3 self-validation depends on resolving these months later. **Fix:** capture a **ranked locator set** preferring stable `id`/`data-testid`/`aria`. **Not beta-blocking** (highlights use bbox, articles aren't re-run yet) — harden *capture* here, defer locator-healing/validation to **Phase 3**.

**Recorder parking lot (post-Phase-1):** pre-upload review (event count/thumbnails, discard); local draft/crash recovery (overlaps R2/R4); undo last event; per-workspace capture profile (event types + redaction list, fetched at connect); network/console capture (likely out of scope).

### P1-M12 — PII redaction (the B2B trust gate)
- **Client-side, before upload (R11) — ✅ core shipped.** Masks password values/regions (never captured) + `email`/`tel`, sensitive `autocomplete`, card/CVV/SSN/secret/token patterns, and host-marked `data-sync-redact`. *(Backlog: a "mask-all-by-default + per-field opt-in" pre-record toggle; pause-and-skip for sensitive screens.)*
- **Studio review-time redaction — backlog.** One-click blur of any screenshot region or text span, persisted to the artifact (e.g. a `redactions Json` on `Step`/`KnowledgeItem`).
- **Server-side backstop — backlog.** OCR screenshots + scrub DOM text for high-confidence PII (emails/phone/card/SSN-like) on ingest → blur/scrub. **Screenshots still capture pixels until this lands — test-account guidance remains the primary protection.**
- **Onboarding nudge:** "use a test/dummy account."

---

## 9. Privacy & redaction

A B2B sales gate — **elevated** in Phase 1 because the copilot speaks to the customer's end-users.

- **Never captured:** `type=password` values and their on-screen regions.
- **Masked by default (client-side, before upload):** input values; `email`/`tel`; sensitive `autocomplete` (cc-*, current/new-password, one-time-code); card/CVV/SSN/secret/token patterns; any host-marked **`data-sync-redact`** field.
- **PII in answers:** approved-KB may still contain captured PII — redaction at capture is the first line; the **server OCR/DOM backstop** (§8 backlog) is the real protection before external beta.
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
- **Retrieval quality (P1-M6 / P1-M3 upgrade):** keyword-first vs. pgvector; embedding model + dimensions; folding conversation history + page context into retrieval; confirm the deploy target's Postgres supports the `vector` extension.
- **Citation UX without leaking structure (P1-M6/M7):** Stage A has no articles to link, so a citation points to the workflow/step (e.g. a step thumbnail).
- **PII in answers (P1-M12):** approved-KB may contain captured PII; the server backstop is the real protection before external beta.
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
