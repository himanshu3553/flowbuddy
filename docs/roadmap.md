# FlowBuddy — Roadmap & Status (Versions · Phases · Modules)

> **What this is.** The authoritative map of the product — **Versions → Phases → Modules** — with the **status of every module** and the legacy-ID mapping so none of the work is lost. **Version 1 ships the copilot first.** For *why* copilot-first see [`product.md`](product/product.md) §5; for the *technical* model see [`architecture.md`](product/architecture.md); for build detail see [`copilot.md`](build/copilot.md) (Phase 1), [`sense-and-reason.md`](build/sense-and-reason.md) (Phase 2), [`agent.md`](build/agent.md) (Phase 4); the V2 portal track: [`portal.md`](build/portal.md). KB step-quality work (raw events → clean per-workflow steps) is **built & verified end-to-end** — see [`kb-step-distillation.md`](build/kb-step-distillation.md).

- **Status:** Locked v1.0 (structure, 2026-06-22)
- **This doc wins** on phase/module structure and priority; the per-phase docs hold the detail.
- **Section numbers are addresses, not sequence — and they are append-only.** Two dozen `§`-pointers across the corpus resolve against them, and a renumber leaves every one of those links valid while making its meaning wrong — the one drift a link checker cannot catch. So **Phase 5 and Phase 6 were appended after the Version 2/3 material** (sections 11 and 12) instead of being inserted in phase order, and any future section goes at the end too. An honest ordering note is cheaper than two dozen quietly-wrong pointers.

---

## 0. The shape of Version 1

**Version 1 = FlowBuddy, the workflow-capture product, released in phases. Phase 1 is the copilot and ships first.**

```
VERSION 1 — Workflow capture · copilot-first        ✅ LAUNCHED — live in production (flowbuddyai.com)
│
├─ PHASE 1 · Copilot ⭐ (the V1 release)        🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟨   12 done · 1 in progress
├─ PHASE 2 · Sense — in-context help            🟩🟩🟩🟩🟩🟩🟨               6 done+verified · 1 in progress
├─ PHASE 3 · Self-validation & freshness (moat) 🟩🟨🟨⬜                     1 done · 2 in progress · replay to be planned
└─ PHASE 4 · Autopilot — agentic execution      🟩🟩🟩🟩                     v1 COMPLETE — all 4 modules (deferrals in agent.md)

BEYOND THE V1 ARC — opened, but not part of the Version 1 release
├─ PHASE 5 · Converse — the goal layer (brain)  🟩⬜🟨🟨                     1 done · 1 draft · 2 in progress · M3 dissolved → §11
└─ PHASE 6 · Interop — the KB for other agents  ⬜⬜⬜⬜⬜⬜⬜                 direction · not designed, not scheduled → §12

VERSION 2 — Portal & articles · modalities · depth  ⬜×13                   deferred

VERSION 3 — Buyer-side: record the tools you USE · the company agent       📝 direction
```

*(The dashboard carries glyphs, never dates — a module's dates live in its phase's table below, once.
Phase 5's four squares are M0/M1/M2/M4; **M3 has no square because it was dissolved**, not deferred.)*

**⭐ The copilot ships in TWO OPERATING MODES** (D9 + D10 — [`agent.md`](build/agent.md)), founder-selected
per workspace and also the pricing tiers. This cuts ACROSS the phases above rather than sitting inside one:

```
1 · Copilot      the read-only agent: it decides how    🟩 BUILT + user-verified E2E
                 to help, turn by turn. Never acts.        ⭐ what every workspace gets
2 · AI Agent     adds acting on the user's behalf —     🟩 BUILT + user-verified E2E
                 consented, narrated, verified runs.       never a default · selectable only behind
                                                           a recorded terms acceptance
```

**A third rung below these — `AI Chatbot`, single-shot answers with fixed rules for the rest — was
RETIRED 2026-08-02** (D10). It was a strictly worse Copilot carrying a second prompt and a second
knowledge renderer that had to be tuned in parallel forever. Its ENGINE survives as the floor
beneath a failed agent loop — the agent's own prompt, one round, no tools — but it is not a mode,
has no stored value, and cannot be selected. Migration `20260802180000_retire_chatbot_mode` moves
any surviving row to `copilot`; a row that escapes it reads forward correctly anyway, because
parsing fails closed.

Every mode stays switchable both ways in Studio → Copilot → Settings. Copilot is now BOTH the
product default and the fail-closed floor, so `NEW_WORKSPACE_MODE` and `DEFAULT_COPILOT_MODE` read
identically — and are still deliberately two constants, because the day the default climbs to
`AI Agent` the floor must not follow. The floor's rule is no longer "the rung that can do least" but
**the rung that cannot ACT**, which was always the part that mattered.

**🧠 Application Intelligence Layer — 🔄 slices 0–3 BUILT + live-verified 2026-08-02.** The KB's
next altitude, and the answer to Copilot mode's top gap ("knows the recipes, not the product" —
[`agent.md`](build/agent.md) §9 Gap 1): derive what the product **IS**
from the same recorded narration workflows already come from. Evolves **P5-M2 Product Profile**
from founder-authored to derivation-first. Decisions AI-1…AI-9 + the road:
[`application-intelligence.md`](build/application-intelligence.md).
- **Slice 0 (transcript gate)** ✅ ran 2026-08-01 — pre-coaching narration was ~90% click-commentary; the coached re-recording (11 workflows, ~10k chars) has the register the extractor needs and is the calibration set.
- **Slice 1 (recording description)** ✅ built + verified E2E locally — every processed recording derives "what this recording covers"; shown on the recordings list + detail page.
- **Slice 2 (overview + concept pages)** ✅ **built + verified E2E 2026-08-02** — quote-anchored extraction in the worker, pages born unapproved with narration provenance, pending-update flow for approved pages, Studio "Product knowledge" review section, retrieval serving live pages as a second corpus rendered as PRODUCT BACKGROUND in every engine (pages emit no citations in v1). First live run: 10 pages, 10/10 anchored, founder-approved in Studio; the three canonical orienting questions answer (one with cross-page synthesis) and uncovered questions still decline.
- **Slice 3 (links + area pages)** ✅ **built + live-verified 2026-08-02** — `area` page type; per-page related-workflow links, title-anchored at extraction and resolved to durable workflow ids at sync; answers surface them as live-approval-filtered `get_workflow` keys (the WHAT→HOW bridge); Studio "Points to" chips. Page↔page links deferred. The live run exercised the whole lifecycle at once: 2 area pages born unapproved, 3 pending updates parked on approved pages, links populated, live content untouched.
- **Baseline formalized 2026-08-02** (`copilot-baseline-questions.json`: 28 cells incl. 11 orienting; f2/t5 regrouped decline→orienting since pricing is now legitimately covered; login-setup cells repaired — that workflow never existed in this workspace). Capture `baseline-copilot-mode-2026-08-02.json`: **20/28 cells valid, every one at its target — 11/11 orienting cells 8/8, all how-to and hard cells 8/8** — the remaining 8 (declines + topic-shift) errored on **OpenAI credit exhaustion**, not product behavior; re-run `--only f1,f3,f4,t1,t2,t3,t4,t6` and merge once credits are topped up.
- **Next:** finish the 8 credit-blocked baseline cells · calibrate extraction thresholds on a second product · V2 portal renders pages as articles (captured direction).

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
| ⛔ | **Dissolved** | A decision absorbed the module's whole job elsewhere. Nothing is left to build under this ID, and it is **not** deferred — the ID is kept so an old pointer still lands somewhere honest. |

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
| **P1-M2** | Knowledge Base (`KnowledgeSource`/`KnowledgeItem`, transcript, segmentation → **distilled per-workflow steps**, keyword index) | ✅ **Done** — incl. step distillation ([`kb-step-distillation.md`](build/kb-step-distillation.md), 2026-06-27) and, since 2026-08-01, a per-workflow **description**: the task's PLAN in prose, written from the founder's narration. Steps can only say what to CLICK, so alternatives and optional work were being answered as a mandatory sequence; the plan is the only place "you need one of these, not all" can live. Both answer modes read it, and Studio shows it wherever a workflow is approved | M3, M6 |
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
| **P2-M6** | **Structural screen identification** — recognise a screen by the labels ON it, not only by its address: recorded screen fingerprints ride the sense plan, and the widget places a user structurally where the URL says nothing (one-path apps, tabs/modals, or several workflows sharing one route pattern). Slice 1 = structure as a way in; slice 2 = structure as a tiebreaker, ranked **exact route → recognised screen → ancestor route** ([`sense-and-reason.md`](build/sense-and-reason.md) §A2) | 🔄 **Built 2026-08-04, NOT user-verified** — 11 unit tests on the matching half; the widget half is still **untested** — the package gained a runner with the acting layer, but nothing on it exercises screen matching — and nothing has been tried against an app that actually keeps its screens off the URL. Fingerprints are absent on recordings too sparse to yield three anchors on any screen, which is exactly the current workspace's risk | — (new) |

**Phase 2 backlog (designed, deliberately not built):** friction-frequency as an input to the hub-page shard ranking (waiting on accumulated P2-M4 data) · an **SPA settle-check before probing** (§A5 of [`sense-and-reason.md`](build/sense-and-reason.md) lists it as the mitigation for probing mid-transition — it is not in the code) · `postRoute` progression evidence in the scorer.

**Depends on:** Phase 1 only — R13 ranked locators + routes + `expected_outcome` (already in the capture), the answer engine, and the P1-M8 context seam. **No Phase-3 gate needed:** probing is read-only, so a mislocalization = a slightly-off answer (recoverable) — nothing acts on the page. **Feeds:** **Phase 4 Autopilot** (mid-workflow entry — "finish from step 3" — consumes step localization; P4-M0's guided walkthrough builds on P2-M3; P4's `ExecutionPlan` is compiled separately from the same captured evidence and shares only the ranked-locator recovery rule — [`agent.md`](build/agent.md) §A2.2), **Phase 3** (locators that stop resolving on real users' pages = passive production drift signals), and founder analytics (per-step friction: "users get stuck on step 3 of X — re-record it or fix the UX").

---

## 4. Phase 3 — Self-validation & freshness (the moat)

**Goal:** keep the KB/articles from going stale by re-checking themselves against the live app (replay captured selectors/routes/expected-outcomes), detect drift, and manage **supersession** (a re-recording becomes the current authority). **Validation environment (decided 2026-06-18):** the customer provisions a dedicated **sandbox** (base URL + test credentials in Studio); validation runs **only** there — never production — so full replay is safe.

| Module | What it is | Status |
|:---|:---|:---|
| **P3-M0** | **Overlap detection & supersession** (Cut 1) — a re-recording of a task the workspace already covers is surfaced on the KB page, on **both** workflows' tiles (approved or not) and on a workflow's own page; a modal compares the two step lists side by side; the founder supersedes the older telling (never deleted, always reversible via Restore) or knowingly keeps both. Detection is two-signal — overall similarity **and** where each workflow ends — and runs off the embeddings the KB already writes, so it costs no model call. Decisions: [`workflow-identity.md`](build/workflow-identity.md) | ✅ **Done** — built + **user-verified E2E 2026-07-31** ([`e2e-testing.md`](ops/e2e-testing.md) §8b); supersession excluded in **every live-only approval reader**, 8 unit tests. **Standing limitation:** the detection gates are calibrated on two true duplicates and one false positive from a single product — a genuine *variant* pair (one goal, two routes) has never been measured, and it is the case most likely to stress the last-step gate |
| **P3-M1** | **Workflow identity & selection** (Cut 2 of the same spec) — a workflow gains a durable identity that outlives the recording slot it came from; a reprocess re-matches workflows to identities **by content**, so an approval survives only where the content still agrees and fails closed where it doesn't (new → unapproved, lost → `needs_review`). Workflows the founder groups as **two routes to one goal** then get **one** selected per task before ranking — screen match, else the one that can be started cold. Grouping is separated from "not duplicates", because only the first asserts the two are interchangeable | 🔄 **In Progress** — identity, content-matching, every gate AND every Studio mutation re-keyed; an approval no longer carries a position at all. **Identity + supersession user-verified E2E 2026-07-31; the reprocess hazard is CLOSED.** Grouping and one-per-task selection **built 2026-07-31, NOT yet user-verified** — nothing in the workspace is grouped, so selection has never fired. *(The widget wire still names workflows by position. Hygiene rather than correctness — the gate is identity-based, so a stale position is a wrong SIGNAL bounded by the sense plan's version hash and 60s TTL, never a leak — and nothing waits on it.)* |
| **P3-M2** | **Execution contracts & live drift telemetry** — every recording yields a deterministic evidence layer (entry · per-step expectations · outcome) stored in the KB: **one layer, three consumers** — answers state it, Sense/Reason diagnose with it, and the acting run verifies against a consent-pinned copy, every miss an audit event — so ordinary production runs are the drift signal, the live half of this phase, ahead of the sandbox. Decisions: [`execution-contracts.md`](build/execution-contracts.md) | 🔄 **In Progress** — direction captured 2026-08-10 (EC-10 founder-set same day); all six slices **code-complete 2026-08-11** (evidence layer · failure audit · run enforcement + the first acted-run harness · answer/consent/Studio/analytics surfacing · Sense echoes · recorder v0.9.0 built, unsubmitted) plus the step-granularity invariant (one step = one actable control, enforced deterministically after a live merged-step failure). **NOT user-verified E2E**; a live false-verified Done (navigating click's post-action settles pre-navigation) is analyzed with fixes designed, awaiting the founder's replication run; answer-path changes await the copilot-baseline before/after |
| **P3-M3+** | **Sandbox replay validation · coverage signals** — the unattended half, against the customer-provisioned sandbox (goal above); replays the same contracts P3-M2 compiles, and is the second consumer that extracts the shared replay core ([`agent.md`](build/agent.md) §A3) | 📝 **Draft** — to be planned |

**Depends on:** the selector-bearing KB (P1-M2) and ranked locators (recorder backlog R13, captured in Phase 1 but consumed here). The riskiest part **left** is the sandbox half — unattended runs against a customer's test environment, and auth/MFA. Selector resolution and outcome verification are proven: they run in production under Phase 4's widget driver, and the shared core is extracted here when this runner becomes their second consumer (see below). **P3-M0 and P3-M1 are the exception:** supersession-by-re-recording is founder-decided, not replay-derived, so neither needs a sandbox and both can ship well ahead of the rest of the phase.

**Relationship to Phase 4 (Autopilot) — reversed 2026-08-04:** the replay core is not a Phase-3 deliverable Phase 4 waits for. Phase 4's widget driver is the replay engine's **first** consumer; the shared core gets extracted when the sandbox runner here becomes its second. What Phase 3 still contributes is the **"validated-current"** signal, which slots into certification's pluggable input — eligibility analysis at enable time is the mandatory floor today. And the loop now closes the other way first: a production safe-stop is live drift telemetry arriving BEFORE the sandbox half exists. Reasoning: [`agent.md`](build/agent.md) §A3.

---

## 5. Phase 4 — Autopilot (agentic execution)

**Goal:** the copilot moves from *telling* to **doing** — after a grounded answer, the widget offers to **execute the approved workflow in the end-user's live session** (resolve ranked locators → act → verify `expected_outcome` → next step / ask the user / safe-stop), with the end-user consenting, watching, and able to abort at any moment. **Grounded actions:** Autopilot only executes workflows the founder **recorded and approved** — a second audience flag alongside `copilot` on the same approval model (the V2 portal adds `portal` as a third) — never free-form agent browsing. Human-in-the-loop by construction: captured input values are masked, so **no recorded value is ever replayed** — every value comes from the user, confirmed once on the consent sheet when the conversation already supplied it, asked in the chat one field at a time when it did not, and always typed into the app's own field when it is sensitive ([`agent.md`](build/agent.md) §A2.4). **The acting design (D12) is BUILT — v1 complete 2026-08-07**: brain/hands split, compiled-and-pinned `ExecutionPlan`, client-executes/server-deliberates transport, chat-first inputs, one step engine under guided AND acting, outcome verification end to end. Design + deferrals: [`agent.md`](build/agent.md) §A2. How to test it: [`e2e-testing.md`](ops/e2e-testing.md) §11c.

| Module | What it is | Status |
|:---|:---|:---|
| **P4-M0** | **Guided walkthrough** — "Walk me through it" on positional answers: highlight each remaining step + follow the user's progress (auto-detect + Next fallback, cross-nav resume, run analytics); no acting (the zero-risk stepping stone) | ✅ **Done** — built 2026-07-15 (decisions: [`agent.md`](build/agent.md) §A8 · mechanics: [`widget.md`](internals/widget.md) §4.9); needs Sense; **default ON for new workspaces since 2026-07-27** |
| **P4-M1** | **Gate + plan substrate** — the acting flag on the identity-keyed approval, the compiled/versioned/persisted `ExecutionPlan` (with outcome markers), eligibility analysis at enable time (file steps compile as the user's own, never disqualifying) | ✅ **Built + user-verified 2026-08-05 → 07** |
| **P4-M2** | **The run** — shared step engine (guided + acting as two actor policies), act verbs with verify-or-hand-back, outcome verification (rejection surfaces · try-once navigation · appearance markers), consent sheet, chat-first inputs (one field at a time; point-and-type for sensitive), narration, cross-nav resume | ✅ **Built + user-verified 2026-08-05 → 07** (three false-Done classes found live and closed; per-page ask batching + mid-run side-questions deferred — [`agent.md`](build/agent.md)) |
| **P4-M3** | **Contractual shell** — versioned terms acceptance (written in the same transaction that first sets the mode to `agent`, and required by the server on every later attempt), destructive-step confirms, abort, `ExecutionRun` audit + Analytics "Agent runs" | ✅ **Built + user-verified 2026-08-05** — mid-run controls simplified 2026-08-11: Pause and the takeover-to-guided handoff removed; **Stop Auto Run** (abort) is the one exit ([`agent.md`](build/agent.md) §A2.7) |

**Phase 4 backlog:** the Studio **"Walkthroughs"** analytics card is not built. `CopilotWalkthrough` rows have landed since P4-M0 shipped — the data was written from day one so the card could read it later, which is exactly the kind of thing that gets rediscovered as *"why are we writing these rows?"*

**Depends on:** **Phase 2 (Sense)** — mid-workflow entry ("finish from step 3") consumes Sense's workflow/step localization. Also consumes Phase 1's R13 ranked locators, `post_action`/`expected_outcome`, routes, and the in-page widget as the execution surface. **Phase 3 is no longer waited for (founder decision 2026-08-04, reversing the 2026-07-15 sequencing):** the widget driver is built as the replay engine's FIRST consumer, with the shared core extracted when the sandbox runner actually exists; certification stays a pluggable input (eligibility + interim signals now, Phase-3 validation when it lands), and an Autopilot safe-stop in production still feeds back as a live drift signal ([`agent.md`](build/agent.md) §A3).

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

**The ownership flip:** Versions 1–2 point FlowBuddy at the product a company **makes**; Version 3 points it at the products a company **uses**. Same extension + Studio: a company records the tools and processes it uses (third-party SaaS, internal tools) → an approved workflow/SOP KB **the company owns** → **a second Chrome extension — the company agent**: a browser-use AI agent (Claude-for-Chrome-class surface, FlowBuddy-grounded behavior) the company itself uses to run those applications — **executing only recorded + approved workflows, never free-form browsing**. A third driver on the replay ENGINE born in Phase 4's widget (the shared core is extracted at the second driver, §4), and consumes the KB through P6's export seam. Direction captured 2026-07-25; candidate modules **V3-M0…M4** + open questions: [`company-agent.md`](build/company-agent.md) — gains its module table when designed.

---

## 8. Legacy ID → new module map

Retired. The Phase-1 renumbering finished long ago and no doc or code refers to the legacy `M0…M13` ids any more. `git show 844a316:docs/roadmap.md` has the table if an old note ever needs decoding.

---

## 9. What's left to ship Version 1

Only **Phase 1** gates the Version 1 release — and the release-gating work is **done**: the copilot is built, verified, and **deployed** (Render + R2). **2026-07-06:** the [`archive/phase-1-review.md`](archive/phase-1-review.md) remediation landed (`1bba47b`, user-verified E2E) — all P0 public-surface hardening (§2.1–2.7), retrieval consolidated into one `@flowbuddy/synthesis` seam (§3.1/3.2 — pgvector now has a single landing spot), transcription degradation (§3.3), graceful shutdown (§3.4), and the KB-page honesty reword (§4.5); **later that day, auth hardening §3.6 Cuts 2+3** (sign-in rate limiting + Resend-backed email verification & password reset — signup gate deliberately open). What remains is discretionary hardening + optional upgrades, none of it release-blocking.

**This section is a filtered VIEW of §2, never a second verdict table.** Every Phase-1 module's
status — and its dates — lives in §2's table and nowhere else; all this section says is which of
them still gate the release, and what trails behind it. *(It used to restate three module rows in
full, which is how a status surface starts disagreeing with itself.)*

**Nothing gates the release.** The one Phase-1 module not yet ✅ is **P1-M12 (PII redaction)**, whose
remaining cut — screenshot/DOM pixel OCR/blur — is deferred to **Version 2** with the portal track
and was never release-blocking. The two that closed late, **P1-M11** (capture reliability, including
the ranked locators Phases 2–4 all consume) and **P1-M3** (the pgvector upgrade), shed a remainder
each: the recorder-UX parking lot moved to **Version 2 · D3**, and the R12 follow-ups stay parked.
Everything else in Phase 1 is ✅ — **P1-M4 cloud deploy included, and the Version 1 release itself
shipped and was user-verified end-to-end in production** ([`deploy.md`](ops/deploy.md)). The backlog
below is follow-on quality and robustness work.

### Phase 1 backlog (discretionary, post-release — not gating)

The residual open items from the Phase-1 end-to-end review — nothing release-blocking; schedule deliberately. Full detail behind each: [`archive/phase-1-review.md`](archive/phase-1-review.md).

- **Automated test layer — ✅ started 2026-07-27, extended since; still partial.** `@flowbuddy/synthesis` and — since the acting layer — `@flowbuddy/widget` carry the repo's tests (`vitest`, run as `pnpm test` beside typecheck; **238 passing across the two packages**, no CI; `api` and `web` still have no runner): the shared answer loop (round + tool budgets, de-duplication by name **and** arguments, what the loop reports back), `formatItems`, the retrieval shortlist's signal ordering, `sanitizeHistory`, the operating-mode vocabulary, duplicate detection, the page extractor, route pattern matching, and the Reason fixture-scoring rules — plus the acting suites the widget runner was added for (what each file covers: [`dev-setup.md`](ops/dev-setup.md) §Tests). Two quality harnesses sit beside them: `scripts/copilot-baseline.mjs` (answer quality over a fixed question set, incl. multi-turn cases) and `scripts/reason-fixtures.mjs` (the **diagnostic** path — replays frozen page states and scores the answers). **Diagnosis is measured for the first time (2026-08-03):** three page states are captured, committed and passing 3/3 on every assertion, with `reason-baseline-2026-08-03.json` as the before-half of any future change. The fourth — a rejection banner, the most valuable of the set — **could not be captured because the recorded app renders no rejection**, which leaves the diagnostic merge verified against three variations of "the form is incomplete" ([`agent.md`](build/agent.md) §9 Gap 3). **Still uncovered:** `cleanEvents`, `redactText` (Luhn/phone/email edges), `shortcutCombo`, the segmenter carry-forward guard, `checkRateLimit`, `distillSteps` grounding validation, `highlightFromBbox`.
- **Observability** — error aggregation (Sentry-class) on api + web, and per-call model latency logging in the answer loop *(token usage itself is now recorded per question — see below)*. *(Structured pino logging is done — [`dev-setup.md`](ops/dev-setup.md) §7.)*
- **Cost ceiling + agent observability** — a per-workspace daily budget counter, and (done) per-question token usage on `CopilotQuery`. *(The cheap caps — question length, `max_completion_tokens`, low temperature, rate limits — are done.)* **Raised in priority 2026-07-27 by Copilot mode, and the answer-path half ✅ CLOSED 2026-07-29:** `CopilotQuery` now records **mode** (the workspace setting) · **engine** (what actually answered) · **rounds** · **toolCalls** — four nullable columns, nothing back-filled, so an older row honestly reads "unknown" — and the api emits one `copilot answer` log line per question. `engine` is deliberately *not* `mode`: the diagnostic path preempts the agent whenever the widget shipped page state, and the safety floor answers with no tools while the mode still reads Copilot, so recording only the setting would attribute both to the wrong engine. *(The question these were built to settle — "should AI Chatbot collapse into Copilot?" — was answered on simplicity rather than cost by D10 on 2026-08-02, before enough traffic accumulated to answer it with data. The columns changed job rather than becoming waste: `engine: "floor"` is now a **reliability** signal, and the only way to notice the fallback firing.)* **The Studio surface landed 2026-08-03** — Analytics → *How answers were produced*: engine share, how often the loop needed more than one look, how often it reached for a tool, and the fallback called out as an ALARM rather than a statistic (since the retirement, `engine: "floor"` only appears when something upstream failed, and nothing else in the product reports that). Percentages are computed over rows that recorded an engine, with the uninstrumented remainder stated rather than absorbed. **The token columns landed 2026-08-03** — `inputTokens` / `cachedInputTokens` / `outputTokens` / `reasoningTokens` on `CopilotQuery` (migration `20260803090000`), summed across EVERY loop a question ran so a question the agent failed and the floor caught reports both, and surfaced as tokens-per-question in Analytics. Tokens, never money: two models answer on this path and their rates change, so a baked-in figure would drift into confidently wrong. **Still open here:** the daily budget counter. *(The spend guard itself stays deliberately unbuilt — founder decision 2026-07-26; revisit before real customer traffic.* **The exposure grew without the decision being revisited:** one hard question can cost several model round-trips, which was acceptable while the expensive mode was opt-in and one person used it, and is a different bet now that it is what every new workspace gets.*)*
- **Extension injection scope** — switch the recorder from static `<all_urls>` content-script injection to programmatic injection into session tabs only (lower Web-Store scrutiny + better privacy optics; the on-demand `armTab` machinery already exists).
- **Signup gate** — an invite/allowlist gate for private beta (deliberately left open; sign-in rate-limiting + email verification/reset are done).
- **Presigned artifact uploads carry no size ceiling — ⏸ DEFERRED BY DECISION (2026-07-28), revisit later.** Opened by the idempotent-upload change: artifacts now go browser → object storage directly, so the API never sees those bytes and neither of its caps applies to them (`MAX_BUNDLE_BYTES` = 500 MB total and the 300 MB per-file multipart limit only ever covered the `/v1/sessions` bundle, which is now just the fallback). A signed URL authorizes *one key*, not *a size*, so a recording can write an unbounded amount.
  **Risk is modest but real:** not an abuse vector (minting a URL needs the workspace's own recorder token), but a runaway capture loop or pathological DOM snapshots would show up as a storage bill rather than an error — and a **leaked recorder token** now has a much larger blast radius than it did when everything went through a rate-limited API.
  **The fix, when it happens:** sign each URL with an exact `ContentLength` so storage itself rejects a different-sized body — real enforcement, not a declared size the client could lie about. The cost is that the recorder must know each artifact's byte size *before* signing, and it currently signs a batch of 25 paths and only builds the blobs afterwards; that loop has to be reordered to build-then-sign (~25 blobs in memory at once). Deferred rather than rushed into a hardening batch, because it reorders a hot path.
  *(The two sibling gaps opened at the same time are now CLOSED: abandoned recordings are swept — explicit discard via `DELETE /v1/uploads/:uploadId` plus a 12-hour server-side sweep riding on finalize; and R2 + CORS on a browser-issued presigned PUT is **verified on dev/Render**, 2026-07-28.)*
- **Capture quality** — type-aware distill labels (`typed`/`pressed`/`scrolled to`), inner-container scroll capture, `Enter`+`submit` merge in `clean.ts`, and the multi-tab screenshot wrong-tab case. The **full-page-nav capture gap** (late `change`/post-action loss) is **CLOSED in code 2026-08-08** — fill-flush on `submit` + `pagehide` in recorder v0.8.0 ([`extension-releases.md`](ops/extension-releases.md)); **not yet on the store, not user-verified**. It had been re-prioritised by the acting layer: a plan missing fill steps is a form submitted half-empty in a live account, so it was no longer capture-quality polish.
- **Studio/widget polish** — range-window the coverage-gap "asked N×" count (+ fuzzy gap matching), per-workspace timezone for analytics day-bucketing, client-side history slicing + widget `maxlength`, widget a11y (dialog role, focus management, thumb labels), a real deflection metric, and a CORS-scope note.

### Product audit (2026-08-03) — status

The audit itself lives in [`audit/`](audit/product-audit-2026-08-03.md) (technical · plain-English ·
a 180-finding appendix) and is a **snapshot, deliberately never edited** — including its §7 record of
six findings that were adversarially overturned, which exists so nobody re-raises them. It carries no
status; this section is the only place that does.

**⚠️ Read its §2 before acting on anything.** ~150 of the 180 findings were written by one reviewer
and never challenged; of the 18 that *were* challenged, 17 were downgraded or corrected. Its top
twelve are trustworthy (six were spot-checked against source and all six held); the appendix is
leads, not a work queue.

**Actioned 2026-08-04** — nine findings, in one pass (`git log` has the detail; restating it here
would be the second copy this file exists to prevent): the transcript run-up window · the workflow
description on every approval surface + the switch on the workflow page · coverage gaps no longer
recording our own truncations · answer-path model timeouts + `ms` latency logging · a no-narration
build reporting which of three causes · email canonicalised at every auth entry point. Three more
came from reading the produced KB rather than the audit, and were not in it at all: the recorder's
sample data reaching customers as instructions, a placeholder rendered as if it were a field name,
and Sense preferring an ancestor-route step over the exactly-placed one.

**Actioned 2026-08-04 (second pass)** — **routes are now matched as PATTERNS**, one rule shared by
retrieval, the sense shard and the widget instead of three copies of string equality. Until this,
nothing localized on any product whose URLs carry record ids: the shard served no workflow, the
route boost never fired, and the walkthrough printed the founder's own record id at the end-user.
That last one is closed twice over — by matching, and by eliding ids from anything shown to a human.
Patterning also exposed a latent ranking defect it would otherwise have shipped on top of: a context
signal firing on 23 of 46 items filled the whole 24-item evidence window and starved out the only
step that answered the question. The window now reserves 8 slots for relevance, and the agent's own
search carries no context signals at all — both pinned by tests, both reproduced and re-measured
against the live workspace.

**Actioned 2026-08-09 (third pass)** — a correctness-and-trust sweep, each item a hole that failed
silently rather than loudly (`git log` carries the mechanisms):

- **Grounding.** A step's `route` came from the model whenever it offered one — the single field that
  escaped the event-id anchoring, feeding a plausible rewrite to the sense probe, the route boost, the
  walkthrough and every route shown to a human. It is now the key event's, always. Segmentation's
  timeline gained per-event timestamps, without which the user's own "new workflow" markers — given as
  times — could not be placed at all.
- **What leaves the page.** A chat-supplied run input could ride the NEXT question to the server: chat
  history filtered by denylist while the guarantee was written against the storage allowlist. The wire
  now has its own allowlist. Page-derived strings (`context.path`, a safe-stop reason) go through the
  one scrub instead of a bare slice, and an unhandled throw no longer serializes Prisma text to a
  public endpoint.
- **Races and stalls.** Discard and the abandoned-recording sweep re-check eligibility inside the
  delete, so a finalize that lands mid-flight wins and the recording it already told the recorder was
  saved cannot be destroyed. The worker's KB rewrite is one transaction — the identity evidence lives
  in the rows it deletes. The widget's answer fetch had no timeout, the one fetch without a budget,
  and a half-open connection pinned the chat indefinitely.
- Plus the recorder's fill-flush (the capture-quality bullet above), `role="alert"` on the auth
  forms' errors, and Studio now dogfooding the widget on itself behind an env flag.

**Deferred, each with the trigger that reopens it:**

- **CI** — founder decision 2026-08-04. Note `pnpm lint` currently examines zero files (no package
  defines a lint script), so lint in CI would be a green check verifying nothing until that changes.
- **A per-ANSWER deadline.** What shipped bounds a per-CALL 60 s; the loop still runs up to four
  rounds, so the worst case is minutes. The proper fix threads a deadline through `engine.ts`. It was
  not done because nothing measured latency — **trigger: the `ms` field now on every answer log line.
  Size it from that distribution, and watch `engine: "floor"` beside it.**
- **Step editing** (audit §3.8, effort L) — the biggest gap versus Scribe/Tango/Guidde. **Trigger: a
  design partner asking for it**, which the KB-depth work will answer for free.
- **Storing the answer text** (audit §3.10) — founder decision 2026-08-04. `CopilotQuery` records the
  question, whether it was answered, what was cited, how it was produced and what it cost, but **not
  what the copilot said**, so a 👎 is a complaint with its evidence discarded and no answer can be
  reproduced. Note the asymmetry: a DECLINE does persist the assistant's words (`CoverageGap.reason`),
  so the failures already visible are recorded and the invisible ones are the ones lost. Not storing
  less of the customer's end-users' data is a defensible default, which is why this was a choice
  rather than an oversight. **Trigger: the first 👎 worth diagnosing, or any answer-quality work that
  needs measuring — the grounding item below cannot be sized without it.** Two constraints when it
  happens: a migration, and `redactText` on the write — the model sees the RAW question, so an answer
  echoing a card number back lands it in the founder's database unless it is scrubbed on the same
  write.

**Known-open, named so they are not rediscovered:**

- **The answer path can state things no source contains.** Observed once: prose about what to write
  in a field, plus a claim about what the product does *not* require. The build path is anchored
  structurally (steps cite real event ids; page quotes must appear verbatim in the transcript) — the
  answer path anchors only *which* item was cited, never that the sentences follow from it. Two shapes
  leak: advice, which the prompt's ban on "UI, steps, features, or facts" does not name; and
  **negative claims, which a corpus of recordings can never ground** — silence is not evidence of
  absence. Frequency unknown, and **unmeasurable until `CopilotQuery` stores the answer text**
  (audit §3.10) — that is the prerequisite, not the fix.
- **A merged workflow inherits one parent's approval.** Seen locally during a reprocess: a workflow
  carrying materially expanded content stayed live under an approval granted for the narrower one.
- **~150 findings remain single-source.** Unchanged since the audit was written.

---

## 10. Doc map

Moved to [`README.md`](README.md) — one navigation surface, so a doc's *description* and its
*status* stop drifting apart. This file owns status; that one owns "which doc holds what".

---

## 11. Phase 5 — Converse (the goal layer)

*(Appended here, out of phase order, because section numbers are append-only addresses — the note at
the top of this file says why. Read §11 and §12 as phases 5 and 6; their position on the page means
nothing.)*

**Goal:** the copilot stops answering one question at a time and starts pursuing what the user is
trying to **accomplish**. The conversation survives navigation, each answer is framed inside a
remembered goal rather than delivered as an isolated verdict, values the user already stated are
never asked for twice, and genuine ambiguity is met with one short question instead of a guess. This
is the **brain over Phase 4's hands** — the same agent loop, given a notion of the task.
**The tier ladder this phase was designed around is gone:** D9 made Tell · Guide · Do tools the agent
picks turn by turn rather than tiers a router chooses once, which dissolved one module outright and
moved another's v1 into Phase 4. Decisions, design and module detail: [`agent.md`](build/agent.md)
(the goal layer).

| Module | What it is | Status |
|:---|:---|:---|
| **P5-M0** | **Conversational foundation** — the chat thread survives full-page navigations, and the previous answer's citations bias the next retrieval, so *"and then what?"* continues the same workflow instead of searching the KB for those words | ✅ **Done** — cut 1 (chat persistence, on a shared cross-page store the walkthrough moved onto too) and cut 2 (continuity bias, weighted below the two measured signals in both scoring paths) **built + user-verified E2E 2026-07-26**. **Cut 3 — query condensation — was DROPPED the same day, and stays dropped**: cut 2 took the common case deterministically, for free and with no added latency, and the topic-shifting remainder is what an agent searching in its own words does natively. Reopen only on a measured case that survives both |
| **P5-M1** | **Goal understanding (intent capture)** — a one-line goal thread on the answer, returned as hint-only context; the companion-style posture rewrite; parameter capture from the goal statement ("create a project called *Acme*"); a `goal` analytics column as the founder's product-gap signal | 📝 **Draft** — with **one slice already delivered from elsewhere: clarifying questions became legal in Copilot mode 2026-07-27** (one short question when approved knowledge genuinely supports two readings — and a clarification counts as an answer, not a decline). The goal thread, the posture rewrite, parameter capture and the analytics column are all unbuilt |
| **P5-M2** | **Product Profile** — the product-understanding KB: what the product *is*, not only how to do things in it. The gap it was filed against was orienting questions ("do I need X or Y?") declining correctly and uselessly | 🔄 **Superseded in shape, not in goal** — the founder-authored profile became **derivation-first**: the same recorded narration yields overview / concept / area pages, born unapproved and approved page by page. Its slices are tracked in §0; the design and its decisions live in [`application-intelligence.md`](build/application-intelligence.md) |
| **P5-M3** | ~~**The goal router**~~ — the tier offer | ⛔ **Dissolved by D9 (2026-07-26)** — there is no tier router. Choosing between Tell, Guide and Do is not a routing decision made once per goal; it is the agent picking a tool per turn, and the loop absorbed the module's whole job. Nothing here is deferred |
| **P5-M4** | **Goal-driven execution orchestration** — the brain that drives the hands: per-goal consent, mid-run input prompting, narration, honest mid-goal failure, and **chaining** one goal across several approved workflows | 🔄 **Its single-workflow v1 shipped as part of Phase 4** (§5) — consent, just-in-time inputs, narration and safe-stop all landed there, in the shape locked for this module. **What remains is chaining**: goal → plan across multiple workflows, cross-workflow handoffs, partial-failure semantics — scoped out of v1 by D12 (single workflow per run). **No longer gated** — the acting layer it was waiting for exists |

**Depends on:** for M0–M2, the shipped copilot and nothing else — they improve every answer
immediately and never needed Phase 3 or Phase 4. **M4 depends on the acting layer** (§5) and consults
its enable-time eligibility analysis for what may run; chaining is additive on top of a run that
already works. **Feeds:** Phase 6 (§12) — a brain over a grounded tool surface is exactly the surface
an outside agent consumes. *(What is deliberately out of scope — cross-device history, per-user
memory, free-form agentic browsing — is the phase's own decision and stays in its doc.)*

---

## 12. Phase 6 — Interop (the open agent interface)

**Goal:** point the same approved KB **outward**. Phases 1–5 build FlowBuddy's own brain and hands
over the workflow KB; Phase 6 exposes that KB in an agent-consumable form so outside agents —
browser agents, computer-use agents, a company's internal agent fleet, custom automations — can
**operate the customer's product reliably instead of improvising**. One recording session makes a web
app agent-compatible, and the per-workflow approval gate generalizes into the permission model those
agents inherit: they receive only what the founder explicitly approved for agent consumption, with
recorded input values masked as always. Direction, feasibility, the transport analysis and the export
schema: [`interop.md`](build/interop.md).

| Module | What it is | Status |
|:---|:---|:---|
| **P6-M0** | **Agent export schema + compiler** — generalize the approved-only sense-plan compiler into the two-layer export form (an instructional layer every consumer can read, an optional machine layer for DOM-driving ones); the single source every transport renders | 📝 **Draft** |
| **P6-M1** | **Trust gate** — the `agents` audience flag on the existing per-workflow approval model, plus an explicit workspace-level opt-in; nothing is exposed by default | 📝 **Draft** |
| **P6-M2a** | **Remote MCP server** — a per-workspace endpoint on the api: find a workflow (over the hybrid retrieval seam), list workflows, fetch one; key-authed and rate-limited | 📝 **Draft** — the v1 **lead** transport: where working agent clients actually live today |
| **P6-M2b** | **Markdown rendering** — the `llms.txt`-style workflow manual over the same compiler, instructional layer only | 📝 **Draft** — the v1 **rider**: near-free, the paste-into-any-agent onboarding path. Don't lead with it |
| **P6-M2c** | **WebMCP widget tools** — flag-gated registration of the knowledge tools on the host page, making every embedding customer agent-ready fleet-wide with no new integration | 📝 **Draft** — the **prepared bet**, built dark and flipped on an adoption trigger. Knowledge-serving only: nothing registered may act |
| **P6-M3** | **Consumption analytics** — which agent fetched and used which workflow → founder visibility, the record-this-next loop extended to agent demand, and the data any pricing model needs | 📝 **Draft** — built alongside the first transport, not after |
| **P6-M4** | **Freshness hooks** — certification surfaced in the export; detected drift flags a workflow or pulls it from exposure | 📝 **Draft** — waits on Phase 3 (§4) |

**Phase state: direction, not schedule.** Captured and assessed — **not yet designed and not
scheduled** — and even the phase name is provisional. **Transport is recommended, not locked:** one
export schema rendered as remote MCP (lead) + markdown (rider) + WebMCP through the widget (the
prepared bet); a bespoke REST API is skipped as a product. Recommended build order: M0 → M1 →
M2a + M2b in one burst (M3 alongside) → M2c on the adoption trigger → M4 when Phase 3 lands.

**Depends on:** nothing unbuilt, for a knowledge-only v1 — the approved-only compiler, the
audience-flag approval pattern, the hybrid retrieval seam and the embed-auth patterns all exist,
which is why the feasibility verdict reads *weeks-scale, not months* ([`interop.md`](build/interop.md)
§3 is the assessment). **Phase 3 (§4) is the load-bearing absence:** FlowBuddy can safe-stop its own
runs, an outside agent cannot, so every export carries freshness metadata from day one and M4
upgrades that to real certification when Phase 3 exists. **Feeds:** Version 3's company agent (§7),
the first consumer of this export seam. *(The copy rule that binds until this phase ships — no
customer-facing surface may present third-party agent access as available — is the phase's own, and
stays in its doc.)*

---

## 13. Demo videos (asset derivation)

**✅ v1 built 2026-08-18** — a polished, narrated product-demo MP4 **derived** from a workflow's
recorded steps (screenshots + click targets + the founder's narration transcript), never a screen
recording: a grounded voiceover script + TTS, synthetic cursor travel with click ripples, camera
zooms onto each step's target, brand intro/outro cards, and step captions. Generated per workflow
from its page in the Studio (aside card: generate → watch inline → download → regenerate), rendered
by the worker on its own queue, stored under the recording's session prefix so recording deletion
cleans it up. Founder-facing only — nothing is served to end users, so it deliberately sits outside
the approval/liveness readers. **Behind a per-workspace flag** (AI Assistant settings → Advanced →
Demo videos, default OFF): off hides the card and refuses the generate action; rows and rendered
files survive the toggle.

**Not yet in v1:** scroll motion and transient UI (menus, spinners) — the recorder captures ~2
frames per step, so everything between frames is synthetic; the recorder's own control bar is
cropped out of the bottom of every frame, which also crops that strip of real UI (hiding the bar
pre-capture is a future recorder release); brand/voice customization; multi-language; regeneration
on re-recording. Direction if it earns adoption: replay-and-record against a live environment on
the acting substrate for true motion.
