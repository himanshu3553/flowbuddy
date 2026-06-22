# Sync — Version 1 Roadmap (Copilot-First)

> **What this is.** The authoritative map of **Version 1 of the product**, divided into **phases**, each phase divided into **modules**. **Version 1 ships the copilot first.** This doc says what each phase/module is, **what is already built vs. still to build**, and maps every **legacy milestone ID** (the old global `M0–M14` / `C1–C6`) onto the new structure so none of the work we've done is lost. For *why* we pivoted, see [`pivot-copilot-first.md`](pivot-copilot-first.md); for the *technical* model, [`architecture.md`](architecture.md).

- **Status:** Locked v1.0 — 2026-06-22
- **Branch:** `copilot`
- **This doc wins** on phase/module structure and priority; older docs are reference for detail.

---

## 0. The shape of Version 1

**Version 1 = Sync, the workflow-capture product, released in phases. Phase 1 is the copilot and ships first.**

```
VERSION 1  (workflow capture; copilot-first)
 ├─ PHASE 1 — COPILOT  ⭐ first public release
 │     foundation (already built) + the embeddable copilot (to build)
 ├─ PHASE 2 — HELP PORTAL & ARTICLES   (the human-facing by-products)
 │     already built (editor/curated-gen/portal) + portal productization (to build)
 └─ PHASE 3 — SELF-VALIDATION & FRESHNESS   (the moat; to be planned)

VERSION 2  (later) — additional capture modalities: narration-only (1.2) + video (1.3)
```

- **Module IDs are per-phase**, written `P{phase}-M{n}` — e.g. **`P1-M5`** = Phase 1, Module 5. (The old docs used one *global* `M0–M14` sequence; those are now "legacy IDs," mapped in §5.)
- **Modules already built are kept and marked ✅** — Phase 1 reuses the foundation we already shipped; Phase 2 already has its first three modules done.

> **⚠️ Phase numbers were redefined on 2026-06-22.** Older docs use the *previous* meaning (Phase 1 = the wedge, Phase 2 = copilot, Phase 3 = self-validation). The mapping:
>
> | Old phase | New phase |
> |---|---|
> | Phase 1 (wedge: capture → KB → articles → portal) | **split** → foundation into **Phase 1**, portal/articles into **Phase 2** |
> | Phase 2 (in-app copilot) | **Phase 1** (now the headline) |
> | Phase 3 (self-validation) | **Phase 3** (unchanged) |

---

## 1. Phase 1 — Copilot ⭐ (the Version 1 release)

**Goal:** a SaaS records its product, approves workflows for the copilot, drops in a `<script>`, and its end-users get an in-app chat widget that answers **grounded only in approved-KB**, with citations and honest declines. **Decoupled** from articles/portal. Detailed build plan: [`phase-1-copilot-plan.md`](phase-1-copilot-plan.md).

| Module | What it is | Status | Legacy ID |
|---|---|---|---|
| **P1-M0** | Monorepo, infrastructure & auth (Postgres, R2/MinIO, Redis/BullMQ, Auth.js, api, worker, multi-tenancy) | ✅ **built** | M0, M1 |
| **P1-M1** | Recorder / workflow capture (Chrome extension: events + DOM + screenshots + narration) | ✅ **built** | M2 |
| **P1-M2** | Knowledge Base (`KnowledgeSource` / `KnowledgeItem`, transcript, segmentation, keyword index) | ✅ **built** | M3, M6 |
| **P1-M3** | Retrieval & grounding engine (`prompt.ts`: retrieve → ground → answer-or-decline) | ✅ **built**; ⏳ pgvector upgrade | M7 (+ M11 retrieval) |
| **P1-M4** | Cloud deploy (Render + R2) — the copilot must be live to embed | ⏳ to build | M8 |
| **P1-M5** | Copilot **approval gate** — per-workflow "approve for copilot" (the trust gate) | ✅ built | C1 |
| **P1-M6** | Copilot **answer endpoint** — conversational RAG over approved-KB; cite or decline | ⏳ to build | C2 |
| **P1-M7** | **Embeddable widget & JS SDK** — one `<script>` renders the chat widget | ⏳ to build | C3 |
| **P1-M8** | **Context API** — widget reports host route/page → "answer for where I am" | ⏳ to build | C4 |
| **P1-M9** | **Embed auth & tenant scoping** — public key, origin allowlist, rate limit | ⏳ to build | C5 |
| **P1-M10** | Copilot **feedback loop & analytics** — log Q&A, hit/miss, coverage gaps | ⏳ to build | C6 |
| **P1-M11** | **Capture reliability hardening** — no-silent-data-loss, nav, iframe (answer quality) | ⏳ to build | M9 (+ recorder backlog R1–R13) |
| **P1-M12** | **PII redaction** — client masking + review + server backstop (elevated: end-user-facing) | ⏳ to build | M10 |

**Build order (to-build) — deploy LAST (locked 2026-06-22):** P1-M5 approval → P1-M6 answer → **P1-M7 widget (first *local* demo)** → P1-M8 context → P1-M9 embed auth → P1-M10 feedback → **P1-M11 + P1-M12 release-hardening** → **P1-M4 cloud deploy (FINAL step)**. We build & verify the entire copilot **locally** (docker-compose) and only then deploy **P1 of V1** to cloud. pgvector retrieval upgrade folds into P1-M3 when answer quality needs it.

**Phase 1 done when:** an external SaaS embeds the snippet on a real page; its end-users get grounded, cited answers from approved-KB (honest declines on gaps); scoped to the right workspace; PII-safe; Q&A logged — **without touching the portal/articles**. → **ship as the Version 1 release.**

---

## 2. Phase 2 — Help Portal & Articles (by-products)

**Goal:** the human-facing help center over the *same* KB — a **decoupled** publish target. Three modules are **already built**; the rest is productization. Detailed plan: [`phase-1b-plan.md`](phase-1b-plan.md) (its M11-search-UI / M12 / M13 / M14 are these modules). As-built reference: [`phase-1-features.md`](phase-1-features.md).

| Module | What it is | Status | Legacy ID |
|---|---|---|---|
| **P2-M0** | Studio article editor (view/edit/reorder/publish) | ✅ **built** | M4 |
| **P2-M1** | Curated article generation (propose titles → select → generate) | ✅ **built** | M6.1 |
| **P2-M2** | Public Help Portal (published articles, screenshots, highlights) | ✅ **built** | M5 |
| **P2-M3** | Portal + KB **search UI** (hybrid; the user-facing half of search) | ⏳ to build | M11 (portal half) |
| **P2-M4** | Authoring depth (split/merge/move, retake/crop, callouts, arrow highlight, manual `static`, collections, versioning, brand voice) | ⏳ to build | M12 |
| **P2-M5** | Portal productization (theming, custom domains, public/gated, "was this helpful?", SEO/sitemap) | ⏳ to build | M13 |
| **P2-M6** | Coverage analytics + collaboration (gaps dashboard, multi-seat/roles) | ⏳ to build | M14 |

> Phase 2 stays **frozen** (built parts running, no new investment) until the copilot (Phase 1) ships.

---

## 3. Phase 3 — Self-validation & freshness (the moat)

**Goal:** keep the KB/articles from going stale by re-checking themselves against the live app (replay captured selectors/routes/expected-outcomes), detect drift, and manage **supersession** (a re-recording becomes the current authority). **To be planned** — depends on the selector-bearing KB (P1-M2) and ranked locators (recorder backlog R13). Was "Phase 3" in the old numbering (unchanged in meaning).

| Module | What it is | Status |
|---|---|---|
| **P3-M0+** | Drift detection · replay validation · supersession · coverage signals | 🔭 to be planned |

---

## 4. Version 2 — additional capture modalities (deferred, unchanged)

Outside Version 1. **Narration-only capture (1.2)** + **video capture (1.3)** + the narration-derived `static` explainer-article path. The KB stays modality-agnostic (`kind`, item `step|topic`) so these slot in additively. See [`architecture.md`](architecture.md) → Product versions.

---

## 5. Legacy ID → new module map (nothing lost)

Every milestone we've defined maps onto the new structure:

| Legacy ID | Was | New module | Status |
|---|---|---|---|
| **M0** monorepo/infra | old Phase 1a | P1-M0 | ✅ |
| **M1** auth + Studio base | old Phase 1a | P1-M0 | ✅ |
| **M2** api ingestion + extension | old Phase 1a | P1-M1 | ✅ |
| **M3** synthesis worker | old Phase 1a | P1-M2 | ✅ |
| **M4** Studio article editor | old Phase 1a | **P2-M0** | ✅ |
| **M5** public portal | old Phase 1a | **P2-M2** | ✅ |
| **M6** KB layer | old Phase 1a | P1-M2 | ✅ |
| **M6.1** curated generation | old Phase 1a | **P2-M1** | ✅ |
| **M7** prompt-to-article | old Phase 1a | P1-M3 (engine) | ✅ |
| **M8** cloud deploy | old Phase 1a | P1-M4 | ⏳ |
| **M9** capture reliability | old Phase 1b | P1-M11 | ⏳ |
| **M10** PII redaction | old Phase 1b | P1-M12 | ⏳ |
| **M11** search | old Phase 1b | P1-M3 (retrieval) + **P2-M3** (UI) | ⏳ |
| **M12** authoring depth | old Phase 1b | **P2-M4** | ⏳ |
| **M13** portal productization | old Phase 1b | **P2-M5** | ⏳ |
| **M14** analytics + collaboration | old Phase 1b | **P2-M6** | ⏳ |
| **C1–C6** copilot plan | (this pivot) | P1-M5 … P1-M10 | ⏳ |
| **R1–R13** recorder backlog | old Phase 1b (under M9/M10) | detail under P1-M11 / P1-M12 (lives in [`phase-1b-plan.md`](phase-1b-plan.md)) | ⏳ |

---

## 6. Doc map

| Doc | Role |
|---|---|
| **`version-1-roadmap.md`** (this) | **The map** — phases, modules, status, legacy mapping. |
| [`pivot-copilot-first.md`](pivot-copilot-first.md) | Decision record — *why* copilot-first + the grounding model. |
| [`phase-1-copilot-plan.md`](phase-1-copilot-plan.md) | **Phase 1 build plan** — copilot modules P1-M0…P1-M12 in detail. |
| [`phase-1b-plan.md`](phase-1b-plan.md) | Detailed milestone reference for **P1-M11/P1-M12** (capture/PII + recorder backlog) and **P2-M3…P2-M6** (portal). |
| [`architecture.md`](architecture.md) | Canonical technical model + version/phase scope. |
| [`phase-1a-plan.md`](phase-1a-plan.md), [`phase-1-features.md`](phase-1-features.md) | As-built record of the foundation (P1-M0…M3) and Phase-2 built modules (P2-M0…M2). Legacy global IDs. |
| [`PRD.md`](PRD.md), [`phase-1-spec.md`](phase-1-spec.md) | Strategy / acceptance — bannered; portal-first framing, repositions later. |
