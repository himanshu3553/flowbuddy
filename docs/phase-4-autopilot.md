# Sync — Phase 4: Autopilot (agentic execution)

> **Phase 4 moves the copilot from *telling* to *doing*.** Today (Phase 1) an end-user asks "how do I X?" and gets a grounded, cited answer. Autopilot adds the next step: after the answer, the widget offers **"Want me to do this for you?"** — and on consent, **executes the approved workflow in the end-user's live session**, resolving each recorded step's element on the real page, acting, and verifying, with the user watching and in control the whole time. Working name **Autopilot** (a.k.a. **AI Agents / agentic mode**). Roadmap/status: [`roadmap.md`](roadmap.md) §5.

- **Status:** 📝 **Draft — to be planned.** Built **after Phase 3** (self-validation), whose replay engine + freshness signal it consumes. No investment before then.
- **Last updated:** 2026-07-08 · **Branch:** `dev`
- **Companion docs:** roadmap/status → [`roadmap.md`](roadmap.md) · technical model → [`architecture.md`](architecture.md) · Phase 1 (the substrate) → [`phase-1-copilot.md`](phase-1-copilot.md) · Phase 2 (Sense — localization + the plan artifact) → [`phase-2-sense.md`](phase-2-sense.md) · Phase 3 (the engine + certification) → [`roadmap.md`](roadmap.md) §4 · why copilot-first → [`product.md`](product.md) §5
- **The trust story in one line — grounded actions.** Generic browser agents *improvise* how to do a task; Autopilot **only executes workflows the founder recorded and approved** — the grounded-authorship guarantee extended from answers to actions. When a step can't be verified, Autopilot **stops safely and says so** instead of guessing forward (decline-over-hallucinate, applied to execution).

---

## 1. The feature

**The loop today (Phase 1):** ask → retrieve over approved-KB → grounded answer + citations, or an honest decline.

**The Autopilot loop:** ask → grounded answer → **offer to execute** → on consent, the widget runs the workflow's steps in the end-user's live session:

```
for each step:  resolve locator (ranked list, first that resolves wins)
                → act (click / fill / navigate)
                → verify expected outcome (page settled into the recorded post-action state?)
                → next step │ ask the user │ SAFE-STOP (explain + hand back control)
```

- **Human-in-the-loop by construction.** Captured input values are **masked** at capture (P1-M12), so Autopilot can never blindly replay values — it **prompts the end-user for every input** (prefilled from their question where safe, always confirmable). Sensitive by design, not by policy.
- **A second audience on the approval model** (`portal` joins as a third with the V2 portal track): `copilot | autopilot` — a per-workflow **"may be executed on end-users' behalf"** flag on the same `(sourceId, segmentIndex)` key. Founder opt-in per workflow, one click, reversible. Absence = never executable.
- **The guided walkthrough is the stepping stone.** Before acting *for* the user, the same machinery can **guide** them — Sense (Phase 2, P2-M3) already highlights the *current* step on demand; P4-M0 extends that into a sequential, progression-aware walkthrough of the whole remaining workflow. Zero side effects, same locator resolution; it ships first and is independently valuable.
- **The user stays in charge:** consent to start, visible step-by-step execution, pause/abort at any moment, confirmation on destructive steps.

**Done when (sketch):** an end-user asks → gets a grounded answer → consents → **watches the widget complete the workflow in their own session** — inputs prompted, destructive steps confirmed, any unverifiable step ending in a safe stop — and only workflows the founder approved for autopilot **and** Phase-3 validation currently certifies green are ever offered.

---

## 2. What Phase 1 already provides (the substrate)

| Capability | Where it comes from |
|---|---|
| **Find the element months later** | **R13 ranked multi-signal locators** — every captured target carries a ranked `{strategy, value, unique}` set (testid → human id → aria → name → placeholder → href → text, css/xpath tails), uniqueness-verified at capture. Execution = walk the list, first locator that resolves wins. |
| **Know the step landed** | **`post_action` / `expected_outcome`** — the settled post-step state captured per event; the agentic loop's verification check. |
| **Navigate between steps** | **`route`** per event (URL/path/hash/title) — deep-link and confirm location. |
| **An execution surface already in the page** | The **widget** is a same-origin script inside the host app — it can highlight, click, fill, and navigate. Today it only renders chat; Autopilot gives it hands. |
| **The trust-gate pattern** | `CopilotApproval` keyed `(sourceId, segmentIndex)`, reprocess-safe — generalizes to the `autopilot` audience (and to `portal` in the V2 portal track). |
| **Input safety** | Values masked at capture → execution **must** ask the user, making every run human-in-the-loop. |

---

## 3. Relationship to Phase 3 — one replay engine, two drivers

Self-validation (Phase 3) and Autopilot are the **same core capability — workflow replay — pointed at different targets with opposite risk profiles**:

| | **Phase 3 · Self-validation** | **Phase 4 · Autopilot** |
|---|---|---|
| Runs where | Customer **sandbox** — never production | End-user's **live production session** |
| Driven by | Sync's scheduled runner | The **widget**, on end-user consent |
| Auth | Sandbox credentials (+ MFA — the hard part) | User already signed in (solved for free) |
| A failed replay is… | **The product working** — a drift flag | **A safety event** — safe-stop, explain, hand back |
| Purpose | Keep the KB fresh | Complete the user's task |

**Why Phase 3 ships first:**
1. **The engine learns where failure is the deliverable.** Locator healing, step semantics, outcome verification get hardened in the sandbox — where a failed replay *is* drift detection — before ever touching a live user's data.
2. **Validation is Autopilot's certification layer.** Eligibility = **approved for autopilot AND recently validated green**. A workflow Phase 3 can't replay cleanly is never offered for execution. This rail exists only if Phase 3 ships first.
3. **The loop closes both ways.** An Autopilot safe-stop in production ("element not found at step 3") is a **live drift signal** feeding Phase 3's freshness dashboards — production telemetry complementing sandbox validation.

**Engineering seam:** one shared **replay core** (locator walk + healing, step semantics, outcome verification) with two drivers — Phase 3's sandbox runner and Phase 4's widget driver. The `retrieval.ts` single-seam pattern, applied to execution.

**Phase 2 (Sense) feeds it too:** Autopilot's **mid-workflow entry** — "you're on step 3; want me to finish the rest?" — consumes Sense's workflow/step localization (the read-only locator probe), so the offer can start from where the user actually is instead of replaying from step 1. **And P2-M5 (Reason) hands it the agent loop:** the read-tool reasoning skeleton (gather evidence → think → gather more → conclude, [`phase-2-reason.md`](phase-2-reason.md) §4) is the loop Autopilot extends with act-verbs — P4 adds hands to a brain that already exists.

---

## 4. Candidate modules (draft — locked at phase planning)

| Module | What it is | Notes |
|:---|:---|:---|
| **P4-M0** | **Guided walkthrough** — sequential, progression-aware step-through of the whole remaining workflow (highlight step k → detect completion → advance to k+1); no acting | Builds on **Sense's P2-M3** (the config-gated single-step highlight) + Sense's localization. Same locator resolution, zero side effects. Ships first. |
| **P4-M1** | **Autopilot gate** — the `autopilot` audience flag + the validated-current certification check (offer execution only on approved **and** green-validated workflows) | Mirrors `CopilotApproval`; consumes the Phase-3 signal. |
| **P4-M2** | **Widget execution driver** — consent UX, visible step-by-step run, per-input prompts, pause/abort/takeover, resume across full-page navigations | The end-user-facing heart of the phase. |
| **P4-M3** | **Safety rails + telemetry** — destructive-step confirmation, safe-stop semantics, per-run audit log, drift feedback to Phase 3 | A bad action is worse than a bad answer — this module is why founders can trust the toggle. |

*(The **replay core** itself is a Phase-3 deliverable consumed here — not a Phase-4 module.)*

---

## 5. Design questions to answer (carry into phase planning)

1. **Consent & visibility UX** — confirm once at the start, or before each step? Default posture: **visible guided execution** (highlight → act, the user watches each step) over invisible automation — slower, but it *builds* trust instead of asking for it. Where does "show me" end and "do it" begin in the UI?
2. **Destructive steps** — submits / deletes / payments: always require a per-step confirmation? Founder-configurable per workflow? Are some step types (payment fields) excluded from autopilot outright?
3. **Input values** — masked at capture → prompt per field at run time; when is prefilling from the user's question safe, and does the user confirm every prefill?
4. **Abort / takeover / safe-stop semantics** — the user can stop at any moment; any verification failure = stop, explain what was and wasn't done, hand back control. **Never guess forward.** What does "what was already done" reporting look like mid-workflow?
5. **Execution limits (the widget has no extension privileges)** — cross-origin iframes and OAuth popups **cannot be driven** from a page script; workflows containing such steps must be detected and marked ineligible (or downgraded to "show me") **at approval time, not discovered mid-run**. Full-page navigations unload the widget — the run plan must persist (e.g. sessionStorage) and **resume after re-mount** (the snippet is on every page). The recorder's R1/R8/R9 lessons map over almost one-to-one.
6. **Eligibility & staleness** — how fresh must the green validation be (validated within N days? since the last detected app change?), and what happens when certification lapses mid-offer: hide the offer, or downgrade to "show me"?
7. **The execution-plan source** — distilled `KnowledgeItem` steps deliberately **don't** carry locators/`expected_outcome` (those live in the raw `KnowledgeSource.manifest`). Compile a per-workflow **execution plan** (ordered steps: locators + route + expected outcome + input slots) at approval/validation time, rather than parsing the manifest at run time. Likely shared with Phase 3 (the validation runner needs the same artifact).
8. **Per-user variance** — the founder records as an admin; an end-user's **role / plan / feature flags** may hide the very button the workflow clicks. Treat as a verification failure (safe-stop + explain), and consider surfacing "this action may need permission X" from repeated same-step failures.
9. **Plan integrity & tenancy** — the widget fetches the plan over the public-key path: key-scoped, origin-checked, rate-limited like `/answer`; the plan must never contain steps from unapproved workflows (**no-leak, applied to execution**). Does the plan need server-side signing to prevent tampering in transit/storage?
10. **Naming & positioning** — "Autopilot" vs "AI Agents mode" as the end-user-facing label; founder-facing toggle copy ("Allow Sync to perform this workflow for your users"); how the offer is phrased in-chat.

---

## 6. Risks

- **A bad action ≫ a bad answer.** A wrong answer wastes a minute; a wrong click mutates real customer data. This asymmetry drives the whole design: certification gate, visible execution, per-input prompts, destructive-step confirmation, safe-stop. The trust incident you prevent is the product.
- **The validation↔execution drift window** — the app can change between the last green sandbox run and this execution. Verification-per-step is the runtime backstop; staleness policy (Q6) bounds the window.
- **Host-app variance** — roles/plans/flags/AB tests mean the recorded path may not exist for this user (Q8). Expect this to be the most common safe-stop cause.
- **Verification latency vs. UX** — waiting for the page to settle after each step (the `post_action` pattern) makes runs deliberate, not instant; set expectations in the UI rather than racing the DOM.
- **New public-key attack surface** — an execution endpoint is a juicier target than an answer endpoint; scope, rate-limit, and audit from day one (Q9).
- **Cross-origin boundaries mid-workflow** — undrivable steps must be caught at approval time (Q5), or Autopilot's failure mode becomes "dies mid-checkout."

---

## 7. Data-model deltas (sketch, additive)

- **`AutopilotApproval`** — the third audience flag, keyed `@@unique([sourceId, segmentIndex])` + `workspaceId` (mirrors `CopilotApproval`; survives reprocess). *(Or: generalize into one per-audience table alongside the V2 portal's `PortalPublication` (V2 · P0) — decide at build time.)*
- **`ExecutionPlan`** — the compiled, replay-ready artifact per approved workflow: ordered steps `{ locators, route, expectedOutcome, inputSlots, destructive? }`; produced at approval/validation time; shared with the Phase-3 runner.
- **`ExecutionRun`** — the audit log: workspace, workflow key, started/finished, steps completed, outcome (`completed | aborted | safe_stop` + reason), end-user feedback. Safe-stop reasons feed Phase-3 drift signals.

---

> **Not in Phase 4:** free-form agentic browsing (never — grounded actions only), cross-app workflows, desktop/native apps, autonomous runs without an end-user present, and building the replay core itself (Phase 3 owns it).
