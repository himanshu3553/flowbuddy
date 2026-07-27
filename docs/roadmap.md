# FlowBuddy — Roadmap & Status (Versions · Phases · Modules)

> **What this is.** The authoritative map of the product — **Versions → Phases → Modules** — with the **status of every module** and the legacy-ID mapping so none of the work is lost. **Version 1 ships the copilot first.** For *why* copilot-first see [`product.md`](product.md) §5; for the *technical* model see [`architecture.md`](architecture.md); for build detail see [`phase-1-copilot.md`](phase-1-copilot.md) (Phase 1), [`phase-2-sense.md`](phase-2-sense.md) (Phase 2), [`phase-4-autopilot.md`](phase-4-autopilot.md) (Phase 4); the V2 portal track: [`v2-portal.md`](v2-portal.md). KB step-quality work (raw events → clean per-workflow steps) is **built & verified end-to-end** — see [`kb-step-distillation.md`](kb-step-distillation.md).

- **Status:** Locked v1.0 (structure, 2026-06-22) · **as-of:** 2026-07-27 · **Branch:** `dev`
- **This doc wins** on phase/module structure and priority; the per-phase docs hold the detail.

---

## 0. The shape of Version 1

**Version 1 = FlowBuddy, the workflow-capture product, released in phases. Phase 1 is the copilot and ships first.**

```
VERSION 1 — Workflow capture · copilot-first        ✅ LAUNCHED — prod 2026-07-23 (flowbuddyai.com)
│
├─ PHASE 1 · Copilot ⭐ (the V1 release)        🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟨   12 done · 1 in progress
├─ PHASE 2 · Sense — in-context help            🟩🟩🟩🟩🟩🟩                 6 done · ALL user-verified
├─ PHASE 3 · Self-validation & freshness (moat) ⬜                          to be planned
└─ PHASE 4 · Autopilot — agentic execution      🟩⬜⬜⬜                     1 done (M0 walkthrough) · 3 to plan

VERSION 2 — Portal & articles · modalities · depth  ⬜×13                   deferred

VERSION 3 — Buyer-side: record the tools you USE · the company agent       📝 direction (2026-07-25)
```

**⭐ The copilot now ships in THREE OPERATING MODES** (D9 — [`unified-agent.md`](unified-agent.md)), founder-selected
per workspace and also the pricing tiers. This cuts ACROSS the phases above rather than sitting inside one:

```
1 · AI Chatbot   answers, fixed rules decide the rest   🟩 shipped — the SAFETY FLOOR (below)
2 · Copilot      the read-only agent: it decides how    🟩 BUILT + user-verified E2E 2026-07-27
                 to help, turn by turn. Never acts.        ⭐ the default for NEW workspaces
3 · AI Agent     adds acting on the user's behalf       ⬜ not built · never a default
```

**Mode 2 is what a new workspace gets (2026-07-27)** — signed up, embedded, and already a Copilot,
with the on-page abilities it advertises (`copilotShowMe`, `copilotWalkthrough`) permitted too.
Every mode stays switchable both ways in Studio → Copilot → Settings, and **existing workspaces are
untouched**: a column default applies only to new rows, and the stored value cannot tell a founder's
deliberate choice from an inherited one.

Mode 1 keeps two jobs it does not share with the ladder position: it is a **sold tier** (the
predictable, single-call configuration), and it is the **safety floor** — where an unrecognised
stored value lands, and where the runtime falls back when the agent loop errors (built 2026-07-27).
That floor may only ever move *down*, which is why the product default and the floor are now
deliberately different constants (`NEW_WORKSPACE_MODE` vs `DEFAULT_COPILOT_MODE`).

🟩 Done · 🟨 In Progress · ⬜ Draft  *(one square per module)*

- **Module IDs are per-phase**, written `P{phase}-M{n}` — e.g. **`P1-M5`** = Phase 1, Module 5. (The old docs used one *global* `M0–M14`; those are "legacy IDs," mapped in §8.)
- **Modules already built are kept and marked ✅** — Phase 1 reuses the foundation we already shipped.

> **⚠️ Phase numbers were redefined on 2026-06-22.** Previously: Phase 1 = the wedge, Phase 2 = copilot, Phase 3 = self-validation. The mapping:
>
> | Old phase | New phase |
> |---|---|
> | Phase 1 (wedge: capture → KB → articles → portal) | **split** → foundation into **Phase 1**, portal/articles into **Phase 2** |
> | Phase 2 (in-app copilot) | **Phase 1** (now the headline) |
> | Phase 3 (self-validation) | **Phase 3** (unchanged) |

> **⚠️ Phase 2 was redefined again on 2026-07-08 (second redefinition).** The **Help Portal & Articles** (previous Phase 2, modules `P2-M0…M6`) moved **out of Version 1 into Version 2** as the **portal track `V2 · P0…P6`** ([`v2-portal.md`](v2-portal.md)) — Version 1 is now a **pure copilot arc**: answer (P1) → locate (P2) → stay fresh (P3) → act (P4). The new **Phase 2 = Sense (in-context help)**. The legacy map (§8) reflects both redefinitions.

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
| **Phase 2 — Sense (in-context help)** | 6 | **6** | 0 | 0 |
| **Phase 3 — Self-validation** | 1 | 0 | 0 | 1 |
| **Phase 4 — Autopilot** | 4 | **1** | 0 | 3 |
| **Version 2 — Portal & articles · modalities · depth** | 13 | 0 | 0 | 13 |

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
| **P1-M1** | Recorder / workflow capture (Chrome extension: events + DOM + screenshots + narration) | ✅ **Done** — **v0.6.0 "FlowBuddy Recorder" LIVE on the Chrome Web Store (2026-07-23)**: the production release — bakes `app.flowbuddyai.com` + the dev Studio + localhost, FlowBuddy "F" icons, carries **R13 ranked locators** (the Sense/Phase-3 enabler) + structured logging. Full log: [`extension-releases.md`](extension-releases.md). | M2 |
| **P1-M2** | Knowledge Base (`KnowledgeSource`/`KnowledgeItem`, transcript, segmentation → **distilled per-workflow steps**, keyword index) | ✅ **Done** — incl. step distillation ([`kb-step-distillation.md`](kb-step-distillation.md), 2026-06-27) | M3, M6 |
| **P1-M3** | Retrieval & grounding engine (retrieve → ground → answer-or-decline) | ✅ **Done** (2026-07-07) — **hybrid keyword + pgvector retrieval** (RRF fusion, `text-embedding-3-small`, worker embeds at KB build, keyword fallback on any vector failure; no backfill — dev reset); Render `vector` support confirmed 2026-07-06 | M7 (+ M11 retrieval) |
| **P1-M4** | Cloud deploy (Render + R2) — the copilot must be live to embed | ✅ **Done** — **prod LIVE at flowbuddyai.com since 2026-07-23** (paid two-blueprint stack: root `render.yaml` from `main`, worker folded into the api — [`deploy.md`](deploy.md)); dev at `flowbuddy-dev-web.onrender.com` (`render.dev.yaml` from `dev`) | M8 |
| **P1-M5** | Copilot **approval gate** — per-workflow "approve for copilot" (the trust gate) | ✅ **Done** | C1 |
| **P1-M6** | Copilot **answer endpoint** — conversational RAG over approved-KB; cite or decline | ✅ **Done** | C2 |
| **P1-M7** | **Embeddable widget & JS SDK** — one `<script>` renders the chat widget | ✅ **Done** | C3 |
| **P1-M8** | **Context API** — widget reports host route/page → "answer for where I am" | ✅ **Done** | C4 |
| **P1-M9** | **Embed auth & tenant scoping** — public key, origin allowlist, rate limit | ✅ **Done** | C5 |
| **P1-M10** | Copilot **feedback loop & analytics** — log Q&A, hit/miss, coverage gaps | ✅ **Done** | C6 |
| **P1-M11** | **Capture reliability hardening** — no-silent-data-loss, nav, iframe | ✅ **Done** (2026-07-06) — R1/R2/R3/R6 + Pause/Resume + R1 cross-origin re-arm + R9 multi-tab + R8 iframe + R4 SW-eviction resilience + R7 on-page control bar + R10 scroll/hover/keyboard + R12 screenshot timing/cost + **R13 ranked locators** shipped; R5 + recorder-UX parking lot → **V2·D3** (2026-07-06); R12 follow-ups parked | M9 (+ R1–R13) |
| **P1-M12** | **PII redaction** — client masking + server backstop (elevated: end-user-facing) | 🔄 **In Progress** — client masking + **server text-scrub (Cut 1)** done; screenshot OCR/blur (Cut 2) → **Version 2 (portal track)** | M10 |

**Build order (locked 2026-06-22, deploy last):** P1-M5 approval → P1-M6 answer → **P1-M7 widget (first *local* demo)** → P1-M8 context → P1-M9 embed auth → P1-M10 feedback → **P1-M11 + P1-M12 release-hardening** → **P1-M4 cloud deploy (FINAL step)**. The whole copilot is built & verified **locally** (docker-compose) first; pgvector retrieval folds into P1-M3 when answer quality needs it.

**Done when (= the Version 1 release):** an external SaaS embeds the snippet on a real page; its end-users get grounded, cited answers from approved-KB (honest declines on gaps); scoped to the right workspace; PII-safe; Q&A logged — **without touching the portal/articles.**

---

## 3. Phase 2 — Sense (in-context help)

**Goal:** the copilot knows **where the user is** — not just the page (P1-M8's route bias) but **which approved workflow and which step** — and answers **positionally**. An end-user stuck on step 3 of a 5-step KB workflow opens the copilot and asks; the widget runs an ask-time **read-only probe** of approved workflows' captured locators against the live page, scores the **top-k hypotheses**, and ships them on the existing `/answer` call — the answer LLM makes the final call *with the question in hand* (**hybrid** localization, locked) and answers: **unstick step 3, then the path to done** (step-level citation; genuine tie → "are you doing X or Y?"; re-probe every follow-up). **Read-only sensing, never surveillance** — no acting (that's Phase 4), no end-user recording, only booleans + one masked error snippet leave the page. Context **biases, never overrides** — unrelated questions answer exactly as today. **Design locked + built 2026-07-08; USER-VERIFIED E2E 2026-07-09** (three E2E hardening fixes landed during verification) — detail + as-built: [`phase-2-sense.md`](phase-2-sense.md) (Part A).

| Module | What it is | Status | Legacy |
|:---|:---|:---|:---|
| **P2-M0** | **Sense plan — compile + serve** (approved workflows → steps × ranked locators + routes + outcome markers; key-authed endpoint, cached; gated by the per-workspace Sense toggle) | ✅ **Done** — built 2026-07-08, user-verified E2E 2026-07-09 | — (new) |
| **P2-M1** | **Widget probe + scorer** (ask-time read-only probe → evidence booleans + masked error snippet → deterministic top-k hypotheses; re-probe per follow-up) | ✅ **Done** — built 2026-07-08, user-verified E2E 2026-07-09 | — (new) |
| **P2-M2** | **Positional answering** (`/answer` takes hypotheses; three-tier relevance — ignore / positional / deictic-primary; unstick-then-path; step-level citations; tie → ask) | ✅ **Done** — built 2026-07-08, user-verified E2E 2026-07-09 | — (new) |
| **P2-M3** | **"Show me" highlight** — config-gated single-step element highlight on the host page (on → show, off → text-only) | ✅ **Done** — built 2026-07-08, user-verified E2E 2026-07-09 | — (new) |
| **P2-M4** | **Step-level friction analytics** (must-have) — localization outcomes logged (`used\|ignored\|none`) → Studio per-step friction view + passive drift signals | ✅ **Done** — built 2026-07-08, user-verified E2E 2026-07-09 | — (new) |
| **P2-M5** | **Reason — diagnostic reasoning** ("why can't I proceed?"): ask-time structured page-state capture (roles/states/validity/hint-text, values masked) + the founder's expected-state step screenshot → a stronger model diagnoses expected-vs-actual in an agentic read-tool loop (the skeleton Phase 4 inherits) | ✅ **Done** ([`phase-2-sense.md`](phase-2-sense.md) Part B) | — (new) |

**Depends on:** Phase 1 only — R13 ranked locators + routes + `expected_outcome` (already in the capture), the answer engine, and the P1-M8 context seam. **No Phase-3 gate needed:** probing is read-only, so a mislocalization = a slightly-off answer (recoverable) — nothing acts on the page. **Feeds:** **Phase 4 Autopilot** (mid-workflow entry — "finish from step 3" — consumes step localization; P4-M0's guided walkthrough builds on P2-M3; the sense plan is the base of P4's `ExecutionPlan`), **Phase 3** (locators that stop resolving on real users' pages = passive production drift signals), and founder analytics (per-step friction: "users get stuck on step 3 of X — re-record it or fix the UX").

---

## 4. Phase 3 — Self-validation & freshness (the moat)

**Goal:** keep the KB/articles from going stale by re-checking themselves against the live app (replay captured selectors/routes/expected-outcomes), detect drift, and manage **supersession** (a re-recording becomes the current authority). **Validation environment (decided 2026-06-18):** the customer provisions a dedicated **sandbox** (base URL + test credentials in Studio); validation runs **only** there — never production — so full replay is safe.

| Module | What it is | Status |
|:---|:---|:---|
| **P3-M0+** | Drift detection · replay validation · supersession · coverage signals | 📝 **Draft** — to be planned |

**Depends on:** the selector-bearing KB (P1-M2) and ranked locators (recorder backlog R13, captured in Phase 1 but consumed here). The riskiest engineering bet — prototype sandbox replay + auth/MFA + selector-robustness early.

**Feeds Phase 4 (Autopilot):** the replay core (locator walk + healing, step semantics, outcome verification) and the **"validated-current"** signal are consumed by Phase 4 as its execution engine + eligibility certification (§5) — one shared replay core, two drivers (sandbox runner here, widget driver there).

---

## 5. Phase 4 — Autopilot (agentic execution)

**Goal:** the copilot moves from *telling* to **doing** — after a grounded answer, the widget offers to **execute the approved workflow in the end-user's live session** (resolve ranked locators → act → verify `expected_outcome` → next step / ask the user / safe-stop), with the end-user consenting, watching, and able to abort at any moment. **Grounded actions:** Autopilot only executes workflows the founder **recorded and approved** — a second audience flag alongside `copilot` on the same approval model (the V2 portal adds `portal` as a third) — never free-form agent browsing. Human-in-the-loop by construction: captured input values are masked, so every input is prompted at run time. Full understanding + design questions: [`phase-4-autopilot.md`](phase-4-autopilot.md).

| Module | What it is | Status |
|:---|:---|:---|
| **P4-M0** | **Guided walkthrough** — "Walk me through it" on positional answers: highlight each remaining step + follow the user's progress (auto-detect + Next fallback, cross-nav resume, run analytics); no acting (the zero-risk stepping stone) | ✅ **Done** — built 2026-07-15 ([`phase-4-autopilot.md`](phase-4-autopilot.md) §8 as-built); needs Sense; **default ON for new workspaces since 2026-07-27** (Copilot mode decides per message, so the switch is a permission rather than a rule) |
| **P4-M1** | **Autopilot gate** — the `autopilot` audience flag + validated-current certification (offer execution only on approved **and** green-validated workflows) | 📝 **Draft** |
| **P4-M2** | **Widget execution driver** — consent UX, visible step-by-step run, per-input prompts, pause/abort/takeover, resume across navigations | 📝 **Draft** |
| **P4-M3** | **Safety rails + telemetry** — destructive-step confirmation, safe-stop semantics, execution audit log, drift feedback to Phase 3 | 📝 **Draft** |

**Depends on:** **Phase 3** — its replay core is the execution engine (one shared core, two drivers) and its validation signal is the safety certification (a workflow Phase 3 can't replay green is never offered for execution); an Autopilot safe-stop in production feeds back as a live drift signal. **Phase 2 (Sense)** — mid-workflow entry ("finish from step 3") consumes Sense's workflow/step localization. Also consumes Phase 1's R13 ranked locators, `post_action`/`expected_outcome`, routes, and the in-page widget as the execution surface. **Sequencing (decided 2026-07-15): the phase opened ahead of Phase 3** — P4-M0 is zero-acting and has no Phase-3 dependency; the acting modules (M1–M3) design the eligibility gate with pluggable signals so Phase-3 certification slots in when it lands.

---

## 6. Version 2 — additional capture modalities + product depth (deferred)

Outside Version 1. Three groups:

- **Help Portal & Articles (the portal track)** — the human-facing by-products, **moved out of Version 1 on 2026-07-08** (previously Phase 2): render approved workflows as articles + per-audience approval + presentation overlay + a public portal + productization. Full feature list: [`v2-portal.md`](v2-portal.md).
- **Capture modalities** — **narration-only capture (1.2)** + **video capture (1.3)** + the narration-derived `static` explainer-article path. The KB stays modality-agnostic (`kind`, item `step|topic`) so these slot in additively. See [`architecture.md`](architecture.md) → Product versions.
- **Product depth** — the Phase-1 feature backlog **moved here by scope decision (2026-07-06)**: Version 1 ships with the copilot loop as-is; these deepen it afterwards. *(Kept in Phase 1 by the same decision — and both since shipped: the **real-widget tester (Approach B)** — **merged 2026-07-08** (the preview embeds the real widget bundle in `data-flowbuddy-preview` mode; Approach A retired → one answer path); **pgvector (P1-M3)** — **built 2026-07-07** (hybrid keyword+vector).)*

| Module | What it is | Status |
|:---|:---|:---|
| **V2 · P0…P6** | **Help Portal & Articles track** (ex-Phase 2, moved 2026-07-08) — publish foundation (per-audience approval + presentation overlay) · Text→Article · public portal · search UI · authoring depth · productization (incl. **PII Cut 2**: screenshot OCR/blur, gates publish) · coverage analytics + collaboration | 📝 **Draft** — [`v2-portal.md`](v2-portal.md) |
| **V2 · 1.2** | **Narration-only capture** (+ narration-derived `static` explainer articles) | 📝 **Draft** — deferred |
| **V2 · 1.3** | **Video capture** | 📝 **Draft** — deferred |
| **V2 · D1** | **Analytics depth** (ex-P1-M10 backlog) — 👎 feedback drill-down · richer gap states (partial/recording) · period deltas · ~~query log~~ **+ export** · real deflection metric · ~~citation backfill~~ | 📝 **Draft** — moved from Phase 1 (2026-07-06). **Two items pulled forward + shipped 2026-07-27:** the **question log** (`/dashboard/analytics/questions` — searchable, filterable, paged; export still deferred), and the **citation count fix** — which turned out not to need a backfill: the writer now stores one row per *workflow* (it was one per cited *step*, so row-counting readers ranked workflows by length, not use) and the readers count **distinct `queryId`**, which is correct for the old rows and the new ones alike. Rode along: `CopilotQuery.question`/`CoverageGap.prompt` are now PII-scrubbed on write. |
| **V2 · D2** | **Copilot-page extensions** (ex-P1-M6/M9 backlog) — decline-threshold persistence + enforcement · F17 origin-blocked state (needs a blocked-origin signal). *Real-widget tester (Approach B) stayed in Phase 1 — shipped, merged 2026-07-08.* | 📝 **Draft** — moved from Phase 1 (2026-07-06) |
| **V2 · D3** | **Recorder UX features** (ex-P1-M11 backlog) — R5 marker hotkey + labels · pre-upload review (thumbnails/discard) · undo last event · local draft/crash recovery · per-workspace capture profiles | 📝 **Draft** — moved from Phase 1 (2026-07-06) |
| **V2 · D4** | **Studio polish** (ex-Phase-1 backlog) — Recordings Tier 3 (sort/bulk) · signup invite gate · token-management UI (list/revoke; pairs with per-device tokens). | 📝 **Draft** — moved from Phase 1 (2026-07-06) |

---

## 7. Version 3 — the company agent (buyer-side track) — 📝 direction

**The ownership flip:** Versions 1–2 point FlowBuddy at the product a company **makes**; Version 3 points it at the products a company **uses**. Same extension + Studio: a company records the tools and processes it uses (third-party SaaS, internal tools) → an approved workflow/SOP KB **the company owns** → **a second Chrome extension — the company agent**: a browser-use AI agent (Claude-for-Chrome-class surface, FlowBuddy-grounded behavior) the company itself uses to run those applications — **executing only recorded + approved workflows, never free-form browsing**. Reuses the shared replay core (one core, three drivers: P3 sandbox · P4 widget · V3 extension) and consumes the KB through P6's export seam. Direction captured 2026-07-25; candidate modules **V3-M0…M4** + open questions: [`v3-company-agent.md`](v3-company-agent.md) — gains its module table when designed.

---

## 8. Legacy ID → new module map (nothing lost)

| Legacy ID | Was | New module | Status |
|---|---|---|---|
| **M0** monorepo/infra · **M1** auth + Studio base | old Phase 1a | P1-M0 | ✅ |
| **M2** api ingestion + extension | old Phase 1a | P1-M1 | ✅ |
| **M3** synthesis worker · **M6** KB layer | old Phase 1a | P1-M2 | ✅ |
| **M4** Studio article editor | old Phase 1a | **V2 · P0** (presentation overlay) | 📝 to build |
| **M5** public portal | old Phase 1a | **V2 · P2** | 📝 to build |
| **M6.1** curated generation | old Phase 1a | **V2 · P1** (Text→Article) | 📝 to build |
| **M7** prompt-to-article / engine | old Phase 1a | P1-M3 (engine ✅) + V2 · P1 (article path 📝) | 🔄 |
| **M8** cloud deploy | old Phase 1a | P1-M4 | ✅ deployed (Render + R2) |
| **M9** capture reliability (incl. R1–R13) | old Phase 1b | P1-M11 | ✅ |
| **M10** PII redaction (incl. R11) | old Phase 1b | P1-M12 | 🔄 core |
| **M11** search | old Phase 1b | P1-M3 (retrieval) + **V2 · P3** (UI) | 🔄 / 📝 |
| **M12** authoring depth | old Phase 1b | **V2 · P4** | 📝 |
| **M13** portal productization | old Phase 1b | **V2 · P5** | 📝 |
| **M14** analytics + collaboration | old Phase 1b | **V2 · P6** | 📝 |
| **C1–C6** copilot plan | (this pivot) | P1-M5 … P1-M10 | ✅ |
| **R1–R13** recorder backlog | old Phase 1b (M9/M10) | detail under P1-M11 / P1-M12 ([`phase-1-copilot.md`](phase-1-copilot.md) §8) | ✅ (R5 → V2·D3) |

---

## 9. What's left to ship Version 1

Only **Phase 1** gates the Version 1 release — and the release-gating work is **done**: the copilot is built, verified, and **deployed** (Render + R2). **2026-07-06:** the [`archive/phase-1-review.md`](archive/phase-1-review.md) remediation landed (`1bba47b`, user-verified E2E) — all P0 public-surface hardening (§2.1–2.7), retrieval consolidated into one `@flowbuddy/synthesis` seam (§3.1/3.2 — pgvector now has a single landing spot), transcription degradation (§3.3), graceful shutdown (§3.4), and the KB-page honesty reword (§4.5); **later that day, auth hardening §3.6 Cuts 2+3** (sign-in rate limiting + Resend-backed email verification & password reset — signup gate deliberately open). What remains is discretionary hardening + optional upgrades, none of it release-blocking:

1. ✅ **P1-M11** — capture-reliability backlog **complete** (2026-07-06): R1/R2/R3/R6 + Pause/Resume + R1 cross-origin + R9 multi-tab + R8 iframe + R4 SW-eviction resilience + R7 on-page control bar + R10 scroll/hover/keyboard + R12 screenshot timing/cost + **R13 ranked multi-signal locators** (the Phase-3 replay enabler) are all **shipped**. **R5** (marker hotkey/labels) and the recorder UX parking lot moved to **Version 2 · D3** (scope decision 2026-07-06); the R12 follow-ups stay parked.
2. 🔄 **P1-M12** — **Cut 1** (copilot answer-path PII scrub) is done; **Cut 2** (screenshot/DOM pixel OCR/blur) is deferred to **Version 2 (portal track)** — not release-blocking.
3. ✅ **P1-M3** — the pgvector upgrade **shipped 2026-07-07** as **hybrid keyword + vector retrieval** (RRF fusion inside the single `synthesis/retrieval.ts` seam; worker embeds at KB build; every vector-path failure degrades to the keyword shortlist).

> Everything else in Phase 1 is ✅ and **P1-M4 cloud deploy is done — and the Version 1 release SHIPPED: launched in production at flowbuddyai.com 2026-07-23, user-verified E2E** ([`deploy.md`](deploy.md)); the items above are follow-on quality/robustness work.

### Phase 1 backlog (discretionary, post-release — not gating)

The residual open items from the Phase-1 end-to-end review — nothing release-blocking; schedule deliberately. Full detail behind each: [`archive/phase-1-review.md`](archive/phase-1-review.md).

- **Automated test layer** — a thin `vitest` pass over the pure seams (`cleanEvents`, `redactText` Luhn/phone/email edges, `shortcutCombo`, the segmenter carry-forward guard, `sanitizeHistory`, `checkRateLimit`, `distillSteps` grounding validation, `highlightFromBbox`); no CI, runs next to typecheck. *(The repo still has no test harness — [`no-test-harness-for-now`]; this is the standing candidate for the first one.)*
- **Observability** — error aggregation (Sentry-class) on api + web, and per-call model latency/token logging in `answerFromKB`. *(Structured pino logging is done — [`dev-setup.md`](dev-setup.md) §7.)*
- **Cost ceiling + agent observability** — a per-workspace daily budget counter + an OpenAI token-usage column on `CopilotQuery` (also unlocks real cost analytics). *(The cheap caps — question length, `max_completion_tokens`, low temperature, rate limits — are done.)* **Raised in priority 2026-07-27 by Copilot mode:** `CopilotQuery` records no **mode**, no **round count**, and no **tools used**, so (a) a founder who switches to Copilot mode sees no evidence it behaves differently, and (b) the escalation-rate/cost measurement that decides *"should AI Chatbot collapse into Copilot?"* is **currently impossible**. Small, additive, and it pairs with the token column above — [`unified-agent.md`](unified-agent.md) §9 Gap 2. *(The spend guard itself stays deliberately unbuilt — founder decision 2026-07-26; revisit before real customer traffic.)*
- **Extension injection scope** — switch the recorder from static `<all_urls>` content-script injection to programmatic injection into session tabs only (lower Web-Store scrutiny + better privacy optics; the on-demand `armTab` machinery already exists).
- **Signup gate** — an invite/allowlist gate for private beta (deliberately left open; sign-in rate-limiting + email verification/reset are done).
- **Capture quality** — type-aware distill labels (`typed`/`pressed`/`scrolled to`), inner-container scroll capture, `Enter`+`submit` merge in `clean.ts`, the multi-tab screenshot wrong-tab case, and the **full-page-nav capture gap** (late `change`/post-action loss — candidate fix: flush field values on `submit` + a `pagehide` flush).
- **Studio/widget polish** — range-window the coverage-gap "asked N×" count (+ fuzzy gap matching), per-workspace timezone for analytics day-bucketing, client-side history slicing + widget `maxlength`, widget a11y (dialog role, focus management, thumb labels), a real deflection metric, and a CORS-scope note.

---

## 10. Doc map

Grouped by role. **Orientation** first (every other doc points back to these three), then build specs (shipped · forward), operations, reference, go-to-market, and archive.

**Orientation — start here**

| Doc | Role |
|---|---|
| **`roadmap.md`** (this) | **The map** — versions/phases/modules, status, legacy mapping. |
| [`product.md`](product.md) | What FlowBuddy is, who it's for, **why copilot-first** (decision record + grounding model + guardrails), moats, surfaces, risks, metrics. |
| [`architecture.md`](architecture.md) | Canonical **technical** model — 3 modules, KB schema, data model, decisions, flows. |

**Build specs — shipped (Version 1, live)**

| Doc | Role |
|---|---|
| [`phase-1-copilot.md`](phase-1-copilot.md) | **Phase 1 (copilot)** — scope/DoD/acceptance + per-module plan & **as-built** + capture contract + privacy + recorder/PII backlog. |
| [`phase-2-sense.md`](phase-2-sense.md) | **Phase 2 (Sense + Reason)** — ✅ built + live. **Part A · Sense** (P2-M0…M4): the copilot localizes the end-user to workflow + step (ask-time read-only probe; hybrid — client scores → top-k hypotheses ride `/answer` → the LLM disambiguates with the question) and answers positionally (unstick step k → path; step-level citation; tie → "X or Y?"; re-probe every follow-up). **Part B · Reason** (P2-M5): diagnostic "why can't I proceed?" — selective trigger → ask-time structured page-state capture (± a lazy clone-masked page image) + the founder's expected state (true screenshot + DOM) → stronger-model agentic read-tool diagnosis of expected-vs-actual. Includes the trust-ladder posture split, the image value analysis, the Sense→Reason flow, and both as-built file maps. |
| [`kb-step-distillation.md`](kb-step-distillation.md) | **KB step quality (built)** — distill raw capture events → clean per-workflow steps (heuristics + LLM); design + as-built. |

**Build specs — forward (planned · draft · direction)**

| Doc | Role |
|---|---|
| [`unified-agent.md`](unified-agent.md) | **The Unified Agent — 🟩 MODE 2 ("Copilot", the read-only agent) BUILT + USER-VERIFIED E2E 2026-07-27.** Decisions locked 2026-07-25/26. **§0 = plain-language orientation** (Phase 4 = hands · Phase 5 = brain · unified agent = one assistant using both) with the end-to-end user scenario and a where-we-are table. **⭐ D9 (2026-07-26) — THREE OPERATING MODES = THE PRICING TIERS: `1 Copilot` (today, unchanged; also the runtime fallback) · `2 Agent (read-only)` (the unified loop, `execute_step` not bound) · `3 Agent (acting)`. The boundary is at *acting*, not at *the agent*** — Tell/Guide leave the user as the actor, Do transfers accountability, and the ~zero-risk read-only half is deliberately not gated behind the risky half. Per-mode build spec in §4. One chat, one agentic loop, one grounded tool surface: **Tell · Show · Do become tools the agent calls turn by turn**, not tiers routed to once. **Unify deliberation, never actuation** — *the agent's action space is the KB, not the DOM*, enforced in the tools rather than the prompt. Records 7 locked decisions (incl. **point-and-type for sensitive input**, manual-only advancement, sensing-informs-the-click, founder posture over a latency dial), the `CopilotQuery.question` raw-PII finding, the roadmap consequences (P5-M3 dissolves; **P4-M2 is the critical path**), and the 5 open questions blocking the design doc. **Read alongside Phase 4 and Phase 5 below** — their module detail stays authoritative; this is newer on *structure*. **§9 records the three gaps left in mode 2** (product understanding · no mode/round/tool logging · the un-merged diagnostic path) and the suggested order. |
| [`phase-4-autopilot.md`](phase-4-autopilot.md) | **Phase 4 (Autopilot)** — agentic execution: the copilot offers to execute approved workflows in the end-user's live session (grounded actions); **P4-M0 guided walkthrough ✅ built (§8 as-built)**; M1…M3 to plan; opened ahead of Phase 3. **Structure superseded in spirit by [`unified-agent.md`](unified-agent.md)** — Phase 4 becomes the acting tool layer under one agent. |
| [`phase-5-converse.md`](phase-5-converse.md) | **Phase 5 (Converse / the goal-based agent) — 📝 draft design.** The Tell → Guide → Do ladder over goal understanding: conversational foundation (persistent chat, continuity retrieval) + goal thread + product-profile KB + tier router + execution orchestration (P5 = brain, P4 = hands). Modules P5-M0…M4; this map gains its phase section when the design locks. **Structure superseded in spirit by [`unified-agent.md`](unified-agent.md)** — the ladder becomes tool choice (P5-M3 dissolves), §5 Q3 resolves to always-confirm, and **P5-M0 was the correct next build — cuts 1 + 2 ✅ BUILT AND USER-VERIFIED E2E 2026-07-26.** Cut 1 (chat persistence): the conversation survives full-page navigations via the new shared slot store `widget/src/session.ts` (the walkthrough refactored onto it; the unified agent's run state is its third consumer), with typed message kinds + a persist allowlist as the privacy boundary. Cut 2 (continuity bias): the previous answer's cited workflows ride `/answer` as `context.lastCited` (approval-re-verified) and weight retrieval **below** the two measured signals, so a term-less follow-up stays in the workflow being discussed. §5 Q2 resolved. **Cut 3 (query condensation) DROPPED** — cut 2 took its common case for free, and the mode-2 agent absorbs the rest. **Next: the read-only agent (mode 2).** |
| [`phase-6-interop.md`](phase-6-interop.md) | **Phase 6 (Interop / the open agent interface) — 📝 direction, not yet designed.** Expose the approved KB to **third-party AI agents** so they can operate the customer's product: the `agents` audience on the same per-workflow approval model + workspace opt-in, one **two-layer** export of distilled workflows (instructional layer universal · ranked-locator machine layer optional; values masked; screenshots gated by PII Cut 2). Transports recommended: **remote MCP (v1 lead) · markdown/`llms.txt` (v1 rider) · WebMCP registered by the widget snippet (the fleet-wide prepared bet) · bespoke REST skipped**; feasibility head start = the P2-M0 sense-plan compiler. Extends `ONE KB → per-target approval → {Copilot, Portal, Agents}`; scope = any web app with workflows. Candidate modules P6-M0…M4 + build sequence. |
| [`v2-portal.md`](v2-portal.md) | **Version 2 portal track (by-products)** — the forward feature list for the help portal & articles: render approved workflows + per-audience approval + presentation overlay + productization; modules V2 · P0…P6, all to build. |
| [`v3-company-agent.md`](v3-company-agent.md) | **Version 3 (the company agent / buyer-side track) — 📝 direction, not designed/scheduled.** The ownership flip: any company records the tools it **uses** (same extension + Studio) → an owned, internal-use-approved workflow/SOP KB → a **second Chrome extension: FlowBuddy's own browser-use agent** runs those apps for the company — executes only recorded + approved workflows, never free-form browsing (the grounded answer to Claude-for-Chrome-class improvisation). One replay core, three drivers (P3 sandbox · P4 widget · V3 extension); consumes P6's export seam. Candidate modules V3-M0…M4. |

**Operations — build, run, ship, test**

| Doc | Role |
|---|---|
| [`dev-setup.md`](dev-setup.md) | Local dev / tooling (pnpm · Turborepo · docker-compose · Prisma) — and the **canonical logging reference** (§7). |
| [`deploy.md`](deploy.md) | **Render deploy guide — both environments.** Shared foundations (two-blueprint model, R2, suffix gotcha, logging, worker-folded model) + the **dev/staging** free-tier walkthrough (every first-deploy gotcha) + the **production** (FlowBuddyAI.com) topology/plans, DNS, as-run runbook, release flow, upgrades, scaling ladder. **Prod deployed; V1 launched + user-verified E2E.** |
| [`e2e-testing.md`](e2e-testing.md) | **Manual E2E test plan** — clean slate → record → KB → approve → embed → ask → analytics; per-step PASS signals. **3 levels:** local · dev (Render, incl. data reset) · prod. |
| [`extension-releases.md`](extension-releases.md) | **Chrome Web Store release log (living)** — one entry per store build of the recorder (what shipped · permissions deltas · baked targets · status) + the cut-a-release checklist. Updated at every packaging. |

**Reference — deep dives**

| Doc | Role |
|---|---|
| [`internals/`](internals/README.md) | **How it RUNS** — low-level per-module mechanics + data flow + a connections map (engineering deep-dive; complements this map's *why/what*). Start at `internals/connections.md`. Follows the code — source wins on conflict. |
| [`design_system/`](design_system/README.md) | **Design system (indigo brand)** — tokens · components · the full Studio UI kit; the source of truth for ALL UI. |
| [`competitive-claude-chrome.md`](competitive-claude-chrome.md) | **Competitive reference: Claude for Chrome (living)** — capabilities, permissions/safety model, head-to-head vs FlowBuddy, the beat-Claude plays; feeds Phase-4/5 design. Re-check on major Anthropic releases. |

**Go-to-market**

| Doc | Role |
|---|---|
| [`landing-page.md`](landing-page.md) | **Landing page (ideas, positioning & structure)** — the flowbuddyai.com marketing page plan: the one-KB-many-consumers story (record → copilot · portal · third-party agents), the "AI-agent-ready" positioning direction, proposed sections, and open decisions. |

**Archive — historical record**

| Doc | Role |
|---|---|
| [`archive/phase-1-review.md`](archive/phase-1-review.md) | **Phase-1 E2E review (2026-07-03), archived** — the full-codebase audit that drove the post-Phase-1 hardening; nearly all findings landed. Its still-open items live as the **Phase 1 backlog** (§9). |
