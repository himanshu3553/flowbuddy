# FlowBuddy — The Unified Agent (direction + decision record)

> **One chat, one agent, one grounded tool surface.** Instead of a copilot that *routes* a user into one of three separate mechanisms — an answer (Phase 1), a walkthrough (P4-M0), an execution run (P4-M2) — FlowBuddy becomes a single agentic loop for which **Tell · Show · Do are tools it may call, turn by turn**. The user stays in one conversation; the agent moves up and down the intensity ladder as the task demands, narrating what it does and asking for what it needs. **The division of labor that survives: the agent deliberates, the grounded primitives act.**

- **Status:** 📝 **DIRECTION — decisions locked in conversation 2026-07-25; the design is not yet written.** This doc records *what was decided and why*, not *how it is built*. The full design follows once the open questions in §7 are settled.
- **Supersedes in spirit, not yet in text:** the Phase-4 / Phase-5 "hands vs. brain" split ([`phase-4-autopilot.md`](phase-4-autopilot.md), [`phase-5-converse.md`](phase-5-converse.md)). Those docs remain authoritative for their module detail; where this doc and they disagree on *structure*, this one is newer.
- **Companion docs:** the substrate → [`phase-1-copilot.md`](phase-1-copilot.md) · position + diagnosis → [`phase-2-sense.md`](phase-2-sense.md) · the acting primitives → [`phase-4-autopilot.md`](phase-4-autopilot.md) · goals/conversation → [`phase-5-converse.md`](phase-5-converse.md) · status map → [`roadmap.md`](roadmap.md) · outward-facing tools → [`phase-6-interop.md`](phase-6-interop.md)

---

## 0. How the three connect (plain language — start here)

Three names get used a lot; they are not three products.

| | In one line |
|:---|:---|
| **Phase 4** | **The hands.** The machinery to find a button on a live page, click it, type into it, and check that it worked. Mechanical, hard, unavoidable. |
| **Phase 5** | **The brain.** Remembering the conversation, understanding what the person is trying to *accomplish*, knowing the product well enough to redirect them. |
| **The unified agent** | **The decision to stop shipping those as separate features.** Not "a copilot, plus a walkthrough feature, plus an autopilot button" — one assistant that reaches for whichever it needs, moment to moment. Shipped as **three founder-selectable modes** (below), because *acting* is a different kind of promise from *advising*. |

### What it looks like to a user

Someone on the billing page asks *"how do I add a team member?"*

1. It notices they're on the wrong page and says so — **answering.**
2. It offers to take them there and highlights each step — **showing.**
3. Halfway they ask *"why is Invite greyed out?"* and it explains — **diagnosing.**
4. It needs the teammate's email, so it highlights **the app's own** email field and asks them to type it there — **input, safely** (D3).

Steps 1–4 are one continuous conversation and the user never picks a *kind* of help. **That fluidity is the point**, and it is unreachable while Tell, Show, and Do are separate mechanisms with separate entry points. Note what has and hasn't happened: the assistant has explained, pointed, and asked — **the user has performed every click.**

Then:

5. They say *"just finish it for me,"* and it does the rest, narrating as it goes — **doing.**

**Step 5 crosses a line the first four do not.** Up to step 4 the user is the actor and the assistant only changes what they know; at step 5 **FlowBuddy becomes the actor and accountability transfers.** "Confidently wrong about which button" is an unhelpful tooltip in step 2 and a liability event in step 5. That seam is why there are three modes rather than one product (D9) — and steps 1–4 are available *without* ever crossing it.

### The three modes

| Mode | What it is | Can act? |
|:---|:---|:---:|
| **1 · Copilot** | Today's product, unchanged — and the fallback underneath the other two | No |
| **2 · Agent (read-only)** | The unified loop: steps 1–4 above, fluid, one conversation | No |
| **3 · Agent (acting)** | Adds step 5 | **Yes** |

Founder-selected per workspace, strictly ordered (mode 3 *is* mode 2 plus one tool), and **also the pricing tiers**. The wall sits where the liability is — between 2 and 3, not between 1 and 2. Full build detail: §4, "D9 in practice."

### What this did and did not change

**It did not cancel Phase 4 or Phase 5.** The hands still have to be built (`execute_step` — P4-M2, the critical path). The brain still has to be built (conversation, goals, product understanding — P5-M0…M2). Every safety module survives, and two of them matter *more* now (§5).

**What it changed is the packaging** — and one real idea got thrown away: that the **end-user** picks an intensity before being helped. Now the agent picks, per message, from a set of grounded tools. *(Not to be confused with D9: the **founder** still picks a deployment mode, once, per workspace. Founder sets the ceiling; the agent chooses beneath it.)*

### Where we actually are

| | | Mode |
|:---|:---|:---|
| **Done, live** | Answering · knowing where the user is (Sense) · diagnosing why they're stuck (Reason) · guided walkthroughs (P4-M0) | 1 |
| **Next** | **P5-M0** — make the conversation survive page changes. Today it resets on navigation, including navigations the walkthrough itself causes. **Ships to mode 1 as well — it's a bug fix, not an agent feature.** | 1 + 2 |
| **After that** | Turn the answering path into the agent loop, **read-only tools first** — no new risk surface, and it proves or falsifies the whole thesis cheaply | 2 |
| **The big one** | Teaching it to actually click and type (**P4-M2**) — the last piece and the riskiest | 3 |

**The destination:** a customer records their product once, approves what the assistant may touch, and their users get something that explains, points, and does — always inside approved workflows, never improvising.

*The rest of this doc is the engineering register: §1–2 the argument and the safety line · §3 the tool surface · §4 the locked decisions · §5 roadmap consequences · §6 the PII finding · §7 what's still open · §8 build order.*

## 1. Why — help is not modal, but the product is

Today the copilot decides *once*, at answer time, by heuristic, which kind of help you get. Then you are locked into it:

- Mid-walkthrough, "wait, why is this button greyed out?" cannot be answered — that is Reason, on a different path.
- "Actually, just do the rest for me" cannot be said.
- The walkthrough offer hangs off positional answers only; there is no general goal → intensity dispatch.

Real help doesn't work that way. A colleague helping you explains, points, takes the keyboard, hands it back, and explains again — fluidly, within one conversation. **That fluidity is unreachable with bolted-on tiers and natural with one agent.** That is the product argument, and it is the primary one.

The secondary argument is architectural: if the copilot is itself an agent over a grounded tool surface, **that tool surface is [Phase 6](phase-6-interop.md).** Expose the same tools over MCP and a third-party agent gets exactly what FlowBuddy's own agent has. P6-M0's export compiler and the internal tool layer converge into one artifact — and [Version 3](v3-company-agent.md)'s company agent becomes a third caller of it rather than a third implementation.

## 2. The line — unify deliberation, never actuation

**Unify the deliberation layer.** Deciding-what-to-do is today scattered across four places: the fast-path answer prompt's `covered`/decline verdict, Reason's selective trigger, the walkthrough-offer heuristic, and the Sense tie-break. Merging those into one loop is a clean win and removes real glue code.

**Do not unify the actuation layer.** Locator resolution, acting, and `expected_outcome` verification stay deterministic, typed, and *not* model-authored. The moment an LLM free-forms DOM actions, the grounding guarantee — *only executes workflows the founder recorded and approved* — is gone, and FlowBuddy is a [Claude-for-Chrome-class](competitive-claude-chrome.md) improviser with worse distribution. That guarantee is the entire differentiation.

> **The invariant: the agent's action space is the KB, not the DOM.**
> It chooses *which grounded primitive to invoke*, never *what to do on the page*. `execute_step(workflowId, k, inputs)` — never `click(selector)`.

**Enforce it in the tools, not the prompt.** `search_kb` can only ever return approval-constrained rows, so the agent cannot *request* ungrounded knowledge. This is the same discipline as masking values at capture rather than filtering them at replay: structural, not policy.

## 3. The tool surface — mostly already built

The striking property of this direction is how little of it is new. The primitives exist; what changes is that the agent *chooses* among them instead of a pipeline hardcoding the order.

| Tool | What it does | Where it already lives |
|:---|:---|:---|
| `search_kb` | Approval-constrained hybrid retrieval | ✅ `synthesis/retrieval.ts` (P1-M3) |
| `get_workflow` | Distilled per-workflow steps | ✅ P1-M2 + [`kb-step-distillation.md`](kb-step-distillation.md) |
| `where_am_i` | Read-only locator probe → workflow + step | ✅ `widget/src/sense.ts` `probeForAsk` (P2-M0/M1) |
| `read_page_state` | Structured field state, **values masked** | ✅ `widget/src/reason.ts` (P2-M5) |
| `highlight_step` | Sticky spotlight on the host page | ✅ `widget/src/sense.ts` `spotlight` (P2-M3) |
| `run_walkthrough` | Guided, user-paced stepping | ✅ `widget/src/walkthrough.ts` (P4-M0) |
| `ask_user` | Clarify · prompt for input · confirm | 🔄 partial — the Sense tie only, today |
| `product_profile` | Founder-authored product understanding | 📝 P5-M2 — to build |
| `execute_step` | Resolve locator → act → verify | 📝 **P4-M2 — to build (the critical path)** |

**Reason is already an agentic loop.** `diagnoseFromKB` runs a read-tool loop over expected-vs-actual — the phase docs call it "the skeleton Phase 4 inherits." The unified agent is not built from scratch; it is that loop **promoted to the main path** and given more tools.

## 4. Decisions locked (2026-07-25)

| # | Decision | Rationale |
|:---:|:---|:---|
| **D1** | **One agent, one interface.** Tell · Show · Do are tool choices per turn, not tiers routed to once. | Help is not modal; users must be able to move between intensities mid-task without leaving the thread. |
| **D2** | **Triage per question, not a global setting.** Depth follows question difficulty, decided at ask time. The one-hop fast path is preserved as the agent's first move; the loop is the *escalation*. | Founders cannot answer "fast or thorough?" for traffic they haven't seen. The system already makes this call — Reason's selective trigger. Simple lookups must not pay for hard questions. |
| **D3** | **Point-and-type for sensitive input.** For anything sensitive, the agent **highlights the host app's own field** and asks in chat; the user types **into the app**, not into the copilot. | The value never enters FlowBuddy — not the chat, not `/answer`, not the DB, not `sessionStorage`. The app's own validation, autofill, password managers, and PCI boundary all keep working. See §6. |
| **D4** | **Manual-only advancement on input steps.** No auto-detection of "the user finished typing." An explicit **Continue** affordance (plus "done" typed in chat) moves the run forward. | `filled ≠ done` — an email field is "filled" at `a@`. Multi-field steps have no observable completion moment. Advancing early means acting on a half-filled form in a live account; waiting costs one click. Cross-origin iframes force manual anyway — one consistent behavior beats two. |
| **D5** | **Sensing informs, the click decides.** Masked state (`filled`/`valid`/`invalidReason`) is read **on** the Continue click to validate and to write better prompts — never to advance. | Turns a blind march into a failed step into an honest *"that email isn't being accepted — the field is showing a format error."* Reason, applied inline and mid-run. |
| **D6** | **Never infer intent; always stay oriented.** The agent must never infer the user finished typing — but it **must** detect that the page navigated or the DOM changed underneath it. | Users will fill a field and hit the app's *own* Save before touching Continue. Without navigation detection the agent waits for a click on a page that no longer exists. These are different mechanisms and conflating them is a bug. |
| **D7** | **Founder control = capability posture + spend cap, not a latency dial.** One control over *what the copilot may do* (answers only · in-context help · full agent), with the existing five toggles as advanced disclosure, paired with a per-workspace cost ceiling. | A speed dial exposes internal architecture as a setting and is wrong for half of any workspace's traffic. Capability and spend are things a founder genuinely has an opinion about; latency follows from them. |
| **D9** | **Three operating modes — and the boundary is at *acting*, not at *the agent*.** `1 Copilot` · `2 Agent (read-only)` · `3 Agent (acting)`, founder-selected per workspace, strictly ordered. **These are also the pricing tiers** (decision 2026-07-26). | Tell and Guide are both *copilot* — the user is still the actor, and you are only changing what they know. **Do is not one more rung; it transfers accountability.** "Confidently wrong about which button" is an unhelpful tooltip in Guide and a **liability event** in Do — decisive in regulated verticals (neobank, fintech, health). But the read-only unification carries **~zero** added risk, so gating it behind the risky half would deny the fluent copilot to exactly the cautious buyers who benefit most. Put the wall where the liability is. |
| **D8** | **Conversational offer, structured consent.** *"Want me to do this for you?"* becomes a **move the agent makes**, not a payload the server attaches to positional answers — but the **commitment moment stays a typed affordance**, never free text the model interprets. | The offer needs judgment (proactive · reactive · escalating mid-walkthrough · silent) that a hardcoded pill can't express. Consent needs an audit boundary: when someone asks *"did this user authorize this run?"*, the answer must be a DB row, not the model's reading of "ok sure why not." |

### D9 in practice — the three modes (the build spec in miniature)

**Two boundaries, and they are different kinds of boundary.**

- **1 → 2 is an orchestration change.** A different decision-maker over the *same* primitives, with the same risk profile. Instantly reversible: flip back and you are on the deterministic path.
- **2 → 3 is an accountability change.** Same orchestrator, one more tool bound, plus the gate and the rails. **This is the contractual line** — the only boundary that needs terms, acceptance, and an audit trail.

| | **1 · Copilot** | **2 · Agent (read-only)** | **3 · Agent (acting)** |
|:---|:---|:---|:---|
| **Orchestrator** | Today's deterministic pipeline — `/answer` fast path · Reason's selective trigger · the walkthrough pill on positional answers | The agent loop (`diagnoseFromKB` promoted to the main path) | The same loop |
| **Tools bound** | n/a — the pipeline hardcodes the order | `search_kb` · `get_workflow` · `where_am_i` · `read_page_state` · `highlight_step` · `run_walkthrough` · `ask_user` · `product_profile` | all of mode 2 **+ `execute_step`** |
| **Explicitly NOT bound** | — | **`execute_step`** — absent, not refused (D8) | — |
| **Gated by** | the existing five feature toggles | the workspace mode setting | mode setting **+** per-workflow `autopilot` flag **+** certification (P4-M1) **+** a recorded acceptance |
| **Risk** | Shipped, known | **~zero on the page** — nothing acts. The real risks are prompt regression and cost/latency | **Accountability transfer** — a wrong action ≫ a wrong answer |
| **What to build** | **Nothing — it exists.** Keep it working; it is also the internal fallback for modes 2 and 3 | Migration steps 2–3 (§8) | P4-M1 · **P4-M2** · P4-M3 + migration step 4 |

**Strictly ordered, not à la carte.** Mode 3 *is* mode 2 plus a tool, so acting cannot exist without the agent loop.

**Two triads — do not conflate them.** **Tell / Guide / Do** is *what the user receives*. **Copilot / read-only / acting** is *how it is orchestrated and what is permitted*. Guide exists in modes 1 and 2 — the same `walkthrough.ts`, reached two different ways (a deterministic pill vs. an agent offer).

**Invariant across all three modes:** one KB, one approval model, one retrieval seam, values masked at capture, grounded-only, honest declines. **The mode picks the orchestrator and the permission ceiling — never the knowledge model.** The existing five toggles (`senseEnabled` · `copilotShowMe` · `copilotWalkthrough` · `reasonEnabled` · `reasonImageEnabled`) tune features *within* a mode, underneath it (D7).

**Defaults.** Mode 1 for every workspace today. Mode 2 becomes the sensible default once proven — strictly better, no new risk. **Mode 3 is never a default**, and plausibly not self-serve at all for regulated verticals.

**Pricing (decision 2026-07-26).** The three modes are the pricing tiers. Two consequences that follow and must not be lost:

1. **The mode boundary becomes a billing control, not only a safety control** — which makes D8's *absence, not refusal* load-bearing twice over: a mode-2 workspace must have no `execute_step` bound at all, never a refusal the model could be talked out of.
2. **The cost measurement still matters** — but for **margin per tier**, not for consolidation. Mode 1 is now commercially durable regardless of the delta (you cannot easily un-sell a tier), so "collapse 1 into 2?" is effectively closed; "what does each tier cost to serve?" is not (§7 Q6).

### D8 in practice — absence, not refusal

**The agent decides *whether to offer*; the gate decides *what is offerable*.** P4-M1 stays deterministic and server-side (the `autopilot` flag · workspace posture · certification). The agent picks from an allowed set and never decides the set — the `search_kb` pattern again.

The implementation rule that makes it safe: **don't tell the model it isn't allowed — don't give it the tool.** A workflow without the flag should have no `execute_step` bound for it at all. Otherwise the agent says *"I could do this, but your admin hasn't enabled it"* — leaking workspace configuration to end-users and generating support load for the founder. **Absence, not refusal.**

Today's `walkOffer` wire shape likely survives (the widget still needs something typed to render a pill and fire a run); what changes is the emitter — the agent's tool choice on any turn, rather than the hardcoded positional-answer branch in the answer path.

### D4/D5 are not new — they are P4-M0, generalized

The shipped walkthrough already implements exactly this posture. From [`widget/src/walkthrough.ts:496`](../packages/widget/src/walkthrough.ts#L496):

> *"Detection = acknowledgment, never motion (manual-only advancement, user decision 2026-07-15)."*

and at [`walkthrough.ts:208`](../packages/widget/src/walkthrough.ts#L208), the discipline is already coded: a walkthrough must never say "click it" at a disabled button, nor advance past an invalid input. **D4 and D5 generalize a proven, shipped, user-verified pattern to input steps** — they are not a new bet.

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

| | Effect |
|:---|:---|
| **Dissolves** | **P5-M3 (the tier router)** largely disappears as a module — if the agent picks Tell/Show/Do as tool calls, there is no separate routing layer to build. |
| **Resolves** | **[`phase-5-converse.md`](phase-5-converse.md) §5 Q3 (destructive steps)** → always pause-and-confirm mid-run. The chat channel is already open for inputs; a confirmation is the same mechanism with no extra machinery. |
| **Unchanged / unavoidable** | **P4-M2** is squarely on the critical path — "fill a form" *is* the execution driver. The agent framing changes who decides to call it, not whether someone writes it. **Phase 3** likewise: an agent that can act needs *more* validation discipline, not less. |
| **Already aligned** | **P5-M4's** locked decisions — mid-run input prompting as the base mechanism, per-goal consent — are exactly this design. **P5-M0** (chat persistence + continuity) remains the correct next build: narration and mid-run prompting hard-depend on a thread that survives navigation. |

### Do we still need Phase 4?

**Yes — three of its four modules, essentially unchanged.** Phase 4 splits in two: its *product surface* is absorbed by the agent; its *mechanics* are irreducible.

| Module | Fate |
|:---|:---|
| **P4-M0** walkthrough | ✅ Built → becomes the `run_walkthrough` tool. Survives as-is. |
| **P4-M1** gate | **Survives fully.** Someone must decide which workflows may be executed at all — a founder trust decision in the DB, checked before `execute_step` is bound. The agent must never decide it (D8). |
| **P4-M2** driver | **Irreducible — it *is* `execute_step`.** Resolve locator → act → verify → safe-stop. The reframing changes who calls it, not whether it gets written. **The critical path.** |
| **P4-M3** rails + audit | **Survives.** Safe-stop semantics, destructive-step policy, execution audit log, drift feedback to Phase 3. |

**Absorbed by the agent:** the "Want me to do this for you?" offer (→ D8), the bespoke consent flow (→ per-goal consent), the step-by-step run UI (→ chat narration), per-input prompts (→ `ask_user` + D3 point-and-type). Roughly the UX half — and never the hard half.

**⚠️ Unification makes M1 and M3 *more* load-bearing, not less.** The old design had a natural speed bump: a discrete button the user pressed to cross from *being told* into *being acted for*. A fluid agent erases that bump — it will reach for `execute_step` far more readily, inside one continuous conversation with no obvious threshold. **The gate and the rails become the only crisp line** between answering a question and changing something in the user's account. The risk calculus is unmoved: a wrong action still ≫ a wrong answer.

**One consolidation win:** P4-M2's *"resume across navigations"* and the agent's transport question (§7 Q1) are **the same problem** — how does a multi-step process survive the page loads it causes? Under the old split it would have been solved twice. Settle transport before touching P4-M2.

**One warning: do not decompose P4-M0 into per-step agent calls** just because everything is tools now. `walkthrough.ts` holds earned machinery (self-correcting backward pointer · `blockedText` naming the first unfinished step · sticky spotlight · stale-nav cleanup · sessionStorage resume) that is deterministic, fast, and user-verified across four E2E rounds. An LLM call per step would add latency, cost, and non-determinism to something that already works. **Keep acting tools coarse-grained** — one call per step, deterministic inside. The same applies to `execute_step`.

**Bookkeeping:** keep Phase 4 as a work bucket and keep the module IDs (`P4-M2` is referenced across docs, memory, and code comments; renaming buys nothing). What should stop is treating phase *numbers* as a build sequence — they already aren't one (Phase 4 opened ahead of Phase 3, and the next build is P5-M0). This doc owns structure; the phase docs own module detail.

## 6. The PII finding — and how D3 resolves it

**The finding.** Making the chat the input channel would turn it into a deliberate PII pipe — users typing emails, addresses, and card numbers so the agent can fill a form. As the code stands:

- [`api/src/server.ts:502`](../packages/api/src/server.ts#L502) writes `question` **raw** into `CopilotQuery.question`. `redactText` is applied to the *context* fields via the sanitizer at [`server.ts:308`](../packages/api/src/server.ts#L308) — **not** to the question itself.
- [`server.ts:614`](../packages/api/src/server.ts#L614) writes it again into `CoverageGap.prompt`.
- P5-M0 proposes persisting the last 20 messages to `sessionStorage`.

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

1. **Transport — the load-bearing one.** The deciding tools run on the server; `where_am_i`/`highlight_step`/`execute_step` run in the widget, and the page navigates mid-run. Options: (a) stateful server loop + persistent channel, (b) client-orchestrated loop, (c) **re-entrant/resumable — run state rides the wire, persisted in `sessionStorage`** (recommended: keeps the server stateless-ish, survives navigation for free, and is the pattern already proven twice by Sense hypotheses and the walkthrough's resume).
2. **Mode-3 certification bar** — require Phase-3 green validation before any acting run, or accept interim signals (recent successful walkthroughs/runs) until P3 lands? *(= [`phase-5-converse.md`](phase-5-converse.md) §5 Q10.)* **Leaning conservative** under D9's liability framing: if mode 3 is a contractual boundary, interim signals are a weak thing to have promised on.
3. **Chaining scope for v1** — single-workflow goals first, chains later? *(= §5 Q5.)*
4. **How mode 3 is accepted** — D9 makes it a contractual line, so the toggle is probably not just a Studio switch: explicit acceptance, versioned terms, and a record of who enabled it and when. What exactly gets stored? Far cheaper now than retrofitted.
5. **Cross-origin iframe UX** — is "highlight the region + Continue" enough, or does the payment case want a bespoke affordance?
6. **Cost per mode (measurement, not a design choice)** — the real cost-per-question and p50/p95 delta between the mode-1 pipeline and the mode-2 loop, on live traffic. **Measured after migration step 2.** Now a *margin* question rather than a consolidation one (D9 pricing), but it still sets tier prices and D7's spend caps.
7. **Where the five existing toggles land per mode** — which are mode-1-only, which survive into 2/3, which become redundant once the agent decides (e.g. does `copilotShowMe` still mean anything when the agent chooses to highlight?).

## 8. Migration path

Each step ships standalone value; step 2 is where the thesis is proven, the transport question gets settled, and the §7 Q6 cost numbers arrive. **Mode 1 stays shipped and supported throughout — it is never a migration casualty.**

| # | Build | Lands in | Risk added |
|:---:|:---|:---:|:---|
| **1** | **P5-M0 — conversational foundation.** Chat persistence + continuity retrieval. Needed under every version of this, and it fixes a live bug: the chat dies on navigation today, including navigations the walkthrough itself causes. **Ships to mode 1 too — hygiene, not an agent feature.** *(Two amendments: typed message kinds in the persisted format from day one, so D3's chat-supplied values are excludable later without a storage migration; and build its persistence deliberately as the transport prototype for §7 Q1.)* | **1 + 2** | none |
| **2** | **Promote `diagnoseFromKB` to the main loop, read-only tools first** — `search_kb`, `get_workflow`, `where_am_i`, `read_page_state`, `product_profile`, `ask_user`. Nothing acts, so **the risk surface does not grow**; Tell + diagnosis + clarifying questions unify immediately. **Mode 2 becomes real here.** | **2** | prompt regression · cost/latency (measure) |
| **3** | **Add the shipped zero-acting client tools** — `highlight_step`, `run_walkthrough`. Tell and Show become one mechanism and mid-walkthrough questions start working. **Mode 2 is now feature-complete.** | **2** | none on the page |
| **4** | **`execute_step` plugs in as one more tool** — P4-M2, gated by P4-M1's eligibility signals (and Phase 3's certification when it lands), with P4-M3's rails and audit log. **Mode 3 opens.** | **3** | **accountability transfer** |

**Regression protection.** Migration step 2 rewrites the prompt every question rides. The repo has no automated tests ([`roadmap.md`](roadmap.md) §9 carries the standing `vitest` candidate); re-run the Sense/Reason/walkthrough legs of [`e2e-testing.md`](e2e-testing.md) before calling it done, and **keep mode 1's single-shot path as the runtime fallback** when the loop errors or times out — the same posture Reason and the condensation hop already use.

---

> **Not in scope (unchanged from Phase 5):** server-side conversation storage or cross-device history, long-term per-user memory, proactive/unprompted messages, and — permanently — **free-form agentic browsing**. A goal grounds to approved workflows or it is not pursued.
