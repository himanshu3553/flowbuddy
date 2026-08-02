# FlowBuddy — The Agent (direction, decisions, and the two layers under it)

> **One doc, because there is one agent.** This merges what were three: the unified-agent direction
> (the spine below), the **acting layer** (was Phase 4 — the hands), and the **goal layer** (was
> Phase 5 — the brain). They were separate docs carrying mutual "superseded in spirit" warnings,
> which meant every reader had to reconcile them by hand. This is that reconciliation, done once.

> **One chat, one agent, one grounded tool surface.** Instead of a copilot that *routes* a user into one of three separate mechanisms — an answer (Phase 1), a walkthrough (P4-M0), an execution run (P4-M2) — FlowBuddy becomes a single agentic loop for which **Tell · Show · Do are tools it may call, turn by turn**. The user stays in one conversation; the agent moves up and down the intensity ladder as the task demands, narrating what it does and asking for what it needs. **The division of labor that survives: the agent deliberates, the grounded primitives act.**

- **Status:** 🟩 **COPILOT MODE BUILT + USER-VERIFIED E2E 2026-07-27** (founder's verdict: markedly more accurate than the single-shot mode it replaced) **— and since 2026-08-02 the only selectable mode**, AI Chatbot having been retired (D10). D1–D8 locked 2026-07-25, D9 2026-07-26, D10 2026-08-02. Migration steps 1–3 are done, and since 2026-07-29 every answer records **which engine actually produced it**, in how many rounds, using which tools; **§9 records the two gaps that remain**. Mode 3 remains direction only. This doc records *what was decided and why*, not *how it is built*. The full design follows once the open questions in §7 are settled.
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
| 2 | **AI Agent** | The loop with acting bound. Not built. Never a default. |

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
> It chooses *which grounded primitive to invoke*, never *what to do on the page*. `execute_step(workflowId, k, inputs)` — never `click(selector)`.

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
| `ask_user` | Clarify · prompt for input · confirm | 🔄 **clarifying questions legalised in mode 2 (2026-07-27)** — no longer the Sense tie only; input prompting + confirmation await mode 3 |
| `product_profile` | Founder-authored product understanding | 📝 P5-M2 — **the top remaining gap (§9 Gap 1)** |
| `execute_step` | Resolve locator → act → verify | 📝 **P4-M2 — to build (the critical path)** |

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

### D9 + D10 in practice — the two modes (the build spec in miniature)

**One boundary now, and it is the one that always mattered.**

- **Copilot → AI Agent is an accountability change.** Same orchestrator, one more tool bound, plus the gate and the rails. **This is the contractual line** — the only boundary that needs terms, acceptance, and an audit trail.
- *(The boundary that disappeared — single-shot → agent loop — was only ever an orchestration change: a different decision-maker over the same primitives at the same risk. That is exactly why it could be deleted rather than defended.)*

| | **1 · Copilot (read-only)** | **2 · AI Agent (acting)** |
|:---|:---|:---|
| **Orchestrator** | The agent loop | The same loop |
| **Tools bound** | `search_kb` · `get_workflow` · `where_am_i` · `read_page_state` · `highlight_step` · `run_walkthrough` · `ask_user` · `product_profile` | all of Copilot **+ `execute_step`** |
| **Explicitly NOT bound** | **`execute_step`** — absent, not refused (D8) | — |
| **Gated by** | the workspace mode setting | mode setting **+** per-workflow `autopilot` flag **+** certification (P4-M1) **+** a recorded acceptance |
| **Risk** | **~zero on the page** — nothing acts. The real risks are prompt regression and cost/latency | **Accountability transfer** — a wrong action ≫ a wrong answer |
| **What to build** | **Nothing — it exists.** | P4-M1 · **P4-M2** · P4-M3 + migration step 4 |

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

1. **The mode boundary becomes a billing control, not only a safety control** — which makes D8's *absence, not refusal* load-bearing twice over: a Copilot workspace must have no `execute_step` bound at all, never a refusal the model could be talked out of.
2. **The cost measurement still matters** — but for **margin per tier**, not for consolidation. The consolidation question is closed: D10 removed the cheaper tier outright rather than costing it. What each remaining tier costs to serve is still open (§7 Q6), and now sits on a thinner ladder — there is no cheap rung left to fall back to if Copilot turns out expensive at volume.

### D8 in practice — absence, not refusal

**The agent decides *whether to offer*; the gate decides *what is offerable*.** P4-M1 stays deterministic and server-side (the `autopilot` flag · workspace posture · certification). The agent picks from an allowed set and never decides the set — the `search_kb` pattern again.

The implementation rule that makes it safe: **don't tell the model it isn't allowed — don't give it the tool.** A workflow without the flag should have no `execute_step` bound for it at all. Otherwise the agent says *"I could do this, but your admin hasn't enabled it"* — leaking workspace configuration to end-users and generating support load for the founder. **Absence, not refusal.**

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

**Phase 4 survives; its UX half does not.** Three of its four modules are still needed — the
eligibility gate, the execution driver, the safety rails — and **P4-M2 is the critical path.** What
the loop absorbs is the *deciding when to offer*, which was Phase 4's discrete "act" button. M1 and
M3 become *more* load-bearing once that button disappears, not less: with no explicit act step, the
gate and the rails are the only things standing between a conversation and an action.

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
- **Chat-supplied:** conversational values only — often already known from the goal statement via P5-M1 parameter capture. These ride a **distinct typed message kind**: never written to `CopilotQuery`, never persisted to `sessionStorage`, masked in the visible transcript once consumed.

**Preserved guarantee.** Captured input values are masked at capture (P1-M12), so the agent structurally *cannot* replay a recorded value — every character it types came from the user, in this conversation. D3 extends that from a capture-time property to an **end-to-end** one.

**Preserved principle.** "Read-only sensing, never surveillance" (Phase 2) survives because D4 deletes continuous observation of typing: no `MutationObserver` on input, state read only on an explicit click, only booleans leave the page, and only inside a consented run.

### The known limitation — cross-origin iframes

Stripe Elements, Plaid, hosted checkout: the widget cannot see inside them, so it can neither highlight the specific field nor read fill state. Degradation is honest rather than broken — highlight the iframe region, ask in chat, rely on the D4 Continue affordance. The feature survives; only auto-detection is lost, and D4 already discarded that. Same story for shadow DOM and canvas-rendered inputs.

## 7. Open questions (blocking the design doc)

1. **Transport — the load-bearing one.** The deciding tools run on the server; `where_am_i`/`highlight_step`/`execute_step` run in the widget, and the page navigates mid-run. Options: (a) stateful server loop + persistent channel, (b) client-orchestrated loop, (c) **re-entrant/resumable — run state rides the wire, persisted in `sessionStorage`** (recommended: keeps the server stateless-ish, survives navigation for free, and is the pattern already proven twice by Sense hypotheses and the walkthrough's resume). **Update 2026-07-26 — option (c) now has a working implementation to design against**, not just a precedent: `widget/src/session.ts` (P5-M0 cut 1) is the generic slot store, with `walkthrough` and `chat` as live consumers and `agent-run` as the intended third. What is still open is the *wire* half — what the server sends back for the client to persist and replay — not the client-side substrate.
2. **Mode-3 certification bar** — require Phase-3 green validation before any acting run, or accept interim signals (recent successful walkthroughs/runs) until P3 lands? *(= the goal layer below §5 Q10.)* **Leaning conservative** under D9's liability framing: if mode 3 is a contractual boundary, interim signals are a weak thing to have promised on.
3. **Chaining scope for v1** — single-workflow goals first, chains later? *(= §5 Q5.)*
4. **How mode 3 is accepted** — D9 makes it a contractual line, so the toggle is probably not just a Studio switch: explicit acceptance, versioned terms, and a record of who enabled it and when. What exactly gets stored? Far cheaper now than retrofitted.
5. **Cross-origin iframe UX** — is "highlight the region + Continue" enough, or does the payment case want a bespoke affordance?
6. **Cost per mode (measurement, not a design choice)** — the real cost-per-question and p50/p95 of the agent loop on live traffic. **Sharper since D10**, not softer: the cheap single-shot tier it would have been compared against no longer exists, so every question now rides the loop and there is no lower rung to retreat to. Round one *is* the old fast path, so the expected delta is small — but "expected" is doing real work in that sentence and nothing has measured it. **Half-instrumented 2026-07-29:** every question now records the engine that answered, its rounds and its tool calls (§9 Gap 2), so the rounds-and-escalation half is answerable from live traffic; **token cost is still not recorded**, so the money half is not. Now a *margin* question rather than a consolidation one (D9 pricing), but it still sets tier prices and D7's spend caps.
7. ~~**Where the five existing toggles land per mode**~~ — **RESOLVED, then re-resolved.** 2026-07-27 made the two on-page toggles a *permission* the agent's judgment refined ("you MAY do this when it helps"). **D11 reversed that on 2026-08-02:** the switch is the whole decision again — on fires every positional answer, off fires none — because a switch that might or might not do anything cannot be demonstrated or supported. Both stay defaulted **ON**, which is the combination deliberately never shipped before (rule-driven *and* on by default); it is accepted now because the noise is bounded by structure rather than by the assistant's restraint, and because a Copilot the picker describes as pointing and guiding must be able to. Still open for `reasonEnabled`/`reasonImageEnabled`, which wait on the un-merged diagnostic path (§9 gap 3).

## 8. Migration path

**Stage 1 (extract the shared loop) and stage 2 (build the read-only agent on it) are done.** What
remains is the acting layer, gated on the modules in the acting section below.

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

### ⏸ Gap 1 — it knows the RECIPES, not the PRODUCT *(the biggest one)*

Everything the assistant knows is a recorded workflow: a sequence of clicks. So it can say **how** to create an account. It cannot say what a workspace *is*, how the plans differ, what "project" means here, or that the user doesn't need a new one for what they're attempting.

Real support skews heavily toward orienting questions — *"do I need X or Y?"*, *"what's the difference?"* — and today every one of them declines: correctly, and uselessly. **This is the difference between an assistant that understands the product and one that recites steps**, and it is the single biggest limit on how good mode 2 can feel.

The design already exists — **P5-M2 Product Profile** (the goal layer below, §G3): founder-authored structured prose (what it is · who uses it · core concepts · plans/roles · FAQs · never-say list), compiled into a synthetic `KnowledgeSource` so retrieval, approval and grounding are untouched, and surfaced to the answer prompt as a second evidence layer (**background may orient and redirect; only workflows may instruct**).

**Sequence it AFTER more workflows are recorded** — otherwise an improvement can't be attributed to the profile rather than to the KB finally having depth.

### ✅ Gap 2 — nothing records what the agent did *(CLOSED 2026-07-29)*

Verified in the code 2026-07-27: `CopilotQuery` logs the question, `answered`, `contextPath`, the Sense outcome and the Reason trigger — **but not which MODE answered, how many ROUNDS it took, or which TOOLS it called.**

Two consequences, and the second is the important one:

1. **The founder is blind.** After switching to Copilot mode nothing in Studio shows it behaving differently — no evidence the upgrade is doing anything.
2. **§7 Q6's measurement is currently impossible.** Escalation rate and cost-per-question are exactly the numbers that decide *"should AI Chatbot collapse into Copilot?"* — the founder raised that question himself, and his mode-2 verdict already leans toward yes. Without these columns the decision stays an opinion. *(**Overtaken 2026-08-02:** D10 answered the question without the numbers, on simplicity rather than cost. The columns still matter — for margin, and for noticing the floor firing — but they no longer gate a decision.)*

**Half of this closed 2026-07-29.** `server.ts` now emits one `copilot answer` log line per question — the scrubbed question, the configured **mode**, the **engine that actually answered** (`agent` \| `reason` \| `floor` — the engine and the mode come apart in both directions, so mode alone was never the right field), `covered`, `rounds`, **every tool call with the exact query it searched**, and on a decline the assistant's **own words**. Diagnosing one incident no longer means reading source. Two things forced it: a decline used to be indistinguishable from a decline that searched three times and found nothing, and the escalation short-circuited before the `CopilotQuery` write, so the agent's own reason was never stored anywhere — the surviving `CoverageGap` held the *diagnostic engine's* text, filed against content the KB actually had. That second half is fixed too: a mode-2 decline no longer escalates, so it reaches the write.

**And the columns landed the same day.** `CopilotQuery` now carries `mode` · `engine` · `rounds` · `toolCalls` (migration `20260728201609_copilot_query_answer_path` — four nullable columns, nothing back-filled, so a pre-2026-07-29 row still honestly reads "unknown"). Every engine reports through the same `onLoop` hook, so **the floor's `rounds: 1, toolCalls: 0` is a recorded fact rather than a claim** and one query compares them all without special-casing. Since D10, `engine: "floor"` is the value to watch: it is the only one that is not a mode, and a run of them means something upstream is failing.

**`engine` is the column that matters, and it is deliberately not `mode`.** The two come apart in both directions — the diagnostic path preempts the agent whenever the widget shipped page state, and the safety floor answers with no tools while `mode` still reads `copilot`. Storing only the configured mode would attribute both to the wrong engine and quietly corrupt the very comparison this exists to enable. Storing both makes the gap between intent and reality countable.

**What this unblocks.** Escalation rate, rounds per question, and how often the floor caught a failure — all now queryable rather than argued. It pairs with the roadmap §9 backlog's token-usage column for real cost analytics. What is still missing is the Studio surface: nothing in `web` reads these columns yet. *(The question they were built to settle — collapse the tiers? — was answered on other grounds by D10 before enough traffic accumulated to answer it with data. The instrumentation is not wasted; it just changed job, from deciding the ladder to watching the floor.)*

### ⏸ Gap 3 — fold the diagnostic path into the agent loop *(deferred with a hard prerequisite)*

**Where it stands.** Mode 2 ships with **two agent loops running side by side**: `diagnoseFromKB` (diagnostic questions — page state + expected-vs-actual) and `answerAsAgent` (everything else). A **deterministic trigger still decides which one a question gets** — Reason's selective trigger, with one exception added 2026-07-29: the fast-path-decline escalation is now keyed on `engineUsed !== 'agent'`, so a mode-2 agent decline is no longer retried through the diagnostic engine (the agent already held the KB tools that retry would take away, and the escalation was overwriting the agent's decline before anything was recorded). That trigger is the last hardcoded fork left in mode 2; every other "what kind of help is this?" decision is now the agent's.

**Why folding them is right eventually.**
- The trigger has the failure mode every rule has: it misses diagnostically-shaped questions phrased unusually, and over-fires on simple questions containing *"why"*.
- A question currently cannot be BOTH: *"why can't I invite someone — and what's the whole process?"* goes down one path or the other. Merged, one turn could read the page **and** pull the workflow.
- It is the last place the product decides FOR the user which kind of help they receive, which is precisely what D1 set out to remove.

**Why it was NOT done in stage 3, and must not be done casually.** `REASON_SYSTEM` is the most heavily tuned prompt in the product — [`sense-and-reason.md`](sense-and-reason.md) §B7.1 records **ten** diagnosis-quality rules, each learned from a real session it got wrong (read the on-page error first · never claim a control is disabled when the state says otherwise · never conclude "looks fine" from structure alone · look at the image before hedging · no speculative declines · …). That is scar tissue, not styling.

And it was **untestable by construction**: the question-set baseline never sends live page STATE, so diagnosis had *zero* automated coverage. Rewriting rounds of hard-won prompt behaviour with no way to detect a regression is the exact risk §8's "regression protection" exists to prevent — and it is not hypothetical: stage 3 introduced a 1-in-6 decline on a trivially-covered question, caught **only** because that path was measurable.

**Why this went unfixed so long, and what changed.** Testing diagnosis always meant "re-record something and click around", so it never happened — and the question-set baselines cannot fill the gap even in principle, because their cells are tuned to specific workflows in a specific workspace and die with it. A committed page state is the first copilot measurement that outlives the workspace it was captured in.

**The prerequisite — the HARNESS is built, the fixtures are not.** Make diagnosis measurable first: replay frozen page states (empty form · half-filled · invalid email · rejection banner showing) through `/answer` and assert what came back. The machinery for that now exists — a debug-gated capture hook in the widget, a fixture format, and a replay harness that scores each answer against the machine-checkable subset of the ten rules (plain language, every blocker addressed, decline-vs-diagnose, which evidence it reached for). **What is missing is the four captures themselves**, which need a workspace with an approved workflow to stand in. How to capture and run: [`e2e-testing.md`](../ops/e2e-testing.md) §11.

Two design points that are load-bearing rather than incidental, because the obvious version of each fails silently:

- **A snapshot alone measures a crippled engine.** The founder's expected-state artifacts are attached off the top SENSE hypothesis, so a fixture without sense binds only `get_page_image` — a third of the path goes unexercised while still reporting a rate. Fixtures carry both halves, captured from the same moment.
- **Fixtures name their workflow; they never store its ids.** Ids change on every reseed, and a fixture holding stale ones keeps reporting rates while testing an unlocalized engine. The harness re-resolves from the live sense plan each run and **skips** what it cannot resolve — an unrunnable fixture must never emit a number.

The same discipline runs through the scoring: a run that did not reach the diagnostic engine is excluded rather than counted, and the harness reports how many fixtures were *fully measured* so a shrinking suite cannot masquerade as a passing one.

**Priority: low.** Diagnosis works today, and mid-walkthrough diagnostic questions already reach it. What the merge buys is consistency and combined-evidence answers, not capability. Sequence it behind anything that grows the KB past a single workflow — with one workflow, half of the agent's judgment has nothing to exercise it.

### ⚠ Not a gap in the code — the KB has almost no depth

Recorded here because it distorts every judgment about mode 2: through 2026-07-27 the test workspace held **one** approved workflow ("Create an account", 6 steps), so three of the agent's abilities had **never actually fired** — searching with its own wording (nothing else to find), choosing between workflows, and asking *"did you mean X or Y?"* (nothing to disambiguate). A second workflow ("Log in") was recorded on 2026-07-29, which is what made the answer-path bug reproducible at all; two workflows is enough to expose choosing-between, still not enough to judge retrieval at depth.

Mode 2 was verified against what a single workflow can exercise. **Recording two or three more is the cheapest way to test the half that is currently theoretical**, and it gates honest evaluation of Gap 1.

### Suggested order

**~~Gap 2 (logging)~~ ✅ done 2026-07-29 → more workflows → Gap 1 (product profile) → Gap 3 (diagnostic merge).** The record now exists and accrues from every question, so the mode-1-collapse question answers itself the longer it runs before anyone asks it. What is left is sequenced by the KB: record two or three more workflows first, because everything after this is more honest to evaluate once the KB has depth. *(A Studio surface for the new columns is the small remainder of Gap 2.)*

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
> the UX half — deciding *when* to offer to act — is absorbed by the loop above. **P4-M2 is the
> critical path.**

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
- **A second audience on the approval model** (`portal` joins with the V2 portal track, `agents` with Phase 6 — [`interop.md`](interop.md)): `copilot | autopilot` — a per-workflow **"may be executed on end-users' behalf"** flag on the same `(sourceId, segmentIndex)` key. Founder opt-in per workflow, one click, reversible. Absence = never executable.
- **The guided walkthrough is the stepping stone.** Before acting *for* the user, the same machinery can **guide** them — Sense (Phase 2, P2-M3) already highlights the *current* step on demand; P4-M0 extends that into a sequential, progression-aware walkthrough of the whole remaining workflow. Zero side effects, same locator resolution; it ships first and is independently valuable.
- **The user stays in charge:** consent to start, visible step-by-step execution, pause/abort at any moment, confirmation on destructive steps.

**Done when (sketch):** an end-user asks → gets a grounded answer → consents → **watches the widget complete the workflow in their own session** — inputs prompted, destructive steps confirmed, any unverifiable step ending in a safe stop — and only workflows the founder approved for autopilot **and** Phase-3 validation currently certifies green are ever offered.

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

**Why the acting modules (M1…M3) wait for Phase 3's replay core** *(the phase itself opened ahead of Phase 3 — sequencing decision 2026-07-15; P4-M0 is zero-acting and never needed these rails)*:
1. **The engine learns where failure is the deliverable.** Locator healing, step semantics, outcome verification get hardened in the sandbox — where a failed replay *is* drift detection — before ever touching a live user's data.
2. **Validation is Autopilot's certification layer.** Eligibility = **approved for autopilot AND recently validated green**. A workflow Phase 3 can't replay cleanly is never offered for execution. This rail exists only once Phase 3 lands — until then, M1's eligibility gate takes pluggable interim signals (the 2026-07-15 sequencing decision).
3. **The loop closes both ways.** An Autopilot safe-stop in production ("element not found at step 3") is a **live drift signal** feeding Phase 3's freshness dashboards — production telemetry complementing sandbox validation.

**Engineering seam:** one shared **replay core** (locator walk + healing, step semantics, outcome verification) with three drivers — Phase 3's sandbox runner, Phase 4's widget driver, and (when that track is built) V3's company-agent extension ([`company-agent.md`](company-agent.md)). The `retrieval.ts` single-seam pattern, applied to execution.

**Phase 2 (Sense) feeds it too:** Autopilot's **mid-workflow entry** — "you're on step 3; want me to finish the rest?" — consumes Sense's workflow/step localization (the read-only locator probe), so the offer can start from where the user actually is instead of replaying from step 1. **And P2-M5 (Reason) hands it the agent loop:** the read-tool reasoning skeleton (gather evidence → think → gather more → conclude, [`sense-and-reason.md`](sense-and-reason.md) Part B) is the loop Autopilot extends with act-verbs — P4 adds hands to a brain that already exists.

---

## A4. Candidate modules (draft — locked at phase planning)

| Module | What it is | Notes |
|:---|:---|:---|
| **P4-M0** | **Guided walkthrough** — sequential, progression-aware step-through of the whole remaining workflow (highlight step k → detect completion → advance to k+1); no acting | ✅ **Built 2026-07-15** (§8 as-built). Builds on **Sense's P2-M3** (the config-gated single-step highlight) + Sense's localization. Same locator resolution, zero side effects. Shipped first. |
| **P4-M1** | **Autopilot gate** — the `autopilot` audience flag + the validated-current certification check (offer execution only on approved **and** green-validated workflows) | Mirrors `CopilotApproval`; consumes the Phase-3 signal. |
| **P4-M2** | **Widget execution driver** — consent UX, visible step-by-step run, per-input prompts, pause/abort/takeover, resume across full-page navigations | The end-user-facing heart of the phase. |
| **P4-M3** | **Safety rails + telemetry** — destructive-step confirmation, safe-stop semantics, per-run audit log, drift feedback to Phase 3 | A bad action is worse than a bad answer — this module is why founders can trust the toggle. |

*(The **replay core** itself is a Phase-3 deliverable consumed here — not a Phase-4 module.)*

---

## A5. Design questions to answer (carry into phase planning)

> **Design input — steal their permissions UX wholesale for Phase 4.** Claude for Chrome ships a proven, user-tested control vocabulary that maps almost one-to-one onto Q1–Q4 below: **ask-before-acting vs. act-within-approved-boundaries** (two explicit modes), **per-action confirmation for irreversible steps** (forced even under "always allow"), **hard-blocked action categories** (payments, permanent deletions, credential entry — blocked regardless of permissions), **admin allowlists/blocklists**, and a **reviewable action history**. Adopt FlowBuddy analogues of each rather than inventing a new vocabulary — it shortens design, and citing the analogy borrows their published safety credibility. Full model + attack-success-rate numbers: [`competitive-claude-chrome.md`](../product/competitive-claude-chrome.md) §3, §5.

1. **Consent & visibility UX** — confirm once at the start, or before each step? Default posture: **visible guided execution** (highlight → act, the user watches each step) over invisible automation — slower, but it *builds* trust instead of asking for it. Where does "show me" end and "do it" begin in the UI?
2. **Destructive steps** — submits / deletes / payments: always require a per-step confirmation? Founder-configurable per workflow? Are some step types (payment fields) excluded from autopilot outright?
3. **Input values** — masked at capture → prompt per field at run time; when is prefilling from the user's question safe, and does the user confirm every prefill?
4. **Abort / takeover / safe-stop semantics** — the user can stop at any moment; any verification failure = stop, explain what was and wasn't done, hand back control. **Never guess forward.** What does "what was already done" reporting look like mid-workflow?
5. **Execution limits (the widget has no extension privileges)** — cross-origin iframes and OAuth popups **cannot be driven** from a page script; workflows containing such steps must be detected and marked ineligible (or downgraded to "show me") **at approval time, not discovered mid-run**. Full-page navigations unload the widget — the run plan must persist (e.g. sessionStorage) and **resume after re-mount** (the snippet is on every page). The recorder's R1/R8/R9 lessons map over almost one-to-one.
6. **Eligibility & staleness** — how fresh must the green validation be (validated within N days? since the last detected app change?), and what happens when certification lapses mid-offer: hide the offer, or downgrade to "show me"?
7. **The execution-plan source** — distilled `KnowledgeItem` steps deliberately **don't** carry locators/`expected_outcome` (those live in the raw `KnowledgeSource.manifest`). Compile a per-workflow **execution plan** (ordered steps: locators + route + expected outcome + input slots) at approval/validation time, rather than parsing the manifest at run time. Likely shared with Phase 3 (the validation runner needs the same artifact).
8. **Per-user variance** — the founder records as an admin; an end-user's **role / plan / feature flags** may hide the very button the workflow clicks. Treat as a verification failure (safe-stop + explain), and consider surfacing "this action may need permission X" from repeated same-step failures.
9. **Plan integrity & tenancy** — the widget fetches the plan over the public-key path: key-scoped, origin-checked, rate-limited like `/answer`; the plan must never contain steps from unapproved workflows (**no-leak, applied to execution**). Does the plan need server-side signing to prevent tampering in transit/storage?
10. **Naming & positioning** — "Autopilot" vs "AI Agents mode" as the end-user-facing label; founder-facing toggle copy ("Allow FlowBuddy to perform this workflow for your users"); how the offer is phrased in-chat.

---

## A7. Data-model deltas (sketch, additive)

- **`AutopilotApproval`** — the third audience flag, keyed `@@unique([sourceId, segmentIndex])` + `workspaceId` (mirrors `CopilotApproval`; survives reprocess). *(Or: generalize into one per-audience table alongside the V2 portal's `PortalPublication` (V2 · P0) — decide at build time.)*
- **`ExecutionPlan`** — the compiled, replay-ready artifact per approved workflow: ordered steps `{ locators, route, expectedOutcome, inputSlots, destructive? }`; produced at approval/validation time; shared with the Phase-3 runner.
- **`ExecutionRun`** — the audit log: workspace, workflow key, started/finished, steps completed, outcome (`completed | aborted | safe_stop` + reason), end-user feedback. Safe-stop reasons feed Phase-3 drift signals.

---

## A8. P4-M0 — Guided walkthrough: as-built (2026-07-15)

**What shipped:** under a positional answer the widget offers **"Walk me through it"**; on the user's click the chat panel closes, a compact **step card** (shadow-root overlay, docked at the launcher corner) shows *instruction k/N*, the step's element gets a **sticky spotlight** (the P2-M3 highlight minus the 6s auto-clear), and the widget **observes** the user completing each step — through the whole remaining workflow, **surviving full-page navigations**. **Advancement is manual-only (user decision 2026-07-15): detection ACKNOWLEDGES — "Detected ✓ — hit Next to continue" — and the pointer moves forward exclusively on the user's Next click**, including after a recorded navigation (the card resumes on the new page with the step acknowledged, waiting for Next). The user performs every action; the widget never clicks, fills, or navigates. Config-gated per workspace (`copilotWalkthrough`, requires Sense), served via `GET /v1/copilot/config`. **Default flipped to ON for new workspaces 2026-07-27** alongside the Copilot-mode default: it was OFF because a fixed rule offered a walkthrough under *every* positional answer, but in Copilot mode the assistant decides per message whether the offer helps, so the switch became a permission rather than a rule. Still zero-acting; the founder switch still wins; existing workspaces untouched.

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
`data-flowbuddy-debug` (mode, from→to, corrections).

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

**Cross-nav resume:** the session persists in `sessionStorage` (`flowbuddy.walkthrough.v2`; founder-derived plan data, keyed to the public key, 30-min TTL from last transition — since P5-M0 cut 1 the versioning/scoping/TTL mechanics live in the shared `widget/src/session.ts`, which the chat thread now uses too). On boot, a stored session (checked **before** any fetch) pulls the route's shard and reconciles: fresh copy swapped in when served; a workflow **absent from a shard its route belongs to = revoked → ends silently** (absence = not approved, applied to resumption); fetch failure proceeds on the persisted copy bounded by the TTL. The stored pointer is **never trusted blindly** — resume runs the same self-correction as every tick (see above), so a reload that reset the form resumes at the first unfinished step, never at the stale one, while true mid-workflow resumes (earlier steps on previous routes don't resolve here) pick up exactly where the user left off.

**Run analytics:** `POST /v1/copilot/walkthrough` (own rate bucket; every field clamped like the sense wire; `started` verifies the key against `CopilotApproval` — no-leak, title from the approval snapshot) → one **`CopilotWalkthrough`** row per run: `startStep/lastStep/totalSteps`, `autoAdvances`/`manualAdvances` (the auto:manual ratio measures detection quality for P4-M2), `outcome` `active|completed|aborted|stalled` (+`stalledAtStep`; a run advancing past a stall recovers to `active`). A row still `active` past the TTL reads as abandoned — no sweeper by design.

**Where everything lives:**

| Piece | Where |
|---|---|
| The module (state machine · card · detection · storage · resume) | `packages/widget/src/walkthrough.ts` |
| Probe keeps EVERY step's element · exported primitives · sticky spotlight · `isFilled` = `checked` for checkbox/radio | `packages/widget/src/sense.ts` |
| `readElementState` — the shared element-state vocabulary (Reason ships it; the walkthrough gates on it) | `packages/widget/src/reason.ts` |
| Offer pill on positional answers · config flag · boot resume · show-me suppressed mid-run | `packages/widget/src/index.ts` |
| Card + offer styles (design tokens, shadow-root, overlay-only) | `packages/widget/src/styles.ts` (`.fb-walk-*`) |
| Config field + `walkthrough` gate bucket + the run endpoint | `packages/api/src/server.ts` |
| `Workspace.copilotWalkthrough` + `CopilotWalkthrough` (migration `20260715155642_walkthrough_guided`; default → ON for new workspaces in `20260727013457_copilot_abilities_default_on`) | `packages/db/prisma/schema.prisma` |
| Studio toggle (under "Show me", disabled without Sense, toasts) | `packages/web/components/dashboard/copilot-workspace.tsx` + `lib/copilot-settings{,-actions}.ts` |

**Deliberate cuts (fast-follows, not gaps):** the offer rides only answers that carry a `position` (citation-only entry later); no per-step `expected_outcome` in the sense plan — detection uses `isFilled`/click/`postRoute`/next-step-resolves (richer outcome markers arrive with P4-M1/Phase-3's `ExecutionPlan`); the Studio "Walkthroughs" analytics card reads the table later — the data lands from day one.

---

> **Not in Phase 4:** free-form agentic browsing (never — grounded actions only), cross-app workflows, desktop/native apps, autonomous runs without an end-user present, and building the replay core itself (Phase 3 owns it).


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

### P5-M0 — Conversational foundation

1. **Continuity bias (deterministic, free) — ✅ BUILT + USER-VERIFIED 2026-07-26 (cut 2).** The widget sends the previous answer's citation keys (`context.lastCited: [{sourceId, segmentIndex}]`, server-validated against `CopilotApproval` — no-leak); retrieval boosts items from those workflows. As built:
   - **Weighted in BOTH scoring paths, below the two measured signals** — `+2` on the keyword fallback (route/sense are `+3`) and `CONTINUITY_RRF_WEIGHT = 1` in the fusion (route/sense are `2`). Route and sense are measured *now*; continuity only recalls a turn ago, and that gap is what lets a user change subject. A bias, never a filter.
   - Keys come from the **last `assistant.answer`**, so an intervening decline is transparent rather than resetting the thread. Capped at 4, deduped, and omitted from the payload entirely when empty (a first question is byte-identical to before).
   - The approval re-check runs **concurrently with the sense resolution** (`Promise.all`), so it adds no serial round-trip to the path every question rides.
   - **Fixed a cut-1 gap it exposed:** the restore path was dropping citation keys, which would have broken continuity precisely after a navigation — the case cut 1 exists for.
   - **Also decoupled `copilotShowCitations`** — it was making the engines return `citations: []`, which would have silently disabled continuity for those workspaces *and* had already been emptying their Analytics "top workflows by citations" card. It is now a presentation gate at the API response boundary (titles nulled; keys and logging intact). See [`internals/copilot.md`](../internals/copilot.md).
2. ~~**Query condensation (LLM, gated)**~~ — **DROPPED 2026-07-26 (revisit only on evidence).** The plan was a cheap-model hop condensing history + question into a standalone retrieval query. Cut 2 took the common case (*"and then what?"* about the SAME workflow) deterministically, for free, with no latency. What remains is the narrower case of a follow-up that *shifts* to a different workflow — and that is exactly what a mode-2 agent calling `search_kb` with its own formulated query does natively (this doc. Paying a permanent per-question latency tax and a fast-path prompt-regression risk for a slice the next milestone likely absorbs is the wrong trade.
3. **Chat persistence — ✅ BUILT 2026-07-26 (cut 1; typecheck + build green, not yet user-verified E2E).** As built, and deliberately more than a chat feature:
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

> **⭐ Now the TOP capability gap for Copilot mode (recorded 2026-07-27).** Mode 2 shipped and was user-verified, and this is the clearest limit on it: the assistant knows **recipes, not the product**. It can say *how* to create an account; it cannot say what a workspace is, how the plans differ, or that the user doesn't need a new project for what they're doing — so every orienting question ("do I need X or Y?", "what's the difference?") declines: correctly, and uselessly. **Sequence it after more workflows are recorded**, or an improvement can't be attributed to the profile rather than to the KB finally having depth. See this doc.
>
> **Direction evolved 2026-08-01 — design home moved:** the derivation-first successor of this module (same goal, same two-evidence-layer answer rule, but **extracted from narration and approved page-by-page** instead of founder-authored) is [`application-intelligence.md`](application-intelligence.md).

- **Authoring (Studio, KB page tab):** founder-authored structured prompts + free text — what the product is · who uses it · core concepts/terms · plans/roles · FAQs · never-say list. Optional starter: distill a draft profile from the recordings' narration transcripts (the understanding is already in the founder's voice there).
- **Storage — reuse the whole pipeline:** authoring truth in a `ProductProfile` row; on save, compiled into a synthetic `KnowledgeSource` (`kind:'product'`) whose `KnowledgeItem`s (one per concept/FAQ/section, embedded) are delete-and-recreated. `CopilotApproval` rows written automatically (founder-authored = approved by authorship), so retrieval's approved-only invariant holds untouched. Citation chip reads **"Source: Product profile."**
- **Answer synthesis:** the prompt names two evidence layers — **PRODUCT BACKGROUND** (orient, explain, compare, redirect) and **WORKFLOWS** (instruct steps) — anchored by POSITION, framed by the GOAL. Background may redirect ("you don't need a new project for that"); only workflows may instruct; nothing may be invented.

### P5-M3 — ~~The goal router (the tier offer)~~ — **DISSOLVED by D9**

There is no tier router. Choosing between Tell, Guide and Do is not a routing decision made once per
goal; it is the agent picking a tool, turn by turn. The module's whole job is absorbed by the loop.

### P5-M4 — Goal-driven execution orchestration (Tier 3's brain; consumes P4-M2)

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
3. **Destructive steps under hands-off Tier 3** — always pause-and-confirm mid-run (recommended: the one exception to no-intervention) vs. founder-flagged fully-automatable workflows?
4. **Tier recommendation** — copilot recommends one tier, user picks (recommended) vs. user always chooses unprompted?
5. **Chaining scope for Tier 3 v1** — single-workflow goals first, chains later (recommended) vs. chains from day one?
6. **`CopilotQuery.goal` analytics column** — now (recommended) or defer?
7. **Profile authoring shape** — structured fields + free text (recommended) vs. one free-text box?
8. **Profile retrieval slot** — overview item always ships as background + rest compete (recommended) vs. pure competition?
9. **Clarifying questions** — max one at a time, only when the KB supports both readings (recommended)?
10. **Tier-3 certification bar** — require Phase-3 green validation before any hands-off run (safest) vs. interim signals (recent successful walkthroughs/runs) until P3 lands?

## G6. Risks

- **Latency** — the loop can take several model rounds before it answers; round one *is* the old fast path, so simple lookups must not get slower. (The condensation hop this risk originally described was dropped — cut 2 took the common case for free.)
- **Untrusted round-trips** — `goal`/`lastCited` come from any page holding the public key: cap, de-angle, re-verify keys, treat as hints that bias framing, never facts (the proven Sense posture).
- **Prompt regression** — the posture rewrite touches the fast path all questions ride: re-run the Sense/Reason E2E legs before calling it done.
- **Tier-3 blast radius** — hands-off execution concentrates all of Phase 4's "a bad action ≫ a bad answer" risk into one consent moment: per-goal confirmation must show exactly what will run, with the values already known (unknown inputs are asked mid-run, in the chat); narration + safe-stop are the runtime backstops; certification (Q10) bounds staleness.
- **Profile bloat/abuse** — per-field caps and an item-count cap at compile; a bloated profile competes against itself in retrieval.

## G7. Dependencies & sequencing

- **P5-M0…M2 have no Phase-3/4 dependency** — they build on the shipped copilot and improve every tier immediately (including the already-shipped Tier 2, whose chat context currently dies on navigation).
- **P5-M3** needs M1 (goals) and consumes P4-M0 (Guide) as its first non-chat tier.
- **P5-M4** is gated on **P4-M2** (the execution driver — not yet built) and consult **P4-M1/P3** for eligibility. Build order inside Phase 4 is unchanged; this phase adds the brain on top, not a bypass.

---

> **Not in Phase 5:** server-side conversation storage or cross-device history, long-term per-user memory, free-form agentic browsing (never — goals ground to approved workflows or they are not pursued), portal articles (V2).
>
> **Proactive/unprompted help is PARKED, not rejected** — user-flagged 2026-07-26 as worth revisiting; the reasoning and the likely shape live in this doc.
