# Sync — Phase 1b Plan (Feature Breadth)

> **Goal of Phase 1b:** take the proven thin slice and make it **beta-ready for real external users** — close the *unmet* items in the [phase-1-spec.md](phase-1-spec.md) definition-of-done so the wedge holds up when a founder records their *own* product against *real* data and ships a portal their customers actually use. 1a proved the architecture on one clean path; 1b makes it trustworthy, searchable, and editable enough to invite people in.

- **Status:** Draft v0.1
- **Last updated:** 2026-06-21
- **Precedes/zooms into:** [phase-1-spec.md](phase-1-spec.md) (acceptance criteria). **Builds on** the completed thin slice ([phase-1a-plan.md](phase-1a-plan.md), M0–M7) and the as-built product reference ([phase-1-features.md](phase-1-features.md)).
- **Prerequisite (not in this doc):** **M8 — cloud deploy (Render + Cloudflare R2)** is a Phase **1a** milestone and is assumed done before/alongside 1b. The product isn't truly end-to-end until it's live; 1b features are built on the deployed system. *(On deploy: add the production Studio origin to the extension manifest and set `STUDIO_URL` / `SYNC_API_URL`.)*
- **Priority driver (locked 2026-06-21): beta-blocking first.** Order milestones by what unblocks real external beta users recording their own product against real data — **capture reliability** and **PII redaction** lead (the spec's unmet DoD + the B2B trust gate), then **search**, then authoring/portal **polish**, with **multi-seat/roles last** (single-user = single-workspace is fine for an invite-only beta).
- **Carried-forward locked decisions:** monorepo (pnpm + Turborepo) • Node/TS + Next.js • Postgres • Redis/BullMQ • Auth.js (self-hosted) • Render + R2 • the **3-module model** Capture → Knowledge Base → Article creation ([architecture.md](architecture.md)) • **grounded authorship** (AI writes only from the workspace's own recordings) • **V1 capture is workflow-only** (narration-only + video = **Version 2**).

---

## 1. Scope

**In 1b** (everything below maps to an unmet or partial item in [phase-1-spec.md](phase-1-spec.md) §1 / §5, called out as `🔜 Phase 1b` in [phase-1-features.md](phase-1-features.md)):

- **Capture reliability** — iframe / cross-frame capture, full-page-navigation resilience, multi-tab handling, pause/resume, "mark workflow" hotkey.
- **Productized PII redaction** — client-side masking beyond passwords + pre-record controls, Studio review-time redaction, server-side OCR/DOM backstop, test-account nudge.
- **Search** — pgvector hybrid (keyword + semantic) retrieval; portal search UI; workspace-wide KB search UI.
- **Authoring depth (Studio)** — segmentation review (split/merge/move steps), screenshot retake/crop, callouts/warnings, arrow-pointer highlight, related-article links, **manual `static` authoring UI**, collections/tags, lightweight versioning at publish, brand voice/tone at (re)generation.
- **Portal productization** — theming/branding (logo + colors), custom domains, public/gated visibility, "was this helpful?" feedback, SEO/structured data + sitemap.
- **Coverage analytics + collaboration** — coverage-gap analytics dashboards (prompt misses + portal no-result searches), multi-seat / minimal roles (owner/editor).

**Explicitly NOT in 1b:**
- **Version 2 capture modalities** — narration-only capture (Module 1.2) + narration-derived `static` explainers, and video capture (Module 1.3). *(The data-model hooks added in 1b — e.g. `Article.body` — let these slot in additively later.)*
- **Phase 2** — in-app Copilot. **Phase 3** — self-validation / drift detection.
- **Billing** — free invite-only beta; monetization stays out of Phase 1.
- **i18n** — lowest-value for an English-first beta; track but don't build unless a beta user blocks on it.

---

## 2. Prioritization rationale (why this order)

The thin slice already satisfies most of the spec's [definition-of-done](phase-1-spec.md#1-goal--definition-of-done). The **unmet** items, and what each requires, drive the order:

| Unmet DoD item | Requires | Milestone |
|---|---|---|
| **≥80% of generated steps accepted with minor edits** (primary quality bar) | Real apps must capture *cleanly* first — iframe UIs and full-page navs are the known root-cause of zero/partial captures | **M9** (gates everything; you can't measure or hit the quality bar on broken captures) |
| **PII redaction works** (passwords never captured; manual redaction; no raw PII by default) | Client masking + pre-record controls + Studio redaction + server OCR backstop | **M10** (the B2B trust gate — you can't ask beta users to record real data without it) |
| **Published portal is browsable *and* searchable** | pgvector index + hybrid retrieval + portal/KB search UIs | **M11** |
| **Time-to-first-published-portal < 1 hr** for a first-timer | Faster editing/curation + a credible-looking portal | **M12–M13** (authoring + portal polish reduce friction and raise the floor on output quality) |

Everything after M11 raises quality and credibility rather than unblocking the core loop, so it follows. **Multi-seat/roles is last** — single-user works for the beta, so collaboration is the lowest-leverage item in the window.

---

## 3. Data-model deltas (additive, per milestone)

All changes are **additive migrations** on the [existing schema](phase-1a-plan.md#3-data-model-postgres--prisma) — the slice's `Workspace / ApiToken / KnowledgeSource / KnowledgeItem / Article / Step / CoverageGap` model stays. Final shapes are decided during each milestone (see §5 risks); sketch:

- **M9 (capture):** no core schema change expected — the [capture contract](phase-1-spec.md#6-the-capture-contract-session-bundle) already carries `target.frame_path` (iframe chain) and per-event `route`. Possibly a capture-quality/`degraded` flag + reason on `KnowledgeSource` for surfacing partial captures.
- **M10 (redaction):** persisted redaction regions/spans on artifacts — e.g. a `redactions Json` on `Step` (and/or `KnowledgeItem`) for review-time blurs; client-side masking needs no schema. Server backstop writes blurred derivatives to R2.
- **M11 (search):** `KnowledgeItem.embedding` (pgvector) + the **pgvector** extension; a `SearchQuery` log (workspace, query, result-count, ts) so portal **no-result** queries become coverage signals.
- **M12 (authoring):** `Article.body` (markdown — for **manual `static`** articles; also the hook V2 narration reuses); `ArticleVersion` (lightweight history at publish); `Collection` (+ Article↔Collection); `Step` callout/warning fields + a highlight `kind` (rectangle | arrow).
- **M13 (portal):** `Workspace` theme fields (logo key, colors), `customDomain`, `visibility` (public | gated) + access secret; `ArticleFeedback` (article, helpful bool, optional note).
- **M14 (collaboration):** `Membership` (User↔Workspace + `role: owner | editor`) + `Invitation`; `CoverageGap` gains aggregation/source fields (prompt-miss vs portal-no-result) for the analytics view.

---

## 4. Build milestones (Phase 1b)

> Continues the global milestone sequence (1a ended at **M8**). Built **one milestone at a time, each verified, with a stop for review** — same cadence as 1a.

| # | Milestone | Done when |
|---|---|---|
| **M9** | **Capture reliability** | A recording on an app whose UI lives in an `<iframe>` and that does full-page navigations produces **complete, correctly-segmented** captures (no silent/partial loss); multi-tab is handled or cleanly messaged. |
| **M10** | **Productized PII redaction** | Spec §8 holds end-to-end: passwords never captured; input values masked by default (opt-in per field); pre-record + Studio review redaction works and persists; server OCR/DOM backstop blurs detected PII. |
| **M11** | **Search (portal + KB)** | Portal visitors search published articles (**hybrid** keyword + semantic); no-result queries log coverage signals; Studio has a workspace-wide KB search. |
| **M12** | **Authoring depth (Studio)** | Founder can fix segmentation (split/merge/move), retake/crop screenshots, add callouts + arrow highlights + related links, **hand-write `static` articles**, organize with collections/tags, set brand voice; versions are kept at publish. |
| **M13** | **Portal productization** | Portal is **themed** (logo/colors), supports a **custom domain** and **public/gated** visibility, has a **"was this helpful?"** widget, and emits SEO/structured data + a sitemap. |
| **M14** | **Coverage analytics + collaboration** | A **coverage-gaps dashboard** unifies prompt misses + portal no-result searches with "record this"; a workspace supports **multiple seats** with owner/editor roles. |

**Definition of done for Phase 1b:** **all** items in the [phase-1-spec.md definition-of-done](phase-1-spec.md#1-goal--definition-of-done) are true on the deployed system — including the ones the slice didn't cover: **PII redaction works**, the **portal is searchable**, and the **≥80%-steps-accepted** quality bar is *measurable and met* on real third-party apps (which M9 unblocks). At that point Phase 1 is complete end-to-end and ready for an invite-only beta.

---

## 5. Per-milestone detail

### M9 — Capture reliability (gates the quality bar)
**Why first:** the spec's primary quality bar (**≥80% of steps accepted**) is unmeasurable until real apps capture cleanly. The known root-cause of zero/partial captures is documented in [phase-1a-plan.md §8](phase-1a-plan.md#8-risks--details-to-finalize-during-build): the recorder is **top-frame only** (`all_frames:false`) so iframe-hosted UIs capture nothing, and the content script **detaches on full-page navigation**. Beta users hit both immediately.
- **Iframe / cross-frame capture** — inject into child frames (`all_frames:true` + frame messaging), populate `target.frame_path`, and resolve element bbox/screenshot coordinates across the frame chain.
- **Full-page-navigation resilience** — survive same-origin full-page navs: persist the in-progress buffer (not just in-memory) and re-attach the content script after navigation so the session continues.
- **Multi-tab** — either follow the workflow across tabs or detect + clearly message the limit (no silent loss). Decide scope during build.
- **Pause / resume** + a **keyboard hotkey for "mark workflow"** (US-EXT-3) — small recorder UX wins that ride along here.
- **Done when:** an app that renders its UI in an iframe and performs full-page navigations yields complete, correctly-segmented captures; the earlier "zero interaction events" cases now actually capture (not just surface a friendly failure).

### M10 — Productized PII redaction (the B2B trust gate)
Implements [spec §8](phase-1-spec.md#8-privacy--redaction) + US-EXT-4 / US-PROC-4 / US-STU-3. The slice masks only password fields; this makes redaction real.
- **Client-side (before upload):** mask **all input values by default** with per-field opt-in; **pre-record "mask this field/region"** controls; **pause-and-skip** for sensitive screens; redact DOM text + screenshot regions in-browser.
- **Studio review-time redaction:** one-click blur of any **screenshot region or text span**, persisted to the stored artifact.
- **Server-side backstop:** OCR screenshots + scrub DOM text for high-confidence PII (emails, phone, card/SSN-like) on ingest → blur/scrub detected regions.
- **Onboarding nudge:** "use a test/dummy account" guidance.
- **Done when:** passwords are never captured (value or region); values masked by default; manual redaction works **both** pre-record and in review and persists; the server backstop blurs detected PII.

### M11 — Search (portal + KB)
Closes the spec's **"browsable *and* searchable"** DoD item (US-POR-2, US-STU-6) and the deferred index from [spec §7](phase-1-spec.md#7-content--storage-model) ("keyword/LLM now → pgvector later").
- **Index:** add the **pgvector** extension; embed `KnowledgeItem.text`; **hybrid** keyword + semantic retrieval. Reuse the same index for **prompt-to-article** (M7) to improve its recall.
- **Portal search UI** — search published articles; **no-result queries logged** as coverage signals (feeds M14).
- **Studio KB search** — a workspace-wide search over the KB (across recordings), the search UI deferred in [phase-1-features.md §4.5](phase-1-features.md).
- **Done when:** portal hybrid search returns relevant published articles, no-result queries are logged, and Studio has a working KB search.

### M12 — Authoring depth (Studio)
Raises output quality and cuts time-to-publish (US-STU-1/2/4/5/6, US-PROC-3 highlight variants). The slice ships edit-text + reorder/delete + publish; this fills out the editor.
- **Segmentation review** — split/merge articles, move steps between articles, rename (US-STU-1).
- **Screenshot retake/crop** — re-pick a frame or re-upload, and re-crop (US-STU-2). *(Still no step-level re-record — re-recording replaces a flow.)*
- **Callouts/warnings**, **arrow-pointer highlight** (alongside the existing rectangle), **related-article links**.
- **Manual `static` authoring UI** — hand-write prose articles (`source=manual`, `type=static`); the model already supports it (needs `Article.body`). Clearly badged "not self-validated"; AI never generates these.
- **Collections / tags / draft-published organization** + **lightweight versioning at publish**.
- **Brand voice / tone** applied at (re)generation (the generation half of US-STU-4; the portal theming half is M13).
- **Done when:** a founder can reshape segmentation, fix screenshots, enrich steps, hand-write static pages, organize the KB, and version on publish.

### M13 — Portal productization
Makes the public portal credible for a real customer-facing launch (US-POR-2/3/4, [spec §9 portal NFRs](phase-1-spec.md#9-non-functional-requirements)).
- **Theming/branding** — logo + colors set in Studio (the portal half of US-STU-4 / US-POR-4).
- **Custom domains** — beyond the `…/<slug>` path; map a customer domain to a workspace portal.
- **Public / gated visibility** — public is the default; gated/private as a fast-follow within 1b.
- **"Was this helpful?"** per-article feedback → analytics foundations (feeds M14).
- **SEO** — server-rendered article pages (already SSR), structured data + a **sitemap**.
- **Done when:** the portal is themed, supports a custom domain + gated visibility, collects feedback, and is SEO-clean.

### M14 — Coverage analytics + collaboration (last)
The lowest-leverage items for an invite-only beta, so they close the phase.
- **Coverage-gap analytics dashboard** — unify prompt-to-article misses (M7's `CoverageGap`) **and** portal no-result searches (M11) into a single "record this next" view (US-STU-7), beyond the current basic list.
- **Multi-seat / minimal roles** — a workspace can have multiple members with **owner/editor** roles + invitations (the slice is single-user = single-workspace). Enforce role checks across Studio actions.
- **Done when:** the gaps dashboard surfaces both signal sources with a record-this prompt, and a second user can be invited into a workspace as an editor with correctly scoped permissions.

---

## 6. Risks / details to finalize during build

- **Iframe capture (M9):** cross-origin iframes are constrained by the browser — document the limit and degrade gracefully (per [spec §11](phase-1-spec.md#11-phase-1-open-items--risks)). Same-origin/first-party frames are the priority.
- **Navigation buffer durability (M9):** persisting the in-progress session across full-page navs (storage choice, size caps) without janking the host page.
- **OCR redaction accuracy (M10):** false negatives are a privacy risk — client-side defaults + test-account guidance remain the primary protection; the server OCR is a backstop, not the guarantee.
- **pgvector on the deploy target (M11):** confirm the managed Postgres supports the `vector` extension; pick an embedding model + dimensions; tune hybrid ranking (keyword vs semantic weight).
- **`Article.body` shared with V2 (M12):** the markdown body added for **manual** static authoring is the same hook V2 narration-derived statics reuse — keep it modality-agnostic so V2 slots in additively.
- **Custom domains (M13):** TLS/cert provisioning + domain-verification flow on the host; the per-workspace routing model.
- **Multi-tenancy under multi-seat (M14):** the slice assumes single-user isolation; auditing every Studio/portal query for correct workspace + role scoping is the main correctness risk when seats are introduced.
- **Quality-bar measurement:** decide *how* "≥80% of steps accepted with minor edits" is measured (edit-distance/acceptance instrumentation in Studio) so the DoD is verifiable, not asserted.

---

> **Cadence:** one milestone at a time, each verified end-to-end, with a stop for review — same working agreement as 1a. M9 (capture reliability) is the gate: until real third-party apps capture cleanly, the quality bar can't be measured, so nothing downstream is truly "done."
