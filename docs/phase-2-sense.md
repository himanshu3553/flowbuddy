# FlowBuddy — Phase 2: Sense (in-context help)

> **Phase 2 makes the copilot know *where the user is*.** Today (Phase 1) the copilot biases answers by page route (P1-M8). Sense sharpens that to **workflow + step**: an end-user stuck on step 3 of a 5-step approved workflow opens the copilot and asks — Sense captures the context **at that moment** (route + a **read-only probe** of approved workflows' captured locators against the live page), localizes them to *workflow W, step k*, and the answer **meets them there**: unstick step 3 first, then the path to done. Internal name **Sense**; descriptive name **in-context help**. Roadmap/status: [`roadmap.md`](roadmap.md) §3.

- **Status:** ✅ **BUILT 2026-07-08 · USER-VERIFIED E2E 2026-07-09** (verified on a real external test app: positional answers, re-anchoring on follow-ups, show-me highlight, friction logging). Design locked 2026-07-08 (§5); as-built + E2E hardening in §8.
- **Last updated:** 2026-07-08 · **Branch:** `dev`
- **Companion docs:** roadmap/status → [`roadmap.md`](roadmap.md) · technical model → [`architecture.md`](architecture.md) · Phase 1 (the substrate) → [`phase-1-copilot.md`](phase-1-copilot.md) · Phase 4 (consumes Sense's localization) → [`phase-4-autopilot.md`](phase-4-autopilot.md) · why copilot-first → [`product.md`](product.md) §5
- **The trust story in one line — sensing, never surveillance.** Sense is an **instantaneous, read-only probe at ask time**: no end-user recording, no continuous monitoring, no screenshots, no DOM snapshots, no input values — only locator-hit **booleans** and a **masked** error snippet ever leave the page. The probe tests **only approved workflows'** locators (no-leak applied to sensing), and context **biases answers, never overrides the question** (the P1-M8 principle carried up).

---

## 1. The feature

**The loop today (Phase 1):** ask → retrieve over approved-KB (question-driven, route-boosted) → grounded answer + citations, or an honest decline.

**The Sense loop:** the user asks → the widget runs a **read-only probe** against the live page → scores which approved workflow + step the user appears to be on → the **top-k hypotheses ride the existing `/answer` call** → the answer LLM makes the final call *with the question in hand* → a **positional answer**:

> *"That error means the Amount can't be zero — enter a value greater than 0, then hit **Send**. After that you're done: Send is the last step of Create an invoice."*

- **Ask-time only, silent.** The probe runs when a message is sent — never on widget open, never proactively. The copilot doesn't announce what it can see; it just answers better.
- **Unstick first, then the path.** For a user localized at step k: resolve step k (using its distilled instruction/detail/narration + the on-screen error), then the remaining steps k+1…n. Citation is **step-level** ("Create an invoice · step 4").
- **Ambiguity → ask.** When two workflows genuinely tie (shared screens), the copilot asks: *"Are you trying to create a new invoice or edit an existing one?"*
- **Multi-turn re-probe.** Every follow-up message re-runs the probe (it's milliseconds, against a cached plan) — if the user moved on, the copilot notices: *"Nice — you're on step 4 now. Next: …"*
- **"Show me" highlight — config-gated.** When enabled in copilot settings, the widget also **highlights the current step's element** on the host page ("click here"); off = text-only answers. *(Single-step highlight; the full sequential walkthrough is Phase 4's P4-M0, built on this — ✅ shipped 2026-07-15.)*
- **Founder control:** a per-workspace **Sense toggle** in Studio. No end-user-facing disclosure.

### The three-tier context model (what if the question is unrelated?)

Context **biases, never overrides** — the question always wins:

| Tier | Situation | Behavior |
|---|---|---|
| **A — unrelated** | Localized at W/step 3, but asks about something else | Retrieval stays question-driven (hybrid keyword+vector, whole approved KB); the localization is a **soft boost** the question out-ranks, and the answer LLM **silently ignores** the hypotheses. No positional preamble. |
| **B — on-workflow** | Question is about the localized workflow | Full positional answer: unstick step k → remaining path, step-level citation. |
| **C — deictic** | *"What now?" · "Why can't I continue?" · "How do I finish this?"* | Context is the **primary signal** — "this" resolves to W/step k. The killer case: a stuck user asks exactly these, and they're unanswerable without Sense. |

The friction log records which tier occurred (**used / ignored / none**) — a step-3 localization attached to an unrelated question is *not* step-3 friction.

**Done when:** an end-user stuck mid-workflow asks and gets a positional answer (unstick + path, step-level citation); unrelated questions are answered exactly as today; genuine ties produce an "X or Y?" question; follow-ups notice progress; the founder sees per-step friction in Studio; the workspace Sense toggle and the show-me toggle both work; and nothing beyond locator booleans + one masked error snippet ever leaves the page.

---

## 2. How it works (the hybrid architecture — locked)

Localization is two jobs, each placed where it's strongest: **mechanical evidence gathering** (deterministic → where the DOM is, the client) and **semantic interpretation** (needs the question → the answer LLM).

```
Studio approval ──► compile SENSE PLAN per approved workflow      (server, at approval/reprocess)
                    (ordered steps × ranked R13 locators + routes + outcome markers)
                          │  GET /v1/copilot/sense-plan?route=<path>   (key-authed;
                          │  ROUTE-SHARDED — only the workflows with steps on/near this
                          │  route, capped top-N; fetched on PANEL OPEN, never page load;
                          │  ETag/version-cached per route; gated by the workspace Sense
                          │  toggle; approved-only)
                          ▼
user sends a message ──► widget PROBES the live DOM (read-only, ms):     (client)
                          per candidate step: resolves? visible? enabled? filled?
                          + expected-outcome echoes (step k done?)
                          + error signals (alert present → masked snippet)
                          ──► deterministic SCORING → top-k hypotheses
                          ▼
POST /v1/copilot/answer  + context { route, hypotheses[] }               (server)
                          ──► retrieval: hypotheses = soft boost (like route bias)
                          ──► answer LLM: final call WITH the question
                              (tier A ignore / tier B positional / tier C primary /
                               genuine tie → ask "X or Y?")
```

**What the probe captures (locked):** route (path/hash/title) · per-step locator results (*resolves / visible-in-viewport / enabled* — booleans) · input-state booleans (*filled/empty*, never the value) · expected-outcome echoes (step k's `post_action` markers present ⇒ step k done — how "steps 1–2 finished" is inferred) · fold position of the step target · error-state boolean + **masked error text** (passed through the P1-M12 client masking patterns, length-capped ~200 chars — the one non-boolean, kept because "stuck" usually means an error is showing and knowing *which* transforms the answer).

**What is never captured:** screenshots, DOM snapshots, input values, arbitrary page text, cookies/storage. The probe is ephemeral — only the localization *outcome* (workflow, step, confidence, used/ignored) is logged, for analytics.

**Example payload on `/answer`:**

```json
"context": {
  "route": "/invoices/new",
  "hypotheses": [
    { "workflow": "Create an invoice", "step": 4, "confidence": 0.86,
      "evidence": { "stepsDone": [1, 3], "stepVisible": true,
                    "error": "Amount must be greater than 0" } },
    { "workflow": "Edit an invoice", "step": 3, "confidence": 0.41 }
  ]
}
```

### 2.1 The two approaches on record — decision: build the hybrid

**Approach 1 — HYBRID (✅ LOCKED 2026-07-08 — this is what Phase 2 builds).** As diagrammed above: the sense plan (founder-derived fingerprints, compiled from the approved recordings) travels **down** to the widget; the probe + deterministic scoring run client-side; only **booleans + one masked error snippet + the top-k hypotheses** travel up, riding the existing `/answer` call; the answer LLM makes the final call with the question in hand. The probe *must* run client-side regardless (only the widget sees the DOM); a pure-client scorer would resolve shared-screen ties **blind** to the question; the hybrid sends a *shortlist*, not a verdict — the tie is broken by the model that also knows what the user asked, at zero extra latency and zero added page data.

**Approach 2 — Server-side fingerprint synthesis (evaluated 2026-07-08 — NOT being built).** The alternative considered: at ask time, capture the current URL + the page's **HTML element fingerprints** (roles, labels, accessible names, visible text of interactive elements), ship them **up** with the question, let the server compare against the approved KB, and let the LLM synthesize localization + retrieval + answer in one pass.

| | **Approach 1 · Hybrid (building)** | **Approach 2 · Server-side fingerprint synthesis (on record)** |
|---|---|---|
| Client complexity | Sense plan + shards + caching + probe/scorer | Trivial — scrape + send (no plan, no shards, no caching) |
| Drift tolerance | Binary — a broken locator = no match (drift is **Phase 3's job**: detect → flag → re-record) | **Better** — the LLM can fuzzy-match a changed page ("a field labeled Amount + a disabled Send ≈ step 4") |
| Privacy | **Booleans + one masked snippet only** — no page content ever leaves | Labels/names/text carry user data ("Invoice for Acme — $4,200"); not pattern-maskable → a page snapshot leaves **on every question**, hard to square with no-disclosure |
| Cost/latency | One-time cached shard (few KB); LLM reads a 2-line hypothesis summary | **Recurring per-message upload** (tens of KB, uncacheable) + thousands of prompt tokens on the hot path, forever |
| Precision | Surgical evidence (exact element **filled**, step-done markers **present**); crisp deterministic tie threshold | Fuzzy recall but weaker precision; done-ness inferred from a dump; mushy self-reported match confidence |
| Injection surface | One delimited error snippet | The **whole page's text** (incl. user-generated content) enters the prompt each question |

**The deciding asymmetry:** the comparison must happen *somewhere* — the only question is which data travels. The founder's recordings already provide **exact** fingerprints, pre-computed; the hybrid ships those (founder-derived data) *down* and compares on the user's machine. Approach 2 re-derives at runtime — over **end-user data**, on the server, per message — what the sense plan knows statically for free. Approach 2 is the design a vendor *without* founder recordings would be forced into; the recordings are the unfair advantage that makes the cleaner architecture possible.

**The fuzzy-fallback idea — RETIRED (2026-07-09), superseded by P2-M5 · Reason.** The salvageable value of approach 2 (drift-tolerant reasoning over richer page state) grew into a full module: **Reason** ([`phase-2-reason.md`](phase-2-reason.md)) — ask-time structured page-state capture + expected-vs-actual diagnosis. Baseline behavior stays: a probe-zero is logged as a **passive drift signal** (P2-M4 → Phase 3) and the answer degrades to route bias.

---

## 3. What Phase 1 already provides (the substrate)

| Capability | Where it comes from |
|---|---|
| **Find a step's element on a live page** | **R13 ranked multi-signal locators** — captured + uniqueness-verified per event target; the probe walks the list, first resolver wins. |
| **Know a step was completed** | **`post_action` / `expected_outcome`** markers — their presence on the current page = done-evidence for earlier steps. |
| **Page-level context** | **P1-M8 context API** — the widget already sends `location.pathname`; Sense deepens the same seam. |
| **The delivery surface** | The **widget** is already in the host page (probe + highlight surface) and already fetches config at mount (`/v1/copilot/config` — the show-me flag rides it). |
| **The answer engine** | `answerFromKB` + hybrid retrieval — Sense adds a context input and prompt rules, not a new engine. |
| **Masking for the error snippet** | The **P1-M12 client-side redaction patterns** — reused verbatim on error text before it leaves the page. |

**One structural piece Sense builds that Phases 3/4 inherit:** the **sense plan** is the compiled per-workflow artifact (steps × locators + routes + outcome markers) that Phase 3 replay and Phase 4 execution also need (P4's `ExecutionPlan` = the sense plan + input slots + destructive flags). Sense is its first, zero-risk consumer — locator resolution gets exercised on real production pages before anything replays or acts.

---

## 4. Modules

| Module | What it is | Notes |
|:---|:---|:---|
| **P2-M0** | **Sense plan — compile + serve (route-sharded).** At approval/reprocess, compile each approved workflow's manifest into a sense plan (ordered steps × ranked locators + routes + outcome markers). Served **sharded by route** — `GET /v1/copilot/sense-plan?route=<path>` returns only the workflows with steps on/near the current route, **capped top-N** (ranked by route-specificity + friction frequency), so the payload is **O(workflows on this page), never O(all workflows)** — a founder with 1,000 recordings ships the same few KB as one with 10. **Workflows are served atomically** — a shard contains every matched workflow *whole* (all steps, including steps on other routes), so mid-workflow progression (step 3's URL → step 4's URL) **never triggers a refetch**: the probe re-runs against the cached plan and notices the advance. A route the cache doesn't cover (user wanders elsewhere) triggers a small **top-up fetch** for that route only. Fetched **on panel open** (never page load — zero cost for visitors who don't ask), **ETag/version-cached per route** (re-downloaded only when approvals change), **gated by the per-workspace Sense toggle**; approved workflows only (no-leak). Beyond the cap (hub pages), Sense degrades to route bias. | The shared-artifact seed for P3 replay / P4 execution. Invalidate on approval changes + reprocess. |
| **P2-M1** | **Widget probe + scorer.** Ask-time read-only probe (locator walk, visibility/enabled/filled booleans, outcome echoes, error detection + **masked snippet**), deterministic scoring → top-k hypotheses; re-probe on every follow-up; strict performance budget (no host-page jank). | Reuses the P1-M12 masking patterns client-side. |
| **P2-M2** | **Positional answering.** `/answer` accepts the hypotheses context; retrieval treats it as a soft boost; the answer prompt implements the **three-tier relevance model**, the **unstick-then-path** shape, **step-level citations**, tie → **"X or Y?"**, and multi-turn **progress acknowledgment**. | The error snippet enters the prompt as **untrusted data** (delimited, treat-as-data instruction — see §6). |
| **P2-M3** | **"Show me" highlight (config-gated).** When the copilot-settings toggle is on, the widget highlights the current step's element on the host page alongside the answer; off = text-only. Single-step only. | Phase 4's **P4-M0 guided walkthrough is built on this** (sequential, manual-Next advancement — ✅ 2026-07-15, [`phase-4-autopilot.md`](phase-4-autopilot.md) §8). Flag rides `GET /v1/copilot/config`. |
| **P2-M4** | **Step-level friction analytics (must-have).** Log the localization outcome per query (`workflow, step, confidence, used\|ignored\|none`); Studio analytics gains a **per-step friction view** ("users get stuck on step 3 of *Create an invoice*") + record-this-next prompts; locator-resolution failure rates surface as **passive drift signals** (feeds Phase 3). | Only tier-B/C localizations count as friction (tier A = ignored). |

**Build order (proposal, locked at kickoff):** P2-M0 → P2-M1 → P2-M2 (the core loop, verifiable E2E) → P2-M4 (analytics on the already-flowing outcomes) → P2-M3 (highlight polish).

---

## 5. Design decisions (LOCKED 2026-07-08)

| # | Decision |
|---|---|
| Trigger & posture | Probe **only at ask time** (message send); context used **silently** — no proactive nudges, no announcements. |
| Captured payload | Route + per-step locator/visibility/enabled/filled **booleans** + expected-outcome echoes + fold position + error boolean + **masked, length-capped error text** (P1-M12 patterns). **Never:** screenshots, DOM snapshots, input values, arbitrary page text. Probe ephemeral; only the outcome is logged. |
| Localization architecture | **Hybrid** — client probes + scores deterministically; **top-k hypotheses + evidence ride the existing `/answer` call**; the answer LLM disambiguates with the question in hand. No extra round trip. *(The server-side fingerprint-synthesis alternative is on record in §2.1 — evaluated, not built.)* |
| Fuzzy fallback | **RETIRED 2026-07-09 — superseded by P2-M5 · Reason** ([`phase-2-reason.md`](phase-2-reason.md)); probe-zero remains a drift signal + route-bias degrade. |
| "Show me" | Part of Sense, **config-gated** in copilot settings: on → highlight the current step's element; off → text-only. |
| Ambiguity | Genuine tie → the copilot **asks the user** ("Are you trying to do X or Y?"). |
| Answer shape | **Unstick step k first, then the remaining path**; step-level citation. |
| Founder controls | **Per-workspace Sense toggle** in Studio. **No end-user-facing disclosure.** |
| Friction analytics | **Must-have, in Phase 2 scope** — per-step friction view in Studio + passive drift signals. |
| Multi-turn | **Re-probe on every follow-up**; the copilot acknowledges progress ("you're on step 4 now"). |
| Unrelated questions | Three-tier relevance: context **biases, never overrides** — unrelated → silently ignored; on-workflow → positional; deictic → context is primary. Log used/ignored/none. |

**Details to finalize at build:** scoring weights + the tie threshold (when does "ask X or Y?" fire vs. picking the leader); the shard cap **N** + the hub-page ranking rule (route-specificity × friction frequency); shard refetch on SPA route change while the panel is open; probe performance budget (cap locators walked, settle timing on SPAs); plan version-hash/invalidation on approval flips; confidence floor below which Sense degrades to plain route bias; exact `CopilotQuery` localization fields.

---

## 6. Risks

- **Frequent mislocalization erodes trust** — a wrong "you're on step 3" is recoverable but corrosive if common. Mitigations: confidence floor (degrade to route bias), tie → ask, and the hypotheses framing (the LLM hedges naturally at low confidence).
- **Prompt injection via the error snippet** — the masked error text is **host-page-controlled text entering the LLM prompt**. Treat as untrusted data: strict delimiting, treat-as-data instruction, length cap; never let it override grounding rules.
- **Plan growth with many workflows** — solved structurally by **route-sharding**: the widget only ever downloads the shard for the current route (a few workflows, ~10–30 KB), fetched on panel open and version-cached — total library size never reaches the visitor. Hub pages (many workflows starting on one screen) are capped top-N by route-specificity + friction frequency; beyond the cap, Sense degrades to route bias.
- **Probe jank** — locator walks are `querySelector` calls (ms-level), and the route-sharded, capped plan bounds the work so a workspace with many workflows can't stall the host page on any message.
- **A new public-key surface** — `sense-plan` is key-authed, origin-checked, and rate-limited like `/config`; it contains locator selectors (not content), approved workflows only.
- **SPA timing** — probing mid-transition mislocalizes; probe after a short DOM-settle check (the recorder's settle heuristics apply).
- **Analytics pollution** — solved by design: only tier-B/C (used) localizations count as friction.

---

## 7. Data-model deltas (additive)

- **`Workspace.senseEnabled`** (default TBD at build) — the per-workspace Studio toggle; gates the plan endpoint. **`Workspace.copilotShowMe`** — the show-me config flag, served via `GET /v1/copilot/config`.
- **Sense plan storage** — compiled at approval/reprocess, keyed by the workflow key `(sourceId, segmentIndex)` (a JSON column on `CopilotApproval` or a sibling table; decide at build — and design it as the shared base of Phase 4's `ExecutionPlan`).
- **`CopilotQuery` localization fields** — `senseSourceId`/`senseSegmentIndex`, `senseStep`, `senseConfidence`, `senseUsed` (`used | ignored | none`) — powers the P2-M4 friction view. No other persistence; no end-user identity.

---

---

## 8. As-built (2026-07-08; user-verified E2E 2026-07-09)

**E2E hardening — three fixes found during user verification (2026-07-08/09):**
1. **UUID hyphens** — the `/answer` wire validation rejected hypothesis `sourceId`s containing hyphens (`KnowledgeSource` ids are `randomUUID()`, not cuids) → every hypothesis was silently dropped server-side. Diagnostic tell: `CopilotQuery.senseUsed='none'` while the widget probed fine.
2. **Show-me key mismatch** — the highlight looked up the probed element by the step number the *LLM echoed* (often the step it recommends *next*); `position.step` is now always the **probe's** step (also the honest value for friction analytics), plus a prefix-fallback element lookup and `data-flowbuddy-debug` narration of the show-me path. *(Also: the show-me/Sense config reaches an embed only on page load — flipping a Studio toggle needs a host-page reload.)*
3. **Conversational position drift** — on "then?" follow-ups the model advanced through steps while the page never changed (it read "at step k" as "done with step k"). Hypotheses now carry the current step's **instruction resolved server-side from the KB** ("CURRENT step — NOT yet completed — is step 2: 'Enter your full name'"), and the prompt rules state the position is **re-measured from the live page every message and beats the conversation**: never advance from chat flow alone; same-step follow-up → re-anchor gently; refer to steps by instruction, not number.

⚠️ Ops note: `tsx watch` does **not** hot-reload workspace-package (`@flowbuddy/synthesis`) changes — restart the api after engine edits.

**Where everything lives:**

| Piece | File(s) |
|:---|:---|
| Schema (`Workspace.senseEnabled` default **ON** · `copilotShowMe` default **OFF** · `CopilotQuery.sense*` fields) | `db/prisma/schema.prisma`, migration `20260708121649_sense_in_context_help` (applied locally; Render on next deploy) |
| **P2-M0** plan compile + route-sharded serve | `api/src/sense-plan.ts` (on-demand compile, 60s per-workspace cache, shard cap top-8, ≤6 locators/step) + `GET /v1/copilot/sense-plan` in `api/src/server.ts` (own rate bucket, toggle-gated) |
| Step → event locator recovery | NEW `DistilledStep.keyEventId` (`synthesis/src/distill.ts`) for fresh builds; **existing recordings resolve via `screenshotFile` matching against the manifest — no reprocess needed** |
| **P2-M1** probe + scorer + masking + shard cache | `widget/src/sense.ts` (read-only locator walk incl. xpath + tag-scoped text; visible/enabled/filled booleans; `role=alert`/`aria-invalid` error capture → client-masked ≤200 chars; scorer weights 0.45 exact-route / 0.3 prefix / 0.35 current-step / 0.2 done-frac; `MIN_SCORE 0.2`, `TIE_DELTA 0.15`; shard cached 5 min per route, fetched on **panel open**) |
| **P2-M2** positional answering | `synthesis/src/copilot.ts` (three-tier POSITION CONTEXT prompt rules, `<page-error>` treat-as-data, `usedPosition`/`positionKey`/`positionStep` in the strict schema, echo re-validated against provided hypotheses) + `synthesis/src/retrieval.ts` (`senseKeys` soft boost: RRF weight 2 hybrid / +3 fallback) + `api/src/server.ts` (`resolveSenseContext`: type-clamped wire validation, **approval-checked keys, titles from the approval snapshot**, error de-angled) |
| **P2-M3** show-me | `widget/src/sense.ts` `spotlight()` (scrollIntoView + fixed pulse outline, 6s, reposition on scroll/resize) + `.sc-spotlight` in `widget/src/styles.ts`; gated by `showMe` served on `/v1/copilot/config`; cleared on next ask / panel close |
| **P2-M4** friction | `senseLogFields` on every `CopilotQuery` (`used \| ignored \| none`) + `web/lib/analytics.ts` `getStepFriction` + the **"Where users get stuck"** card on `/dashboard/analytics` |
| Studio toggles | Copilot → Settings → **"Sense — in-context help"** section (`copilot-workspace.tsx`): Enable Sense + "Show me" highlight (disabled while Sense is off), success/error toasts (citation toggle retrofitted with toasts too); actions in `web/lib/copilot-settings-actions.ts` |

**Build-time decisions (within the locked design):** Sense defaults ON (read-only, harmless), show-me defaults OFF (draws on the host page); the plan compiles **on demand** with a 60s server cache instead of persisting at approval time (no invalidation machinery; approval flips visible ≤60s + widget shard TTL); an **empty shard sends no sense context at all** (no workflows near the route ≠ drift — `senseUsed='none'` is reserved for "candidates existed, nothing matched"); preview mode (`data-flowbuddy-preview`) skips Sense entirely. **Still open for later cuts:** friction-frequency in the hub-page shard ranking (needs accumulated P2-M4 data), SPA settle-check before probing, `postRoute` progression evidence in the scorer.

---

> **Not in Phase 2:** acting on the page (Phase 4 — Autopilot), the full guided step-through walkthrough (P4-M0 — since ✅ built in Phase 4, 2026-07-15), continuous monitoring or proactive nudges (locked out; P4-M0's walkthrough observes only during an explicit user-started session), end-user recording (never), sandbox replay/drift validation (Phase 3), and the portal/articles (Version 2).
