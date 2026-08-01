# FlowBuddy — Phase 1: Copilot (Plan · Spec · As-Built)

> **Phase 1 is the copilot, end-to-end — and it ships as the Version 1 release.** A SaaS records its product, **approves workflows for the copilot**, drops a `<script>` into its app, and its end-users get a chat widget that answers **grounded only in approved Knowledge Base content**, with citations and honest declines. **Decoupled** from the human-facing portal/articles (those are a [Version 2 by-product](portal.md)). This doc is the build plan, the acceptance spec, and the as-built record in one place.

- **Status:** **Built, verified locally, and deployed** — foundation **P1-M0…P1-M3** + copilot **P1-M5…P1-M12** built/core-done (per-module table in §5). **P1-M4 cloud deploy is done — and Version 1 is LIVE IN PRODUCTION at flowbuddyai.com since 2026-07-23** ([`deploy.md`](../ops/deploy.md): paid two-blueprint stack, worker folded into the api; dev stays at `https://flowbuddy-dev-web.onrender.com`, reset/test guide → [`e2e-testing.md`](../ops/e2e-testing.md) **Level 2**). Remaining Phase-1 work: only **P1-M12 PII Cut 2** (deferred to the V2 portal track) — **P1-M3 shipped 2026-07-07** as hybrid keyword+pgvector retrieval (§5 / §11). The **P1-M11 capture-reliability backlog is complete** (§8 — **R13 ranked locators shipped 2026-07-06** closing the original list; **R14 — idempotent upload identity + direct artifact streaming — landed 2026-07-27 and completed 2026-07-28** (§8·A — narration goes direct too, abandoned recordings are cleaned up, R2 + CORS proven on dev/Render; shipping to production with recorder **v0.7.0**); **R5** + the recorder UX parking lot → **V2·D3**).
- **Last updated:** 2026-07-27 · **Branch:** `dev`
- **Companion docs:** why copilot-first → [`product.md`](../product/product.md) §5 · roadmap/status → [`roadmap.md`](../roadmap.md) · technical model → [`architecture.md`](../product/architecture.md) · KB step distillation → [`kb-step-distillation.md`](kb-step-distillation.md) · manual E2E test plan → [`e2e-testing.md`](../ops/e2e-testing.md) · deploy → [`deploy.md`](../ops/deploy.md) · V2 portal by-products → [`portal.md`](portal.md) · local dev → [`dev-setup.md`](../ops/dev-setup.md) *(the Phase-1 visual map is §1.1 above)*
- **Grounding (Stage A):** the copilot grounds on **approved-KB** (`KnowledgeItem`s behind a per-workflow approval flag), **not** published articles. **Stage B** (also cite a published article when one exists) is **deferred**. *(These grounding "Stages" are within Phase 1 — not the product Phases 1/2/3.)*

---

## 1. Overview

Phase 1 is the whole loop: **record your product → it becomes an approved knowledge base → your
customers get grounded answers inside your app.** Four surfaces make that work — a Chrome recorder, an
ingestion API plus worker, the Studio console where a human approves what the copilot may say, and an
embeddable widget.

The one idea everything else serves: **the copilot answers only from workflows a human approved, and
declines honestly otherwise.** Approval is the product's trust boundary, and the reason a wrong answer
is a bug rather than an inherent property of the system.

How it runs, surface by surface: [`internals/`](../internals/README.md) — start at
[`connections.md`](../internals/connections.md), which traces one recording from a click to an answer.

---

## 2. Scope & definition of done

**In (Phase 1 — copilot):** Chrome-extension capture; ingestion/processing into the KB; **per-workflow approval gate**; **copilot answer endpoint** (conversational RAG over approved-KB; cite or decline → coverage gap); **embeddable widget + JS SDK**; **context API**; **embed auth & tenant scoping** (public key, origin allowlist, rate limit); **feedback loop & analytics**; **capture reliability** + **client-side PII redaction**; cloud deploy (last); workspace/auth baseline.

**Out (other phases / deferred):**
- **Help portal + article authoring/publishing** → **Version 2** ([`portal.md`](portal.md)) — decoupled by-products over the same KB.
- **Grounding Stage B** (also cite a published article) — deferred (a grounding stage, distinct from the product phases).
- **In-app actionability** — since delivered in later phases from this phase's captured data: the "show me" element highlight (P2-M3, ✅) and the guided walkthrough (P4-M0, ✅); executing workflows on the end-user's behalf → **Phase 4's acting modules** ([`agent.md`](agent.md)); the data exists.
- **Self-validation / sandbox / drift** → **Phase 3**.
- **Narration-only & video capture** → **Version 2**.
- Integrations & public API; i18n; multi-seat/roles; billing (free open-signup beta).

**Definition of done (= the Version 1 release):**
- [x] End-to-end: install → record → process → **approve for copilot** → embed snippet → end-user asks → grounded answer.
- [x] **Grounded answer with a citation** (source workflow/step) when approved-KB covers it; **honest decline + logged coverage gap** when it doesn't — **no hallucinations**.
- [x] **No-leak:** never retrieves/answers from un-approved or raw KB, even when asked directly.
- [x] **Scoped to the correct workspace** (public embeddable key + origin allowlist) and **rate-limited**.
- [x] **Context-aware** (biases to the host route; degrades gracefully) and **multi-turn**.
- [x] **PII-safe:** passwords never captured; input values masked by default **before upload**.
- [x] Every Q&A **logged** with answered/hit-miss + 👍/👎; Studio surfaces top questions + coverage gaps.
- [x] Works **without touching the portal/articles** (Version 2).
- [x] **Cloud deploy is the final step:** whole copilot built & verified locally first, then deployed.

---

## 3. Locked decisions & assumptions

| # | Decision |
|---|---|
| Capture model | **Event/DOM-primary.** Per-interaction event + DOM snapshot + hi-res screenshot + post-action snapshot (`expected_outcome`) + continuous audio. Events = ground truth. |
| Grounding substrate | The copilot grounds on **approved-KB** (`KnowledgeItem`s behind a per-workflow flag), **not** published articles. |
| Trust gate | A lightweight **per-workflow "approve for copilot"** flag (one click; reversible; audited) defines the answerable corpus. |
| Decline behavior | Conservative: when retrieval/grounding confidence is low, **decline + log a coverage gap** rather than guess. |
| Retrieval | **Hybrid** (P1-M3, 2026-07-07): keyword term-overlap ∪ pgvector cosine (`text-embedding-3-small` over `KnowledgeItem.text`), fused by RRF + the route signal; any vector failure degrades to keyword-only. |
| Embed identity | Per-workspace **public embeddable key** (`pk_…`, safe in client HTML), distinct from the recorder's secret token; **origin allowlist** (empty = any) + **rate limit** (per key). |
| Widget | Single `<script>` → shadow-DOM chat (launcher + panel); no host-framework lock-in; config via `data-flowbuddy-*` attrs. |
| Redaction | Client-side **before upload**; mask password/email/tel, sensitive `autocomplete`, card/CVV/SSN-like patterns, and host-marked `data-flowbuddy-redact`. Server backstop → backlog. |
| Recording scope | Primary tab **+ tabs opened from it** (R9 Option A, 2026-07-02); survives same-tab navigations incl. **cross-origin** (R1); upload retry on failure (R2). |
| Deploy | Render (Dockerized: api + worker + web) + Cloudflare R2; **executed last**, after the copilot works locally. |
| Workspace | Single-user = single-workspace in V1; multi-seat/roles later. Browser: Chrome-only (MV3). Beta: free, open signup. |

**Cadence:** one module at a time, each verified end-to-end, with a stop for review.

---

## 4. The four surfaces

| Surface | What it is | Mechanics |
|---|---|---|
| **Recorder** (Chrome MV3) | Captures narrated workflows — events, DOM fingerprints, screenshots, audio — and uploads them. | [`internals/recorder-capture.md`](../internals/recorder-capture.md) |
| **KB build** (worker) | Transcribes, cleans, segments and distills a raw capture into per-workflow steps. | [`internals/knowledge-base.md`](../internals/knowledge-base.md) |
| **Copilot** ⭐ | The headline: retrieval over approved KB → grounded answer with citations, or an honest decline. | [`internals/copilot.md`](../internals/copilot.md) |
| **Studio** | The builder's console — review, **approve**, configure the embed, read analytics. | [`internals/studio.md`](../internals/studio.md) |

Three decisions from building them that are not obvious from the code:

- **The Studio preview *is* the real widget**, running in an iframe host page. There was briefly a
  second answer path for it; collapsing them means there is exactly one path to audit, and a preview
  can never diverge from what customers see.
- **Appearance is live-served, not baked into the snippet.** The snippet carries only src, api and
  key, so a founder changing their accent colour doesn't have to re-paste anything. Explicit embed
  attributes still win, as deliberate per-page overrides.
- **The widget is an overlay and never touches host-page layout.** A dock-to-side mode that displaced
  the page was built and then discarded — displacing a customer's product is not ours to do.

---

## 5. Modules P1-M0…P1-M12

Status: [`roadmap.md`](../roadmap.md) §2. It is the only status surface.

---

## 6. The capture contract (session bundle)

The most important interface in Phase 1: exactly what the extension emits. Copilot retrieval, grounding, citations, and (later) self-validation all depend on this shape.

```jsonc
Session {
  id,                                   // the recorder-minted uploadId (UUID) — the recording's identity, stable across retries
  workspace_id, created_by, started_at, ended_at,
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
- **Transport (2026-07-27, completed 2026-07-28) — the bundle is no longer one all-or-nothing POST.** While recording, the recorder batches artifact paths to **`POST /v1/uploads/sign`** (recorder token; ≤100 paths per call) and PUTs each screenshot / DOM snapshot **directly to object storage** with a 900 s presigned URL — the api never touches those bytes. **The narration goes the same way**, at Stop rather than during capture (it only exists once the offscreen recorder reports), so on a healthy connection **the finalize request carries the manifest and nothing else**.
- **Identity + idempotency.** One recording = one `uploadId` (UUID), minted by the recorder when Record is pressed and carried on **`X-FlowBuddy-Upload-Id`** — `/v1/sessions` returns **400** without it. It rides a header, not the manifest, because parts stream to storage before the manifest part is parsed. Both routes resolve it to the same row via `@@unique([workspaceId, uploadId])`, so **a retry can never create a second recording**; a finalize arriving after the recording is built drains the body and replies `alreadyFinalized`.
- **Artifact allowlist.** Both routes validate every relative path against `shots/<name>.jpg|jpeg|png`, `dom/<name>.html`, `audio.webm`. A signed URL is a write capability, so the key is *validated*, never merely sanitized.
- **Degradation.** If signing fails (offline, auth, an older server), nothing is lost — unconfirmed artifacts simply ride the Stop bundle exactly as before. **The multipart bundle path is kept on purpose**, not leftover: it is the only way a browser that cannot reach object storage directly still delivers a complete recording, and it is why the finalize deadline stays a generous 300 s even though the healthy path sends kilobytes.
- **Cleanup.** Because artifacts upload *during* the capture, an abandoned recording has already written a row and objects — so discarding became a server-side act rather than just clearing a local buffer. Only a row still in `recording` may be discarded; a finalized one must be deleted in Studio. Mechanics, status codes and the sweep: [`internals/ingestion-api.md`](../internals/ingestion-api.md) §4.6.

---

## 7. Data model

The schema itself is [`packages/db/prisma/schema.prisma`](../../packages/db/prisma/schema.prisma), and the
table-by-table walkthrough is [`internals/data.md`](../internals/data.md). What belongs
here is only what the schema **cannot** say about itself — the invariants a migration could break
without any type error:

- **`@@unique([workspaceId, uploadId])` is the idempotency guarantee.** The recorder mints `uploadId`
  at Record, so both ingestion routes resolve to the same row and **a retry can never create a second
  recording**. Drop that constraint and the duplicate-recording bug returns.
- **`CopilotApproval` is keyed by `(sourceId, segmentIndex)`, not by item id** — which is precisely why
  approval **survives the worker's item delete-and-recreate on reprocess**. Re-keying it to items would
  silently un-approve every workflow on the next reprocess.
- **`KnowledgeItem.embedding` is nullable on purpose.** A row without a vector stays keyword-retrievable,
  so a failed embed degrades retrieval instead of hiding knowledge.
- **The copilot retrieves over `KnowledgeItem`s, never articles.** Approval is the only gate between the
  KB and an answer.
- **The answer text is deliberately not stored.** `CopilotQuery` keeps the question (PII-scrubbed on
  write), the outcome, and — since 2026-07-29 — how the answer was produced. Cited workflows are
  persisted separately; the prose is not.
- **Artifacts are private and reached only by signed, expiring URLs, in both directions** — read URLs
  for Studio and synthesis, and presigned PUT URLs so the recorder writes directly. A signed URL is a
  write capability, so the key is validated against an allowlist before it is built
  ([`internals/ingestion-api.md`](../internals/ingestion-api.md) §4.2).

**Async processing:** uploads enqueue onto Redis/BullMQ → the worker transcribes, cleans, segments and
distills → `ready`. The copilot answers **synchronously**. The enqueue's deliberate fragility-tolerance,
the two Redis connections and worker concurrency are one story, told in
[`internals/connections.md`](../internals/connections.md) Seam C.

---

## 8. Capture reliability & PII backlog (P1-M11 / P1-M12)

Brought into Phase 1 because **copilot answer quality = capture quality**, and PII is elevated (end-user-facing). The **core shipped**; the rest is the recorder/PII backlog below. Effort key: **S** ≈ <½ day, **M** ≈ 1–2 days, **L** ≈ 3+ days.

### P1-M11 — Capture reliability (recorder backlog R1–R14)

**Shipped.** One line each; the mechanics live in [`internals/recorder-capture.md`](../internals/recorder-capture.md), and `git log -- packages/extension` carries the full fix stories.

| R | Problem | Outcome |
|---|---|---|
| **R1** | A hard navigation lost every event after it | Re-arm flipped **push → pull**: each freshly loaded page self-arms via a `hello` handshake, any origin |
| **R2** | Upload failure wiped the buffer | Clear only on success; otherwise keep the buffer and offer Retry |
| **R3** | Long recordings dropped narration | Bounded 30–60 s finalize wait instead of a fixed 5 s |
| **R4** | MV3 worker eviction during quiet narration | 20 s keepalive from the top frame + an outbox that reconnects and retries in the same call |
| **R6** | Users record blind; a dead mic is found too late | Live WebAudio mic meter + pre-record permission flow |
| **R7** | Stop/marker/status needed the popup | Draggable shadow-DOM control bar in the top frame |
| **R8** | iframe UIs captured nothing | `all_frames:true`; bbox translated to top-document coords (cross-origin frames omit bbox rather than crop wrong) |
| **R9** | OAuth popups / new tabs lost capture | `Rec.tabIds` set; tabs opened **from** a recording tab are adopted via `openerTabId` |
| **R10** | Only click/change/submit/Enter captured | Debounced page-level scroll, dwell-gated hover on `aria-haspopup`, and modifier-combo keydowns |
| **R12** | Screenshots landed after the click's side effect | Pre-capture on `pointerdown`, awaited by the click; JPEG instead of PNG; bbox re-validated against scroll delta |
| **R13** | Only brittle positional selectors | Ranked multi-signal `locators`, uniqueness-verified at capture time — framework-generated ids rejected |
| **Stop→upload** | Silent, deadline-less upload pipeline | Persisted `phase` + alarms-backed recovery + a status pill on the page. **That pill deliberately reverses the 2026-07-01 "outcomes never render on the page" decision, for the stop moment only.** |

**R14 — idempotent upload identity + direct artifact streaming** *(✅ 2026-07-28, recorder v0.7.0)*. Worth keeping the root cause: a ~10-minute recording stalled at "Finishing…", the watchdog aborted on a flat 120 s deadline, the api committed the recording anyway, and the Retry the user was told to click produced a **second identical recording**. Two causes — `/v1/sessions` minted a fresh server-side id per request (nothing could collapse a retry), and the api awaited one object-storage round-trip **per file, serially, inside the multipart parse loop**, before creating the row or responding. The fix is an `uploadId` minted at Record (`@@unique([workspaceId, uploadId])`) plus presigned direct-to-storage artifact uploads. **The R2 checksum trap that nearly sank it is recorded in [`deploy.md`](../ops/deploy.md) §2.2** — it passes local dev and fails only in production.

**Still open.**

- **R5 — marker hotkey + labels** *(→ Version 2 · D3)* — **S.** [`architecture.md`](../product/architecture.md) calls the marker hotkey **"the main segmentation-quality lever"**, but there is no hotkey and markers carry no label. Deferred because markers are already droppable from the popup and the on-page bar; revisit only if segmentation quality needs the extra signal.
- **R12(a) — keyboard/Tab pre-capture** — **S/M.** Pre-capture triggers on `pointerdown`, so a field left via **Tab** or a form submitted via **Enter** falls back to the late event-time capture. The browser order is symmetric (`keydown` fires before blur/submit), so the fix is a `preCapture` on `keydown` **gated to Tab/Enter/Escape only** — never printable keys, or it floods the queue. Low payoff: this realistically only rescues *Enter-to-submit on the last field*.
- **R12(b) — rapid-fire clicks** — **M–L.** `captureVisibleTab` is hard-capped at **~2 shots/s**. Cheaper half-fix: the post-action frame is only rendered for a workflow's **last** step, so deferring non-terminal post-action shots roughly halves the load. Proper fix: replace `captureVisibleTab` with a **`chrome.tabCapture` video stream** and grab frames on demand — no per-frame limit, exact-moment frames. That **supersedes most of the R12 pre-capture machinery**, but it is a real rebuild (CPU/mem, new permission + user gesture, offscreen coordination). Only worth it if rapid-fire recording becomes real.

**Recorder parking lot (→ Version 2 · D3, scope decision 2026-07-06):** pre-upload review (event count/thumbnails, discard); local draft/crash recovery (overlaps R2/R4); undo last event; per-workspace capture profile (event types + redaction list, fetched at connect); network/console capture (likely out of scope).

### P1-M12 — PII redaction (the B2B trust gate)
- **Client-side, before upload (R11) — ✅ core shipped.** Masks password values/regions (never captured) + `email`/`tel`, sensitive `autocomplete`, card/CVV/SSN/secret/token patterns, and host-marked `data-flowbuddy-redact`. *(Backlog: a "mask-all-by-default + per-field opt-in" pre-record toggle; pause-and-skip for sensitive screens.)*
- **Studio review-time redaction — backlog.** One-click blur of any screenshot region or text span, persisted to the artifact (e.g. a `redactions Json` on `KnowledgeItem`).
- **Server-side backstop — split into two cuts:**
  - **Cut 1 (copilot-facing text) — ✅ shipped 2026-06-26.** At KB build the worker scrubs high-confidence structured PII (email / phone / card-with-Luhn / SSN) from everything the copilot reads — the persisted **transcript**, each **`KnowledgeItem.text`**, and the aligned **narration** — replacing it with typed placeholders (`[redacted-email]` …). Plus a **guardrail in the answer-engine prompt** (never emit personal data; the rule does **not** change coverage). High-PRECISION patterns (Luhn for cards, separator-required phones) so prices/dates/IDs/versions are never touched — no answer-quality regression. Impl: `@flowbuddy/synthesis` `redactText` (`src/redact.ts`), applied in `buildKB`. This closes the **end-user answer-leak** path.
  - **Cut 2 (pixels/DOM at rest) — deferred to Version 2 (rides with the portal).** OCR screenshots + region-blur + DOM-attribute scrub for PII *displayed* on the page (captured in screenshot pixels / DOM, which the copilot does **not** surface but the **V2 portal renders publicly**). See [`portal.md`](portal.md). **Until Cut 2 lands, screenshots/DOM still hold pixels — test-account guidance remains the primary protection for those artifacts.**
- **Onboarding nudge:** "use a test/dummy account."

---

## 9. Privacy & redaction

A B2B sales gate — **elevated** in Phase 1 because the copilot speaks to the customer's end-users.

- **Never captured:** `type=password` values and their on-screen regions.
- **Masked by default (client-side, before upload):** input values; `email`/`tel`; sensitive `autocomplete` (cc-*, current/new-password, one-time-code); card/CVV/SSN/secret/token patterns; any host-marked **`data-flowbuddy-redact`** field.
- **PII in answers:** client masking is the first line; the **server text-scrub (P1-M12 Cut 1, §8)** is the second — it strips high-confidence structured PII from the transcript/KB-text/narration the copilot reads, so the **answer path is protected**. PII *displayed* in screenshots/DOM is scrubbed by **Cut 2 (Version 2, portal track)**; until then test-account guidance covers those at-rest artifacts.
- **PII in questions (2026-07-27):** the end-user's own message is stored — the founder reads it back verbatim in the question log and in the coverage gap — so it runs through the same high-precision scrub before it is written. A card number typed into the chat never reaches the workspace owner's database or screen, while order ids, prices and dates survive. **Storage only:** retrieval and the model still see exactly what was typed, so the scrub cannot change an answer. Applied once, so the coverage-gap dedupe matches on the same text (a mismatch would file a fresh gap per repeat).
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
- **Decline threshold — a settings control that was designed and never built.** There is no such slider in Studio. To build it: add `copilotDeclineThreshold` to `Workspace`; have the engine emit a `confidence` (0–100) plus a prompt line rating how well the items cover the question, accept a `declineThreshold`, and turn `covered && confidence < threshold` into a friendly decline; persist it and wire the control. **Two caveats that make it less attractive than it looks:** confidence is *model self-reported* — a heuristic dial, not a calibrated probability — and a threshold-decline must still log a coverage gap, or the feedback loop goes blind exactly where quality is worst.
- **Retrieval quality (P1-M6 / P1-M3):** settled — hybrid keyword+vector, keyword fallback on every vector-path failure. The seam and its constants live in [`internals/copilot.md`](../internals/copilot.md). **Three things remain open and are recorded nowhere else:** folding **conversation history into the retrieval query** (today only the current question and the continuity bias reach it); an **ANN index (HNSW)** if a workspace ever exceeds tens of thousands of items; and the experiment below.

  **EXPERIMENT — make a workflow's DESCRIPTION searchable, not just attached.** The description
  itself is BUILT: a per-workflow prose "plan" (what the task achieves, what is optional, what has to
  be true first), written at KB build from the founder's narration and printed above that workflow's
  steps in both answer modes. What is NOT built is making it *findable*. Stored on the workflow row it
  is invisible to ranking — only step text is matched — so a workflow can still only be *found*
  through the wording of its UI actions. "Click Next: Add Knowledge Sources" matches almost nothing a
  user would type; the description, written in their language, would.

  Making it searchable means indexing it (most cheaply as a `KnowledgeItem` of its own `kind`, which
  rides the existing embed/keyword/vector/citation rails). The cost is that it then **competes with
  steps for the candidate budget**, and the failure mode is specific: a description wins a slot, its
  steps do not, and the copilot explains the task without saying what to click. The shape that avoids
  it is to let a description *earn* its workflow a place but never *cost* that workflow its steps —
  index it, then force-include it for any workflow already represented, outside the step budget.

  **Not needed yet, and the trigger is measurable.** Retrieval only chooses when the KB exceeds the
  candidate budget; below that nearly everything reaches the prompt whatever is asked, so findability
  cannot be the bottleneck. Revisit when the copilot starts declining, or answering from the wrong
  workflow, on questions you know are covered. Storing the description on the workflow row does not
  block any of this — it would be added, not replaced.
- **Citation UX without leaking structure (P1-M6/M7):** Stage A has no articles to link, so a citation points to the workflow/step (e.g. a step thumbnail).
- **PII in answers (P1-M12):** **Cut 1 done** — the server text-scrub protects the copilot answer path; **Cut 2 (screenshot/DOM pixel redaction)** is the remaining piece, deferred to Version 2 (needed before the public portal renders screenshots).
- **Embed security & cost (P1-M9):** public key + origin allowlist + rate limiting; per-workspace LLM ceilings; anonymous end-user session model.
- **Context mapping (P1-M8):** host routes vs. captured routes when paths differ (params/hashes); privacy of host-sent context.
- **Capture reliability internals (P1-M11):** nav re-arm + buffer durability; upload-retry bounds; audio finalize race; SW reconnect; iframe/multi-tab scope; event-vocabulary noise; selector robustness (defer healing to Phase 3).
- **Segmentation accuracy:** drives both the approval unit and retrieval grouping; markers + route boundaries reduce reliance on the LLM.
- **Cloud deploy (P1-M4): ✅ done** — dev env rebuilt 2026-07-17, **prod launched 2026-07-23**; the blueprint/env/extension-rebuild mechanics live in [`deploy.md`](../ops/deploy.md).

---

## 12. End-to-end journey

One recording from a click to an answer, with the seams named:
[`internals/connections.md`](../internals/connections.md) §2.
