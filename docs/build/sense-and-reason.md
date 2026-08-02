# FlowBuddy — Phase 2: Sense + Reason (in-context help & diagnostic reasoning)

> **Phase 2 makes the copilot aware of the user's live situation.** **Sense** answers *where the user is* — which approved workflow and which step — and answers **positionally** ("you're on step 3 of X; here's how to get unstuck, then the path to done"). **Reason** (module P2-M5) answers *why they're stuck* — it reads the live page state, compares it against the founder's own recording of that step working, and diagnoses the blocker. Both are built and live in production.

- **Status:** ✅ Built, user-verified end-to-end, in production.
- **Companion docs:** Phase 1 substrate → [`copilot.md`](copilot.md) · roadmap → [`roadmap.md`](../roadmap.md) · technical model → [`architecture.md`](../product/architecture.md) · Phase 4 (consumes Sense localization + inherits Reason's agent loop) → [`agent.md`](agent.md) · why copilot-first → [`product.md`](../product/product.md) §5

## The trust ladder (the load-bearing distinction)

Sense and Reason are two rungs with **deliberately different privacy postures** — keep them distinct:

| | **Sense** (the probe) | **Reason** (the escalation) |
|---|---|---|
| What leaves the page | Locator-hit **booleans** + **one masked error snippet** only | A **structured page-state snapshot** (values masked) ± a DOM-rendered page image |
| End-user disclosure | **None needed** — nothing identifiable leaves | **Founder-gated** — founder toggle + a privacy-policy disclosure snippet |
| Posture | Sensing, never surveillance | End-user-silent, ask-time-scoped, founder opt-in |
| Runs | Every message (read-only probe) | **Selectively** — diagnostic questions / blocked state / fast-path failure |

Both are **ask-time only** (never on widget open, never proactively, never a running tape), tested **only against approved workflows** (no-leak), and **bias answers, never override the question**. Product facts always come **only** from the approved KB; Reason adds *measured page state* as a second legitimate grounding substrate for explaining the user's *current situation* — it never invents product facts, and declines when neither substrate covers the question.

---

# Part A — Sense (P2-M0…M4): in-context help

## A1. The feature

**Baseline (Phase 1):** ask → retrieve over approved-KB (question-driven, route-boosted) → grounded answer + citations, or an honest decline.

**The Sense loop:** the user asks → the widget runs a **read-only probe** against the live page → scores which approved workflow + step the user appears to be on → the **top-k hypotheses ride the existing `/answer` call** → the answer LLM makes the final call *with the question in hand* → a **positional answer**:

> *"That error means the Amount can't be zero — enter a value greater than 0, then hit **Send**. After that you're done: Send is the last step of Create an invoice."*

- **Ask-time only, silent.** The probe runs when a message is sent. The copilot doesn't announce what it can see; it just answers better.
- **Unstick first, then the path.** For a user localized at step k: resolve step k (using its distilled instruction/detail/narration + the on-screen error), then the remaining steps k+1…n. Citation is **step-level** ("Create an invoice · step 4").
- **Ambiguity → ask.** When two workflows genuinely tie (shared screens), the copilot asks: *"Are you trying to create a new invoice or edit an existing one?"*
- **Multi-turn re-probe.** Every follow-up re-runs the probe (milliseconds, against a cached plan) — if the user moved on, the copilot notices: *"Nice — you're on step 4 now. Next: …"*
- **"Show me" highlight — config-gated.** When enabled in copilot settings, the widget also **highlights the current step's element** on the host page; off = text-only. Single-step only (the full sequential walkthrough is Phase 4's P4-M0, built on this).
- **Founder control:** a per-workspace **Sense toggle** in Studio. No end-user-facing disclosure.

### The three-tier context model

Context **biases, never overrides** — the question always wins:

| Tier | Situation | Behavior |
|---|---|---|
| **A — unrelated** | Localized at W/step 3, but asks about something else | Retrieval stays question-driven (hybrid keyword+vector, whole approved KB); the localization is a **soft boost** the question out-ranks; the answer LLM **silently ignores** the hypotheses. No positional preamble. |
| **B — on-workflow** | Question is about the localized workflow | Full positional answer: unstick step k → remaining path, step-level citation. |
| **C — deictic** | *"What now?" · "Why can't I continue?" · "How do I finish this?"* | Context is the **primary signal** — "this" resolves to W/step k. The killer case: a stuck user asks exactly these, unanswerable without Sense. |

The friction log records which tier occurred (**used / ignored / none**) — a step-3 localization attached to an unrelated question is *not* step-3 friction (only tier-B/C count as friction).

## A2. How it works (the hybrid architecture)

Localization is two jobs, each placed where it's strongest: **mechanical evidence gathering** (deterministic → where the DOM is, the client) and **semantic interpretation** (needs the question → the answer LLM).

```
Studio approval ──► compile SENSE PLAN per approved workflow      (server, at approval/reprocess)
                    (ordered steps × ranked R13 locators + routes + outcome markers)
                          │  GET /v1/copilot/sense-plan?route=<path>   (key-authed;
                          │  ROUTE-SHARDED — only workflows with steps on/near this route,
                          │  capped top-N; fetched on PANEL OPEN, never page load;
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

**What the probe captures:** route (path/hash/title) · per-step locator results (*resolves / visible-in-viewport / enabled* — booleans) · input-state booleans (*filled/empty*, never the value) · expected-outcome echoes (step k's `post_action` markers present ⇒ step k done — how "steps 1–2 finished" is inferred) · fold position of the step target · error-state boolean + **masked error text** (P1-M12 client masking patterns, length-capped ~200 chars — the one non-boolean, kept because "stuck" usually means an error is showing and knowing *which* transforms the answer).

**What the Sense probe never captures:** screenshots, DOM snapshots, input values, arbitrary page text, cookies/storage. *(The founder-gated Reason escalation captures its own structured snapshot ± image — Part B.)* The probe is ephemeral — only the localization *outcome* (workflow, step, confidence, used/ignored) is logged, for analytics.

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

### Why hybrid, not server-side fingerprint synthesis

The alternative architecture — capture the page's HTML element fingerprints (roles, labels, names, visible text) at ask time, ship them **up** with the question, and let the server compare against the KB — was rejected. The comparison must happen *somewhere*; the only question is which data travels.

| | **Hybrid (what's built)** | **Server-side fingerprint synthesis (rejected)** |
|---|---|---|
| Client complexity | Sense plan + shards + caching + probe/scorer | Trivial — scrape + send |
| Drift tolerance | Binary — a broken locator = no match (drift is **Phase 3's job**: detect → flag → re-record) | Better — the LLM can fuzzy-match a changed page |
| Privacy | **Booleans + one masked snippet only** — no page content leaves | Labels/names/text carry user data, not pattern-maskable → a page snapshot leaves on every question |
| Cost/latency | One-time cached shard (few KB); LLM reads a 2-line hypothesis summary | Recurring per-message upload (tens of KB, uncacheable) + thousands of prompt tokens forever |
| Precision | Surgical evidence (exact element **filled**, done-markers **present**); crisp deterministic tie threshold | Fuzzy recall, weaker precision; mushy self-reported confidence |
| Injection surface | One delimited error snippet | The whole page's text (incl. user-generated content) each question |

**The deciding asymmetry:** the founder's recordings already provide **exact** fingerprints, pre-computed. The hybrid ships that founder-derived data *down* and compares on the user's machine; the alternative re-derives at runtime over **end-user data**, on the server, per message, what the sense plan knows statically for free. The drift-tolerant-reasoning value of the alternative grew into a full module instead — **Reason** (Part B). When the probe matches nothing (probe-zero), that's logged as a **passive drift signal** (P2-M4 → Phase 3) and the answer degrades to plain route bias.

## A3. Modules (P2-M0…M4)

| Module | What it is |
|:---|:---|
| **P2-M0** | **Sense plan — compile + serve (route-sharded).** At approval/reprocess, compile each approved workflow's manifest into a sense plan (ordered steps × ranked locators + routes + outcome markers). Served **sharded by route** — `GET /v1/copilot/sense-plan?route=<path>` returns only the workflows with steps on/near the current route, **capped top-N** (ranked by route-specificity + friction frequency), so payload is **O(workflows on this page), never O(all workflows)** — a founder with 1,000 recordings ships the same few KB as one with 10. **Workflows are served atomically** — a shard contains every matched workflow *whole* (all steps, including steps on other routes), so mid-workflow progression (step 3's URL → step 4's URL) **never triggers a refetch**: the probe re-runs against the cached plan and notices the advance. A route the cache doesn't cover triggers a small **top-up fetch** for that route only. Fetched **on panel open** (never page load — zero cost for visitors who don't ask), **ETag/version-cached per route**, **gated by the Sense toggle**, approved-only (no-leak). Beyond the cap (hub pages), Sense degrades to route bias. The shared-artifact seed for Phase-3 replay / Phase-4 execution. |
| **P2-M1** | **Widget probe + scorer.** Ask-time read-only probe (locator walk, visibility/enabled/filled booleans, outcome echoes, error detection + **masked snippet**), deterministic scoring → top-k hypotheses; re-probe on every follow-up; strict performance budget (no host-page jank). Reuses the P1-M12 masking patterns client-side. |
| **P2-M2** | **Positional answering.** `/answer` accepts the hypotheses context; retrieval treats it as a soft boost; the answer prompt implements the **three-tier relevance model**, the **unstick-then-path** shape, **step-level citations**, tie → **"X or Y?"**, and multi-turn **progress acknowledgment**. The error snippet enters the prompt as **untrusted data** (delimited, treat-as-data). |
| **P2-M3** | **"Show me" highlight (config-gated).** When the toggle is on, the widget highlights the current step's element on the host page alongside the answer; off = text-only. Single-step only. Phase 4's P4-M0 guided walkthrough is built on this (sequential, manual-Next advancement). |
| **P2-M4** | **Step-level friction analytics.** Log the localization outcome per query (`workflow, step, confidence, used\|ignored\|none`); Studio analytics gains a **per-step friction view** ("users get stuck on step 3 of *Create an invoice*") + record-this-next prompts; locator-resolution failure rates surface as **passive drift signals** (feeds Phase 3). Only tier-B/C localizations count as friction. |

## A4. Design rules

- **Trigger & posture:** probe only at ask time (message send); context used silently — no proactive nudges or announcements.
- **Captured payload:** route + per-step locator/visibility/enabled/filled **booleans** + expected-outcome echoes + fold position + error boolean + masked, length-capped error text. **Never** screenshots, DOM snapshots, input values, or arbitrary page text. Probe ephemeral; only the outcome is logged.
- **Localization architecture:** hybrid — client probes + scores deterministically; top-k hypotheses + evidence ride the existing `/answer` call; the answer LLM disambiguates with the question in hand. No extra round trip.
- **Show-me:** config-gated in copilot settings; on → highlight the current step's element, off → text-only.
- **Ambiguity:** genuine tie → the copilot asks the user ("X or Y?").
- **Answer shape:** unstick step k first, then the remaining path; step-level citation.
- **Founder controls:** per-workspace Sense toggle; no end-user-facing disclosure.
- **Multi-turn:** re-probe on every follow-up; acknowledge progress. **Position is re-measured from the live page every message and beats the conversation** — never advance from chat flow alone; a same-step follow-up re-anchors gently; refer to steps by *instruction*, not number. (Hypotheses carry the current step's instruction, resolved server-side from the KB, so the model can't drift "at step k" into "done with step k".)
- **Unrelated questions:** three-tier relevance (bias, never override); log used/ignored/none.
- **Defaults:** Sense **ON** (read-only, harmless); show-me — see [`roadmap.md`](../roadmap.md) for the current per-workspace defaults (it was flipped ON for new workspaces alongside the Copilot-mode default, 2026-07-27). An **empty shard sends no sense context at all** (no workflows near the route ≠ drift — `senseUsed='none'` is reserved for "candidates existed, nothing matched"). Preview mode (`data-flowbuddy-preview`) skips Sense entirely.

## A5. Risks & mitigations

- **Frequent mislocalization erodes trust** — confidence floor (degrade to route bias), tie → ask, and the hypotheses framing (the LLM hedges naturally at low confidence).
- **Prompt injection via the error snippet** — host-page-controlled text entering the prompt: strict delimiting, treat-as-data, length cap; never overrides grounding.
- **Plan growth with many workflows** — solved structurally by route-sharding (the widget only downloads the current route's shard, fetched on panel open, version-cached); hub pages capped top-N, then degrade to route bias.
- **Probe jank** — locator walks are `querySelector` calls (ms-level); the sharded, capped plan bounds the work.
- **A new public-key surface** — `sense-plan` is key-authed, origin-checked, and rate-limited like `/config`; it contains locator selectors (not content), approved workflows only.
- **SPA timing** — probing mid-transition mislocalizes; probe after a short DOM-settle check.

## A6. Data-model deltas

- **`Workspace.senseEnabled`** (default **ON**) — the Studio toggle; gates the plan endpoint. **`Workspace.copilotShowMe`** (default **ON** for new workspaces since 2026-07-27, was OFF) — the show-me flag, served via `GET /v1/copilot/config`. It was off in the era when a fixed rule last governed it (*every* positional answer highlights, which was judged noisy enough to deserve opt-in). Both the rule and the ON default now hold at once — deliberate since 2026-08-02, when the assistant's per-message judgment was reversed back to a rule (agent.md D8, amended): the noise is bounded by structure, and a switch that might or might not fire is worse than one that plainly does. **The switch is the only decider.** Existing workspaces keep what they set — the migration flips the column default only.
- **Sense plan storage** — compiled on demand, keyed by the workflow key `(sourceId, segmentIndex)`; designed as the shared base of Phase 4's `ExecutionPlan`.
- **`CopilotQuery` localization fields** — `senseSourceId`/`senseSegmentIndex`, `senseStep`, `senseConfidence`, `senseUsed` (`used | ignored | none`) — powers the P2-M4 friction view. No end-user identity.

## A7. As-built — where everything lives (Sense)

| Piece | File(s) & specifics |
|:---|:---|
| Schema | `db/prisma/schema.prisma`: `Workspace.senseEnabled` (ON) · `copilotShowMe` (ON for new workspaces since 2026-07-27) · `CopilotQuery.sense*` fields |
| **P2-M0** plan compile + route-sharded serve | `api/src/sense-plan.ts` (on-demand compile, **60s per-workspace cache** — no invalidation machinery; approval flips visible ≤60s + the widget shard TTL — shard cap **top-8**, **≤6 locators/step**) + `GET /v1/copilot/sense-plan` in `api/src/server.ts` (own rate bucket, toggle-gated) |
| Step → event locator recovery | `DistilledStep.keyEventId` (`synthesis/src/distill.ts`) for fresh builds; existing recordings resolve via `screenshotFile` matching against the manifest — no reprocess needed |
| **P2-M1** probe + scorer + masking + shard cache | `widget/src/sense.ts` — read-only locator walk (incl. xpath + tag-scoped text), visible/enabled/filled booleans, `role=alert`/`aria-invalid` error capture → client-masked ≤200 chars; **scorer weights: 0.45 exact-route / 0.3 prefix / 0.35 current-step / 0.2 done-fraction; `MIN_SCORE 0.2`, `TIE_DELTA 0.15`**; shard cached 5 min per route, fetched on panel open |
| **P2-M2** positional answering | `synthesis/src/copilot.ts` — three-tier POSITION CONTEXT prompt rules, `<page-error>` treat-as-data, `usedPosition`/`positionKey`/`positionStep` in the strict schema, echo re-validated against provided hypotheses. `synthesis/src/retrieval.ts` — `senseKeys` soft boost (RRF weight 2 hybrid / +3 fallback). `api/src/server.ts` — `resolveSenseContext`: type-clamped wire validation, **approval-checked keys, titles from the approval snapshot**, error de-angled. **Wire note:** hypothesis `sourceId`s are `randomUUID()` (hyphens), not cuids — the validation must accept hyphens or every hypothesis is silently dropped. |
| **P2-M3** show-me | `widget/src/sense.ts` `spotlight()` (scrollIntoView + fixed pulse outline, 6s, reposition on scroll/resize) + `.fb-spotlight` in `widget/src/styles.ts`; gated by `showMe` on `/v1/copilot/config`; cleared on next ask / panel close. `position.step` for the highlight is always the **probe's** step (not the step the LLM echoes/recommends next), with a prefix-fallback element lookup. |
| **P2-M4** friction | `senseLogFields` on every `CopilotQuery` + `web/lib/analytics.ts` `getStepFriction` + the **"Where users get stuck"** card on `/dashboard/analytics` |
| Studio toggles | Copilot → Settings → **"Sense — in-context help"** (`copilot-workspace.tsx`): Enable Sense + "Show me" highlight (disabled while Sense is off), success/error toasts; actions in `web/lib/copilot-settings-actions.ts`. **Config reaches an embed only on page load** — flipping a Studio toggle needs a host-page reload. |

**Open refinements (not yet built):** friction-frequency in the hub-page shard ranking (needs accumulated P2-M4 data), an SPA settle-check before probing, `postRoute` progression evidence in the scorer.

**Dev-workflow note:** `tsx watch` does **not** hot-reload workspace-package (`@flowbuddy/synthesis`) changes — restart the api after engine edits.

---

# Part B — Reason (P2-M5): diagnostic reasoning

## B1. The gap it closes

Sense's probe ships **yes/no facts** (found / visible / filled / disabled + one masked error snippet). That answers *"where am I and what's next"* — but not *"why is Create Account disabled?"*: the probe saw `email: filled` and had no way to see *filled with something that isn't a valid email*, nor to read the password-requirements checklist on the page. A general assistant handed a screenshot answers this easily; a copilot fed booleans cannot. **Reason widens the evidence channel and adds a reasoning loop** — general reasoning over general page state replaces the enumeration of hand-built evidence extractors.

**The moat move — expected-vs-actual.** Every generic bot can at best see the user's page. Only FlowBuddy also has **the founder's recording of the same step succeeding** (screenshot + captured state), so it can say: *"When this step works, the button is enabled after a valid form; on your screen the email fails format validation and 3 of 4 password rules are unmet."*

## B2. Capture posture & genericity

- **Genericity:** **web standards only** — every signal must be derivable on any standards-built SaaS (the HTML5 validity API, ARIA roles/states, DOM properties). Nothing app-specific, ever.
- **End-user-silent, founder-gated:** no per-incident consent friction. The guardrails that make this legitimate: a **founder-level Studio toggle**, **input-value masking by default**, and a ready-made **privacy-policy disclosure snippet** the founder carries. (Same model as session-replay tools like FullStory/LogRocket — the site owner opts in and carries disclosure.)
- **Ask-time-scoped, always** — a snapshot when the user asks, never a running tape. No continuous recording of end-users, in any mode.
- **Technical reality:** a true pixel screenshot **cannot** be captured silently (browsers force a picker for screen capture), so silent capture is **DOM-derived**: a structured snapshot, optionally a re-painted image. For form/state questions structured DOM state is *more* informative than pixels — `disabled`/`invalid`/`checked` are explicit rather than inferred from colors.
- **Capture form:** **structure + a rendered image**. The DOM-to-canvas renderer is **lazy-loaded** on the first diagnostic question (never in the base bundle); masking happens on a **cloned DOM before render**; cross-origin taint failures degrade to structure-only.

## B3. The reasoning input package

Ordered by value per token:

| # | Data point | What it gives the reasoner |
|---|---|---|
| 1 | Question + conversation history | Intent, follow-up chain |
| 2 | Sense localization (workflow, current step, done-evidence, confidence) | Anchors everything |
| 3 | The full localized workflow — all steps, in order, with instructions | The complete recipe |
| 4 | **Structured page-state snapshot** — every interactive element with role / accessible name / `disabled` / `checked` / `expanded`; every field with `filled` / `valid` + **failed-constraint name** (`typeMismatch`, `tooShort`, `patternMismatch`, `valueMissing`); visible labels, hints, requirement/error text; reading order | The core new channel — what a screenshot shows, as explicit machine state, on any standards-built app |
| 5 | Field values — **masked by default, everywhere**; founder-controlled unmasking; password/card/SSN hard-floored | Rarely needed ("filled but invalid" usually suffices) |
| 6 | **The founder's expected state from the KB — BOTH artifacts:** the step **screenshot** (a true pixel photo) *and* the step's captured **DOM snapshot** (data) | **The differentiator.** The DOM half enables a **data-vs-data diff** (founder's DOM then vs. the user's structured snapshot now) so the structure-only default gets true expected-vs-actual too — pixels aren't required for it; the photo half pairs with #7 for the visual diff where the image tier is on |
| 7 | DOM-rendered image (html2canvas-class) | Pixels for what structure can't express (canvas-heavy apps, visual confusion, low-semantics UIs) |
| 8 | Environment — route, title, viewport | Disambiguation |

**Stays out, deliberately:** continuous event recording (ask-time snapshots only), cookies/storage/network, anything cross-origin the browser hides from page scripts anyway.

### B3.1 The rendered image — honest value analysis

Kept on record so the day-one image-tier decision carries its reasoning:

- **Where the image earns its place:** (a) **low-semantics apps** — bare-`<div>` UIs with no roles/labels produce muddy structure but still *render* correctly; vision reads what the DOM never said (the image's strongest case — the fallback when the structure channel is weak); (b) **layout/occlusion bugs** — structure says "button enabled", pixels reveal "covered by a cookie banner / off-screen / white-on-white"; (c) **color-only state** — green-✓/grey-✗ checklists and red borders with nothing mirrored in text/ARIA; (d) **spatial "where is X?" questions**; (e) **the picture-vs-picture synergy** — the founder's expected-state step screenshot (#6) is an image regardless, so adding the user's image turns expected-vs-actual into a natural visual diff. *(e) applies to every app, not just the odd ones — the primary reason the image tier is built.*
- **Where it adds ~nothing:** standards-built forms — the dominant case in the target segment. `filled/INVALID (typeMismatch)` + hint text + `DISABLED` in the structure already carry the full diagnosis; the clone-masked image just repeats it at vision-token prices.
- **The canvas caveat:** DOM-to-canvas renderers frequently **cannot** reproduce `<canvas>`/WebGL content (taint rules, blank read-backs) — a canvas-heavy app often renders as a blank rectangle. Canvas apps are **not** the image tier's win; a true screenshot would capture them but cannot be taken silently. Do not oversell this case.
- **Rough proportions (revisit against real failure logs):** ~80–90% of diagnostic questions on form/CRUD SaaS are fully answered by structure alone; the image is decisive in ~5–15% (cases a–d) and upgrades the expected-vs-actual comparison everywhere (e).
- **Why paint at all:** the image is derived from the DOM, but *deriving it means executing the browser's layout/stacking math* — exactly what data can't cheaply express. Answering "is anything covering this button?" from raw data requires z-index/stacking-context resolution (unreliable for an LLM over style tables); the painted image resolves occlusion for free. Shipping the full recipe instead (entire DOM + computed styles) costs 10–100× the tokens of the ~1–2k-token image. **Pixels are the cheapest correct encoding of "what the user actually sees";** data-vs-data remains the primary channel for state facts.
- **Fidelity — the image is a RECONSTRUCTION, not a photograph.** The widget re-paints the DOM onto a canvas, so vs. a true screenshot it loses canvas/WebGL content (blank), cross-origin images/video (blank/skipped), fancy CSS (approximated), native control chrome (re-drawn). **Plain DOM UI — forms, buttons, text, layout, overlays — reconstructs well**, which is what diagnosis needs, and the structured snapshot carries the hard facts regardless. **Asymmetry:** the founder's expected-state screenshot is a TRUE pixel screenshot (extension privilege, `captureVisibleTab`); the user's actual-state image is a reconstruction → **build rule: the expected-vs-actual prompt must diff CONTENT/STATE, never pixel styling** (colors/fonts legitimately differ). True end-user pixels have exactly one route — the `getDisplayMedia` consent picker — a possible later opt-in "share your screen" tier that leaves the silent design untouched.

### B3.2 What capture looks like to the end-user

- **Zero explicit action.** The user's only act is asking. If it trips the selective trigger *and* the founder has the relevant toggles on, the widget's JavaScript (already running in the page) walks the DOM and (image tier) renders the masked clone to a canvas. **No browser permission prompt appears** — inherent to DOM-derived capture (the prompting API, `getDisplayMedia`, is exactly what this design avoids).
- **No visible indication.** Nothing flashes, no icon, no notice — per the end-user-silent posture. The end-user learns of it only through the founder's privacy policy (the disclosure snippet shipped in Studio).
- **Honest edges:** the capture is *silent, not hidden* — a technical user can see the payload leave in DevTools' network tab, like any web traffic; on very heavy pages the DOM-render can cost a brief CPU spike (the render budget keeps it imperceptible).

## B4. The loop

- **Fast path (Sense):** probe → hypotheses → positional answer. Pennies, ~2s, one cheap text-only model call. Handles "how do I X / what's next / I'm stuck on an error". Most questions end here.
- **Reasoning path (Reason):** fires **selectively** — on diagnostic intent, on fast-path failure, or on a blocked page state; clearly-diagnostic questions go straight here (no double latency). The widget captures the §B3 package at ask time; the server assembles it and runs a **stronger model** in a small **agentic loop with read-tools** — *inspect this element's subtree · fetch the founder's step screenshot · request the rendered image* — pulling detail on demand instead of front-loading everything. Then: evidence-grounded diagnosis + the fix path.
- **Grounding doctrine:** product facts from the KB only; state explanations from measured/captured evidence only; decline when neither covers. Page-derived text is fenced as untrusted data (the Sense `<page-error>` pattern, generalized).
- **Both paths are LLM-generated on the server.** The widget never composes answer text — it renders UI, probes the page, and ships evidence. "Fast vs Reason" is *cheap single LLM call* vs *stronger model + agentic loop + more evidence*, not "no-AI vs AI". (The only frontend-authored strings: the greeting, error fallbacks, and the show-me highlight.)
- **The arc:** this read-tool agent loop is the skeleton **Phase 4 inherits** — same loop, act-verbs added by Phase 4's execution driver (P4-M2). P4-M0's guided walkthrough already gates on this module's `readElementState` vocabulary. **It was also the direct ancestor of the Copilot agent:** the loop was extracted into `synthesis/engine.ts` (2026-07-26) and is now shared by all three answer paths — this one, the mode-1 fast path (the same loop with no tools and a forced stop), and Copilot mode's agent.

> **⏸ Deferred — this path has NOT been folded into the Copilot-mode agent (2026-07-26).** Copilot mode runs two agent loops side by side, and **Reason's selective trigger still decides which one a question gets** — the last hardcoded fork left in it. Folding them is right eventually (the trigger misses oddly-phrased diagnostic questions, over-fires on simple ones containing *"why"*, and blocks answers that need page state AND a workflow lookup in the same turn). It was deliberately NOT attempted, for one reason: **`REASON_SYSTEM` is the most heavily tuned prompt in the product — the §B7.1 rules below are scar tissue from real failures — and it currently has ZERO automated coverage**, because the baseline script never sends live page STATE (it gained page paths and multi-turn cases on 2026-07-29, but neither reaches this path), and `preview` mode suppresses the escalation that would otherwise exercise it. The prerequisite is committed `ReasonSnapshot` fixtures the baseline can replay (empty form · half-filled · invalid email · rejection banner). Full reasoning: [`agent.md`](agent.md) §9, Gap 3. **Do not merge these paths before diagnosis is measurable.**

## B5. Design rules

- **Capture form:** structure + rendered image (lazy-loaded renderer · clone-masking · taint fallback to structure-only).
- **Trigger — SELECTIVE:** fires on diagnostic intent ("why / can't / stuck / not working / what happened / went wrong / didn't work / error / rejected") OR fast-path failure (a decline from a **single-call** engine — since 2026-07-29 an *agent* decline is no longer retried, because the agent already held the KB tools the retry would take away) OR a blocked page state (the current step's target disabled); clearly-diagnostic questions skip the fast path. Simple questions stay on the fast path. ("Always reason" can become a founder setting later — same plumbing, different gate.)
- **Founder-toggle defaults:** structure **ON** (masked) · image **ON** (marked *recommended* — visual-only state, banners and met/unmet checklists, is where diagnosis quality lives). Two Studio switches; flipping the image switch surfaces the disclosure snippet.
- **Field values:** masked by default **everywhere** — structure AND the rendered image (clone-masking), consistently. Founder-controlled unmasking via a Studio control. **Hard floors regardless of setting:** password fields never captured in any form; card/SSN patterns (P1-M12) always masked.

## B6. Risks & mitigations

- **Prompt injection, enlarged** — the structured snapshot puts the page's *visible text* (incl. user-generated content) into model input on every reasoning call. Fence all page-derived strings as data (delimiters + treat-as-data), cap sizes, never let them override grounding.
- **Cost on a public endpoint** — the reasoning path is the most expensive per-interaction thing the product does; the selective trigger + per-workspace ceilings bound it. Vision multiplies it — hence the tiering.
- **Snapshot size/perf** — the capture is budgeted (element caps, text caps, sanitizer reuse) so a complex page can't jank the host or blow the prompt.
- **Founder-side compliance** — silent capture makes the disclosure snippet + toggle load-bearing for the founder's own legal posture; they ship together with the feature, not as a follow-up.
- **Custom-validation apps** — no HTML5 constraints/ARIA = weaker evidence (disabled flag + hint text only). Honest ceiling; the rendered-image tier is the recourse.

## B7. As-built — where everything lives (Reason)

| Piece | File(s) & specifics |
|:---|:---|
| Schema | `db/prisma/schema.prisma`: `Workspace.reasonEnabled` (**ON**) · `reasonImageEnabled` (**ON**, recommended) · `reasonIncludeValues` (**OFF**); `CopilotQuery.reasonTrigger` (`intent\|blocked\|escalation`) + `reasonImage` |
| Trigger + structured snapshot + renderer loader | `widget/src/reason.ts` — `reasonTrigger` (intent regex + blocked-state check off the Sense probe's current-step element); `captureSnapshot` (**≤60 controls / ≤40 texts**, capped strings, validity-API failed-constraint names, accessible-name walk, `maskText` reuse, password/card/SSN hard floors); `renderPageImage` (sibling-URL script inject + **4s budget**) |
| Image renderer bundle (lazy, never in the base widget) | `widget/src/render-image.ts` → `dist/flowbuddy-copilot-render.js` (html2canvas; **viewport-only, ≤1280px scale, JPEG 0.7**; clone-masking incl. text-node PII; **≥8000-element / oversize / taint / timeout → null**); `build.mjs` builds both bundles; `web/app/widget/flowbuddy-copilot-render.js/route.ts` dev-serves it |
| Widget wiring | `widget/src/index.ts` — `reason`/`reasonImage`/`reasonValues` from `/v1/copilot/config`; capability flag `context.reason.available` on every ask so the server can offer escalation; **one escalation retry, never chained**; preview skips Reason like Sense |
| **The engine** | `synthesis/src/reason.ts` `diagnoseFromKB` — grounding doctrine in `REASON_SYSTEM`; **≤4 rounds / ≤4 tool calls**; tools `get_expected_screenshot` · `get_expected_dom` · `get_page_image`, offered only when their evidence exists; images attached via a **post-tool user message** (tool messages are text-only); content/state-not-pixel-styling diff rule; strict JSON answer schema **shared with the fast path** (so citations/thumbs/position/show-me keep working); `senseBlock` reused from `copilot.ts` |
| API | `api/src/server.ts` — `resolveReasonContext` (type-clamp + de-angle + `redactText` backstop on every page string; **the image is accepted only when the founder's tier is ON, values only when unmasking is ON** — a spoofed widget can't force a posture); `buildReasonEvidence` (full workflow recipe from the approval-checked top hypothesis + `keyEventId`/`screenshotFile` → manifest event → lazy R2 readers for the TRUE step screenshot + captured DOM); **reason rate bucket 6/min** on top of the answer bucket (over → silent fast-path degrade); route **`bodyLimit` 4 MB** for the size-capped image; the **`escalate` handshake** (decline NOT logged when escalation is offered — the retry logs the real outcome); `/v1/copilot/config` serves the 3 flags; `copilot-auth.ts` resolves them with the key |
| Studio | Copilot → Settings → **"Reason — diagnostic answers"** (`copilot-workspace.tsx`): Enable Reason (ON) · Include page image (ON, *recommended*) · Include typed values (OFF), image/values disabled while Reason is off; the copyable **privacy-policy disclosure snippet** renders inside the section; success/error toasts; actions in `web/lib/copilot-settings-actions.ts` |

**Escalation handshake (build detail):** the fast-path-failure trigger is a two-round-trip handshake — the server replies `escalate: true` instead of logging the decline; the widget captures and retries once. It fires only when the founder's toggle is on AND the widget declared capability, so old widgets keep the plain decline, **and — since 2026-07-29 — the decline did not come from the agent** (`engineUsed !== 'agent'`): in Copilot mode the retry would drop `search_knowledge`/`get_workflow` and hand the question to a different engine entirely, so the agent's own honest decline is kept and logged instead. **Without Sense localization Reason still runs** (snapshot + KB only — the expected-state tools just aren't offered). The renderer URL derives from the widget script's own `src`, so **`flowbuddy-copilot-render.js` must deploy beside `flowbuddy-copilot.js`** (and be re-copied into any app that serves a copied bundle after a rebuild). `REASON_MODEL` picks this path's model, which **must be vision-capable** — it is sent a rendered page image. Unset, it falls back to `SYNTH_MODEL`. Coverage-gap logging on a Reason decline matches the fast path.

### B7.1 Diagnosis-quality rules baked into the engine & capture

These behaviors are load-bearing for correct diagnoses — preserve them:

1. **`valid` is trustworthy-only.** A field with only `required` passes `checkValidity()` while failing every on-screen (React-state) rule. The capture ships `valid` **only** when it's *false* or the control has real HTML5 constraints (email/url/number/date types, pattern/min/max/step/…); absent = "nothing machine-checkable", and the prompt must never assume such a field passes the app's rules.
2. **Visible text via a text-node TreeWalker** (markup-agnostic, reading order, control captions skipped) — requirement checklists are routinely plain `<div>`s that a tag selector misses. When structured state can't explain a DISABLED action (e.g. color-only checklist state), the prompt tells the model to **request the page image before concluding**.
3. **On-page errors first.** An error/alert/rejection message in the evidence IS the primary diagnosis — explain it and the way forward before any theory. A complete form + a rejection banner means the *action* was rejected → diagnose the rejection, not the form.
4. **Never claim a state the evidence contradicts.** disabled/blocked/not-clickable may only be asserted when PAGE STATE says DISABLED; buttons report **`enabled` explicitly** so the rule has positive facts to stand on.
5. **Image-first reading order** when the image is present — read banners/toasts and met/unmet marks from pixels first; PAGE STATE stays ground truth for machine facts; never assert a requirement UNMET without evidence.
6. **`[alert]`-tagged capture pass** (`captureSnapshot`) — alert/error surfaces (`role=alert`, assertive live regions, `class*=error|danger|alert`) are collected **document-wide, first**, with a reserved slice of the text budget, so a rejection banner can't lose the budget to marketing copy or fall outside a narrow scope.
7. **Shared alert-surface detector.** `findAlertSurfaces` in `sense.ts` (standards signals + error-styled classes + **red-family text blocks** — catches utility-CSS banners like Tailwind's `text-red-600`, which carry no role and no "error" class) feeds **both** Reason's `[alert]` capture pass AND Sense's `findError`, so the masked rejection snippet also rides the probe wire into **fast-path** answers (a follow-up over a rejection banner won't answer "go ahead and click it").
8. **Completeness is structural, not prompted.** `pageStateBlock` appends a deterministic **"machine-checked blockers" list** (invalid fields · empty required fields · unticked required boxes — computed in code) that the answer must cover entry-by-entry. (Prompt nudges alone oscillated at temp 0.2 — completeness is derived in code.)
9. **Look before concluding; no speculation in declines.** The model may not conclude "everything looks fine" or decline until it has an on-page error to explain **or** has examined the page image (clean structure + a stuck user means the problem lives where structure can't see). Declines never invent causes — no server/network/connectivity speculation.
10. **Answer style & format.** Support-agent voice: translate constraint names to plain words (`valueMissing` → "is still empty"), never narrate evidence sources, no boilerplate re-instructions or closing summaries. A shared **`ANSWER_FORMAT_RULES`** const (exported from `copilot.ts`, appended to **both** the fast-path and Reason system prompts): numbered lines for multi-action answers, every UI target **bolded**, short paragraphs. The widget renderer matches — `mdToHtml` is block-level: "1. …" → step rows with an accent-tinted numbered chip (`.fb-step-n`), "- …" → bullet rows, else spaced paragraphs; assistant bubbles use `white-space: normal` (user bubbles keep `pre-wrap`); escape-first; only that subset renders (headings/tables/links stay banned in the prompts).
 11. **The question is labelled as the NEW one (2026-07-29).** The final user message ends with `The user's NEW message — this is the one to answer, not anything asked earlier: …`, never a bare `Question:`. This path is the most exposed of the three: position, the full workflow recipe and an entire page-state dump all sit between the conversation and the question, so a bare label at the bottom loses a salience contest to the previous turn's short clean line — and the engine answers the OLD question. Measured on the fast path and the agent (0/10 → 10/10 both); carried here for consistency, since the diagnostic path cannot be measured the same way until page-state fixtures exist.

---

# The end-to-end flow (Sense → Reason)

Running example: the founder recorded **"Create an account"** (Start Free → name → email → password → terms → Create Account) and approved it; the sense plan is live. A user types "Hey" as their name, "done" as their email, a 5-char password, ticks terms — **Create Account stays disabled**. They open the copilot.

1. **The glance (Sense).** On send, the widget checks the page against the sense plan in milliseconds: which workflow, which step, what's filled. Yes/no facts only.
2. **The fork (the trigger).** The system routes by the *kind* of question:
   - *"what do I do here?"* → **fast path**: the probe's hypotheses + the question go to the server, where the answer LLM writes the positional answer — ~2s, one cheap model call. Most questions end here.
   - *"why is Create Account disabled?"* → diagnostic intent, and the glance itself sees a blocked state (the disabled target). **Reason wakes.**
3. **The deep read (Reason — silent, ask-time only).** The widget captures the structured page state (`Email — filled, INVALID (typeMismatch)`, the password hint text, `Create Account — DISABLED`; values masked) and, where the founder enabled it, paints the page image. The user does nothing and sees nothing.
4. **The comparison.** The server assembles: question + Sense localization + the full workflow recipe + the page reading + **the founder's expected state for that step (true screenshot + DOM snapshot)**. The stronger model diffs expected-vs-actual like a support engineer.
5. **The answer.** *"Create Account activates once the form is valid. Two things are blocking it: your email isn't a valid format, and your password doesn't yet meet the listed requirements — fix those and the button enables."* Show-me highlights the email field if enabled. If the evidence doesn't support a diagnosis → honest decline, never a guess.
6. **The founder's payoff.** The blocked-state moment is logged → Analytics friction signals ("users keep getting stuck at signup") → re-record with a better explanation, or fix the product's own UX.

**One-sentence version:** Sense figures out where you're standing; Reason takes one silent look at your screen the moment you ask "why", compares it with the founder's recording of that step working, and tells you exactly what's blocking you — while simple questions stay on the fast, cheap path.

---

# What Phase 1 provides (the substrate both build on)

| Capability | Where it comes from |
|---|---|
| **Find a step's element on a live page** | **R13 ranked multi-signal locators** — captured + uniqueness-verified per event target; the probe walks the list, first resolver wins |
| **Know a step was completed** | **`post_action` / `expected_outcome`** markers — their presence on the current page = done-evidence for earlier steps |
| **Page-level context** | **P1-M8 context API** — the widget already sends `location.pathname`; Sense deepens the same seam |
| **The delivery surface** | The **widget** is already in the host page (probe + highlight surface) and fetches config at mount (`/v1/copilot/config`) |
| **The answer engine** | the agent loop (`answerAsAgent`) + hybrid retrieval — Sense adds a context input and prompt rules, not a new engine |
| **Masking** | The **P1-M12 client-side redaction patterns** — reused on error text (Sense) and snapshot values (Reason) before anything leaves the page |
| **The founder's expected state** | Each distilled step's `keyEventId`/`screenshotFile` → the manifest event → the TRUE step screenshot + captured DOM in R2 (Reason's expected-vs-actual) |

**The shared artifact Phases 3/4 inherit:** the **sense plan** (steps × locators + routes + outcome markers) is what Phase 3 replay and Phase 4 execution also need (P4's `ExecutionPlan` = the sense plan + input slots + destructive flags). Sense is its first, zero-risk consumer — locator resolution gets exercised on real production pages before anything replays or acts. Reason's agentic read-tool loop is the skeleton Phase 4's execution driver extends with act-verbs.

---

> **Not in Phase 2:** acting on the page (Phase 4 — Autopilot), the full guided step-through walkthrough (P4-M0, built in Phase 4, on top of Sense's show-me), continuous monitoring or proactive nudges (locked out — capture is ask-time only), end-user recording (never), per-incident end-user consent flows (Reason's posture is founder-level), sandbox replay/drift validation (Phase 3), and the portal/articles (Version 2). Nothing in Phase 2 is app-specific.
