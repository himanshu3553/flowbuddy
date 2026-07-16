# Sync — Phase 4: Autopilot (agentic execution)

> **Phase 4 moves the copilot from *telling* to *doing*.** Today (Phase 1) an end-user asks "how do I X?" and gets a grounded, cited answer. Autopilot adds the next step: after the answer, the widget offers **"Want me to do this for you?"** — and on consent, **executes the approved workflow in the end-user's live session**, resolving each recorded step's element on the real page, acting, and verifying, with the user watching and in control the whole time. Working name **Autopilot** (a.k.a. **AI Agents / agentic mode**). Roadmap/status: [`roadmap.md`](roadmap.md) §5.

- **Status:** 🔄 **In progress — P4-M0 (guided walkthrough) ✅ built 2026-07-15 (§8 as-built); P4-M1…M3 to plan.** Sequencing decision (2026-07-15): the phase opened **ahead of Phase 3** — P4-M0 has no Phase-3 dependency (zero-acting), and P4-M1's eligibility gate will accept pluggable signals so Phase-3 certification slots in later without rework. The acting modules (M2) still consume the shared replay core (§3).
- **Last updated:** 2026-07-15 · **Branch:** `dev`
- **Companion docs:** roadmap/status → [`roadmap.md`](roadmap.md) · technical model → [`architecture.md`](architecture.md) · Phase 1 (the substrate) → [`phase-1-copilot.md`](phase-1-copilot.md) · Phase 2 (Sense — localization + the plan artifact) → [`phase-2-sense.md`](phase-2-sense.md) · Phase 3 (the engine + certification) → [`roadmap.md`](roadmap.md) §4 · why copilot-first → [`product.md`](product.md) §5 · competitive reference (Claude for Chrome) → [`competitive-claude-chrome.md`](competitive-claude-chrome.md)
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
| **P4-M0** | **Guided walkthrough** — sequential, progression-aware step-through of the whole remaining workflow (highlight step k → detect completion → advance to k+1); no acting | ✅ **Built 2026-07-15** (§8 as-built). Builds on **Sense's P2-M3** (the config-gated single-step highlight) + Sense's localization. Same locator resolution, zero side effects. Shipped first. |
| **P4-M1** | **Autopilot gate** — the `autopilot` audience flag + the validated-current certification check (offer execution only on approved **and** green-validated workflows) | Mirrors `CopilotApproval`; consumes the Phase-3 signal. |
| **P4-M2** | **Widget execution driver** — consent UX, visible step-by-step run, per-input prompts, pause/abort/takeover, resume across full-page navigations | The end-user-facing heart of the phase. |
| **P4-M3** | **Safety rails + telemetry** — destructive-step confirmation, safe-stop semantics, per-run audit log, drift feedback to Phase 3 | A bad action is worse than a bad answer — this module is why founders can trust the toggle. |

*(The **replay core** itself is a Phase-3 deliverable consumed here — not a Phase-4 module.)*

---

## 5. Design questions to answer (carry into phase planning)

> **Design input — steal their permissions UX wholesale for Phase 4.** Claude for Chrome ships a proven, user-tested control vocabulary that maps almost one-to-one onto Q1–Q4 below: **ask-before-acting vs. act-within-approved-boundaries** (two explicit modes), **per-action confirmation for irreversible steps** (forced even under "always allow"), **hard-blocked action categories** (payments, permanent deletions, credential entry — blocked regardless of permissions), **admin allowlists/blocklists**, and a **reviewable action history**. Adopt Sync analogues of each rather than inventing a new vocabulary — it shortens design, and citing the analogy borrows their published safety credibility. Full model + attack-success-rate numbers: [`competitive-claude-chrome.md`](competitive-claude-chrome.md) §3, §5.

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

## 8. P4-M0 — Guided walkthrough: as-built (2026-07-15)

**What shipped:** under a positional answer the widget offers **"Walk me through it"**; on the user's click the chat panel closes, a compact **step card** (shadow-root overlay, docked at the launcher corner) shows *instruction k/N*, the step's element gets a **sticky spotlight** (the P2-M3 highlight minus the 6s auto-clear), and the widget **observes** the user completing each step — through the whole remaining workflow, **surviving full-page navigations**. **Advancement is manual-only (user decision 2026-07-15): detection ACKNOWLEDGES — "Detected ✓ — hit Next to continue" — and the pointer moves forward exclusively on the user's Next click**, including after a recorded navigation (the card resumes on the new page with the step acknowledged, waiting for Next). The user performs every action; the widget never clicks, fills, or navigates. Config-gated per workspace (`copilotWalkthrough`, default OFF, requires Sense), served via `GET /v1/copilot/config`.

**Posture — user-initiated, zero-acting, session-scoped observation.** Observers attach on the offer click and detach on done/exit/TTL: read-only re-resolution of the current step's element, a document capture-phase click listener used solely to test "was that the highlighted element?", and `location.pathname` (popstate/hashchange + a 400ms poll — no history monkey-patching). Nothing leaves the page except run analytics (workflow key + step numbers + auto/manual + outcome — never page content, values, or selectors). This deliberately extends Phase 2's ask-time-only glance into a **bounded session the user explicitly asked for**; outside an active walkthrough nothing observes and nothing is fetched at page load.

**Completion detection (evidence or nothing — and detection only ever acknowledges; ALL forward
motion is the user's Next). State-aware since the first E2E (2026-07-15): every verdict consults
Reason's element-state vocabulary** (`readElementState` in `reason.ts` — the same reading the
diagnostic model gets: `disabled`/`checked`/`filled`/`valid` + the failed-constraint name), so the
card never says "click it" at a disabled button and never counts an invalid or unchecked field as
done:

| Step kind | Detection signal (→ "Detected ✓ — hit Next") | Without it |
|---|---|---|
| `input` | `input`/`change`/blur/Enter (800ms debounce) + **genuinely done**: checkbox/radio = `checked`; fields = `filled` AND not provably invalid (constraint API / `aria-invalid`); re-verified LIVE at Next-click time. Filled-but-invalid → status names the failed constraint in words ("the format doesn't look right") | Next = explicit skip |
| `action` + `postRoute` | observed click (**disabled targets never count**) → *awaiting-nav* (persisted synchronously before unload) → route watcher (SPA) or resume handshake (hard nav) confirms the landing; a matching route **without** an observed click also counts (outcome over mechanism). Evidence is persisted, so the ack survives the very page load the click causes | Next = override |
| `action`, no `postRoute` | click → mutation-quiet settle → next step resolves+visible, or the clicked control left the DOM | Next = override |
| `locators: []` | none — instruction-only card | Next only |

**Analytics still measure detection quality with no wire change:** Next on a verified-done step logs
`step_advanced` mode=`auto` (detection-confirmed); Next on an unverified step logs `manual`
(override/skip) — the auto:manual ratio remains P4-M2's detection-quality signal.

A **disabled action target** gets *"This button is disabled — check step k ('…') first"*, naming the
first earlier input step that isn't genuinely done; a **400ms state tick** (active-session only,
read-only, shared with the route poll) keeps every status live (button enables → "click it"; field
turns valid → "Detected ✓"; programmatic fills caught; an ack rolls back if the state regresses),
**re-resolves the element if an SPA re-render replaced it**, and clears an awaiting-nav whose timer
died with a reload. An unresolvable on-route step after
a 0/750/2000ms retry ladder = **safe-stop**: stalled card (Retry/Back/Exit), `stalled` event, **never
guesses forward**. A step on another route = text-only "head there and I'll pick it up" (navigating
for the user would be acting).

**The pointer is self-correcting backwards (redesigned after the second E2E round).** While all
forward motion is the user's Next, every tick, every Next, and every resume still converges the
pointer **back** to the **earliest on-this-route input step that is verifiably not done** (empty /
invalid / unchecked) — page evidence beats stored position, so a stale resumed session, a hydration
race, or any other drift snaps back to truth within ~400ms. Only *input* steps can pull the pointer
back (their state is readable; a completed click leaves no evidence, so action steps never cause
false pullbacks), and completion is never declared over a pending one. **Next on a still-pending
step = an explicit user override** — the step is remembered as skipped and the pointer never drags
them back to it (Back onto it re-engages the gate). Every pointer decision logs under
`data-sync-debug` (mode, from→to, corrections).

**The Reason escalation — "Explain what's blocking me."** On blocked/invalid/stalled states (and
only when the founder's Reason toggle is on), the card offers one extra button: it reopens the chat
and asks *"Why can't I proceed with this step?"* on the user's behalf — Reason's existing intent
trigger fires, `captureSnapshot` grabs the structured page state (± the image tier), and the full
expected-vs-actual diagnosis arrives in chat through the exact pipeline a typed question takes
(zero new server surface; the walkthrough keeps observing underneath — the open panel covers the
card via z-order). **Division of labor:** local state checks *gate* (instant, free, every tick);
the diagnostic loop *explains* (seconds + tokens, user-invoked). This also covers the honest
limitation of DOM-only checks: purely-visual custom validation (a JS rule that never sets
`aria-invalid` or native constraints) is invisible to the gate but well within the diagnosis's
reach — expected-vs-actual over the founder's TRUE step evidence.

**Cross-nav resume:** the session persists in `sessionStorage` (`sync.walkthrough.v1` — the widget's ONLY storage; founder-derived plan data, keyed to the public key, 30-min TTL from last transition). On boot, a stored session (checked **before** any fetch) pulls the route's shard and reconciles: fresh copy swapped in when served; a workflow **absent from a shard its route belongs to = revoked → ends silently** (absence = not approved, applied to resumption); fetch failure proceeds on the persisted copy bounded by the TTL. The stored pointer is **never trusted blindly** — resume runs the same self-correction as every tick (see above), so a reload that reset the form resumes at the first unfinished step, never at the stale one, while true mid-workflow resumes (earlier steps on previous routes don't resolve here) pick up exactly where the user left off.

**Run analytics:** `POST /v1/copilot/walkthrough` (own rate bucket; every field clamped like the sense wire; `started` verifies the key against `CopilotApproval` — no-leak, title from the approval snapshot) → one **`CopilotWalkthrough`** row per run: `startStep/lastStep/totalSteps`, `autoAdvances`/`manualAdvances` (the auto:manual ratio measures detection quality for P4-M2), `outcome` `active|completed|aborted|stalled` (+`stalledAtStep`; a run advancing past a stall recovers to `active`). A row still `active` past the TTL reads as abandoned — no sweeper by design.

**Where everything lives:**

| Piece | Where |
|---|---|
| The module (state machine · card · detection · storage · resume) | `packages/widget/src/walkthrough.ts` |
| Probe keeps EVERY step's element · exported primitives · sticky spotlight · `isFilled` = `checked` for checkbox/radio | `packages/widget/src/sense.ts` |
| `readElementState` — the shared element-state vocabulary (Reason ships it; the walkthrough gates on it) | `packages/widget/src/reason.ts` |
| Offer pill on positional answers · config flag · boot resume · show-me suppressed mid-run | `packages/widget/src/index.ts` |
| Card + offer styles (design tokens, shadow-root, overlay-only) | `packages/widget/src/styles.ts` (`.sc-walk-*`) |
| Config field + `walkthrough` gate bucket + the run endpoint | `packages/api/src/server.ts` |
| `Workspace.copilotWalkthrough` + `CopilotWalkthrough` (migration `20260715155642_walkthrough_guided`) | `packages/db/prisma/schema.prisma` |
| Studio toggle (under "Show me", disabled without Sense, toasts) | `packages/web/components/dashboard/copilot-workspace.tsx` + `lib/copilot-settings{,-actions}.ts` |

**Deliberate cuts (fast-follows, not gaps):** the offer rides only answers that carry a `position` (citation-only entry later); no per-step `expected_outcome` in the sense plan — detection uses `isFilled`/click/`postRoute`/next-step-resolves (richer outcome markers arrive with P4-M1/Phase-3's `ExecutionPlan`); the Studio "Walkthroughs" analytics card reads the table later — the data lands from day one.

---

> **Not in Phase 4:** free-form agentic browsing (never — grounded actions only), cross-app workflows, desktop/native apps, autonomous runs without an end-user present, and building the replay core itself (Phase 3 owns it).
