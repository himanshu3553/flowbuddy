# FlowBuddy — The Agent (direction, decisions, and the two layers under it)

> **One doc, because there is one agent.** This merges what were three: the unified-agent direction
> (the spine below), the **acting layer** (was Phase 4 — the hands), and the **goal layer** (was
> Phase 5 — the brain). They were separate docs carrying mutual "superseded in spirit" warnings,
> which meant every reader had to reconcile them by hand. This is that reconciliation, done once.

> **One chat, one agent, one grounded tool surface.** Instead of a copilot that *routes* a user into one of three separate mechanisms — an answer (Phase 1), a walkthrough (P4-M0), an execution run (P4-M2) — FlowBuddy becomes a single agentic loop for which **Tell · Show · Do are tools it may call, turn by turn**. The user stays in one conversation; the agent moves up and down the intensity ladder as the task demands, narrating what it does and asking for what it needs. **The division of labor that survives: the agent deliberates, the grounded primitives act.**

- **Status:** [`roadmap.md`](../roadmap.md) §5 for the acting layer, and §11 for the goal layer — this doc covers both, and records *what was decided and why*, never what is built. Decisions locked: **D1–D8** 2026-07-25 · **D9** 2026-07-26 · **D10–D11** 2026-08-02 · **D12** 2026-08-04. The ladder those decisions produced is **two modes** (below), and every answer records which engine actually produced it, in how many rounds, using which tools. **§9 records the one gap that remains** in Copilot mode.
- **This doc is the reconciliation.** The Phase-4 / Phase-5 "hands vs. brain" split still holds as a *concept*; it no longer holds as a document boundary.
- **Companion docs:** the substrate → [`copilot.md`](copilot.md) · position + diagnosis → [`sense-and-reason.md`](sense-and-reason.md) · the acting primitives → the acting layer below · goals/conversation → the goal layer below · status map → [`roadmap.md`](../roadmap.md) · outward-facing tools → [`interop.md`](interop.md)

---

## 0. Start here (plain language)

**Phase 4 is the hands. Phase 5 is the brain. The unified agent is one assistant that uses both.**

Today the product is modal: it answers, or it points at something, or it walks you through. Which of
those you get is decided once, by a rule, before the assistant has really understood you. Help isn't
modal — a single question often needs a fact, a look at your page, and a nudge on screen.

So: **one chat, one loop, one grounded tool surface.** Tell, Show and Do become tools the agent picks
turn by turn, not tiers it routes to once.

**Two operating modes**, founder-selected per workspace and switchable both ways:

| | Mode | What it is |
|---|---|---|
| 1 | **Copilot** | The read-only loop — Tell, Show and diagnose, fluidly. **Built, verified, and what every workspace gets.** Cannot act. |
| 2 | **AI Agent** | The loop with acting bound. Selectable only behind a recorded terms acceptance. Never a default. |

*(A third mode below these, **AI Chatbot** — single-shot answers, fixed rules for everything else —
was **retired 2026-08-02**. Its engine survives as the floor beneath a failed loop but is not a mode
and cannot be selected. D10 below records why.)*

**The boundary is at *acting*, not at *the agent*.** Tell and Guide leave the user as the actor; Do
transfers accountability — a wrong button is a tooltip in Guide and a liability event in Do. The
read-only half is ~zero-risk, so it is deliberately *not* gated behind the risky half.

**Two triads not to conflate:** Tell / Guide / Do is *what the user gets*. Copilot / read-only /
acting is *how it's orchestrated and what's permitted*.

---

## 1. Why — help is not modal, but the product is

Today the copilot decides *once*, at answer time, by heuristic, which kind of help you get. Then you are locked into it:

- Mid-walkthrough, "wait, why is this button greyed out?" cannot be answered — that is Reason, on a different path.
- "Actually, just do the rest for me" cannot be said.
- The walkthrough offer hangs off positional answers only; there is no general goal → intensity dispatch.

Real help doesn't work that way. A colleague helping you explains, points, takes the keyboard, hands it back, and explains again — fluidly, within one conversation. **That fluidity is unreachable with bolted-on tiers and natural with one agent.** That is the product argument, and it is the primary one.

The secondary argument is architectural: if the copilot is itself an agent over a grounded tool surface, **that tool surface is [Phase 6](interop.md).** Expose the same tools over MCP and a third-party agent gets exactly what FlowBuddy's own agent has. P6-M0's export compiler and the internal tool layer converge into one artifact — and [Version 3](company-agent.md)'s company agent becomes a third caller of it rather than a third implementation.

## 2. The line — unify deliberation, never actuation

**Unify the deliberation layer.** Deciding-what-to-do is today scattered across four places: the fast-path answer prompt's `covered`/decline verdict, Reason's selective trigger, the walkthrough-offer heuristic, and the Sense tie-break. Merging those into one loop is a clean win and removes real glue code.

**Do not unify the actuation layer.** Locator resolution, acting, and `expected_outcome` verification stay deterministic, typed, and *not* model-authored. The moment an LLM free-forms DOM actions, the grounding guarantee — *only executes workflows the founder recorded and approved* — is gone, and FlowBuddy is a [Claude-for-Chrome-class](../product/competitive-claude-chrome.md) improviser with worse distribution. That guarantee is the entire differentiation.

> **The invariant: the agent's action space is the KB, not the DOM.**
> It chooses *which grounded primitive to invoke*, never *what to do on the page*. `offer_run(workflowKey)` — never `click(selector)`.

**Enforce it in the tools, not the prompt.** `search_kb` can only ever return approval-constrained rows, so the agent cannot *request* ungrounded knowledge. This is the same discipline as masking values at capture rather than filtering them at replay: structural, not policy.

## 3. The tool surface — mostly already built

The striking property of this direction is how little of it is new. The primitives exist; what changes is that the agent *chooses* among them instead of a pipeline hardcoding the order.

| Tool | What it does | Where it already lives |
|:---|:---|:---|
| `search_kb` | Approval-constrained hybrid retrieval | ✅ **bound to the agent 2026-07-27** as `search_knowledge` (`synthesis/agent.ts`) |
| `get_workflow` | Distilled per-workflow steps | ✅ **bound 2026-07-27**; approval re-checked server-side in `loadApprovedWorkflow` |
| `where_am_i` | Read-only locator probe → workflow + step | ✅ `widget/src/sense.ts` `probeForAsk` (P2-M0/M1) |
| `read_page_state` | Structured field state, **values masked** | ✅ exists (`widget/src/reason.ts`, P2-M5) but **NOT bound to the agent** — still reached via the diagnostic path (§9 Gap 3) |
| `highlight_step` | Sticky spotlight on the host page | ✅ exists — but **switch-decided, not agent-decided (D11, 2026-08-02)**: it fires on every positional answer the founder's switch permits. Briefly agent-decided from 2026-07-27 |
| `run_walkthrough` | Guided, user-paced stepping | ✅ same — switch-decided since D11 |
| `ask_user` | Clarify · prompt for input · confirm | 🔄 **clarifying questions legalised in Copilot mode (2026-07-27)** — no longer the Sense tie only; input prompting + confirmation arrived with the acting tier |
| `product_profile` | What the product IS, not just how to do things in it | ✅ served as a second corpus (**derived** product-knowledge pages, not founder-authored prose — [`application-intelligence.md`](application-intelligence.md)); still not a tool the agent calls |
| `offer_run` | Resolve locator → act → verify — **run-scoped since D12, not step-scoped**: the bound tool offers/starts a whole consented run and the widget's executor does the steps (§A2.1) | ✅ **built** — bound only when the mode permits *and* runnable workflows exist |

**Reason is already an agentic loop.** `diagnoseFromKB` runs a read-tool loop over expected-vs-actual — the phase docs call it "the skeleton Phase 4 inherits." The unified agent is not built from scratch; it is that loop **promoted to the main path** and given more tools.

## 4. Decisions locked (D1–D8 2026-07-25 · D9 2026-07-26 · D10–D11 2026-08-02)

| # | Decision | Rationale |
|:---:|:---|:---|
| **D1** | **One agent, one interface.** Tell · Show · Do are tool choices per turn, not tiers routed to once. | Help is not modal; users must be able to move between intensities mid-task without leaving the thread. |
| **D2** | **Triage per question, not a global setting.** Depth follows question difficulty, decided at ask time. The one-hop fast path is preserved as the agent's first move; the loop is the *escalation*. | Founders cannot answer "fast or thorough?" for traffic they haven't seen. The system already makes this call — Reason's selective trigger. Simple lookups must not pay for hard questions. |
| **D3** | **Point-and-type for sensitive input.** For anything sensitive, the agent **highlights the host app's own field** and asks in chat; the user types **into the app**, not into the copilot. | The value never enters FlowBuddy — not the chat, not `/answer`, not the DB, not `sessionStorage`. The app's own validation, autofill, password managers, and PCI boundary all keep working. See §6. |
| **D4** | **Manual-only advancement on input steps.** No auto-detection of "the user finished typing." An explicit **Continue** affordance (plus "done" typed in chat) moves the run forward. | `filled ≠ done` — an email field is "filled" at `a@`. Multi-field steps have no observable completion moment. Advancing early means acting on a half-filled form in a live account; waiting costs one click. Cross-origin iframes force manual anyway — one consistent behavior beats two. |
| **D5** | **Sensing informs, the click decides.** Masked state (`filled`/`valid`/`invalidReason`) is read **on** the Continue click to validate and to write better prompts — never to advance. | Turns a blind march into a failed step into an honest *"that email isn't being accepted — the field is showing a format error."* Reason, applied inline and mid-run. |
| **D6** | **Never infer intent; always stay oriented.** The agent must never infer the user finished typing — but it **must** detect that the page navigated or the DOM changed underneath it. | Users will fill a field and hit the app's *own* Save before touching Continue. Without navigation detection the agent waits for a click on a page that no longer exists. These are different mechanisms and conflating them is a bug. |
| **D7** | **Founder control = capability posture + spend cap, not a latency dial.** One control over *what the copilot may do* (answers only · in-context help · full agent), with the existing five toggles as advanced disclosure, paired with a per-workspace cost ceiling. | A speed dial exposes internal architecture as a setting and is wrong for half of any workspace's traffic. Capability and spend are things a founder genuinely has an opinion about; latency follows from them. |
| **D8** | *(Its OFFER half was reversed by D11 — the consent half stands unchanged.)* **Conversational offer, structured consent.** *"Want me to do this for you?"* becomes a **move the agent makes**, not a payload the server attaches to positional answers — but the **commitment moment stays a typed affordance**, never free text the model interprets. | The offer needs judgment (proactive · reactive · escalating mid-walkthrough · silent) that a hardcoded pill can't express. Consent needs an audit boundary: when someone asks *"did this user authorize this run?"*, the answer must be a DB row, not the model's reading of "ok sure why not." |
| **D9** | *(Amended by D10 — the ladder is now two rungs, the boundary is unchanged.)* **Operating modes — and the boundary is at *acting*, not at *the agent*.** `1 Copilot` · `2 Agent (read-only)` · `3 Agent (acting)`, founder-selected per workspace, strictly ordered. **These are also the pricing tiers** (decision 2026-07-26). | Tell and Guide are both *copilot* — the user is still the actor, and you are only changing what they know. **Do is not one more rung; it transfers accountability.** "Confidently wrong about which button" is an unhelpful tooltip in Guide and a **liability event** in Do — decisive in regulated verticals (neobank, fintech, health). But the read-only unification carries **~zero** added risk, so gating it behind the risky half would deny the fluent copilot to exactly the cautious buyers who benefit most. Put the wall where the liability is. |

| **D10** | **Retire AI Chatbot entirely (2026-08-02).** The single-shot mode stops being a sellable tier and stops being a stored value. Its ENGINE survives, unsellable, as the floor beneath a failed agent loop — the agent's own prompt run for one round with nothing bound. | It was a **strictly worse Copilot that cost twice to maintain**: a second prompt and a second knowledge renderer, both of which had to be tuned in parallel forever, and every knowledge feature had to be built into both (the workflow plan and the Application Intelligence pages each paid that tax). CLAUDE.md carried a standing trap for the failure it invited — update one, forget the other, and the *safety floor* answers worse than the tier above it. Retiring it deletes the trap rather than documenting it. The founder's judgment (2026-08-02): *"I simply can't see any benefit of keeping AI Chatbot mode."* **This reverses D9's pricing corollary**, which had assumed a sold tier could not be un-sold; it could, because nobody was on it. |

| **D11** | **The founder's switch decides when an on-page ability fires — not the assistant (2026-08-02).** `copilotShowMe` and `copilotWalkthrough` fire on EVERY positional answer when on, and never when off. This reverses D8's *offer* half; D8's consent half (a typed affordance, never free text) is untouched, and so is *absence, not refusal*. **The assistant's preference was removed entirely, not merely ignored** — see below. | **A "maybe" is a bad control.** Under judgment a founder cannot distinguish a switch that is OFF from one that is ON and being declined — which makes the feature undemonstrable to a prospect, undiscoverable to end-users, and unsupportable when someone asks why it didn't appear. **And the judgment was never measured:** §8's own regression list flagged the agent under-offering as a risk to watch across a cutover, and nobody watched it. Trading an unmeasured judgment for a predictable rule is the cheap direction, and reversible — the intents are still recorded, so "would judgment have won?" stays a query. **The noise D8 feared is bounded by structure, not by judgment:** only POSITIONAL answers reach the rule, a clarifying question sets `usedPosition` false so nothing fires, the highlight needs an element the probe actually resolved, and `walkthroughOffer` returns null on the last step. What remains is a user mid-workflow seeing one ring and one pill. **Given up:** the assistant can no longer stay quiet at a moment only it can see is wrong. **Why the telemetry went too:** the first cut kept the two intent fields as unobeyed telemetry, so a future reversal would have evidence. That does not survive contact with the prompt — the fields are only meaningful while the prompt keeps ~4 lines teaching the model *when* to set them, and that is reasoning spent on an answer nobody reads, competing for attention with instructions that are read. Keep the section and pay forever; drop it and the telemetry records noise. So both went, and reversal means re-adding four prompt lines and two schema fields. The schema collapse was the tell: without them the agent's "superset" schema was byte-identical to the base one, so `AGENT_ANSWER_SCHEMA` and the engine's `schema` override both disappeared with it. |

| **D12** | **The acting design is locked (2026-08-04)** — brain/hands split · compiled-pinned `ExecutionPlan` · client-executes/server-deliberates transport · just-in-time inputs · navigation as an action · one step engine under guided AND acting · consent once + destructive confirms · single workflow per run. Full design: the acting layer **§A2**. | The founder's directive: build the most reliable acting agent, rewriting whatever needs rewriting — and **an agent is reliable in proportion to how little it improvises**. So the model deliberates only at run boundaries (offer · input · deviation · done); the founder's recorded plan decides every action; verification is recorded-evidence; every failed act hands back rather than guesses forward. The rewrite that followed is the step-engine extraction (§A2.10), accepted knowingly against the shipped walkthrough. |

### D9 + D10 in practice — the two modes (the build spec in miniature)

**One boundary now, and it is the one that always mattered.**

- **Copilot → AI Agent is an accountability change.** Same orchestrator, one more tool bound, plus the gate and the rails. **This is the contractual line** — the only boundary that needs terms, acceptance, and an audit trail.
- *(The boundary that disappeared — single-shot → agent loop — was only ever an orchestration change: a different decision-maker over the same primitives at the same risk. That is exactly why it could be deleted rather than defended.)*

| | **1 · Copilot (read-only)** | **2 · AI Agent (acting)** |
|:---|:---|:---|
| **Orchestrator** | The agent loop | The same loop |
| **Tools bound** | `search_kb` · `get_workflow` · `where_am_i` · `read_page_state` · `highlight_step` · `run_walkthrough` · `ask_user` · `product_profile` | all of Copilot **+ `offer_run`** |
| **Explicitly NOT bound** | **`offer_run`** — absent, not refused (D8) | — |
| **Gated by** | the workspace mode setting | mode setting **+** a recorded acceptance **+** a live approval **+** the per-workflow acting flag **+** eligibility analysis at enable time **+** per-run consent |
| **Risk** | **~zero on the page** — nothing acts. The real risks are prompt regression and cost/latency | **Accountability transfer** — a wrong action ≫ a wrong answer |
| **What it costs** | **Nothing — it exists.** | A terms acceptance, a per-workflow acting flag, and the rails (§A2). |

**Strictly ordered, not à la carte.** AI Agent *is* Copilot plus a tool, so acting cannot exist without the agent loop.

**What retiring a rung cost, recorded because it was so much less than expected.** The shared loop
(`engine.ts`, extracted 2026-07-26) predicted this: *"collapsing AI Chatbot into Copilot later is
raising a cap and binding tools, never a rewrite."* That held exactly. Mode 1's engine needed no
porting — the floor is the same loop with `maxRounds: 1` and an empty tools array — and because the
stored mode is a STRING rather than an enum, un-selling a tier cost an `UPDATE` instead of a type
change. The one thing that did need care was the prompt: the surviving one talks about tools, and
the floor has none, so telling a model to *"search first, then answer"* with nothing bound invents a
decline at the exact moment the user has already hit one failure. The prompt is therefore assembled
in two configurations, and a test asserts the floor's never names a tool.

**Two triads — do not conflate them.** **Tell / Guide / Do** is *what the user receives*. **Copilot / read-only / acting** is *how it is orchestrated and what is permitted*. Guide exists in modes 1 and 2 — the same `walkthrough.ts`, reached two different ways (a deterministic pill vs. an agent offer).

**Invariant across every mode:** one KB, one approval model, one retrieval seam, values masked at capture, grounded-only, honest declines. **The mode picks the orchestrator and the permission ceiling — never the knowledge model.** The existing five toggles (`senseEnabled` · `copilotShowMe` · `copilotWalkthrough` · `reasonEnabled` · `reasonImageEnabled`) tune features *within* a mode, underneath it (D7) — and the switch always wins: no mode can turn on an ability the founder turned off. What "on" means is settled (§7 Q7, resolved 2026-07-27): a **permission**, never an instruction to fire every time. The rule-driven reading went with AI Chatbot — with one deliberate exception, the diagnostic path, whose schema has no intent fields and so cannot express a judgment at all (see §9 Gap 3; the exception deletes itself when that path merges).

**Defaults.** Copilot is what every workspace gets, and since D10 it is also the fail-closed value — the floor is no longer "the rung that can do least" but **the rung that cannot ACT**, which was always the part that mattered. `NEW_WORKSPACE_MODE` and `DEFAULT_COPILOT_MODE` therefore read identically today and are still deliberately two constants: the day the default climbs to AI Agent, the floor must not follow. **AI Agent is never a default**, and plausibly not self-serve at all for regulated verticals.

**Pricing (decision 2026-07-26, amended by D10).** The modes are the pricing tiers. Two consequences that follow and must not be lost:

1. **The mode boundary becomes a billing control, not only a safety control** — which makes D8's *absence, not refusal* load-bearing twice over: a Copilot workspace must have no `offer_run` bound at all, never a refusal the model could be talked out of.
2. **The cost measurement still matters** — but for **margin per tier**, not for consolidation. The consolidation question is closed: D10 removed the cheaper tier outright rather than costing it. What each remaining tier costs to serve is still open (§7 Q6), and now sits on a thinner ladder — there is no cheap rung left to fall back to if Copilot turns out expensive at volume.

### D8 in practice — absence, not refusal

**The agent decides *whether to offer*; the gate decides *what is offerable*.** P4-M1 stays deterministic and server-side (the acting flag · workspace posture · certification). The agent picks from an allowed set and never decides the set — the `search_kb` pattern again.

The implementation rule that makes it safe: **don't tell the model it isn't allowed — don't give it the tool.** A workflow without the flag should have no `offer_run` bound for it at all. Otherwise the agent says *"I could do this, but your admin hasn't enabled it"* — leaking workspace configuration to end-users and generating support load for the founder. **Absence, not refusal.**

Today's `walkOffer` wire shape likely survives (the widget still needs something typed to render a pill and fire a run); what changes is the emitter — the agent's tool choice on any turn, rather than the hardcoded positional-answer branch in the answer path.

### D4/D5 are not new — they are P4-M0, generalized

The shipped walkthrough already implements exactly this posture. In [`widget/src/walkthrough.ts`](../../packages/widget/src/walkthrough.ts), grep for:

> *"Detection = acknowledgment, never motion (manual-only advancement, user decision 2026-07-15)."*

and the discipline is already coded alongside it: a walkthrough must never say "click it" at a disabled button, nor advance past an invalid input. **D4 and D5 generalize a proven, shipped, user-verified pattern to input steps** — they are not a new bet.

### Latency, honestly

Triage governs *hops before the first useful response*. **Do lives on a different clock entirely** — it is measured in time-to-done, not time-to-answer:

| Ask | Hops | Time to first useful response |
|:---|:---:|:---|
| "How do I export a CSV?" — simple lookup | 1 | **~2s** (unchanged from today) |
| "And then what?" — needs position/history | 2 | ~3–4s |
| "Why is Save greyed out?" — diagnosis | 3–5 + page state ± image | **~8s** (today's Reason, already this slow) |
| "Walk me through it" | rides the answer | offer instant; the walkthrough is user-paced |
| "Just do it for me" | consent instant | then a **run**: 30s–3min, narrated |

The spread tracks **question difficulty, not tier** — a hard diagnostic question is a *Tell* that takes 9 seconds. So triage asks *"how much evidence do I need before I can respond usefully?"*; the tier falls out of the answer rather than being the input. The invariant: **something useful appears fast in every case**, and expensive questions show their work while they pay for it.

## 5. Consequences for the roadmap

**Phase 4 survives; its UX half does not.** Three of its four modules carried the phase — the
eligibility gate, the execution driver, the safety rails. What the loop absorbs is the *deciding
when to offer*, which was Phase 4's discrete "act" button. M1 and M3 turned out *more* load-bearing
once that button disappeared, not less: with no explicit act step, the gate and the rails are the
only things standing between a conversation and an action.

**P5-M3 dissolves** — see the goal layer below. There is no tier router.

Both layers now live in this doc, so the reconciliation that used to be the reader's job is done.

---

## 6. The PII finding — and how D3 resolves it

**The finding.** Making the chat the input channel would turn it into a deliberate PII pipe — users typing emails, addresses, and card numbers so the agent can fill a form. Where the code now stands:

- ✅ **Both stored copies are scrubbed on write (2026-07-27).** `server.ts` computes `storedQuestion = redactText(question)` once and uses it for `CopilotQuery.question` *and* `CoverageGap.prompt`, so the coverage-gap dedupe matches on the same text. Storage only — the model and retrieval still see exactly what the user typed, so answer quality is unchanged.
- ✅ The same scrubbed text is what the per-question `copilot answer` log line carries (2026-07-29), so a log file is not a new place PII can land.
- ⚠️ **Still open, and the part D3 actually turns on:** chat persistence keeps the last messages in browser storage. The typed-kind allowlist is the boundary — D3's `user.value` is excluded by never being added to it — but that is a discipline, not an enforcement.

That posture was sound when questions were questions — incidental PII, backstopped downstream. It is **not** sound when the product is *asking people for values*.

**D3 resolves it structurally.** Under point-and-type the sensitive value goes user → the host app's own field, exactly as it would with no copilot present. Nothing to scrub, because nothing arrives.

**The residual, and the rule.** Non-sensitive values ("what should I call the project?") remain more convenient in chat, so both modes exist — and **the choice must not be the model's**:

- **Point-and-type (hard rule, in the tool):** any target with `type=password`, an `autocomplete` in the `cc-*` family, or any field inside a **cross-origin iframe**. Default to this on any doubt.
- **Chat-supplied:** conversational values only — often already known from the goal statement via P5-M1 parameter capture. These ride a **distinct typed message kind**: never written to `CopilotQuery`, never persisted to `sessionStorage`, never logged. *(Masking it in the visible transcript once consumed was part of the design and is **not built** — the value stays readable in the live thread, and dies with it.)*

**Preserved guarantee.** Captured input values are masked at capture (P1-M12), so the agent structurally *cannot* replay a recorded value — every character it types came from the user, in this conversation. D3 extends that from a capture-time property to an **end-to-end** one.

**Preserved principle.** "Read-only sensing, never surveillance" (Phase 2) survives because D4 deletes continuous observation of typing: no `MutationObserver` on input, state read only on an explicit click, only booleans leave the page, and only inside a consented run.

### The known limitation — cross-origin iframes

Stripe Elements, Plaid, hosted checkout: the widget cannot see inside them, so it can neither highlight the specific field nor read fill state. Degradation is honest rather than broken — highlight the iframe region, ask in chat, rely on the D4 Continue affordance. The feature survives; only auto-detection is lost, and D4 already discarded that. Same story for shadow DOM and canvas-rendered inputs.

## 7. Open questions — Q1–Q5 RESOLVED 2026-08-04 (D12 · §A2); only Q6, a measurement, remains open

1. ~~**Transport — the load-bearing one.**~~ — **RESOLVED 2026-08-04 (D12): option (c), as recommended.** Run state is client-held in the session store's `agent-run` slot; the server stays stateless between **four boundary calls** — consent/start · input · deviation · completion — each of which carries the run state. The wire half that was open is now specified: consent yields a **run id and the plan pinned to the hash it consented to**, and the executor runs steps locally between boundaries, so a full-page navigation costs a resume from storage, never a reconnection. **v1 ships two of the four:** consent/start — the one that re-verifies the gate live — and the audit appends that record each step and the terminal outcome. The input boundary turned out not to be needed (a missing value is asked and validated entirely client-side, with no mid-run model call — §A2.4), and the deviation boundary waits on Reason-powered diagnosis (§A2.6). Detail: §A2.3.
2. ~~**Mode-3 certification bar**~~ — **RESOLVED 2026-08-04: interim signals, made honest by a mandatory floor.** Eligibility analysis at enable time is not optional (§A2.9); the walkthrough's auto:manual detection-quality ratio and completed runs are the interim signal; Phase-3 validation slots into the same pluggable input when it exists. The conservative instinct survives as what is NEVER waived: acceptance, the per-workflow flag, eligibility, and per-run consent. *(= the goal layer §5 Q10.)*
3. ~~**Chaining scope for v1**~~ — **RESOLVED 2026-08-04 (D12): single workflow per run.** Chains are P5-M4's remaining scope. *(= §5 Q5.)*
4. ~~**How mode 3 is accepted**~~ — **RESOLVED 2026-08-04: acceptance is a ROW, never a toggle state.** A durable record — who enabled, when, against which terms version — written before `agent` is ever selectable for the workspace, plus per-run consent on the `ExecutionRun` row (§A2.8). Exact columns at build; the decision is the shape.
5. ~~**Cross-origin iframe UX**~~ — **RESOLVED for v1 2026-08-04: an acting run never reaches one.** A workflow with a cross-origin-frame step is ineligible for acting at enable time (§A2.9), so the question only arises in guided walkthroughs, where region-highlight + Continue stands (§6). Revisit if a payment-heavy design partner needs acting there.
6. **Cost per mode (measurement, not a design choice)** — the real cost-per-question and p50/p95 of the agent loop on live traffic. **Sharper since D10**, not softer: the cheap single-shot tier it would have been compared against no longer exists, so every question now rides the loop and there is no lower rung to retreat to. Round one *is* the old fast path, so the expected delta is small — but "expected" is doing real work in that sentence and nothing has measured it. **Fully instrumented as of 2026-08-03:** every question records the engine that answered, its rounds, its tool calls (§9 Gap 2) **and what it consumed** — input, the cached share of it, output, and the reasoning share of that. Both halves are now answerable from live traffic. Two properties that make the numbers trustworthy rather than merely present: spend is summed across every loop a question ran (an agent failure caught by the floor paid for both), and the cached and reasoning figures are kept as SUBSETS of their parents, because ignoring the cache overstates spend on these long stable prompts while ignoring reasoning hides why an answer was expensive. Now a *margin* question rather than a consolidation one (D9 pricing), but it still sets tier prices and D7's spend caps.
7. ~~**Where the five existing toggles land per mode**~~ — **RESOLVED, then re-resolved.** 2026-07-27 made the two on-page toggles a *permission* the agent's judgment refined ("you MAY do this when it helps"). **D11 reversed that on 2026-08-02:** the switch is the whole decision again — on fires every positional answer, off fires none — because a switch that might or might not do anything cannot be demonstrated or supported. Both stay defaulted **ON**, which is the combination deliberately never shipped before (rule-driven *and* on by default); it is accepted now because the noise is bounded by structure rather than by the assistant's restraint, and because a Copilot the picker describes as pointing and guiding must be able to. Still open for `reasonEnabled`/`reasonImageEnabled`, which wait on the un-merged diagnostic path (§9 gap 3).

## 8. Migration path

**The migration is three stages:** extract the shared loop · build the read-only agent on it · add
the acting layer, gated on the modules in the acting section below.

**Regression protection — the part that outlives the plan.** Three risks, in descending order of how
quietly they bite:

1. **The prompt rewrite touches the fast path every question rides.** Answers good today can degrade
   in ways nobody notices for weeks. Coverage is partial: `pnpm test` covers the shared loop and the
   pure seams, and the baseline script measures answer decisions against a fixed question set — but
   **the diagnostic path has none.** Re-run the Sense / Reason / walkthrough legs by hand before
   calling anything done. *(Not hypothetical: stage 3 introduced a 1-in-6 decline on a trivially
   covered question, caught **only** because that path was measurable.)*
2. ~~**Offer quality — the agent under- or over-offering.**~~ **Closed by D11 (2026-08-02), and the
   way it closed is the lesson.** The walkthrough offer was deterministic, D8 made it judgment, and
   this line said to watch walkthrough starts per positional answer across the cutover. Nobody did —
   so when the question came up months later there was no evidence either way, and the decision was
   made on control-surface grounds instead: the switch decides, always. **A risk you write down but
   never instrument does not stop being a risk; it stops being answerable.** *(The intents were
   briefly kept as unobeyed telemetry so a reversal would have data. They were then removed too —
   see D11's note: keeping the fields without the prompt section that made them meaningful would
   have recorded noise, and keeping the prompt section meant paying for reasoning nobody reads.)*
3. **Cost and latency.** Round one *is* the old fast path, so simple lookups must not get slower.

**The single-shot path survives as the runtime fallback** when the loop errors or times out — but
since D10 it is no longer a sold configuration, which removes the property this paragraph used to
rely on: it is *not* exercised by ordinary production traffic any more, and can rot unnoticed.
Two things replace that safety net, and both are deliberate. It shares the agent's prompt and item
renderer, so it cannot drift from the thing it falls back to. And `agent-prompt.test.ts` pins the
one way it can still go wrong on its own — promising a tool it does not have. A run of `engine:
"floor"` rows is now a **reliability** signal rather than a configuration one.

---

## 9. What's still open in Copilot mode — built + verified 2026-07-26/27

Copilot mode is **complete against its scope and user-verified E2E** (founder's verdict: markedly more accurate than the single-shot mode it replaced). Nothing below is half-built — these are the gaps that remain, recorded 2026-07-27 in priority order.

### ✅ Gap 1 — it knew the RECIPES, not the PRODUCT *(closed by derivation, not by authoring)*

Everything the assistant knew was a recorded workflow: a sequence of clicks. So it could say **how** to create an account. It could not say what a workspace *is*, how the plans differ, what "project" means here, or that the user doesn't need a new one for what they're attempting. Real support skews heavily toward orienting questions — *"do I need X or Y?"*, *"what's the difference?"* — and every one of them declined: correctly, and uselessly. **This was the difference between an assistant that understands the product and one that recites steps**, and it was the single biggest limit on how good Copilot mode could feel.

**What closed it is not the answer this section originally proposed.** P5-M2's founder-authored structured prose (the goal layer below, §G3) has become **derivation-first**: the same recorded narration workflows come from also yields what the product IS, as approved knowledge pages retrieval serves as a second corpus — background may orient and redirect; only workflows may instruct. The design and its decisions: [`application-intelligence.md`](application-intelligence.md); how far it has got: [`roadmap.md`](../roadmap.md) §0.

The instinct this gap was filed with — *sequence it after more workflows are recorded, or an improvement can't be attributed to the profile rather than to the KB finally having depth* — is why the coached re-recording came first.

### ✅ Gap 2 — nothing records what the agent did *(CLOSED 2026-07-29)*

Verified in the code 2026-07-27: `CopilotQuery` logs the question, `answered`, `contextPath`, the Sense outcome and the Reason trigger — **but not which MODE answered, how many ROUNDS it took, or which TOOLS it called.**

Two consequences, and the second is the important one:

1. **The founder is blind.** After switching to Copilot mode nothing in Studio shows it behaving differently — no evidence the upgrade is doing anything.
2. **§7 Q6's measurement is currently impossible.** Escalation rate and cost-per-question are exactly the numbers that decide *"should AI Chatbot collapse into Copilot?"* — the founder raised that question himself, and his mode-2 verdict already leans toward yes. Without these columns the decision stays an opinion. *(**Overtaken 2026-08-02:** D10 answered the question without the numbers, on simplicity rather than cost. The columns still matter — for margin, and for noticing the floor firing — but they no longer gate a decision.)*

**Half of this closed 2026-07-29.** `server.ts` now emits one `copilot answer` log line per question — the scrubbed question, the configured **mode**, the **engine that actually answered** (`agent` \| `reason` \| `floor` — the engine and the mode come apart in both directions, so mode alone was never the right field), `covered`, `rounds`, **every tool call with the exact query it searched**, and on a decline the assistant's **own words**. Diagnosing one incident no longer means reading source. Two things forced it: a decline used to be indistinguishable from a decline that searched three times and found nothing, and the escalation short-circuited before the `CopilotQuery` write, so the agent's own reason was never stored anywhere — the surviving `CoverageGap` held the *diagnostic engine's* text, filed against content the KB actually had. That second half is fixed too: a mode-2 decline no longer escalates, so it reaches the write.

**And the columns landed the same day.** `CopilotQuery` now carries `mode` · `engine` · `rounds` · `toolCalls` (migration `20260728201609_copilot_query_answer_path` — four nullable columns, nothing back-filled, so a pre-2026-07-29 row still honestly reads "unknown"). Every engine reports through the same `onLoop` hook, so **the floor's `rounds: 1, toolCalls: 0` is a recorded fact rather than a claim** and one query compares them all without special-casing. Since D10, `engine: "floor"` is the value to watch: it is the only one that is not a mode, and a run of them means something upstream is failing.

**`engine` is the column that matters, and it is deliberately not `mode`.** The two come apart in both directions — the diagnostic path preempts the agent whenever the widget shipped page state, and the safety floor answers with no tools while `mode` still reads `copilot`. Storing only the configured mode would attribute both to the wrong engine and quietly corrupt the very comparison this exists to enable. Storing both makes the gap between intent and reality countable.

**What this unblocks.** Escalation rate, rounds per question, and how often the floor caught a failure — all now queryable rather than argued. It pairs with the roadmap §9 backlog's token-usage column for real cost analytics. **The Studio surface landed 2026-08-03** (Analytics → *How answers were produced*), and it reads the columns for what they are now worth: the engine split, the escalation share, and the fallback rendered as an alarm. *(The question they were built to settle — collapse the tiers? — was answered on other grounds by D10 before enough traffic accumulated to answer it with data. The instrumentation is not wasted; it just changed job, from deciding the ladder to watching the floor.)*

### ⏸ Gap 3 — fold the diagnostic path into the agent loop *(deferred with a hard prerequisite)*

**Where it stands.** Copilot mode ships with **two agent loops running side by side**: `diagnoseFromKB` (diagnostic questions — page state + expected-vs-actual) and `answerAsAgent` (everything else). A **deterministic trigger still decides which one a question gets** — Reason's selective trigger, with one exception added 2026-07-29: the fast-path-decline escalation is now keyed on `engineUsed !== 'agent'`, so a mode-2 agent decline is no longer retried through the diagnostic engine (the agent already held the KB tools that retry would take away, and the escalation was overwriting the agent's decline before anything was recorded). That trigger is the last hardcoded fork left in Copilot mode; every other "what kind of help is this?" decision is now the agent's.

**Why folding them is right eventually.**
- The trigger has the failure mode every rule has: it misses diagnostically-shaped questions phrased unusually, and over-fires on simple questions containing *"why"*.
- A question currently cannot be BOTH: *"why can't I invite someone — and what's the whole process?"* goes down one path or the other. Merged, one turn could read the page **and** pull the workflow.
- It is the last place the product decides FOR the user which kind of help they receive, which is precisely what D1 set out to remove.

**Why it was NOT done in stage 3, and must not be done casually.** `REASON_SYSTEM` is the most heavily tuned prompt in the product — [`sense-and-reason.md`](sense-and-reason.md) §B7.1 records **ten** diagnosis-quality rules, each learned from a real session it got wrong (read the on-page error first · never claim a control is disabled when the state says otherwise · never conclude "looks fine" from structure alone · look at the image before hedging · no speculative declines · …). That is scar tissue, not styling.

And it was **untestable by construction**: the question-set baseline never sends live page STATE, so diagnosis had *zero* automated coverage. Rewriting rounds of hard-won prompt behaviour with no way to detect a regression is the exact risk §8's "regression protection" exists to prevent — and it is not hypothetical: stage 3 introduced a 1-in-6 decline on a trivially-covered question, caught **only** because that path was measurable.

**Why this went unfixed so long, and what changed.** Testing diagnosis always meant "re-record something and click around", so it never happened — and the question-set baselines cannot fill the gap even in principle, because their cells are tuned to specific workflows in a specific workspace and die with it. A committed page state is the first copilot measurement that outlives the workspace it was captured in.

**The prerequisite is MET for three of the four states (2026-08-03).** Make diagnosis measurable first: replay frozen page states (empty form · half-filled · invalid email · rejection banner showing) through `/answer` and assert what came back. The machinery for that now exists — a debug-gated capture hook in the widget, a fixture format, and a replay harness that scores each answer against the machine-checkable subset of the ten rules (plain language, every blocker addressed, decline-vs-diagnose, which evidence it reached for). `empty-form`, `half-filled` and `invalid-email` are captured, committed and passing 3/3 on every assertion — the first automated coverage the diagnostic path has ever had (`scripts/reason-baseline-2026-08-03.json` is the before-half of any future change). How to capture and run: [`e2e-testing.md`](../ops/e2e-testing.md) §11.

**The fourth state — the REJECTION BANNER — could not be captured, and it is the one that matters most.** It is the state that produced the "read the on-page error first" rule, and the only one where the failure mode is confidently diagnosing the wrong thing rather than saying too little. The blocker is not the harness: the recorded app renders no rejection at all. Submitting the signup form with an existing address, and the login form with wrong credentials, both leave the page silently unchanged — nothing for the widget's alert-surface detector to find. **Until some approved workflow surfaces a real rejection, the merge would be verified against three states that all share a shape** (a form that is merely incomplete), which is exactly the half of diagnosis least likely to regress.

Two design points that are load-bearing rather than incidental, because the obvious version of each fails silently:

- **A snapshot alone measures a crippled engine.** The founder's expected-state artifacts are attached off the top SENSE hypothesis, so a fixture without sense binds only `get_page_image` — a third of the path goes unexercised while still reporting a rate. Fixtures carry both halves, captured from the same moment.
- **Fixtures name their workflow; they never store its ids.** Ids change on every reseed, and a fixture holding stale ones keeps reporting rates while testing an unlocalized engine. The harness re-resolves from the live sense plan each run and **skips** what it cannot resolve — an unrunnable fixture must never emit a number.

The same discipline runs through the scoring: a run that did not reach the diagnostic engine is excluded rather than counted, and the harness reports how many fixtures were *fully measured* so a shrinking suite cannot masquerade as a passing one.

**Priority: low.** Diagnosis works today, and mid-walkthrough diagnostic questions already reach it. What the merge buys is consistency and combined-evidence answers, not capability. Sequence it behind anything that grows the KB past a single workflow — with one workflow, half of the agent's judgment has nothing to exercise it.

### ⚠ Not a gap in the code — the KB has almost no depth

Recorded here because it distorts every judgment about Copilot mode: through 2026-07-27 the test workspace held **one** approved workflow ("Create an account", 6 steps), so three of the agent's abilities had **never actually fired** — searching with its own wording (nothing else to find), choosing between workflows, and asking *"did you mean X or Y?"* (nothing to disambiguate). A second workflow ("Log in") was recorded on 2026-07-29, which is what made the answer-path bug reproducible at all; two workflows is enough to expose choosing-between, still not enough to judge retrieval at depth.

Copilot mode was verified against what a single workflow can exercise. **Recording two or three more is the cheapest way to test the half that is currently theoretical**, and it gated honest evaluation of Gap 1.

### Suggested order

**~~Gap 2 (logging)~~ → ~~more workflows~~ → ~~Gap 1 (product understanding)~~ → Gap 3 (diagnostic merge)** — the order held, and only the last rung is left. The record now exists and accrues from every question; the coached re-recording gave the KB the narration depth Gap 1's answer needed, which is exactly why it went second.

---

> **Not in scope (unchanged from Phase 5):** server-side conversation storage or cross-device history, long-term per-user memory, and — permanently — **free-form agentic browsing**. A goal grounds to approved workflows or it is not pursued.

### 💡 Parked idea — proactive help (user-flagged 2026-07-26, revisit deliberately)

Every mode so far is **purely reactive**: the assistant never speaks until spoken to. It cannot offer help even when it can see the user is stuck — a disabled button they've clicked three times, a validation error sitting on screen, the same step retried repeatedly. The machinery to *notice* all of that already exists and ships today (the read-only probe, the element-state reading, the walkthrough's progression observation); what is missing is permission to open its mouth first.

**Why it was excluded:** an uninvited pop-up on someone else's product is the single fastest way to make a widget feel like spam, and it converts a trusted help surface into an interruption. The bar for getting it right is high.

**Why it is worth revisiting:** the users who most need help are exactly the ones who never open a help widget. Reactive help only ever serves people who already thought to ask.

**If it is picked up, the shape is probably:** founder-controlled and off by default · triggered by *evidence*, never by inference (a genuinely blocked state, not "seems slow") · at most once per session · dismissible permanently by the end-user · and a nudge rather than a panel — the launcher gets a quiet badge, not an auto-opening chat. Note this is orthogonal to the modes: it is a question of *who starts the conversation*, and it could apply to `1 Copilot` as easily as to the agent modes.


---
---

# The acting layer — the hands *(was Phase 4: Autopilot)*

> Under one agent, this is the **tool layer that acts**. The module detail here stays authoritative;
> the UX half — deciding *when* to offer to act — is absorbed by the loop above.

## A1. The feature

**The loop today (Phase 1):** ask → retrieve over approved-KB → grounded answer + citations, or an honest decline.

**The Autopilot loop:** ask → grounded answer → **offer to execute** → on consent, the widget runs the workflow's steps in the end-user's live session:

```
for each step:  resolve locator (ranked list, first that resolves wins)
                → act (click / fill / navigate)
                → verify expected outcome (page settled into the recorded post-action state?)
                → next step │ ask the user │ SAFE-STOP (explain + hand back control)
```

- **Human-in-the-loop by construction.** Captured input values are **masked** at capture (P1-M12), so Autopilot can never blindly replay values — it **prompts the end-user for every input** (prefilled from their question where safe, always confirmable). Sensitive by design, not by policy.
- **A second audience on the approval model** (`portal` joins with the V2 portal track, `agents` with Phase 6 — [`interop.md`](interop.md)): `copilot | autopilot` — a per-workflow **"may be executed on end-users' behalf"** flag riding the **identity-keyed** approval (§A7 — the original `(sourceId, segmentIndex)` sketch predates workflow identity and is dead). Founder opt-in per workflow, one click, reversible. Absence = never executable.
- **The guided walkthrough is the stepping stone.** Before acting *for* the user, the same machinery can **guide** them — Sense (Phase 2, P2-M3) already highlights the *current* step on demand; P4-M0 extends that into a sequential, progression-aware walkthrough of the whole remaining workflow. Zero side effects, same locator resolution; it ships first and is independently valuable.
- **The user stays in charge:** consent to start, visible step-by-step execution, pause/abort at any moment, confirmation on destructive steps.

**Done when (sketch):** an end-user asks → gets a grounded answer → consents → **watches the widget complete the workflow in their own session** — inputs prompted, destructive steps confirmed, any unverifiable step ending in a safe stop — and only workflows the founder approved for autopilot **and** certification currently holds for (eligibility + interim signals now; Phase-3 validation when it lands — §7 Q2) are ever offered.

---

## A2. The design — LOCKED 2026-08-04 (D12)

> Planned in one sitting against the founder's directive: *build the most reliable acting agent, and
> rewrite whatever needs rewriting.* Four decisions were the founder's, taken explicitly:
> **navigation is an allowed action** · **consent once at start + always-confirm destructive steps** ·
> **single workflow per run in v1** · **the step-engine rewrite may touch the shipped walkthrough.**
> The input mechanism (§A2.4) was frozen in the same conversation. Everything below is design, not
> status — build state lives in [`roadmap.md`](../roadmap.md) §5.

### A2.1 Two layers: the brain deliberates at boundaries, the hands execute between them

**An agent is reliable in proportion to how little it improvises.** So the acting mode is not "the
LLM drives the page"; it is two layers with a hard line:

- **The brain** — the same agent loop Copilot mode runs, with acting tools bound. It understands the
  goal, picks the workflow, extracts values the user already said, asks for what's missing, narrates,
  and reports honestly when the app pushes back (mapping a rejection to the field it blames is
  deferred — §A2.6). It is invoked at exactly **four run boundaries**: offer/plan · input needed ·
  deviation · completion.
- **The hands** — a deterministic executor in the widget that runs the compiled plan: resolve locator
  → act → verify → advance. **No model call per step.** A 12-step run is 12 DOM operations plus a
  handful of boundary calls, not 12 model rounds.

The model never chooses a selector, a button, or an action — it chooses among grounded primitives,
and the acting tool is **run-scoped, deliberately coarser than even the step-scoped `execute_step`
this design first imagined**: it offers and
starts a consented run; the executor owns the steps. The §2 invariant is unchanged and gets its
strongest enforcement yet — page content cannot alter an action set that the model never authors.

### A2.2 The ExecutionPlan — compiled, versioned, pinned

The replay-ready artifact A5 Q7 asked for, and the thing a future sandbox runner shares (§A3):

- **Compiled when the founder enables acting for a workflow** — that is the moment eligibility must
  be judged and shown (§A2.9), not at approval generally and never mid-run. Recovered from the same
  captured evidence the sense plan reads (the ranked locators, routes, and post-action outcomes the
  recorder already ships).
- **Content:** ordered steps — verb (`click | fill | select | check | navigate`), instruction, route
  pattern, ranked locators, post-route, outcome evidence, input slot (label + sensitive flag),
  destructive flag. Navigation compiles as a step verb like any other; what stays a run-level RULE is
  how it behaves — tried once and then patient, and never marker-checked (§A2.5). *(Outcome
  evidence is not a placeholder: for the last + destructive steps, the recorded before/after
  DOM snapshots are diffed at enable time into scrubbed APPEARANCE MARKERS — `expect.appeared` —
  matched at run time by recall. A marker-carrying step completed by an OBSERVED act — the run's own
  or the user's press — completes only when one is visible, which is what retired the "last step ⇒
  done" assumption. The scoping is real: a step that finishes some other way (an input step, a
  hand-back resolution, a route change) still earns "done" from element state or page evidence, so a
  workflow whose last step is a fill compiles a marker nothing checks.)*
- **Content-hashed and PINNED AT CONSENT.** The run executes the exact plan version the user agreed
  to, even across a recompile; staleness is bounded by the run TTL. Liveness and the acting flag are
  re-verified at **start** and again on every **resume** — a workflow retired mid-run ends the run
  quietly at the next page load, not at the next audit call (§A2.3).
- **Persisted.** On a reprocess, workflow identity re-matches by content as everywhere else, and the
  acting flag additionally **re-runs eligibility on the new content** — a content match that is no
  longer eligible drops the flag to needs-review. Fail closed, same posture as identity itself.

### A2.3 Offer → consent → run (the transport, §7 Q1 resolved)

- **The offer is deterministic where D11 put it:** mode is `agent` + the workflow is actable + the
  answer is positional/covered by it ⇒ the run affordance shows. It is **conversational where only
  the brain can hear it** ("just do it for me" ⇒ the agent's offer tool). Both converge on the same
  typed consent sheet. Absence, not refusal: for un-actable workflows no tool is bound and no
  affordance renders.
- **The consent sheet** shows what will run (title, step count), the values already known from the
  conversation (confirmed once, here — A5 Q3's prefill confirmation), the inputs that will be asked
  as-we-go, and every destructive step flagged. **Commitment is a click on a typed affordance** (D8's
  consent half, untouched).
- **Start is the moment everything is re-verified live, server-side:** mode · approval liveness
  (`inactiveReason: null` — an approval reader, chosen live-only on purpose) · the acting flag · that
  a compiled plan exists · hash equality. Then it writes the `ExecutionRun` row. The two gates it
  does *not* re-run are gated once each, earlier and durably: **acceptance** at mode selection
  (§A2.8) and **eligibility** at enable time (§A2.9) — the acting flag is eligibility's standing
  proxy, which is why a reprocess must be able to drop it.
- **Run state is client-held** in the session store's `agent-run` slot — the pattern already proven
  twice by the walkthrough and the chat thread. The server is stateless between boundary
  calls; a full-page navigation unloads the widget and the run **resumes from storage on remount**,
  re-fetching the plan (a revoked or re-hashed plan ends the run quietly) and self-correcting against
  page evidence exactly as the walkthrough does. No persistent channel to break. The step and
  terminal calls are audit appends, not gates — mid-run revocation lands on the resume.

### A2.4 Inputs — just-in-time is the base; upfront and point-and-type are its two edges *(frozen 2026-08-04)*

**Why not collect-everything-upfront:** the plan's slot list is a *hypothesis from one recording* —
conditional fields the founder's path never showed, fields added since, and capture loss all mean
mid-run asking must exist anyway. So mid-run asking is the base mechanism and upfront collection can
only ever be a convenience, never the contract. Chat-as-a-questionnaire is also simply worse than
the app's own form. **Why not point-and-type-everything:** it un-builds the autopilot — the user does
all the labor — and it re-asks values the conversation already supplied, in physical form.

The rules, one line each:

- **Conversation-supplied values** are extracted at OFFER time, server-side, from the conversation
  that produced the offer — confirmed once on the consent sheet, filled by the run, never re-asked.
  *(The plan cannot supply them: it is compiled at enable time, long before any end-user
  conversation exists.)*
- **Everything else** is asked in chat when the run reaches it, validated against the live field
  after the fill (D5), and repaired conversationally with the app's own error on rejection ("that
  name's taken — try another?"). *(As built, v1 asks one field at a time — the reply IS the value,
  deterministic, zero mid-run model calls. Batching a page's unknowns into one ask needs the model
  to map a free-text reply onto slots — the input-needed boundary — and is the deferred
  refinement.)*
- **Sensitive fields** (D3's hard rule: `type=password`, `autocomplete cc-*`, cross-origin iframe)
  are **always point-and-type**: highlight the app's own field, the user types there, the run
  verifies booleans only. Not optional — a card number typed into chat lands in the founder's
  database.
- **A failed fill degrades that one step to point-and-type** and the run continues (§A2.6).
- **Plumbing:** chat-supplied values ride a **distinct typed message kind** with the guarantees §6
  states — and the deferred half §6 names too. The input channel must not become a PII pipe.

### A2.5 Navigation is an action *(founder decision 2026-08-04)*

End-to-end means the run never stops to say "please go to the projects page." In preference order:
**click the recorded navigation element** (grounded, always first); **navigate directly only to
routes that are pattern-safe and cold-startable** — no record ids, the id classifier guards, because
an end-user must never be sent to the founder's own record. A step whose route can be reached
neither way is an **eligibility failure at enable time**, not a mid-run surprise. A navigation is
**tried once and then waits patiently** — an intercepting login wall resumes the run by itself the
moment the user arrives, and a retry loop would only fight the app it landed in.

### A2.6 Verify-or-hand-back, on every act

The widget is a page script: its synthetic events carry `isTrusted: false`, some frameworks ignore
them, and controlled inputs need native-setter dispatch. The design treats this as physics, not as
an error class to fight:

- **Every act is verified against recorded evidence** — post-route pattern, next-step-resolves,
  control-left-the-DOM, element state (`filled`/`valid`) — the walkthrough's detection vocabulary,
  consulted after *our* act instead of the user's.
- **An act that didn't take is a first-class outcome:** the run hands exactly that step back in
  guided posture ("click this one yourself — I'll take it from there"), detection confirms, the run
  resumes acting from the next step.
- **An unresolvable step = safe-stop, in place:** the run stops where it stands, says so in the
  user's terms, and offers Retry · Stop Auto Run. The terminal audit row records the exit as
  `safe_stop`. **Never guess forward** — unchanged from the walkthrough, now with more to lose.
  *(Until 2026-08-11 this state also offered a takeover that converted the remaining steps into a
  guided walkthrough — removed, see §A2.7.)*

### A2.7 Destructive steps, takeover, narration

- **Destructive steps** are flagged at compile (submit/delete/payment heuristics), shown to the
  founder at enable time and to the user on the consent sheet, and **each one pauses for a typed
  confirm mid-run** — always, in v1 (founder-configurable automation later; goal layer §5 Q3
  resolved).
- **The run card** (the walkthrough card, grown up) always offers **Stop Auto Run** (and the ✕ —
  the same act): abort outright, back to the plain copilot. **Reversed 2026-08-11 (founder):** the
  original card also carried Pause and a takeover ("I'll take it from here" → guided walkthrough
  from the current step); both were removed for one unambiguous exit — a mid-run user either lets
  the agent finish or stops it, and stopping never turns into a second mode. Abort-at-any-moment —
  the contractual minimum — is unchanged.
- **Every state change is narrated in chat** as it happens — narration is the visibility mechanism
  that replaces watch-every-click, and it survives navigations because the thread does (P5-M0).

### A2.8 The gate and the audit (the contractual line)

- **Workspace level:** mode `agent` is selectable in the vocabulary; what gates it is a durable
  **acceptance record** — who enabled, when, against which terms version (§7 Q4). Selecting the mode
  is refused server-side unless a row for the CURRENT terms version exists, and the founder's accept
  writes the row and flips the mode in one transaction; a workspace that already accepted switches
  both ways freely.
- **Workflow level:** the acting flag rides the **identity-keyed approval** — liveness comes with the
  row, and the three acting readers (the runnable-offer set, plan serving, run start) filter
  `inactiveReason: null`.
- **Run level:** `ExecutionRun` — the consent moment, the plan hash, per-step outcomes, which input
  slots were filled and from which source (chat · point-and-type · confirmed prefill — **never the
  values**), and the outcome (`completed | aborted | safe_stop` + reason + step). "Did this user
  authorize this run, and what did it do?" is answered from rows, not from model output (D8).

### A2.9 Eligibility is decided at enable time, never discovered mid-run (A5 Q5)

Static analysis over the compiled plan, verdict shown to the founder the moment they try to enable
acting: every step recovers at least one locator · no cross-origin-frame steps · no foreign-origin
navigations (OAuth popups) · every verb supported · no navigation into a specific record (the id
classifier guards — an end-user must never be sent to the founder's own record, §A2.5).
*(File-upload steps stopped disqualifying — they
compile as the USER's own step instead: browsers open pickers only on trusted
gestures, so the run pauses, the user chooses, and Continue verifies the chosen file. The enable
summary counts them: "1 step the user does themselves.")* Ineligible ⇒ the flag cannot be
enabled ⇒ absence downstream. Certification proper stays a **pluggable input** (§7 Q2): eligibility
mandatory now, interim signals (the walkthrough's auto:manual ratio, completed runs) as the quality
bar, Phase-3 validation slotting in when it exists.

### A2.10 One step engine, two actors *(founder decision 2026-08-04 — the rewrite)*

The walkthrough already contains the hardest half of execution: locator resolution with retries,
route watching, settle detection, element-state verification, safe-stop, cross-nav resume. That
machinery is **extracted into a shared step engine** with two actor policies:

- **Guided** — the user acts; detection acknowledges; Next advances. D4's manual-only advancement is
  untouched; the re-platform had to be behavior-identical, and the existing E2E legs verified it.
- **Acting** — the widget acts; verification advances; input and destructive steps pause.

The payoff is structural — and it is a standing invariant rather than a design note, so it is
stated once, in [`CLAUDE.md`](../../CLAUDE.md)'s traps. The regression risk on a shipped,
user-verified feature was accepted explicitly here, deliberately, as the price of it.

### A2.11 Testing posture

The widget gains its first test runner with this build — an acting engine in the one package with
zero tests is the reliability risk. The step engine and the act verbs are born with DOM-fixture
tests (including framework-controlled inputs), and the engine extraction lands only after the
existing walkthrough E2E legs pass on the new core. **Not built:** a scripted acted-run harness
against the local test app — the acting counterpart of the copilot baseline. Until it exists,
whether a whole run still behaves is a manual E2E question.

### A2.12 Build order — risk added last

**Substrate** (plan compiler · eligibility · identity-keyed flag · Studio surfaces) → **step-engine
extraction** (zero-acting, behavior-identical) → **the hands** (act verbs + verify-or-hand-back +
resume, dev-flagged runs against the test app) → **the brain wiring** (acting tools · consent sheet ·
mid-run inputs · narration · deviation diagnosis) → **the contractual shell** (acceptance record ·
destructive confirms · takeover · audit surfaces). **Only at the end of that order, with the
acceptance flow standing in front of it, did `agent` become selectable at all.** Module mapping and status:
[`roadmap.md`](../roadmap.md) §5.

**Not in v1, on purpose:** chaining (§7 Q3 — single workflow per run) · upfront input *collection*
beyond the consent sheet (the sheet lists, the run asks) · plan signing (§A5 Q9 — no-leak already
holds because only live + actable workflows ever compile; revisit with real customer traffic) ·
proactive offers (parked, unchanged).

**One debt outside this phase, carried rather than paid:** the recorder's known full-page-nav
capture gap (late `change` events lost) now costs more than a worse answer — a plan missing fill
steps is a form submitted half-empty. The flush-on-submit/`pagehide` fix was NOT landed before the
first real runs and is still open ([`roadmap.md`](../roadmap.md) §9); acting raised its price, not
its urgency-as-a-gate.

---

## A3. Relationship to Phase 3 — one replay engine, two drivers

Self-validation (Phase 3) and Autopilot are the **same core capability — workflow replay — pointed at different targets with opposite risk profiles**:

| | **Phase 3 · Self-validation** | **Phase 4 · Autopilot** |
|---|---|---|
| Runs where | Customer **sandbox** — never production | End-user's **live production session** |
| Driven by | FlowBuddy's scheduled runner | The **widget**, on end-user consent |
| Auth | Sandbox credentials (+ MFA — the hard part) | User already signed in (solved for free) |
| A failed replay is… | **The product working** — a drift flag | **A safety event** — safe-stop, explain, hand back |
| Purpose | Keep the KB fresh | Complete the user's task |

**The acting modules no longer wait for Phase 3's replay core** *(founder decision 2026-08-04,
reversing the 2026-07-15 sequencing; D12)*. The core does not exist and nothing else of Phase 3's
replay track is planned, so waiting meant the acting agent stayed on paper — exactly the strategic
risk [`competitive-claude-chrome.md`](../product/competitive-claude-chrome.md) §5 names. What
replaces the wait, without giving up what the wait was for:

1. **The widget driver is the replay engine's FIRST consumer.** The step engine (§A2.10) is born in
   the widget because that is where the first real runs happen. The shared core is **extracted when
   the second driver actually exists** (Phase 3's sandbox runner, then V3's extension) — extract at
   the second consumer, never speculatively. The `retrieval.ts` single-seam pattern still ends up
   applied to execution; it just arrives by extraction instead of by up-front construction.
2. **Certification stays a pluggable input, with a mandatory floor** (§A2.9, §7 Q2): eligibility
   analysis at enable time now, interim quality signals now, Phase-3 validation slotting into the
   same socket when it lands. The sandbox's "learn where failure is the deliverable" hardening still
   happens — it now hardens an engine that already runs, rather than gating its existence.
3. **The loop still closes both ways.** An Autopilot safe-stop in production ("element not found at
   step 3") is a **live drift signal** feeding Phase 3's freshness dashboards — production telemetry
   arriving *before* sandbox validation instead of after it.

**Phase 2 (Sense) feeds it too:** Autopilot's **mid-workflow entry** — "you're on step 3; want me to finish the rest?" — consumes Sense's workflow/step localization (the read-only locator probe), so the offer can start from where the user actually is instead of replaying from step 1. **And P2-M5 (Reason) hands it the agent loop:** the read-tool reasoning skeleton (gather evidence → think → gather more → conclude, [`sense-and-reason.md`](sense-and-reason.md) Part B) is the loop the acting BRAIN runs at its boundaries — P4 adds hands to a brain that already exists. The hands themselves are deliberately not part of that loop: the executor is deterministic, with **no model call per step** (§A2.1).

---

## A4. Modules (locked to the §A2 design; status: [`roadmap.md`](../roadmap.md) §5)

| Module | What it is | Design |
|:---|:---|:---|
| **P4-M0** | **Guided walkthrough** — sequential, progression-aware step-through of the whole remaining workflow (highlight step k → detect completion → advance to k+1); no acting | §A8 for the decisions, [`internals/widget.md`](../internals/widget.md) §4.9 for the mechanics. Builds on **Sense's P2-M3** + Sense's localization; re-platformed onto the shared step engine in M2 (§A2.10), behavior-identical. |
| **P4-M1** | **Gate + plan substrate** — the acting flag on the identity-keyed approval, the compiled/versioned/persisted `ExecutionPlan`, eligibility analysis at enable time, the acceptance record | §A2.2 · §A2.8 · §A2.9 — slice 1 of the §A2.12 order. |
| **P4-M2** | **The run** — the shared step engine (guided + acting as two actor policies), act verbs with verify-or-hand-back, consent sheet, just-in-time inputs, narration, cross-nav resume | §A2.1 · §A2.3–A2.6 · §A2.10 — slices 2–4. The end-user-facing heart of the phase. |
| **P4-M3** | **Contractual shell** — destructive-step confirms, takeover/abort, `ExecutionRun` audit + Studio surfaces, the acceptance flow that stands in front of mode `agent` | §A2.7 · §A2.8 — slice 5. A bad action is worse than a bad answer — this module is why founders can trust the toggle. |

*(The **replay core** is born inside M2 as the step engine and is extracted to a shared seam at the
second consumer — §A3. It is no longer a Phase-3 deliverable consumed here.)*

---

## A5. Design questions — RESOLVED 2026-08-04 (each answer lives in §A2; this list is the index)

> **Design input that shaped §A2 — their permissions UX, stolen as planned.** Claude for Chrome's
> control vocabulary maps onto the design almost one-to-one: per-run consent + forced confirmation on
> irreversible steps (§A2.3/§A2.7), hard-excluded categories via eligibility (§A2.9), admin control
> via the per-workflow flag (§A2.8), and a reviewable action history via `ExecutionRun`. Citing the
> analogy borrows their published safety credibility. Full model:
> [`competitive-claude-chrome.md`](../product/competitive-claude-chrome.md) §3, §5.

1. ~~Consent & visibility UX~~ — **once at run start**, then a visible, narrated, watched run
   (§A2.3, §A2.7). "Show me" ends and "do it" begins at the typed consent sheet.
2. ~~Destructive steps~~ — **always a per-step typed confirm in v1**; founder-configurable automation
   later; payment-iframe workflows are excluded outright by eligibility (§A2.7, §A2.9).
3. ~~Input values~~ — the frozen mechanism (§A2.4): conversation values confirmed once at consent;
   everything else asked just-in-time, one field at a time in the chat, the reply itself being the
   value (per-page batching deferred — §A2.4); sensitive fields always point-and-type.
4. ~~Abort / takeover / safe-stop~~ — Stop Auto Run on the run card at all times (Pause + the
   guided-takeover downgrade were removed 2026-08-11 — §A2.7); every deviation
   verifies-or-hands-back; safe-stop reports what's done/what isn't (§A2.6, §A2.7). "What was
   already done" = the narration thread + the `ExecutionRun` rows.
5. ~~Execution limits~~ — **eligibility at enable time** (§A2.9): unrecoverable locators,
   cross-origin-frame steps, foreign-origin navigations, unsupported verbs and navigation into a
   specific record all block the flag, never surprise a run. Full-page navigations were already
   solved by the resume pattern (§A2.3).
6. ~~Eligibility & staleness~~ — the plan is **pinned at consent** and TTL-bounded; liveness is
   re-verified at start and again on every resume, so retirement mid-run ends the run quietly at the
   next page load; a lapsed certification hides the offer for NEW runs and never kills a consented
   run mid-step (§A2.2, §A2.3).
7. ~~The execution-plan source~~ — **compiled + persisted `ExecutionPlan` at enable time** (§A2.2);
   never manifest-parsing at run time; shared with Phase 3 by extraction when its runner exists
   (§A3).
8. ~~Per-user variance~~ — a hidden button IS a verification failure: safe-stop + honest explanation
   (§A2.6). Repeated same-step failures surface to the founder from `ExecutionRun` aggregation when
   the drift loop lands (§A3.3).
9. ~~Plan integrity & tenancy~~ — served key-scoped/origin-checked/rate-limited like everything else;
   **no-leak holds structurally** (only live + actable workflows ever compile); the consent-time hash
   pins content. Server-side signing deferred until real customer traffic — tampering in the user's
   own browser harms only that user's own session, the same trust class as the sense plan (§A2.12).
10. ~~Naming & positioning~~ — the founder-facing mode label stays **AI Agent** (the locked
    vocabulary); end-user copy (offer pill, consent sheet, narration voice) is decided at build with
    the consent sheet itself.

---

## A7. Data-model deltas (additive; the schema owns the exact columns)

*(Rewritten 2026-08-04: the original sketch keyed the flag on `(sourceId, segmentIndex)`, which
predates workflow identity — positions are signals now, never keys.)*

- **The acting flag rides the identity-keyed approval** — enabled/at/by beside the existing row, so
  liveness (`inactiveReason: null`) comes with it and acting needs no trust object of its own. The
  eligibility verdict is snapshotted with it (§A2.9).
- **`ExecutionPlan`** — the compiled, replay-ready artifact per actable workflow (§A2.2): ordered
  steps `{ verb, instruction, route pattern, locators, postRoute, outcome evidence, inputSlot?,
  destructive? }` + a content hash; compiled at enable time, re-verified on reprocess, pinned at
  consent.
- **`ExecutionRun`** — the audit row (§A2.8): consent moment, plan hash, per-step outcomes, input
  slots + their source (never values), outcome `completed | aborted | safe_stop` (+ reason, step).
  Safe-stop reasons feed Phase-3 drift signals.
- **The acceptance record** — workspace, who, when, terms version (§7 Q4); what the server checks
  before it will set the mode to `agent` (§A2.8).

---

## A8. P4-M0 — Guided walkthrough: the locked decisions

*(How it runs — detection, the self-correcting pointer, the resume reconciliation, the observation
posture: [`internals/widget.md`](../internals/widget.md) §4.9 and §5.)*

**What it is.** Under a positional answer the widget offers **"Walk me through it"**. On the user's
click the chat panel closes and a compact step card walks them through the whole remaining workflow
— *instruction k/N*, the step's element spotlit, surviving full-page navigations — while the widget
watches them complete each step. **The user performs every action; the widget never clicks, fills,
or navigates.** It is config-gated per workspace (`copilotWalkthrough`, requires Sense); the
founder's switch is the whole rule (D11), and the per-workspace defaults are status —
[`roadmap.md`](../roadmap.md) §5.

**D4's law, and its amendment.** *Advancement was manual-only* — **user decision 2026-07-15**:
detection only ACKNOWLEDGES, the pointer moves on the user's Next. The case against auto-advance
was always an INPUT-step case: `filled ≠ done`, a multi-field step has no observable completion
moment, and being confidently early costs the user a half-finished form in their own live account.
The traveling card exposed the other half: for a click the widget just WATCHED land — evidence in,
recorded navigation confirmed — demanding a second click on → re-taxes exactly the mouse travel
the card redesign removed. So the law now splits by evidence (**founder decision 2026-08-11**): a
conclusively-detected ACTION step advances itself, including across the page load it causes;
input steps and any click without evidence still wait for the user's →. Auto-advance runs through
the same advancement path as the button — never over a pending earlier field, never off a
disabled click, never on a guess — and the walkthrough still performs nothing itself. The →
button holds the same standard in reverse, but **only over the workflow's skeleton** (**founder
decisions 2026-08-12** — first the gate, then its scope): → re-verifies a CLICK step at press
time and refuses an un-evidenced one, saying what to finish — you cannot honestly be on step 5
if step 2's navigation never happened. The LAST step is the exception: the gate protects the
pointer's position, and past the last step there is no position left to protect, so **Done always
completes** — refusing it would only convert honest endings into ✕-aborts, while the auto/manual
stamp already separates verified from declared completions. INPUT steps are deliberately never gated: an empty field
or unticked box may BE the user's decision — the recorded state was the founder's choice, not a
requirement, the same recorder's-choice rule the acting run applies to values — so guidance
stays, → passes, and the skip is remembered so the pointer doesn't drag them back. The app
remains the enforcer of record for required fields: its disabled or rejecting submit surfaces
through the next click's gate and the blocked-button explanation. Two escapes keep the click
gate from becoming a trap: a safe-stopped step keeps → (an element that legitimately cannot
resolve must never brick the walkthrough), and instruction-only steps stay ungated (nothing
checkable). **This is guided mode's law regardless of what the acting policy does** on the same
engine.

**The card travels — one step, beside the element (2026-08-11).** The step card began as a fixed
corner overlay, which made every step a full viewport crossing: eyes and mouse shuttling between
the spotlit element and the Next button. The redesign is the industry tour pattern: one step per
card on the widget's accent, anchored beside the highlighted element with a beacon dot marking the
anchor point, "2 of 5" progress and ← / → at the card's foot. The workflow title appears only when
the card DOCKS back to the fixed corner — which it does exactly when there is nothing to point at:
a step on another page, an instruction-only step, a safe-stop, waiting out a navigation. On the
last step the forward control reads **Done**, and completing simply closes the card (**founder
decision 2026-08-12**) — there is no parting banner, because it would only restate what the user
just did. One thing deliberately did not move: the **acting run's card keeps the fixed corner and
the neutral surface** — its user is watching a run, not steering one, so a traveling card there
would be motion without meaning.

**The boundary the whole module exists to hold: zero acting.** Observation is user-initiated,
session-scoped and read-only; nothing leaves the page except run analytics. Its two sharpest edges
are worth naming as decisions rather than details — a step on another route is described in text
rather than navigated to (navigating *for* the user would be acting), and the guided path never
imports the acting module at all, so "a walkthrough cannot act" is enforced by the module graph
rather than by a convention someone has to remember.

**Re-platform note (D12):** the run machinery **was** extracted into the shared step engine
(§A2.10), with guided mode as one of its two actor policies. Everything user-visible survived
**identically** — the E2E legs pinned it.

**A deliberate cut, not a gap:** the offer rides only answers that carry a `position`. Citation-only
entry was considered and dropped, because an offer with no measured position has nowhere honest to
start.

---

> **Not in Phase 4:** free-form agentic browsing (never — grounded actions only), cross-app workflows, desktop/native apps, autonomous runs without an end-user present, and *extracting* a shared replay core — the replay engine is born here as the widget driver and is only extracted at its second consumer (§A3).


---
---

# The goal layer — the brain *(was Phase 5: Converse)*

> Goal → plan → consent → narration → chaining. The tier ladder this phase was built around is gone
> (D9): Tell, Guide and Do are tools the agent calls, not tiers it routes to.

## G2. The gap this phase closes (as measured in the code)

| Symptom | Cause (verified) |
|---|---|
| Every message feels one-shot | Retrieval runs on the bare question text (`retrieval.ts` — question terms + route boost); history rides the prompt but never retrieval, so *"and then what?"* searches the KB for "and then what" |
| ~~The conversation dies on navigation~~ — **✅ fixed 2026-07-26 (P5-M0 cut 1)** | `messages` was in-memory per page view (`widget/src/index.ts`) — following the copilot's own advice wiped the thread, including navigations a walkthrough itself caused, so its own "Explain what's blocking me" escalation landed in an empty panel. The walkthrough had solved this for itself; the chat never got it. Now both use the shared `widget/src/session.ts` store |
| No notion of the user's goal | Nothing tracks "what is this user trying to accomplish"; each answer is a verdict, not a step toward finishing a task |
| Answers-or-declines, never asks | **Closed in Copilot mode (2026-07-27), still true beneath it.** The single-call engine's only legal question is the Sense tie, so ambiguous intent → guess or decline. The agent may now ask ONE short clarifying question when the approved knowledge genuinely supports more than one reading — and a clarifying question counts as an *answer*, not a decline. |
| Knows recipes, not the product | The KB = workflow steps (+ narration topics); no product description, concepts, plans/roles, FAQs — the copilot can navigate but cannot orient, compare, or redirect |
| Help intensity is bolted on | The walkthrough offer hangs off positional answers only; there is no goal → tier dispatch |

**Principles carried over, unchanged:** grounded-only (this phase widens what the copilot knows and pursues, never its permission to invent) · decline-over-hallucinate for facts · position is re-measured every message and beats conversation for WHERE — conversation owns WHAT-they're-trying-to-do · every piece degrades silently to today's behavior.

---

## G3. Modules

> **Status: [`roadmap.md`](../roadmap.md) §11** — which cut is built, which was dropped, which
> dissolved and what each was verified against. This section is the design and the reasoning; the
> verdicts used to be stamped inline here too, and two of them had already drifted from the roadmap's.

### P5-M0 — Conversational foundation

1. **Continuity bias (deterministic, free) — cut 2.** The widget sends the previous answer's citation keys (`context.lastCited: [{sourceId, segmentIndex}]`, server-validated against `CopilotApproval` — no-leak); retrieval boosts items from those workflows. As built:
   - **Weighted in BOTH scoring paths, below the two measured signals** — `+2` on the keyword fallback (route/sense are `+3`) and `CONTINUITY_RRF_WEIGHT = 1` in the fusion (route/sense are `2`). Route and sense are measured *now*; continuity only recalls a turn ago, and that gap is what lets a user change subject. A bias, never a filter.
   - Keys come from the **last `assistant.answer`**, so an intervening decline is transparent rather than resetting the thread. Capped at 4, deduped, and omitted from the payload entirely when empty (a first question is byte-identical to before).
   - The approval re-check runs **concurrently with the sense resolution** (`Promise.all`), so it adds no serial round-trip to the path every question rides.
   - **Fixed a cut-1 gap it exposed:** the restore path was dropping citation keys, which would have broken continuity precisely after a navigation — the case cut 1 exists for.
   - **Also decoupled `copilotShowCitations`** — it was making the engines return `citations: []`, which would have silently disabled continuity for those workspaces *and* had already been emptying their Analytics "top workflows by citations" card. It is now a presentation gate at the API response boundary (titles nulled; keys and logging intact). See [`internals/copilot.md`](../internals/copilot.md).
2. ~~**Query condensation (LLM, gated)**~~ — **cut 3, dropped (revisit only on evidence).** The plan was a cheap-model hop condensing history + question into a standalone retrieval query. Cut 2 took the common case (*"and then what?"* about the SAME workflow) deterministically, for free, with no latency. What remains is the narrower case of a follow-up that *shifts* to a different workflow — and that is exactly what a mode-2 agent calling `search_kb` with its own formulated query does natively (this doc. Paying a permanent per-question latency tax and a fast-path prompt-regression risk for a slice the next milestone likely absorbs is the wrong trade.
3. **Chat persistence — cut 1.** As built, and deliberately more than a chat feature:
   - **The store was extracted, not copied.** `widget/src/session.ts` is now a **slot-based cross-page store** owning versioning, workspace-key scoping, created/updated stamps, TTL and silent discard of foreign/expired/corrupt records; consumers bring only their domain shape. Three consumers, present and planned: `walkthrough` (P4-M0, refactored onto it — `WalkSession` shed `v`/`k`/`startedAt`/`updatedAt`, key bumped to `flowbuddy.walkthrough.v2`), `chat` (`flowbuddy.chat.v1`, this cut), and the unified agent's resumable run state (this doc.
   - **Typed message kinds from day one** — `MsgKind` (`user.question` · `assistant.answer` · `assistant.decline` · `assistant.error`) replaced the old `decline`/`error` booleans, and **a `PERSISTED_KINDS` allowlist decides what survives, not the message shape**. `assistant.error` is excluded (a transport failure is about a moment, not the conversation); D3's future `user.value` is excluded by never being added — no storage migration (this doc.
   - **`walkOffer` cannot leak:** persistence maps fields one by one, so a founder-derived plan copy structurally never reaches storage; stale plans re-derive on re-ask.
   - **Panel reopen (§5 Q2 resolved):** the thread always restores; the panel re-opens *itself* only when the thread was touched within 2 minutes — and never when a walkthrough is about to resume (a synchronous `walkthroughPending` peek, because `resumeWalkthrough` is async). Restoring can only repopulate the transcript — never a highlight, never a position; Sense re-measures those every message.
   - **Restore runs before `mount()`**, so a restored thread never flashes the empty greeting. Skipped entirely in Studio preview mode, alongside the heartbeat and analytics.
   - **The one behavior change:** `history` on `/answer` is built from `messages`, so it now **spans navigations**. Desirable, and the point — but it changes what the server sees on the path every question rides, so it belongs on the E2E list.

   **Tier 3's narration hard-depends on this module** — the narrative must survive the page loads the automation causes.

### P5-M1 — Goal understanding (intent capture)

- **The goal thread (stateless):** the answer JSON gains a `goal` field — one line, "what this user is trying to accomplish," updated by the model every turn; the widget stores it with the chat session and returns it as `context.goal` (capped, de-angled, hint-only — the Sense three-tier rule applied to intent).
- **Posture rewrite** (fast-path `SYSTEM`): verdict-style → companion-style — acknowledge the thread, frame answers inside the goal, never re-greet or re-explain. **Clarifying questions become legal:** when intent is genuinely ambiguous AND the KB supports more than one reading, ask ONE short question (a clarification is `covered: true` — help, not a decline).
- **Parameter capture:** when a goal statement carries inputs ("create a project called *Acme* for *acme.com*"), the conversation extracts and remembers them — so Tier 3 (and Tier 1/2 answers) never re-ask what the user already said. Extraction is opportunistic, never exhaustive: whatever isn't known gets asked mid-run (P5-M4). The masked-at-capture safety property survives either way — values always come from the user, never the recording.
- **Analytics:** `CopilotQuery.goal` (nullable, additive migration) — aggregated goals = the founder's product-gap signal.

### P5-M2 — Product Profile (the product-understanding KB)

> **The gap this module was filed against** — the assistant knowing **recipes, not the product**, so
> every orienting question ("do I need X or Y?", "what's the difference?") declined correctly and
> uselessly — is §9 Gap 1 above, including why it was sequenced behind recording more workflows.
>
> **Direction evolved — the design home moved:** the derivation-first successor of this module (same
> goal, same two-evidence-layer answer rule, but **extracted from narration and approved
> page-by-page** instead of founder-authored) is [`application-intelligence.md`](application-intelligence.md).
> What is built of it, and how the original module now reads: [`roadmap.md`](../roadmap.md) §11.
> **Everything below is the superseded founder-authored design**, kept because the answer-synthesis
> rule it locked — background may orient and redirect, only workflows may instruct — survived intact.

- **Authoring (Studio, KB page tab):** founder-authored structured prompts + free text — what the product is · who uses it · core concepts/terms · plans/roles · FAQs · never-say list. Optional starter: distill a draft profile from the recordings' narration transcripts (the understanding is already in the founder's voice there).
- **Storage — reuse the whole pipeline:** authoring truth in a `ProductProfile` row; on save, compiled into a synthetic `KnowledgeSource` (`kind:'product'`) whose `KnowledgeItem`s (one per concept/FAQ/section, embedded) are delete-and-recreated. `CopilotApproval` rows written automatically (founder-authored = approved by authorship), so retrieval's approved-only invariant holds untouched. Citation chip reads **"Source: Product profile."**
- **Answer synthesis:** the prompt names two evidence layers — **PRODUCT BACKGROUND** (orient, explain, compare, redirect) and **WORKFLOWS** (instruct steps) — anchored by POSITION, framed by the GOAL. Background may redirect ("you don't need a new project for that"); only workflows may instruct; nothing may be invented.

### P5-M3 — ~~The goal router (the tier offer)~~ — **DISSOLVED by D9**

There is no tier router. Choosing between Tell, Guide and Do is not a routing decision made once per
goal; it is the agent picking a tool, turn by turn. The module's whole job is absorbed by the loop.

### P5-M4 — Goal-driven execution orchestration (Tier 3's brain; consumes P4-M2)

> **Its single-workflow v1 is absorbed by the acting layer** (§A2 — per-goal consent, mid-run input
> prompting, narration and safe-stop are specified there, exactly as locked below). What remains of
> this module is **chaining** — goal → multiple workflows, cross-workflow handoffs, partial-failure
> semantics — scoped out of v1 by D12's single-workflow-per-run decision.
> Status: [`roadmap.md`](../roadmap.md) §11.

- **Per-goal consent:** the goal, the workflow chain, and every value already known from the conversation are confirmed ONCE before anything runs. Consent is about *what will happen*; it does not require every input upfront. (The one standing exception to hands-off: destructive steps — see Q3.)
- **Inputs — mid-run prompting is the base mechanism (locked 2026-07-16):** when the driver reaches an input step whose value isn't known, it pauses and asks **in the chat** (the narration channel doubles as the prompt channel), then continues — no exhaustive upfront slot enumeration, and conditional fields the recording never showed are handled naturally. Values the conversation already supplied are **never re-asked**; known upcoming inputs may be *offered* at confirmation as a convenience ("give them now or as we go"). An unanswered mid-run prompt times out into a safe-stop with the honest what's-done/what's-left report.
- **Chaining:** a goal may span multiple approved workflows ("get my chatbot live" = create project → add sources → build → embed). Still grounded — a chain of approved workflows is not free-form browsing — but chaining is new scope: goal→plan mapping, cross-workflow handoffs, partial-failure semantics.
- **Narration:** every action the driver takes is reported into the chat as it happens ("Created project *X* — now adding your website…"), across navigations (P5-M0.3). Narration is the visibility mechanism that replaces watch-every-click.
- **Honest mid-goal failure:** a safe-stop reports like a colleague — what's done, what failed, where the user is, what's left — and downgrades to Tier 2 from that exact step (Sense's mid-workflow entry).
- **The seam:** P5-M4 hands P4-M2 one workflow at a time with pre-collected inputs; P4 owns locator resolution, acting, verification, safe-stop. P3's validated-current certification gates eligibility when it lands (P4-M1's pluggable signals).

---

## G4. Wire & schema deltas (all additive)

| Delta | Where |
|---|---|
| `context.lastCited[]` on `/answer` (validated, capped, approval-re-verified) — **✅ built** · `context.goal` (later, M1) | widget · api |
| `continuityKeys` retrieval option, weighted in both scoring paths — **✅ built** | synthesis |
| `copilotShowCitations` moved from the answer engines to the API response boundary — **✅ built** | synthesis · api |
| `goal` (+ later `tierOffer`) in the answer JSON | `synthesis/copilot.ts` |
| sessionStorage `flowbuddy.chat.v1` via the shared slot store `widget/src/session.ts` (+ `flowbuddy.walkthrough.v2` migrated onto it) — **✅ built** | widget |
| `CopilotQuery.goal` (nullable) | db migration |
| `ProductProfile` table + synthetic product source/items + auto-approvals | db migration · compile step |
| Studio: Product profile tab + toasts | web |
| P5-M4 (later): goal-run consent + narration events; execution stays on P4's `ExecutionPlan`/`ExecutionRun` | widget · api |

## G5. Design questions to lock

1. ~~**Condensation gating**~~ — **CLOSED 2026-07-26 by dropping the hop** (P5-M0 cut 3). Continuity bias took the common case deterministically and for free, and a topic-shifting follow-up is what the agent's own search covers. Reopen only if a measured case survives both.
2. ~~**Panel reopen after navigation**~~ — **✅ RESOLVED 2026-07-26 (built):** the thread always restores; the panel re-opens itself only on a thread touched within the last 2 minutes, and never when a walkthrough is resuming. Continuity where it was clearly intentional; a half-hour-old session must not pop the copilot open on a page the user navigated to for their own reasons — on someone else's product.
3. ~~**Destructive steps under hands-off Tier 3**~~ — **RESOLVED 2026-08-04 (D12): always pause-and-confirm in v1**; founder-configurable automation later. §A2.7.
4. **Tier recommendation** — copilot recommends one tier, user picks (recommended) vs. user always chooses unprompted?
5. ~~**Chaining scope for Tier 3 v1**~~ — **RESOLVED 2026-08-04 (D12): single-workflow goals first**; chaining is this module's remaining scope. §A2.12.
6. **`CopilotQuery.goal` analytics column** — now (recommended) or defer?
7. **Profile authoring shape** — structured fields + free text (recommended) vs. one free-text box?
8. **Profile retrieval slot** — overview item always ships as background + rest compete (recommended) vs. pure competition?
9. **Clarifying questions** — max one at a time, only when the KB supports both readings (recommended)?
10. ~~**Tier-3 certification bar**~~ — **RESOLVED 2026-08-04: interim signals with a mandatory eligibility floor** (= §7 Q2); Phase-3 validation slots into the same pluggable input when it lands. §A2.9.

## G6. Risks

- **Latency** — the loop can take several model rounds before it answers; round one *is* the old fast path, so simple lookups must not get slower. (The condensation hop this risk originally described was dropped — cut 2 took the common case for free.)
- **Untrusted round-trips** — `goal`/`lastCited` come from any page holding the public key: cap, de-angle, re-verify keys, treat as hints that bias framing, never facts (the proven Sense posture).
- **Prompt regression** — the posture rewrite touches the fast path all questions ride: re-run the Sense/Reason E2E legs before calling it done.
- **Tier-3 blast radius** — hands-off execution concentrates all of Phase 4's "a bad action ≫ a bad answer" risk into one consent moment: per-goal confirmation must show exactly what will run, with the values already known (unknown inputs are asked mid-run, in the chat); narration + safe-stop are the runtime backstops; certification (Q10) bounds staleness.
- **Profile bloat/abuse** — per-field caps and an item-count cap at compile; a bloated profile competes against itself in retrieval.

## G7. Dependencies & sequencing

- **P5-M0…M2 have no Phase-3/4 dependency** — they build on the shipped copilot and improve every tier immediately (including the already-shipped Tier 2, whose chat context currently dies on navigation).
- **P5-M3** needs M1 (goals) and consumes P4-M0 (Guide) as its first non-chat tier.
- **P5-M4** builds on the execution driver (§A2) and consults eligibility analysis for what may run. Build order inside Phase 4 is unchanged; this phase adds the brain on top, not a bypass.

---

> **Not in Phase 5:** server-side conversation storage or cross-device history, long-term per-user memory, free-form agentic browsing (never — goals ground to approved workflows or they are not pursued), portal articles (V2).
>
> **Proactive/unprompted help is PARKED, not rejected** — user-flagged 2026-07-26 as worth revisiting; the reasoning and the likely shape live in this doc.
