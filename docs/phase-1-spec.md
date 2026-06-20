# Sync — Phase 1 Build Spec

> **The wedge:** record once → good structured articles → published help portal, in under an hour, with no manual writing required. This document is the buildable detail for Phase 1. Strategy/context lives in the [PRD](PRD.md).

- **Status:** Draft v0.1
- **Last updated:** 2026-06-18
- **Scope:** Phase 1 only. Copilot (Phase 2) and self-validation (Phase 3) are out of scope but the data captured here must not preclude them.
- **Build approach (decided 2026-06-18):** port the validated [spike](SPIKE.md) (verdict: GO) into a fresh **monorepo** and ship a **thin slice first** — see [`phase-1a-plan.md`](phase-1a-plan.md). Stack: Node/TS · Next.js · Postgres · Redis/BullMQ · Auth.js (self-hosted). Deploy: Render (Dockerized) + Cloudflare R2.
- **Architecture (frozen 2026-06-19):** Phase 1 follows the **3-module model** — **Capture → Knowledge Base → Article creation** ([`architecture.md`](architecture.md)). Capture now includes a **narration-only** mode (1.2); articles are generated from an explicit **KB** (`KnowledgeSource` + `KnowledgeItem` + transcript + keyword/LLM index) via **auto** or **prompt**.

---

## Table of contents

1. [Goal & definition of done](#1-goal--definition-of-done)
2. [Scope: in / out](#2-scope-in--out)
3. [Locked decisions & assumptions](#3-locked-decisions--assumptions)
4. [Primary user journey](#4-primary-user-journey)
5. [Functional spec by surface](#5-functional-spec-by-surface)
   - [5.1 Chrome Extension (Recorder)](#51-chrome-extension-recorder)
   - [5.2 Ingestion & processing](#52-ingestion--processing)
   - [5.3 Synthesis](#53-synthesis)
   - [5.4 Prompt-to-article](#54-prompt-to-article)
   - [5.5 Studio](#55-studio)
   - [5.6 Help Portal](#56-help-portal)
6. [The capture contract (session bundle)](#6-the-capture-contract-session-bundle)
7. [Content & storage model](#7-content--storage-model)
8. [Privacy & redaction](#8-privacy--redaction)
9. [Non-functional requirements](#9-non-functional-requirements)
10. [Build sequence (milestones)](#10-build-sequence-milestones)
11. [Phase 1 open items & risks](#11-phase-1-open-items--risks)

---

## 1. Goal & definition of done

**Goal:** A founder signs up, installs the extension, records one narrated session covering several workflows, reviews/edits the drafts, and publishes a live, searchable help portal — in under an hour, with no manual writing required.

**Definition of done (Phase 1 ships when all are true):**
- [ ] End-to-end journey works: install → record → process → review/edit → publish → public portal.
- [ ] A single recording covering ≥3 workflows is auto-segmented into ≥3 draft articles.
- [ ] **≥80% of generated steps are accepted with only minor edits** (primary quality bar).
- [ ] **Time-to-first-published-portal < 1 hour** for a first-time user.
- [ ] Prompt-to-article returns a grounded article when coverage exists, and **declines + logs a coverage gap** when it doesn't (no hallucinated steps).
- [ ] PII redaction works: password fields never captured; manual redaction available; no raw PII in stored artifacts by default.
- [ ] Published portal is browsable and searchable on a Sync subdomain.

---

## 2. Scope: in / out

**In:** Chrome extension capture; ingestion/processing; synthesis into structured articles; prompt-to-article; Studio (review, edit, organize, publish); public help portal; client-side redaction; workspace/auth baseline; coverage-gap signal foundations.

**Out (later phases):** in-app copilot; self-validation/sandbox/drift; integrations & public API; i18n; deflection analytics; custom domains; gated/private portals; billing (free beta).

---

## 3. Locked decisions & assumptions

| # | Decision |
|---|---|
| Capture model | **Event/DOM-primary.** Per-interaction event + DOM snapshot + hi-res screenshot + post-action snapshot (`expected_outcome`) + continuous audio + optional low-fps context video. Events = ground truth; video = secondary aid. |
| DOM depth | Capture enough DOM/accessibility data for robust selectors + redaction, sanitized client-side — not full-page dumps. |
| Redaction | Client-side **before upload**; strong defaults + one-click manual redaction + "use a test account" nudge. |
| Recording scope | Single tab; follows same-tab navigations. |
| Segmentation | Auto-propose → human confirms (drafts). |
| Prompt-to-article | Conservative: decline + coverage gap rather than stitch a shaky article. |
| Usage caps | Placeholder founder-tier caps; **TBD with pricing**. |
| Portal hosting | Subdomain (`yourco.synchelp.app`), **public-only** in v1. Custom domain + gating are fast-follow. |
| Editor depth | Structured step-card editing + manual screenshot retake; **no step-level re-record**. |
| Search | Hybrid (reuse prompt-to-article embeddings). |
| Monetization | **Free invite-only beta**; billing out of Phase 1 build. |
| Browser / dist | Chrome-only (MV3); unlisted Web Store listing. |
| Workspace | Multi-seat, minimal roles (owner/editor). |

---

## 4. Primary user journey

1. **Onboard** — sign up, create workspace, install extension, sign extension into workspace.
2. **Record** — open product, start recording, narrate through several workflows (use the marker hotkey to signal "new workflow"), stop.
3. **Process** — Sync transcribes, segments, extracts/crops screenshots, redacts, and synthesizes draft articles. User is notified when drafts are ready.
4. **Review & edit** — in Studio: confirm segmentation, edit step text, reorder/merge/split, retake/redact screenshots, set brand voice + theme. Optionally prompt-to-article and hand-write static pages.
5. **Publish** — one click publishes selected articles to the public portal on a subdomain.

---

## 5. Functional spec by surface

User stories use: **As a** \<role\> **I want** \<capability\> **so that** \<value\>, followed by acceptance criteria (AC).

### 5.1 Chrome Extension (Recorder)

**US-EXT-1 — Record a session.** As a founder I want to start/stop/pause recording of the current tab with mic narration so that I can capture my workflows effortlessly.
- AC: Start/stop/pause controls; persistent recording indicator; mic level shown; recording survives in-app (same-tab) navigations.
- AC: Audio is captured continuously for the whole session.

**US-EXT-1b — Narration-only capture (Module 1.2).** As a founder I want to record audio-only (no clicking) so that I can create conceptual articles (policies, FAQs, "what is X").
- AC: an audio-only mode that uploads even with **zero interaction events** (just audio ± an optional context screenshot); the source is marked `kind = narration`.
- AC: the narration path produces a `static` (explainer) article, grounded in the transcript — never general knowledge.

**US-EXT-2 — Capture interactions as ground truth.** As the system I need to capture each meaningful interaction with full semantic context so that synthesis is accurate and steps are self-validatable later.
- AC: For each interaction event, capture: event type, target element (role, accessible name, text, tag, css_path, xpath, bbox, iframe path), route, DOM snapshot, hi-res screenshot. (See [capture contract](#6-the-capture-contract-session-bundle).)
- AC: Capture a **post-action snapshot** (screenshot + DOM + route) after the DOM settles (mutation quiet) or network idle, capped by a timeout.
- AC: Capture overhead must not visibly jank the host page.

**US-EXT-3 — Mark workflow boundaries.** As a founder I want a hotkey/button to mark "a new workflow starts here" so that segmentation is accurate.
- AC: Marker events are recorded with timestamp and optional label; markers are hard boundaries for segmentation.

**US-EXT-4 — Redact before anything leaves my browser.** As a founder I want sensitive data masked locally so that I can record against real data safely.
- AC: Password-type inputs are **never** captured (value or screenshot region).
- AC: Input values masked by default; user can opt specific fields back in.
- AC: Pre-record "mask this field/region" controls; pause-and-skip for sensitive screens.
- AC: All redaction is applied **before upload**. (See [§8](#8-privacy--redaction).)

**US-EXT-5 — Upload the session.** As the system I need to upload the session bundle reliably so that processing can begin.
- AC: Chunked/resumable upload via signed URLs; progress shown; user is linked to the processing status in Studio.
- AC: Optional low-fps/low-res context video uploaded as a secondary asset.

### 5.2 Ingestion & processing

**US-PROC-1 — Transcribe narration.** AC: Audio → timestamped transcript; transcript segments aligned to the event timeline by timestamp.

**US-PROC-2 — Segment into workflows.** AC: Produce candidate article boundaries using (priority order) user markers → route changes → narration topic cues → LLM topic segmentation. Each candidate becomes a draft article.

**US-PROC-3 — Prepare screenshots.** AC: For each step, crop the screenshot to the target element bbox with padding and apply a highlight (box/arrow); keep the full-frame original too. Honor device pixel ratio.

**US-PROC-4 — Apply server-side redaction backstop.** AC: OCR screenshots and scrub DOM text for high-confidence PII patterns (emails, phone, card/SSN-like) as a backstop to client-side redaction; blur detected regions.

### 5.3 Synthesis

**US-SYN-1 — Generate structured articles.** As the system I want to fuse transcript (why) + events (what) + screenshots (visual) into the [structured content model](#7-content--storage-model) so that articles are accurate and editable.
- AC: Each segment → an Article with title, intent, tags, routes, preconditions, and ordered Steps.
- AC: Each Step has: instruction (from the event/element), rationale (from nearby narration), screenshot (cropped+highlighted), selector (multi-signal), route, and expected_outcome (from the post-action snapshot).
- AC: Trivial/noise events (incidental scroll, focus) are collapsed; only meaningful steps surface.
- AC: Articles are created as **drafts** with `source = recording_auto`, `type = workflow-backed`.

### 5.4 Prompt-to-article

**US-PTA-1 — Author by topic, grounded in recordings.** As a founder I want to type a topic and get an article assembled only from my recordings so that I can fill specific gaps fast.
- AC: A searchable index exists over the **Knowledge Base** (`KnowledgeItem.text`) — **keyword/LLM retrieval first, pgvector embeddings later** (decided 2026-06-19).
- AC: On prompt, retrieve the relevant `KnowledgeItem`s (across captures), then synthesize an article via the same synthesis path; `source = prompt_grounded` (`type` = `workflow-backed` for workflow items, `static` for narration/topic items).
- AC: If retrieval confidence is below threshold, **decline** and create a **coverage-gap** entry ("record this"); never fabricate steps.
- AC: The article cites which session(s)/spans it drew from.

### 5.5 Studio

**US-STU-1 — Review & fix segmentation.** AC: See drafts from a session; split/merge articles; move steps between articles; rename.

**US-STU-2 — Edit a structured article.** AC: Step-card editor to edit instruction/rationale text, reorder/merge/split/delete steps, retake (re-pick frame or re-upload) and re-crop screenshots, add callouts/warnings, link related articles. **No step-level re-record** (re-recording replaces a flow).

**US-STU-3 — Redact in review.** AC: One-click blur of any screenshot region or text span; persists to stored artifacts.

**US-STU-4 — Brand voice & theme.** AC: Set tone/voice applied at (re)generation; set portal logo + colors.

**US-STU-5 — Static authoring.** AC: Hand-write `static` articles (markdown-like) for no-workflow content; clearly badged "not self-validated." AI never generates these.

**US-STU-6 — Organize the KB.** AC: Collections, tags, draft/published states, internal search.

**US-STU-7 — Coverage gaps.** AC: A list of gaps (from prompt-to-article misses + portal no-result searches) with a "record this" prompt.

**US-STU-8 — Publish.** AC: Select articles → publish to the portal; unpublish; see published state.

### 5.6 Help Portal

**US-POR-1 — Browse & read.** AC: Public site on a Sync subdomain; article pages render ordered steps with cropped/highlighted screenshots; collections navigation.

**US-POR-2 — Search.** AC: Hybrid (keyword + semantic) search; no-result queries are logged as coverage-gap signals.

**US-POR-3 — Feedback.** AC: "Was this helpful?" per article, feeding analytics foundations.

**US-POR-4 — Theming.** AC: Logo + color theming from Studio; clean responsive default.

---

## 6. The capture contract (session bundle)

The single most important interface in Phase 1: exactly what the extension must emit. Downstream synthesis, prompt-to-article, and (later) self-validation all depend on this shape.

```jsonc
Session {
  id, workspace_id, created_by,
  started_at, ended_at,
  app_meta: { base_url, user_agent, viewport, device_pixel_ratio },
  markers: [ { t, label } ],            // user "new workflow" markers (ms from start)
  audio:   { ref, format, duration_ms, sample_rate },
  video?:  { ref, fps, resolution },    // optional low-fps context reel
  events:  [ Event ]
}

Event {
  id,
  t,                                    // ms from session start (sync key for audio/video)
  type,                                 // click | input | submit | nav | scroll | keydown | focus | marker
  target: {
    role, accessible_name, text,        // for instruction text + robust selectors
    tag, attributes_subset,
    css_path, xpath,                    // multi-signal selector
    bbox: { x, y, w, h },               // viewport coords -> crop + highlight
    frame_path?                         // iframe chain, if applicable
  },
  value?,                               // redacted/masked input value
  route: { url, path, hash, title },
  dom_snapshot_ref,                     // sanitized DOM at the moment of the event
  screenshot_ref,                       // hi-res screenshot at the event
  post_action?: {                       // captured after settle
    screenshot_ref, dom_snapshot_ref, route,
    settle_reason                       // mutation_quiet | network_idle | timeout
  }
}
```

**Notes / requirements**
- **Selectors are multi-signal** (role + accessible_name + text + css_path + xpath). Downstream picks the most robust; brittle CSS alone is never the only signal.
- **DOM snapshots are sanitized and size-capped** at capture time (redaction applied first; large/irrelevant subtrees pruned).
- **Screenshots** are PNG, device-pixel-ratio aware; stored as object-storage refs; bbox enables server-side cropping.
- **Timestamps (`t`)** are the synchronization key across audio, events, and optional video.
- **`post_action`** is what makes `expected_outcome` possible and is the seed for Phase 3 validation — do not skip it.

---

## 7. Content & storage model

Authoritative model is in the [PRD §6.2](PRD.md) and the 3-module architecture in [`architecture.md`](architecture.md). Phase 1 storage notes:

- **Knowledge Base layer (Module 2):** captures are normalized into **`KnowledgeSource` + `KnowledgeItem`** (with a **persisted transcript** + a keyword/LLM index). Articles are generated *from* the KB, not directly from raw captures.
- **Article / Step** stored as structured records (not markdown blobs). `source ∈ {recording_auto, prompt_grounded, manual, import}`, `type ∈ {workflow-backed, static}` (independent axes — see architecture.md).
- **Binary artifacts** (screenshots, audio, video, DOM snapshots) in object storage, referenced by id; per-workspace isolation.
- **Index** for prompt-to-article + portal search: keyword/LLM over `KnowledgeItem.text` now → pgvector embeddings later.
- **Versioning:** keep article version history at publish (lightweight in v1).

---

## 8. Privacy & redaction

A B2B sales gate — must work in v1.

- **Never captured:** `type=password` values and their on-screen regions.
- **Masked by default:** all input values; user can opt specific fields back in.
- **Client-side first:** redaction applied in the extension **before upload** (values, DOM text, screenshot regions).
- **Server-side backstop:** OCR + DOM-text PII detection (emails, phone, card/SSN-like) → blur/scrub on ingest.
- **Manual redaction:** in the extension (pre-record) and in Studio (review) — blur any region or text span; persists to artifacts.
- **Guidance:** onboarding nudges recording with a test/dummy account.
- **Data handling:** encryption at rest + in transit; per-workspace isolation; signed, expiring upload/download URLs.

---

## 9. Non-functional requirements

- **Capture performance:** no visible jank on the host page; DOM snapshots sanitized + size-capped; backpressure if events burst.
- **Session limits (v1 placeholders, TBD w/ pricing):** max session length ~30–60 min; per-workspace monthly recording-minute + article caps.
- **Processing latency:** drafts ready within minutes of upload for a typical session; clear status surfaced in Studio.
- **Reliability:** resumable uploads; processing is idempotent and retryable per session.
- **Security/tenancy:** per-workspace data isolation; least-privilege access to artifacts; audit basics.
- **Browser:** Chrome (MV3), current stable; graceful messaging on unsupported browsers.
- **Accessibility/SEO (portal):** semantic HTML, server-rendered article pages, sitemap.

---

## 10. Build sequence (milestones)

> **Authoritative, current build sequence (M0–M9) lives in [`phase-1a-plan.md`](phase-1a-plan.md) §9–§10.** The list below is the original Phase-1 conceptual breakdown (kept for context).

- **M0 — Foundations:** workspace, auth, multi-seat (owner/editor), object storage, signed uploads.
- **M1 — Capture & upload:** extension emits the full [session bundle](#6-the-capture-contract-session-bundle) with client-side redaction; verify capture quality on real apps *before* building synthesis.
- **M2 — Processing & synthesis:** transcription, segmentation, screenshot crop/highlight → draft articles viewable in Studio.
- **M3 — Studio editor:** segmentation fixes, step-card editing, screenshot retake, redaction, brand voice, static authoring.
- **M4 — Portal:** publish flow + public subdomain rendering + hybrid search + feedback.
- **M5 — Prompt-to-article:** corpus index, retrieval, grounded synthesis, decline + coverage gaps.

> Sequencing rationale: capture quality (M1) gates everything. Validate it on real third-party apps before investing in synthesis. M5 reuses the embedding/index work that M4 search needs.

---

## 11. Phase 1 open items & risks

- **Usage cap numbers** — pending the deferred pricing decision; using placeholders.
- **Selector robustness** — React/obfuscated class names; mitigate with multi-signal selectors (and visual fallback later in Phase 3). Validate on a few real apps in M1.
- **Segmentation accuracy** — the main quality risk for the "≥80% accepted" bar; markers + route boundaries reduce reliance on the LLM. Tune in M2.
- **Post-action settle detection** — heuristics (mutation-quiet vs network-idle vs timeout) need tuning per app; risk of capturing mid-transition states.
- **OCR redaction accuracy** — false negatives are a privacy risk; client-side defaults + test-account guidance reduce exposure.
- **iframes / cross-origin content** — capture within cross-origin iframes is constrained; document limits and degrade gracefully.
- **Canvas/non-DOM apps** — out of reliable scope for v1; the optional context video partially mitigates.
- **Synthesis cost per minute** — multimodal generation + transcription + storage; informs caps and future pricing.
