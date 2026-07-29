# FlowBuddy — Roadmap & Status (Versions · Phases · Modules)

> **What this is.** The authoritative map of the product — **Versions → Phases → Modules** — with the **status of every module** and the legacy-ID mapping so none of the work is lost. **Version 1 ships the copilot first.** For *why* copilot-first see [`product.md`](product/product.md) §5; for the *technical* model see [`architecture.md`](product/architecture.md); for build detail see [`copilot.md`](build/copilot.md) (Phase 1), [`sense-and-reason.md`](build/sense-and-reason.md) (Phase 2), [`agent.md`](build/agent.md) (Phase 4); the V2 portal track: [`portal.md`](build/portal.md). KB step-quality work (raw events → clean per-workflow steps) is **built & verified end-to-end** — see [`kb-step-distillation.md`](build/kb-step-distillation.md).

- **Status:** Locked v1.0 (structure, 2026-06-22) · **as-of:** 2026-07-29 · **Branch:** `dev`
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

**⭐ The copilot now ships in THREE OPERATING MODES** (D9 — [`agent.md`](build/agent.md)), founder-selected
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

*(Phase numbers were redefined twice — 2026-06-22 and 2026-07-08 — reaching the arc above. The old numbering appears in no current doc; `git log docs/roadmap.md` has the mappings.)*

### Legend

| Badge | Status | Meaning |
|:---:|---|---|
| ✅ | **Done** | Built, verified end-to-end, nothing outstanding for this scope. |
| 🔄 | **In Progress** | Core shipped or config ready, but work remains (deferred items, a pending upgrade, or a user-gated step). |
| 📝 | **Draft** | Planned / specified but not started. |

---

## 1. Phase 0 — Discovery spike — ✅ DONE (verdict: GO, 2026-06-18)

A throwaway spike answered one question before any product was built — **does capture → KB generation actually work?** It did. The code was disposable; the capture engine and synthesis prompts carried into Phase 1. The decisions it locked (OpenAI, fully multimodal, Node/TS, API key backend-only) are recorded in [`architecture.md`](product/architecture.md).

---

## 2. Phase 1 — Copilot ⭐ (the Version 1 release)

**Goal:** a SaaS records its product, approves workflows for the copilot, drops in a `<script>`, and its end-users get an in-app chat widget that answers **grounded only in approved-KB**, with citations and honest declines. **Decoupled** from articles/portal. Build/spec/as-built detail: [`copilot.md`](build/copilot.md).

| Module | What it is | Status | Legacy |
|:---|:---|:---|:---|
| **P1-M0** | Monorepo, infrastructure & auth (Postgres, R2/MinIO, Redis/BullMQ, Auth.js, api, worker, multi-tenancy) | ✅ **Done** | M0, M1 |
| **P1-M1** | Recorder / workflow capture (Chrome extension: events + DOM + screenshots + narration) | ✅ **Done** — **v0.7.0 "FlowBuddy Recorder" LIVE on the Chrome Web Store**: the upload-identity release production requires — `X-FlowBuddy-Upload-Id` so a retry can never create a second recording, artifacts uploaded directly to object storage while recording (narration at Stop), and abandoned captures discarded server-side. Bakes `app.flowbuddyai.com` + the dev Studio + localhost, FlowBuddy "F" icons, carries **R13 ranked locators** (the Sense/Phase-3 enabler) + structured logging. **⚠️ Ordering lesson worth keeping:** the API that *requires* this build shipped to production first (2026-07-28, by explicit decision — no customers on prod), which left a window where the then-published v0.6.0 could not upload at all. v0.7.0 going live closed it. The store-first rule ([`deploy.md`](ops/deploy.md) §7.6) exists for exactly this, and it only survived because nobody was using the product. Full log: [`extension-releases.md`](ops/extension-releases.md). | M2 |
| **P1-M2** | Knowledge Base (`KnowledgeSource`/`KnowledgeItem`, transcript, segmentation → **distilled per-workflow steps**, keyword index) | ✅ **Done** — incl. step distillation ([`kb-step-distillation.md`](build/kb-step-distillation.md), 2026-06-27) | M3, M6 |
| **P1-M3** | Retrieval & grounding engine (retrieve → ground → answer-or-decline) | ✅ **Done** (2026-07-07) — **hybrid keyword + pgvector retrieval** (RRF fusion, `text-embedding-3-small`, worker embeds at KB build, keyword fallback on any vector failure; no backfill — dev reset); Render `vector` support confirmed 2026-07-06 | M7 (+ M11 retrieval) |
| **P1-M4** | Cloud deploy (Render + R2) — the copilot must be live to embed | ✅ **Done** — **prod LIVE at flowbuddyai.com since 2026-07-23** (paid two-blueprint stack: root `render.yaml` from `main`, worker folded into the api — [`deploy.md`](ops/deploy.md)); dev at `flowbuddy-dev-web.onrender.com` (`render.dev.yaml` from `dev`) | M8 |
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

**Goal:** the copilot knows **where the user is** — not just the page (P1-M8's route bias) but **which approved workflow and which step** — and answers **positionally**. An end-user stuck on step 3 of a 5-step KB workflow opens the copilot and asks; the widget runs an ask-time **read-only probe** of approved workflows' captured locators against the live page, scores the **top-k hypotheses**, and ships them on the existing `/answer` call — the answer LLM makes the final call *with the question in hand* (**hybrid** localization, locked) and answers: **unstick step 3, then the path to done** (step-level citation; genuine tie → "are you doing X or Y?"; re-probe every follow-up). **Read-only sensing, never surveillance** — no acting (that's Phase 4), no end-user recording, only booleans + one masked error snippet leave the page. Context **biases, never overrides** — unrelated questions answer exactly as today. **Design locked + built 2026-07-08; USER-VERIFIED E2E 2026-07-09** (three E2E hardening fixes landed during verification) — detail + as-built: [`sense-and-reason.md`](build/sense-and-reason.md) (Part A).

| Module | What it is | Status | Legacy |
|:---|:---|:---|:---|
| **P2-M0** | **Sense plan — compile + serve** (approved workflows → steps × ranked locators + routes + outcome markers; key-authed endpoint, cached; gated by the per-workspace Sense toggle) | ✅ **Done** — built 2026-07-08, user-verified E2E 2026-07-09 | — (new) |
| **P2-M1** | **Widget probe + scorer** (ask-time read-only probe → evidence booleans + masked error snippet → deterministic top-k hypotheses; re-probe per follow-up) | ✅ **Done** — built 2026-07-08, user-verified E2E 2026-07-09 | — (new) |
| **P2-M2** | **Positional answering** (`/answer` takes hypotheses; three-tier relevance — ignore / positional / deictic-primary; unstick-then-path; step-level citations; tie → ask) | ✅ **Done** — built 2026-07-08, user-verified E2E 2026-07-09 | — (new) |
| **P2-M3** | **"Show me" highlight** — config-gated single-step element highlight on the host page (on → show, off → text-only) | ✅ **Done** — built 2026-07-08, user-verified E2E 2026-07-09 | — (new) |
| **P2-M4** | **Step-level friction analytics** (must-have) — localization outcomes logged (`used\|ignored\|none`) → Studio per-step friction view + passive drift signals | ✅ **Done** — built 2026-07-08, user-verified E2E 2026-07-09 | — (new) |
| **P2-M5** | **Reason — diagnostic reasoning** ("why can't I proceed?"): ask-time structured page-state capture (roles/states/validity/hint-text, values masked) + the founder's expected-state step screenshot → a stronger model diagnoses expected-vs-actual in an agentic read-tool loop (the skeleton Phase 4 inherits) | ✅ **Done** ([`sense-and-reason.md`](build/sense-and-reason.md) Part B) | — (new) |

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

**Goal:** the copilot moves from *telling* to **doing** — after a grounded answer, the widget offers to **execute the approved workflow in the end-user's live session** (resolve ranked locators → act → verify `expected_outcome` → next step / ask the user / safe-stop), with the end-user consenting, watching, and able to abort at any moment. **Grounded actions:** Autopilot only executes workflows the founder **recorded and approved** — a second audience flag alongside `copilot` on the same approval model (the V2 portal adds `portal` as a third) — never free-form agent browsing. Human-in-the-loop by construction: captured input values are masked, so every input is prompted at run time. Full understanding + design questions: [`agent.md`](build/agent.md).

| Module | What it is | Status |
|:---|:---|:---|
| **P4-M0** | **Guided walkthrough** — "Walk me through it" on positional answers: highlight each remaining step + follow the user's progress (auto-detect + Next fallback, cross-nav resume, run analytics); no acting (the zero-risk stepping stone) | ✅ **Done** — built 2026-07-15 ([`agent.md`](build/agent.md) §A8 as-built); needs Sense; **default ON for new workspaces since 2026-07-27** (Copilot mode decides per message, so the switch is a permission rather than a rule) |
| **P4-M1** | **Autopilot gate** — the `autopilot` audience flag + validated-current certification (offer execution only on approved **and** green-validated workflows) | 📝 **Draft** |
| **P4-M2** | **Widget execution driver** — consent UX, visible step-by-step run, per-input prompts, pause/abort/takeover, resume across navigations | 📝 **Draft** |
| **P4-M3** | **Safety rails + telemetry** — destructive-step confirmation, safe-stop semantics, execution audit log, drift feedback to Phase 3 | 📝 **Draft** |

**Depends on:** **Phase 3** — its replay core is the execution engine (one shared core, two drivers) and its validation signal is the safety certification (a workflow Phase 3 can't replay green is never offered for execution); an Autopilot safe-stop in production feeds back as a live drift signal. **Phase 2 (Sense)** — mid-workflow entry ("finish from step 3") consumes Sense's workflow/step localization. Also consumes Phase 1's R13 ranked locators, `post_action`/`expected_outcome`, routes, and the in-page widget as the execution surface. **Sequencing (decided 2026-07-15): the phase opened ahead of Phase 3** — P4-M0 is zero-acting and has no Phase-3 dependency; the acting modules (M1–M3) design the eligibility gate with pluggable signals so Phase-3 certification slots in when it lands.

---

## 6. Version 2 — additional capture modalities + product depth (deferred)

Outside Version 1. Three groups:

- **Help Portal & Articles (the portal track)** — the human-facing by-products, **moved out of Version 1 on 2026-07-08** (previously Phase 2): render approved workflows as articles + per-audience approval + presentation overlay + a public portal + productization. Full feature list: [`portal.md`](build/portal.md).
- **Capture modalities** — **narration-only capture (1.2)** + **video capture (1.3)** + the narration-derived `static` explainer-article path. The KB stays modality-agnostic (`kind`, item `step|topic`) so these slot in additively. See [`architecture.md`](product/architecture.md) → Product versions.
- **Product depth** — the Phase-1 feature backlog **moved here by scope decision (2026-07-06)**: Version 1 ships with the copilot loop as-is; these deepen it afterwards. *(Kept in Phase 1 by the same decision — and both since shipped: the **real-widget tester (Approach B)** — **merged 2026-07-08** (the preview embeds the real widget bundle in `data-flowbuddy-preview` mode; Approach A retired → one answer path); **pgvector (P1-M3)** — **built 2026-07-07** (hybrid keyword+vector).)*

| Module | What it is | Status |
|:---|:---|:---|
| **V2 · P0…P6** | **Help Portal & Articles track** (ex-Phase 2, moved 2026-07-08) — publish foundation (per-audience approval + presentation overlay) · Text→Article · public portal · search UI · authoring depth · productization (incl. **PII Cut 2**: screenshot OCR/blur, gates publish) · coverage analytics + collaboration | 📝 **Draft** — [`portal.md`](build/portal.md) |
| **V2 · 1.2** | **Narration-only capture** (+ narration-derived `static` explainer articles) | 📝 **Draft** — deferred |
| **V2 · 1.3** | **Video capture** | 📝 **Draft** — deferred |
| **V2 · D1** | **Analytics depth** (ex-P1-M10 backlog) — 👎 feedback drill-down · richer gap states (partial/recording) · period deltas · ~~query log~~ **+ export** · real deflection metric · ~~citation backfill~~ | 📝 **Draft** — moved from Phase 1 (2026-07-06). **Two items pulled forward + shipped 2026-07-27:** the **question log** (`/dashboard/analytics/questions` — searchable, filterable, paged; export still deferred), and the **citation count fix** — which turned out not to need a backfill: the writer now stores one row per *workflow* (it was one per cited *step*, so row-counting readers ranked workflows by length, not use) and the readers count **distinct `queryId`**, which is correct for the old rows and the new ones alike. Rode along: `CopilotQuery.question`/`CoverageGap.prompt` are now PII-scrubbed on write. |
| **V2 · D2** | **Copilot-page extensions** (ex-P1-M6/M9 backlog) — decline-threshold persistence + enforcement · F17 origin-blocked state (needs a blocked-origin signal). *Real-widget tester (Approach B) stayed in Phase 1 — shipped, merged 2026-07-08.* | 📝 **Draft** — moved from Phase 1 (2026-07-06) |
| **V2 · D3** | **Recorder UX features** (ex-P1-M11 backlog) — R5 marker hotkey + labels · pre-upload review (thumbnails/discard) · undo last event · local draft/crash recovery · per-workspace capture profiles | 📝 **Draft** — moved from Phase 1 (2026-07-06) |
| **V2 · D4** | **Studio polish** (ex-Phase-1 backlog) — Recordings Tier 3 (sort/bulk) · signup invite gate · token-management UI (list/revoke; pairs with per-device tokens). | 📝 **Draft** — moved from Phase 1 (2026-07-06) |

---

## 7. Version 3 — the company agent (buyer-side track) — 📝 direction

**The ownership flip:** Versions 1–2 point FlowBuddy at the product a company **makes**; Version 3 points it at the products a company **uses**. Same extension + Studio: a company records the tools and processes it uses (third-party SaaS, internal tools) → an approved workflow/SOP KB **the company owns** → **a second Chrome extension — the company agent**: a browser-use AI agent (Claude-for-Chrome-class surface, FlowBuddy-grounded behavior) the company itself uses to run those applications — **executing only recorded + approved workflows, never free-form browsing**. Reuses the shared replay core (one core, three drivers: P3 sandbox · P4 widget · V3 extension) and consumes the KB through P6's export seam. Direction captured 2026-07-25; candidate modules **V3-M0…M4** + open questions: [`company-agent.md`](build/company-agent.md) — gains its module table when designed.

---

## 8. Legacy ID → new module map

Retired. The Phase-1 renumbering finished long ago and no doc or code refers to the legacy `M0…M13` ids any more. `git show 844a316:docs/roadmap.md` has the table if an old note ever needs decoding.

---

## 9. What's left to ship Version 1

Only **Phase 1** gates the Version 1 release — and the release-gating work is **done**: the copilot is built, verified, and **deployed** (Render + R2). **2026-07-06:** the [`archive/phase-1-review.md`](archive/phase-1-review.md) remediation landed (`1bba47b`, user-verified E2E) — all P0 public-surface hardening (§2.1–2.7), retrieval consolidated into one `@flowbuddy/synthesis` seam (§3.1/3.2 — pgvector now has a single landing spot), transcription degradation (§3.3), graceful shutdown (§3.4), and the KB-page honesty reword (§4.5); **later that day, auth hardening §3.6 Cuts 2+3** (sign-in rate limiting + Resend-backed email verification & password reset — signup gate deliberately open). What remains is discretionary hardening + optional upgrades, none of it release-blocking:

1. ✅ **P1-M11** — capture-reliability backlog **complete** (2026-07-06): R1/R2/R3/R6 + Pause/Resume + R1 cross-origin + R9 multi-tab + R8 iframe + R4 SW-eviction resilience + R7 on-page control bar + R10 scroll/hover/keyboard + R12 screenshot timing/cost + **R13 ranked multi-signal locators** (the Phase-3 replay enabler) are all **shipped**. **R5** (marker hotkey/labels) and the recorder UX parking lot moved to **Version 2 · D3** (scope decision 2026-07-06); the R12 follow-ups stay parked.
2. 🔄 **P1-M12** — **Cut 1** (copilot answer-path PII scrub) is done; **Cut 2** (screenshot/DOM pixel OCR/blur) is deferred to **Version 2 (portal track)** — not release-blocking.
3. ✅ **P1-M3** — the pgvector upgrade **shipped 2026-07-07** as **hybrid keyword + vector retrieval** (RRF fusion inside the single `synthesis/retrieval.ts` seam; worker embeds at KB build; every vector-path failure degrades to the keyword shortlist).

> Everything else in Phase 1 is ✅ and **P1-M4 cloud deploy is done — and the Version 1 release SHIPPED: launched in production at flowbuddyai.com 2026-07-23, user-verified E2E** ([`deploy.md`](ops/deploy.md)); the items above are follow-on quality/robustness work.

### Phase 1 backlog (discretionary, post-release — not gating)

The residual open items from the Phase-1 end-to-end review — nothing release-blocking; schedule deliberately. Full detail behind each: [`archive/phase-1-review.md`](archive/phase-1-review.md).

- **Automated test layer — ✅ started 2026-07-27, extended 2026-07-29; still partial.** `@flowbuddy/synthesis` carries the repo's first tests (`vitest`, run as `pnpm test` beside typecheck; **49 passing**, no CI): the shared answer loop (round + tool budgets, de-duplication by name **and** arguments, what the loop reports back), `formatItems`, the retrieval shortlist's signal ordering, `sanitizeHistory`, and the operating-mode vocabulary. Beside them `scripts/copilot-baseline.mjs` measures answer *quality* against a fixed question set — including multi-turn cases where the question under test arrives as a follow-up. **Still uncovered:** `cleanEvents`, `redactText` (Luhn/phone/email edges), `shortcutCombo`, the segmenter carry-forward guard, `checkRateLimit`, `distillSteps` grounding validation, `highlightFromBbox` — and the diagnostic path, which has no coverage at all and is the hard prerequisite for folding it into the agent loop ([`agent.md`](build/agent.md) §9 Gap 3).
- **Observability** — error aggregation (Sentry-class) on api + web, and per-call model latency/token logging in `answerFromKB`. *(Structured pino logging is done — [`dev-setup.md`](ops/dev-setup.md) §7.)*
- **Cost ceiling + agent observability** — a per-workspace daily budget counter + an OpenAI token-usage column on `CopilotQuery` (also unlocks real cost analytics). *(The cheap caps — question length, `max_completion_tokens`, low temperature, rate limits — are done.)* **Raised in priority 2026-07-27 by Copilot mode, and the answer-path half ✅ CLOSED 2026-07-29:** `CopilotQuery` now records **mode** (the workspace setting) · **engine** (what actually answered) · **rounds** · **toolCalls** — four nullable columns, nothing back-filled, so an older row honestly reads "unknown" — and the api emits one `copilot answer` log line per question. `engine` is deliberately *not* `mode`: the diagnostic path preempts the agent whenever the widget shipped page state, and the safety floor answers as AI Chatbot while the mode still reads Copilot, so recording only the setting would attribute both to the wrong engine. *"Should AI Chatbot collapse into Copilot?"* is now a query rather than an opinion — [`agent.md`](build/agent.md) §9 Gap 2. **Still open here:** the token-usage column, the daily budget counter, and a Studio surface — nothing in `web` reads the new columns yet. *(The spend guard itself stays deliberately unbuilt — founder decision 2026-07-26; revisit before real customer traffic.)*
- **Extension injection scope** — switch the recorder from static `<all_urls>` content-script injection to programmatic injection into session tabs only (lower Web-Store scrutiny + better privacy optics; the on-demand `armTab` machinery already exists).
- **Signup gate** — an invite/allowlist gate for private beta (deliberately left open; sign-in rate-limiting + email verification/reset are done).
- **Presigned artifact uploads carry no size ceiling — ⏸ DEFERRED BY DECISION (2026-07-28), revisit later.** Opened by the idempotent-upload change: artifacts now go browser → object storage directly, so the API never sees those bytes and neither of its caps applies to them (`MAX_BUNDLE_BYTES` = 500 MB total and the 300 MB per-file multipart limit only ever covered the `/v1/sessions` bundle, which is now just the fallback). A signed URL authorizes *one key*, not *a size*, so a recording can write an unbounded amount.
  **Risk is modest but real:** not an abuse vector (minting a URL needs the workspace's own recorder token), but a runaway capture loop or pathological DOM snapshots would show up as a storage bill rather than an error — and a **leaked recorder token** now has a much larger blast radius than it did when everything went through a rate-limited API.
  **The fix, when it happens:** sign each URL with an exact `ContentLength` so storage itself rejects a different-sized body — real enforcement, not a declared size the client could lie about. The cost is that the recorder must know each artifact's byte size *before* signing, and it currently signs a batch of 25 paths and only builds the blobs afterwards; that loop has to be reordered to build-then-sign (~25 blobs in memory at once). Deferred rather than rushed into a hardening batch, because it reorders a hot path.
  *(The two sibling gaps opened at the same time are now CLOSED: abandoned recordings are swept — explicit discard via `DELETE /v1/uploads/:uploadId` plus a 12-hour server-side sweep riding on finalize; and R2 + CORS on a browser-issued presigned PUT is **verified on dev/Render**, 2026-07-28.)*
- **Capture quality** — type-aware distill labels (`typed`/`pressed`/`scrolled to`), inner-container scroll capture, `Enter`+`submit` merge in `clean.ts`, the multi-tab screenshot wrong-tab case, and the **full-page-nav capture gap** (late `change`/post-action loss — candidate fix: flush field values on `submit` + a `pagehide` flush).
- **Studio/widget polish** — range-window the coverage-gap "asked N×" count (+ fuzzy gap matching), per-workspace timezone for analytics day-bucketing, client-side history slicing + widget `maxlength`, widget a11y (dialog role, focus management, thumb labels), a real deflection metric, and a CORS-scope note.

---

## 10. Doc map

Moved to [`README.md`](README.md) — one navigation surface, so a doc's *description* and its
*status* stop drifting apart. This file owns status; that one owns "which doc holds what".
