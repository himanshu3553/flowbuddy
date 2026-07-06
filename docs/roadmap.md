# Sync — Roadmap & Status (Versions · Phases · Modules)

> **What this is.** The authoritative map of the product — **Versions → Phases → Modules** — with the **status of every module** and the legacy-ID mapping so none of the work is lost. **Version 1 ships the copilot first.** For *why* copilot-first see [`product.md`](product.md) §5; for the *technical* model see [`architecture.md`](architecture.md); for build detail see [`phase-1-copilot.md`](phase-1-copilot.md) (Phase 1) and [`phase-2-portal.md`](phase-2-portal.md) (Phase 2). KB step-quality work (raw events → clean per-workflow steps) is **built & verified end-to-end** — see [`kb-step-distillation.md`](kb-step-distillation.md).

- **Status:** Locked v1.0 (structure, 2026-06-22) · **as-of:** 2026-07-07 · **Branch:** `dev`
- **This doc wins** on phase/module structure and priority; the per-phase docs hold the detail.

---

## 0. The shape of Version 1

**Version 1 = Sync, the workflow-capture product, released in phases. Phase 1 is the copilot and ships first.**

```
VERSION 1 — Workflow capture · copilot-first        ✅ shipping
│
├─ PHASE 1 · Copilot ⭐ (the V1 release)        🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟨   12 done · 1 in progress
├─ PHASE 2 · Help Portal & Articles (frozen)    🟩🟩🟩⬜⬜⬜⬜               3 done · 4 draft
└─ PHASE 3 · Self-validation & freshness (moat) ⬜                          to be planned

VERSION 2 — Modalities + product depth (later)   ⬜⬜⬜⬜⬜⬜                 deferred
```

🟩 Done · 🟨 In Progress · ⬜ Draft  *(one square per module)*

- **Module IDs are per-phase**, written `P{phase}-M{n}` — e.g. **`P1-M5`** = Phase 1, Module 5. (The old docs used one *global* `M0–M14`; those are "legacy IDs," mapped in §6.)
- **Modules already built are kept and marked ✅** — Phase 1 reuses the foundation we already shipped.

> **⚠️ Phase numbers were redefined on 2026-06-22.** Previously: Phase 1 = the wedge, Phase 2 = copilot, Phase 3 = self-validation. The mapping:
>
> | Old phase | New phase |
> |---|---|
> | Phase 1 (wedge: capture → KB → articles → portal) | **split** → foundation into **Phase 1**, portal/articles into **Phase 2** |
> | Phase 2 (in-app copilot) | **Phase 1** (now the headline) |
> | Phase 3 (self-validation) | **Phase 3** (unchanged) |

### Legend

| Badge | Status | Meaning |
|:---:|---|---|
| ✅ | **Done** | Built, verified end-to-end, nothing outstanding for this scope. |
| 🔄 | **In Progress** | Core shipped or config ready, but work remains (deferred items, a pending upgrade, or a user-gated step). |
| 📝 | **Draft** | Planned / specified but not started. |

### Progress at a glance

| Scope | Modules | ✅ Done | 🔄 In Progress | 📝 Draft |
|---|:---:|:---:|:---:|:---:|
| **Phase 1 — Copilot** | 13 | **12** | 1 | 0 |
| **Phase 2 — Portal & Articles** | 7 | **3** | 0 | 4 |
| **Phase 3 — Self-validation** | 1 | 0 | 0 | 1 |
| **Version 2 — Modalities + product depth** | 6 | 0 | 0 | 6 |

---

## 1. Phase 0 — Discovery spike — ✅ DONE (verdict: GO, 2026-06-18)

A throwaway, lightweight spike answered one question before building any product: **does capture → KB generation actually work?** No login, Studio, multi-tenancy, or portal — just the core pipeline and a way to eyeball output.

- **Hypothesis (validated):** a narrated screen recording can be captured in multi-layer form (event + DOM + screenshot + post-action + audio) and **synthesized into accurate, structured, step-by-step articles**.
- **Build decisions that carried forward:** LLM = **OpenAI** (quality over cost); **fully multimodal**; **Node/TS**; API key **backend-only**; fully automated.
- **Outcome:** built, run on a real app, hypothesis confirmed. Code was disposable; the **capture engine + synthesis prompts** carried into Phase 1. The tracked `spike/` was removed from the repo (commit `c9f13f4`, 2026-06-22).

---

## 2. Phase 1 — Copilot ⭐ (the Version 1 release)

**Goal:** a SaaS records its product, approves workflows for the copilot, drops in a `<script>`, and its end-users get an in-app chat widget that answers **grounded only in approved-KB**, with citations and honest declines. **Decoupled** from articles/portal. Build/spec/as-built detail: [`phase-1-copilot.md`](phase-1-copilot.md).

| Module | What it is | Status | Legacy |
|:---|:---|:---|:---|
| **P1-M0** | Monorepo, infrastructure & auth (Postgres, R2/MinIO, Redis/BullMQ, Auth.js, api, worker, multi-tenancy) | ✅ **Done** | M0, M1 |
| **P1-M1** | Recorder / workflow capture (Chrome extension: events + DOM + screenshots + narration) | ✅ **Done** — **v0.2.1 LIVE on the Chrome Web Store** (approved 2026-07-06; prod-targeted: deployed-Studio + localhost connect). **v0.3.0** (stop→upload feedback + resilience, 2026-07-06) **submitted to the Web Store 2026-07-06** (in review); see [`deploy-render.md`](deploy-render.md) §11. *(R13 ranked locators landed after the v0.3.0 submission — ships in the next store version.)* | M2 |
| **P1-M2** | Knowledge Base (`KnowledgeSource`/`KnowledgeItem`, transcript, segmentation → **distilled per-workflow steps**, keyword index) | ✅ **Done** — incl. step distillation ([`kb-step-distillation.md`](kb-step-distillation.md), 2026-06-27) | M3, M6 |
| **P1-M3** | Retrieval & grounding engine (retrieve → ground → answer-or-decline) | ✅ **Done** (2026-07-07) — **hybrid keyword + pgvector retrieval** (RRF fusion, `text-embedding-3-small`, worker embeds at KB build, keyword fallback on any vector failure; no backfill — dev reset); Render `vector` support confirmed 2026-07-06 | M7 (+ M11 retrieval) |
| **P1-M4** | Cloud deploy (Render + R2) — the copilot must be live to embed | ✅ **Done** — deployed on Render (Dockerized api + worker + web) + Cloudflare R2; dev deploy at `sync-web-uir8.onrender.com` | M8 |
| **P1-M5** | Copilot **approval gate** — per-workflow "approve for copilot" (the trust gate) | ✅ **Done** | C1 |
| **P1-M6** | Copilot **answer endpoint** — conversational RAG over approved-KB; cite or decline | ✅ **Done** | C2 |
| **P1-M7** | **Embeddable widget & JS SDK** — one `<script>` renders the chat widget | ✅ **Done** | C3 |
| **P1-M8** | **Context API** — widget reports host route/page → "answer for where I am" | ✅ **Done** | C4 |
| **P1-M9** | **Embed auth & tenant scoping** — public key, origin allowlist, rate limit | ✅ **Done** | C5 |
| **P1-M10** | Copilot **feedback loop & analytics** — log Q&A, hit/miss, coverage gaps | ✅ **Done** | C6 |
| **P1-M11** | **Capture reliability hardening** — no-silent-data-loss, nav, iframe | ✅ **Done** (2026-07-06) — R1/R2/R3/R6 + Pause/Resume + R1 cross-origin re-arm + R9 multi-tab + R8 iframe + R4 SW-eviction resilience + R7 on-page control bar + R10 scroll/hover/keyboard + R12 screenshot timing/cost + **R13 ranked locators** shipped; R5 + recorder-UX parking lot → **V2·D3** (2026-07-06); R12 follow-ups parked | M9 (+ R1–R13) |
| **P1-M12** | **PII redaction** — client masking + server backstop (elevated: end-user-facing) | 🔄 **In Progress** — client masking + **server text-scrub (Cut 1)** done; screenshot OCR/blur (Cut 2) → **Phase 2** | M10 |

**Build order (locked 2026-06-22, deploy last):** P1-M5 approval → P1-M6 answer → **P1-M7 widget (first *local* demo)** → P1-M8 context → P1-M9 embed auth → P1-M10 feedback → **P1-M11 + P1-M12 release-hardening** → **P1-M4 cloud deploy (FINAL step)**. The whole copilot is built & verified **locally** (docker-compose) first; pgvector retrieval folds into P1-M3 when answer quality needs it.

**Done when (= the Version 1 release):** an external SaaS embeds the snippet on a real page; its end-users get grounded, cited answers from approved-KB (honest declines on gaps); scoped to the right workspace; PII-safe; Q&A logged — **without touching the portal/articles.**

---

## 3. Phase 2 — Help Portal & Articles (decoupled by-products · frozen)

**Goal:** the human-facing help center over the *same* KB — a **decoupled** publish target. **⚠️ Direction change 2026-07-07 — workflows-as-articles** ([`phase-2-portal.md`](phase-2-portal.md) **§7**): the pre-pivot article engine (parked in-tree since 2026-06-25) was **removed** — Phase 1's distilled workflows + the approval-gate pattern already provide what an article needs, so Phase 2 **renders approved workflows** (per-audience approval: copilot | portal) instead of resuming a parallel synthesis engine. Rebuild notes (editing overlay · Text→Article · prose polish) in §7; recovery inventory in §6. The public portal app validated the render path and **returns in Phase 2**. Stays **frozen** (no new investment) until the copilot ships. Detail: [`phase-2-portal.md`](phase-2-portal.md).

| Module | What it is | Status | Legacy |
|:---|:---|:---|:---|
| **P2-M0** | Studio article editor (view/edit/reorder/publish) | ✅ Built → 🗑️ **removed 2026-07-07** — superseded by workflows-as-articles ([`phase-2-portal.md`](phase-2-portal.md) §7: rebuild as a presentation overlay) | M4 |
| **P2-M1** | Curated article generation (propose titles → select → generate) + prompt-to-article | ✅ Built → 🗑️ **removed 2026-07-07** — superseded by workflows-as-articles ([`phase-2-portal.md`](phase-2-portal.md) §7) | M6.1 / M7 |
| **P2-M2** | Public Help Portal (published articles, screenshots, highlights) | ✅ Built → 🔄 `packages/portal` **removed for the Phase-1 clean slate (`c9f13f4`); returns in Phase 2** (render path proven) | M5 |
| **P2-M3** | Portal + KB **search UI** (hybrid; user-facing half of search) | 📝 **Draft** | M11 (portal half) |
| **P2-M4** | Authoring depth (split/merge/move, retake/crop, callouts, arrow highlight, manual `static`, collections, versioning, brand voice) | 📝 **Draft** | M12 |
| **P2-M5** | Portal productization (theming, custom domains, public/gated, "was this helpful?", SEO/sitemap) | 📝 **Draft** | M13 |
| **P2-M6** | Coverage analytics + collaboration (gaps dashboard, multi-seat/roles) | 📝 **Draft** | M14 |

---

## 4. Phase 3 — Self-validation & freshness (the moat)

**Goal:** keep the KB/articles from going stale by re-checking themselves against the live app (replay captured selectors/routes/expected-outcomes), detect drift, and manage **supersession** (a re-recording becomes the current authority). **Validation environment (decided 2026-06-18):** the customer provisions a dedicated **sandbox** (base URL + test credentials in Studio); validation runs **only** there — never production — so full replay is safe.

| Module | What it is | Status |
|:---|:---|:---|
| **P3-M0+** | Drift detection · replay validation · supersession · coverage signals | 📝 **Draft** — to be planned |

**Depends on:** the selector-bearing KB (P1-M2) and ranked locators (recorder backlog R13, captured in Phase 1 but consumed here). The riskiest engineering bet — prototype sandbox replay + auth/MFA + selector-robustness early.

---

## 5. Version 2 — additional capture modalities + product depth (deferred)

Outside Version 1. Two groups:

- **Capture modalities** — **narration-only capture (1.2)** + **video capture (1.3)** + the narration-derived `static` explainer-article path. The KB stays modality-agnostic (`kind`, item `step|topic`) so these slot in additively. See [`architecture.md`](architecture.md) → Product versions.
- **Product depth** — the Phase-1 feature backlog **moved here by scope decision (2026-07-06)**: Version 1 ships with the copilot loop as-is; these deepen it afterwards. *(Kept in Phase 1 by the same decision: the **real-widget tester (Approach B)** — **prototyped 2026-07-07 on the unmerged experiment branch `dev-feature-copilot-preview`** (the preview embeds the real widget bundle in a `data-sync-preview` mode; deliberately kept out of `dev` as an experiment); **pgvector (P1-M3)** — **built 2026-07-07** (hybrid keyword+vector).)*

| Module | What it is | Status |
|:---|:---|:---|
| **V2 · 1.2** | **Narration-only capture** (+ narration-derived `static` explainer articles) | 📝 **Draft** — deferred |
| **V2 · 1.3** | **Video capture** | 📝 **Draft** — deferred |
| **V2 · D1** | **Analytics depth** (ex-P1-M10 backlog) — 👎 feedback drill-down · richer gap states (partial/recording) · period deltas · query log + export · real deflection metric · citation backfill | 📝 **Draft** — moved from Phase 1 (2026-07-06) |
| **V2 · D2** | **Copilot-page extensions** (ex-P1-M6/M9 backlog) — decline-threshold persistence + enforcement · F17 origin-blocked state (needs a blocked-origin signal). *Real-widget tester (Approach B) stays in Phase 1 — prototyped on the unmerged experiment branch `dev-feature-copilot-preview` (2026-07-07).* | 📝 **Draft** — moved from Phase 1 (2026-07-06) |
| **V2 · D3** | **Recorder UX features** (ex-P1-M11 backlog) — R5 marker hotkey + labels · pre-upload review (thumbnails/discard) · undo last event · local draft/crash recovery · per-workspace capture profiles | 📝 **Draft** — moved from Phase 1 (2026-07-06) |
| **V2 · D4** | **Studio polish** (ex-Phase-1 backlog) — Recordings Tier 3 (sort/bulk) · signup invite gate · token-management UI (list/revoke; pairs with per-device tokens). | 📝 **Draft** — moved from Phase 1 (2026-07-06) |

---

## 6. Legacy ID → new module map (nothing lost)

| Legacy ID | Was | New module | Status |
|---|---|---|---|
| **M0** monorepo/infra · **M1** auth + Studio base | old Phase 1a | P1-M0 | ✅ |
| **M2** api ingestion + extension | old Phase 1a | P1-M1 | ✅ |
| **M3** synthesis worker · **M6** KB layer | old Phase 1a | P1-M2 | ✅ |
| **M4** Studio article editor | old Phase 1a | **P2-M0** | ✅ |
| **M5** public portal | old Phase 1a | **P2-M2** | ✅ built → removed, returns Phase 2 |
| **M6.1** curated generation | old Phase 1a | **P2-M1** | ✅ |
| **M7** prompt-to-article / engine | old Phase 1a | P1-M3 (engine) + P2-M1 (article path) | ✅ |
| **M8** cloud deploy | old Phase 1a | P1-M4 | ✅ deployed (Render + R2) |
| **M9** capture reliability (incl. R1–R13) | old Phase 1b | P1-M11 | ✅ |
| **M10** PII redaction (incl. R11) | old Phase 1b | P1-M12 | 🔄 core |
| **M11** search | old Phase 1b | P1-M3 (retrieval) + **P2-M3** (UI) | 🔄 / 📝 |
| **M12** authoring depth | old Phase 1b | **P2-M4** | 📝 |
| **M13** portal productization | old Phase 1b | **P2-M5** | 📝 |
| **M14** analytics + collaboration | old Phase 1b | **P2-M6** | 📝 |
| **C1–C6** copilot plan | (this pivot) | P1-M5 … P1-M10 | ✅ |
| **R1–R13** recorder backlog | old Phase 1b (M9/M10) | detail under P1-M11 / P1-M12 ([`phase-1-copilot.md`](phase-1-copilot.md) §8) | ✅ (R5 → V2·D3) |

---

## 7. What's left to ship Version 1

Only **Phase 1** gates the Version 1 release — and the release-gating work is **done**: the copilot is built, verified, and **deployed** (Render + R2). **2026-07-06:** the [`phase-1-review.md`](phase-1-review.md) remediation landed (`1bba47b`, user-verified E2E) — all P0 public-surface hardening (§2.1–2.7), retrieval consolidated into one `@sync/synthesis` seam (§3.1/3.2 — pgvector now has a single landing spot), transcription degradation (§3.3), graceful shutdown (§3.4), and the KB-page honesty reword (§4.5); **later that day, auth hardening §3.6 Cuts 2+3** (sign-in rate limiting + Resend-backed email verification & password reset — signup gate deliberately open). What remains is discretionary hardening + optional upgrades, none of it release-blocking:

1. ✅ **P1-M11** — capture-reliability backlog **complete** (2026-07-06): R1/R2/R3/R6 + Pause/Resume + R1 cross-origin + R9 multi-tab + R8 iframe + R4 SW-eviction resilience + R7 on-page control bar + R10 scroll/hover/keyboard + R12 screenshot timing/cost + **R13 ranked multi-signal locators** (the Phase-3 replay enabler) are all **shipped**. **R5** (marker hotkey/labels) and the recorder UX parking lot moved to **Version 2 · D3** (scope decision 2026-07-06); the R12 follow-ups stay parked.
2. 🔄 **P1-M12** — **Cut 1** (copilot answer-path PII scrub) is done; **Cut 2** (screenshot/DOM pixel OCR/blur) is deferred to **Phase 2** — not release-blocking.
3. ✅ **P1-M3** — the pgvector upgrade **shipped 2026-07-07** as **hybrid keyword + vector retrieval** (RRF fusion inside the single `synthesis/retrieval.ts` seam; worker embeds at KB build; every vector-path failure degrades to the keyword shortlist).

> Everything else in Phase 1 is ✅ and **P1-M4 cloud deploy is done**. Phase 1's definition-of-done is met post-deploy — **that is the Version 1 release**; the items above are follow-on quality/robustness work.

---

## 8. Doc map

| Doc | Role |
|---|---|
| **`roadmap.md`** (this) | **The map** — versions/phases/modules, status, legacy mapping. |
| [`product.md`](product.md) | What Sync is, who it's for, **why copilot-first** (decision record + grounding model + guardrails), moats, surfaces, risks, metrics. |
| [`architecture.md`](architecture.md) | Canonical **technical** model — 3 modules, KB schema, data model, decisions, flows. |
| [`phase-1-copilot.md`](phase-1-copilot.md) | **Phase 1 (copilot)** — scope/DoD/acceptance + per-module plan & **as-built** + capture contract + privacy + recorder/PII backlog. |
| [`phase-1-modules-map.md`](phase-1-modules-map.md) | **Phase 1 visual** — Mermaid end-to-end flow (capture → KB → approval → copilot) + package/module map + P1-M# cross-ref. |
| [`phase-2-portal.md`](phase-2-portal.md) | **Phase 2 (by-products)** — portal & article authoring (as-built, frozen) + to-build modules P2-M3…M6. |
| [`kb-step-distillation.md`](kb-step-distillation.md) | **KB step quality (built 2026-06-27)** — distill raw capture events → clean per-workflow steps (heuristics + LLM); design + as-built. |
| [`internals/`](internals/README.md) | **How it RUNS** — low-level per-module mechanics + data flow + a connections map (engineering deep-dive; complements this map's *why/what*). Start at `internals/connections.md`. Follows the code — source wins on conflict. |
| [`e2e-testing.md`](e2e-testing.md) | **Manual E2E test plan** — clean slate → record → KB → approve → embed → ask → analytics; per-step PASS signals. **3 levels:** local · dev (Render, incl. data reset) · prod (placeholder). |
| [`deploy-render.md`](deploy-render.md) | **Render deploy guide** — free-tier blueprint walkthrough (every first-deploy gotcha) + the going-to-production deltas. |
| [`phase-1-review.md`](phase-1-review.md) | **Phase-1 E2E review (2026-07-03)** — full-codebase findings + prioritized recommendations (P0/P1/P2) + a suggested remediation sequence; annotated as items land. |
| [`dev-setup.md`](dev-setup.md) | Local dev / tooling (pnpm · Turborepo · docker-compose · Prisma). |
