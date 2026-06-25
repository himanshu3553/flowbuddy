# Sync — Phase 2: Help Portal & Articles (by-products)

> **Phase 2 is the human-facing help center over the *same* Knowledge Base — a decoupled publish target.** It is **frozen**: the article editor + curated generation are built (and still run in Studio); the public portal app validated the render path and **returns in Phase 2**; the rest is productization. No new investment here until the copilot (Phase 1) ships. Roadmap/status: [`roadmap.md`](roadmap.md) §3. Technical model: [`architecture.md`](architecture.md). Why it's a by-product: [`product.md`](product.md) §5.

- **Status:** **Frozen.** Built: P2-M0 (editor), P2-M1 (curated generation + prompt-to-article). P2-M2 (public portal) **built → removed for the Phase-1 clean slate, returns in Phase 2**. To build: P2-M3…P2-M6.
- **Last updated:** 2026-06-25 · **Branch:** `copilot`
- **Decoupling guardrail:** the copilot path must **never** require article authoring or portal publish. Approving a workflow for the copilot and publishing an article are **independent** actions over the same KB. Mental model: `ONE raw KB → per-target approval/visibility → { Copilot, Portal }`.

---

## 1. Overview

The same recordings that power the copilot also produce **clean, step-by-step help articles** and a **public help portal** — a second, *decoupled* publish target for **public/SEO readers** (vs. the copilot's in-app authenticated end-users). Both authoring paths obey **grounded authorship**: AI writes **only** from the workspace's own recordings, and declines + flags a coverage gap when a topic isn't covered.

| Module | What it is | Status |
|:---|:---|:---|
| **P2-M0** | Studio article editor (view/edit/reorder/publish) | ✅ built (in Studio) |
| **P2-M1** | Curated article generation + prompt-to-article | ✅ built (in Studio) |
| **P2-M2** | Public Help Portal (published articles, screenshots, highlights) | ✅ built → app removed, **returns in Phase 2** |
| **P2-M3** | Portal + KB **search UI** (hybrid) | 📝 to build |
| **P2-M4** | Authoring depth | 📝 to build |
| **P2-M5** | Portal productization | 📝 to build |
| **P2-M6** | Coverage analytics + collaboration | 📝 to build |

---

## 2. As built (frozen)

### 2.1 Curated auto-generation ("Auto Generate Articles") — P2-M1
Articles are **not pushed automatically**:
1. **Propose (instant, no LLM):** Studio lists the **candidate workflow titles** the KB produced at segmentation, each with a checkbox; a candidate that already has an article shows **"✓ generated."**
2. **Select:** you check the workflows worth an article.
3. **Generate:** Sync synthesizes **only the selected** workflows into **draft articles** (multimodal: narration + events + screenshots), grounded strictly in the recording.

Entry points: **per-recording** (from a recording's KB page) and a workspace-wide **"opportunities"** list of un-generated candidates across all recordings.

### 2.2 Prompt-to-article ("Text → Article") — P2-M1
Type a topic; Sync retrieves the relevant items over the **whole-workspace KB** (keyword shortlist), then **synthesizes or declines**. A decline logs a **coverage gap** ("record this next") on the dashboard. Prompt-grounded articles can **span multiple recordings**; their screenshots resolve back to whichever recording each step came from. *(This shares the retrieval/grounding engine with the copilot — see [`architecture.md`](architecture.md) Module 3.)*

### 2.3 The structured Article model — P2-M0
Articles are stored as **structured data, not markdown blobs** — what makes the portal (and later self-validation) possible:

```
Article { id, title, intent, tags[], routes[], preconditions[], source, type, status, steps[] }
Step    { order, instruction,            // human action ("Click …")
          rationale,                     // the "why", from narration
          screenshot + highlight,        // image + element rectangle (viewport fractions 0–1)
          selector, route,               // robust, multi-signal — for future validation
          expectedOutcome, uncertain }   // expected state after the step; flagged when capture was thin
```
- **`type`** = shape/self-validatability: **`workflow_backed`** (steps) vs **`static`** (prose).
- **`source`** = origin: **`recording_auto`** (curated), **`prompt_grounded`** (Text→Article), **`manual`** (human-written), `import`.
- **`status`** = **`draft`** | **`published`**.

### 2.4 Studio article editor — P2-M0
Open any article to edit step **title/instruction/rationale**, **reorder/delete** steps, toggle **Publish/Unpublish**, and see each step's **screenshot with the element highlight** (computed from the captured bbox as viewport fractions; served via short-lived signed URLs).

### 2.5 Public Help Portal — P2-M2 *(built → returns in Phase 2)*
A **public, per-workspace** site rendering **only published articles** (drafts + raw KB never exposed), each server-side with title, intent, preconditions, and ordered **steps with screenshots + element highlights**.

> **Status:** built in the foundation (legacy M5) and **validated the KB→render path**; its standalone app (`packages/portal`) was **removed for the Phase-1 copilot clean slate** (commit `c9f13f4`, 2026-06-22) and **returns in Phase 2** — the article editor + curated generation it depended on remain in Studio. When it returns it picks up the productization modules (P2-M3, P2-M5) below.

---

## 3. To-build modules (P2-M3 … P2-M6)

> Priority within Phase 2 mirrors the old "beta-blocking" order: search first, then authoring/portal polish, then collaboration last. Each is built one at a time, verified, with a stop for review.

### P2-M3 — Search (portal + KB UI) *(legacy M11, portal half)*
The user-facing half of search (the retrieval/embedding half is the Phase-1 P1-M3 pgvector upgrade).
- **Portal search UI** — search published articles (**hybrid** keyword + semantic); **no-result queries logged** as coverage signals (feeds P2-M6).
- **Studio KB search UI** — a workspace-wide search over the KB (across recordings) — the search surface deferred from the foundation.
- **Done when:** portal hybrid search returns relevant published articles, no-result queries are logged, and Studio has a working KB search.

### P2-M4 — Authoring depth (Studio) *(legacy M12)*
Raises output quality and cuts time-to-publish. The foundation ships edit-text + reorder/delete + publish; this fills out the editor.
- **Segmentation review** — split/merge articles, move steps between articles, rename.
- **Screenshot retake/crop** — re-pick a frame or re-upload, and re-crop. *(Still no step-level re-record — re-recording replaces a flow.)*
- **Callouts/warnings**, **arrow-pointer highlight** (alongside the rectangle), **related-article links**.
- **Manual `static` authoring UI** — hand-write prose articles (`source=manual`, `type=static`; the model supports it, needs `Article.body`). Badged "not self-validated"; AI never generates these.
- **Collections / tags** organization + **lightweight versioning at publish**.
- **Brand voice / tone** at (re)generation (the portal theming half is P2-M5).
- **Done when:** a founder can reshape segmentation, fix screenshots, enrich steps, hand-write static pages, organize the KB, and version on publish.

### P2-M5 — Portal productization *(legacy M13)*
Makes the public portal credible for a real customer-facing launch.
- **Theming/branding** — logo + colors set in Studio.
- **Custom domains** — beyond the `…/<slug>` path; map a customer domain to a workspace portal.
- **Public / gated visibility** — public default; gated/private as a fast-follow.
- **"Was this helpful?"** per-article feedback → analytics foundations (feeds P2-M6).
- **SEO** — server-rendered article pages (already SSR), structured data + a **sitemap**.
- **Done when:** the portal is themed, supports a custom domain + gated visibility, collects feedback, and is SEO-clean.

### P2-M6 — Coverage analytics + collaboration *(legacy M14, last)*
The lowest-leverage items for an invite-only beta, so they close the phase.
- **Coverage-gap analytics dashboard** — unify prompt-to-article misses + portal no-result searches (and the copilot's own declines) into a single "record this next" view, beyond the current basic list.
- **Multi-seat / minimal roles** — a workspace can have multiple members with **owner/editor** roles + invitations (V1 is single-user = single-workspace). Enforce role checks across Studio actions.
- **Done when:** the gaps dashboard surfaces all signal sources with a record-this prompt, and a second user can be invited into a workspace as an editor with correctly scoped permissions.

---

## 4. Data-model deltas (additive, per module)

All **additive migrations** on the foundation schema — nothing existing changes:

- **P2-M3 (search):** `KnowledgeItem.embedding` (pgvector) + the **pgvector** extension (shared with the Phase-1 P1-M3 retrieval upgrade); a `SearchQuery` log (workspace, query, result-count, ts) so portal **no-result** queries become coverage signals.
- **P2-M4 (authoring):** `Article.body` (markdown — for **manual `static`** articles; also the hook V2 narration reuses); `ArticleVersion` (lightweight history at publish); `Collection` (+ Article↔Collection); `Step` callout/warning fields + a highlight `kind` (rectangle | arrow).
- **P2-M5 (portal):** `Workspace` theme fields (logo key, colors), `customDomain`, `visibility` (public | gated) + access secret; `ArticleFeedback` (article, helpful bool, optional note).
- **P2-M6 (collaboration):** `Membership` (User↔Workspace + `role: owner | editor`) + `Invitation`; `CoverageGap` aggregation across sources (prompt-miss · portal-no-result · copilot-decline) for the analytics view.

---

## 5. Risks / details to finalize

- **pgvector on the deploy target (P2-M3):** confirm managed Postgres supports the `vector` extension; pick an embedding model + dimensions; tune hybrid ranking (keyword vs. semantic weight).
- **`Article.body` shared with V2 (P2-M4):** the markdown body for **manual** statics is the same hook V2 narration-derived statics reuse — keep it modality-agnostic so V2 slots in additively.
- **Custom domains (P2-M5):** TLS/cert provisioning + domain-verification flow; the per-workspace routing model.
- **Multi-tenancy under multi-seat (P2-M6):** the foundation assumes single-user isolation; auditing every Studio/portal query for correct workspace + role scoping is the main correctness risk when seats are introduced.
- **Portal app restoration (P2-M2):** rebuild the removed `packages/portal` (render path proven) on the current schema; wire it to the published-article view and the P2-M5 productization.

> **Not in Phase 2:** the in-app **Copilot** (Phase 1), **self-validation/drift** (Phase 3), **Version 2 capture modalities** (narration-only + video), billing, and i18n (tracked, English-first beta).
