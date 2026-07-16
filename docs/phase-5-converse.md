# Sync — Phase 5: Converse (the goal-based agent)

> **Phase 5 turns the copilot from a question-answerer into a goal agent.** It understands what the user is trying to *accomplish* — from the conversation, the founder's product understanding, the approved workflows, and where the user is standing right now — confirms it, and then helps at the right intensity through a **three-tier ladder**: **Tell** (the SOP, step by step, in chat) → **Guide** ("follow me" — the guided walkthrough) → **Do** (confirmed, end-to-end execution, narrated live in the chat while it works across pages). One goal, three delivery modes, one grounded knowledge spine. **Division of labor with Phase 4: Phase 5 is the brain (goal → plan → parameters → consent → narration → chaining), Phase 4 is the hands (execute one approved workflow, step by step, safely).**

- **Status:** 📝 **Draft — design for discussion.** Modules P5-M0…M4 proposed below; roadmap/CLAUDE entries follow when the design locks.
- **Drafted:** 2026-07-16 · **Branch:** `dev`
- **Companion docs:** answers → [`phase-1-copilot.md`](phase-1-copilot.md) · position → [`phase-2-sense.md`](phase-2-sense.md) · diagnosis → [`phase-2-reason.md`](phase-2-reason.md) · the hands (walkthrough + execution driver) → [`phase-4-autopilot.md`](phase-4-autopilot.md) · validation/certification → [`roadmap.md`](roadmap.md) §4
- **The trust story, extended one more step:** answers are grounded in approved knowledge (P1) · actions are grounded in approved workflows (P4) · **goals are grounded in both** — the agent only ever pursues a goal it can express as approved workflows over founder-provided understanding, confirms it with the user before acting, and narrates everything it does.

---

## 1. The three-tier ladder (the product)

| Tier | Name | What the user gets | Engine |
|---|---|---|---|
| 1 | **Tell** | The SOP in chat: goal-shaped, step-by-step, grounded, conversational | Answer engine + this phase's conversational spine |
| 2 | **Guide** | "Follow me": each step highlighted on the live page, progress observed, user drives (Next) | **P4-M0 guided walkthrough (✅ built)** |
| 3 | **Do** | The agent confirms the goal ONCE, then executes end-to-end — narrating each action in the chat as it moves across pages; any input it doesn't already know from the conversation is asked in the chat at the moment it's needed | P4-M2 execution driver (P4 owns), orchestrated by P5-M4 |

The ladder is offered, not imposed: when a goal is understood, the copilot presents the applicable tiers, **recommends one, and the user picks**. Tier availability degrades honestly — a workflow not approved for autopilot offers Tell + Guide; a goal the agent can't ground offers nothing but an honest answer.

## 2. The gap this phase closes (as measured in the code)

| Symptom | Cause (verified) |
|---|---|
| Every message feels one-shot | Retrieval runs on the bare question text (`retrieval.ts` — question terms + route boost); history rides the prompt but never retrieval, so *"and then what?"* searches the KB for "and then what" |
| The conversation dies on navigation | `messages` is in-memory per page view (`widget/src/index.ts`) — following the copilot's own advice wipes the thread (the walkthrough solved this exact problem for itself with sessionStorage + boot resume; the chat never got it) |
| No notion of the user's goal | Nothing tracks "what is this user trying to accomplish"; each answer is a verdict, not a step toward finishing a task |
| Answers-or-declines, never asks | The only clarifying question allowed is the Sense tie; ambiguous intent → guess or decline |
| Knows recipes, not the product | The KB = workflow steps (+ narration topics); no product description, concepts, plans/roles, FAQs — the copilot can navigate but cannot orient, compare, or redirect |
| Help intensity is bolted on | The walkthrough offer hangs off positional answers only; there is no goal → tier dispatch |

**Principles carried over, unchanged:** grounded-only (this phase widens what the copilot knows and pursues, never its permission to invent) · decline-over-hallucinate for facts · position is re-measured every message and beats conversation for WHERE — conversation owns WHAT-they're-trying-to-do · every piece degrades silently to today's behavior.

---

## 3. Modules

### P5-M0 — Conversational foundation

1. **Continuity bias (deterministic, free):** the widget sends the previous answer's citation keys (`context.lastCited: [{sourceId, segmentIndex}]`, server-validated against `CopilotApproval` — no-leak); retrieval boosts items from those workflows (+2, below the +3 route boost). A follow-up stays in the workflow being discussed; an unrelated question still out-ranks it (bias, never a filter).
2. **Query condensation (LLM, gated):** when history exists AND the question looks context-dependent (short, or anaphora markers — *it/that/then/next/same/also/again/what about*), a fast cheap model condenses history + question into one standalone retrieval query (temp 0, ~800ms hard budget, history treated as data). Failure/timeout → raw question. Full questions skip the hop — no latency tax on the common case.
3. **Chat persistence:** sessionStorage `sync.chat.v1` (same pattern/posture as the walkthrough session — key-scoped, 30-min TTL, tab-scoped): `{v, k, updatedAt, open, goal, messages: last 20}`. Restore on boot; `walkOffer` payloads dropped at persist (stale plans re-derive on re-ask). **Tier 3's narration hard-depends on this module** — the narrative must survive the page loads the automation causes.

### P5-M1 — Goal understanding (intent capture)

- **The goal thread (stateless):** the answer JSON gains a `goal` field — one line, "what this user is trying to accomplish," updated by the model every turn; the widget stores it with the chat session and returns it as `context.goal` (capped, de-angled, hint-only — the Sense three-tier rule applied to intent).
- **Posture rewrite** (fast-path `SYSTEM`): verdict-style → companion-style — acknowledge the thread, frame answers inside the goal, never re-greet or re-explain. **Clarifying questions become legal:** when intent is genuinely ambiguous AND the KB supports more than one reading, ask ONE short question (a clarification is `covered: true` — help, not a decline).
- **Parameter capture:** when a goal statement carries inputs ("create a project called *Acme* for *acme.com*"), the conversation extracts and remembers them — so Tier 3 (and Tier 1/2 answers) never re-ask what the user already said. Extraction is opportunistic, never exhaustive: whatever isn't known gets asked mid-run (P5-M4). The masked-at-capture safety property survives either way — values always come from the user, never the recording.
- **Analytics:** `CopilotQuery.goal` (nullable, additive migration) — aggregated goals = the founder's product-gap signal.

### P5-M2 — Product Profile (the product-understanding KB)

- **Authoring (Studio, KB page tab):** founder-authored structured prompts + free text — what the product is · who uses it · core concepts/terms · plans/roles · FAQs · never-say list. Optional starter: distill a draft profile from the recordings' narration transcripts (the understanding is already in the founder's voice there).
- **Storage — reuse the whole pipeline:** authoring truth in a `ProductProfile` row; on save, compiled into a synthetic `KnowledgeSource` (`kind:'product'`) whose `KnowledgeItem`s (one per concept/FAQ/section, embedded) are delete-and-recreated. `CopilotApproval` rows written automatically (founder-authored = approved by authorship), so retrieval's approved-only invariant holds untouched. Citation chip reads **"Source: Product profile."**
- **Answer synthesis:** the prompt names two evidence layers — **PRODUCT BACKGROUND** (orient, explain, compare, redirect) and **WORKFLOWS** (instruct steps) — anchored by POSITION, framed by the GOAL. Background may redirect ("you don't need a new project for that"); only workflows may instruct; nothing may be invented.

### P5-M3 — The goal router (the tier offer)

- When a goal is understood and grounded to workflow(s), the answer carries a **tier offer**: the applicable tiers (Tell always; Guide when the workflow is walkable on this page; Do when approved-for-autopilot AND certified — the P4-M1 gate), a recommendation, and the user's pick as the dispatch.
- Widget: the offer renders as pills under the answer (the existing "Walk me through it" pill generalizes into the ladder).
- Grounding rule for goals: **a goal the agent cannot express as approved workflows is never offered a tier** — it gets an honest grounded answer or a decline, exactly like a fact it doesn't know.

### P5-M4 — Goal-driven execution orchestration (Tier 3's brain; consumes P4-M2)

- **Per-goal consent:** the goal, the workflow chain, and every value already known from the conversation are confirmed ONCE before anything runs. Consent is about *what will happen*; it does not require every input upfront. (The one standing exception to hands-off: destructive steps — see Q3.)
- **Inputs — mid-run prompting is the base mechanism (locked 2026-07-16):** when the driver reaches an input step whose value isn't known, it pauses and asks **in the chat** (the narration channel doubles as the prompt channel), then continues — no exhaustive upfront slot enumeration, and conditional fields the recording never showed are handled naturally. Values the conversation already supplied are **never re-asked**; known upcoming inputs may be *offered* at confirmation as a convenience ("give them now or as we go"). An unanswered mid-run prompt times out into a safe-stop with the honest what's-done/what's-left report.
- **Chaining:** a goal may span multiple approved workflows ("get my chatbot live" = create project → add sources → build → embed). Still grounded — a chain of approved workflows is not free-form browsing — but chaining is new scope: goal→plan mapping, cross-workflow handoffs, partial-failure semantics.
- **Narration:** every action the driver takes is reported into the chat as it happens ("Created project *X* — now adding your website…"), across navigations (P5-M0.3). Narration is the visibility mechanism that replaces watch-every-click.
- **Honest mid-goal failure:** a safe-stop reports like a colleague — what's done, what failed, where the user is, what's left — and downgrades to Tier 2 from that exact step (Sense's mid-workflow entry).
- **The seam:** P5-M4 hands P4-M2 one workflow at a time with pre-collected inputs; P4 owns locator resolution, acting, verification, safe-stop. P3's validated-current certification gates eligibility when it lands (P4-M1's pluggable signals).

---

## 4. Wire & schema deltas (all additive)

| Delta | Where |
|---|---|
| `context.lastCited[]`, `context.goal` on `/answer` (validated, capped, hint-only) | widget · api |
| `goal` (+ later `tierOffer`) in the answer JSON | `synthesis/copilot.ts` |
| sessionStorage `sync.chat.v1` | widget |
| `CopilotQuery.goal` (nullable) | db migration |
| `ProductProfile` table + synthetic product source/items + auto-approvals | db migration · compile step |
| Studio: Product profile tab + toasts | web |
| P5-M4 (later): goal-run consent + narration events; execution stays on P4's `ExecutionPlan`/`ExecutionRun` | widget · api |

## 5. Design questions to lock

1. **Condensation gating** — heuristic-gated LLM hop (recommended) vs. always-condense when history exists?
2. **Panel reopen after navigation** — restore `open` (recommended: continuity is the point) vs. always start closed?
3. **Destructive steps under hands-off Tier 3** — always pause-and-confirm mid-run (recommended: the one exception to no-intervention) vs. founder-flagged fully-automatable workflows?
4. **Tier recommendation** — copilot recommends one tier, user picks (recommended) vs. user always chooses unprompted?
5. **Chaining scope for Tier 3 v1** — single-workflow goals first, chains later (recommended) vs. chains from day one?
6. **`CopilotQuery.goal` analytics column** — now (recommended) or defer?
7. **Profile authoring shape** — structured fields + free text (recommended) vs. one free-text box?
8. **Profile retrieval slot** — overview item always ships as background + rest compete (recommended) vs. pure competition?
9. **Clarifying questions** — max one at a time, only when the KB supports both readings (recommended)?
10. **Tier-3 certification bar** — require Phase-3 green validation before any hands-off run (safest) vs. interim signals (recent successful walkthroughs/runs) until P3 lands?

## 6. Risks

- **Latency** — the condensation hop is serial before retrieval: heuristic gate + hard budget + raw-question fallback keep the common case untouched.
- **Untrusted round-trips** — `goal`/`lastCited` come from any page holding the public key: cap, de-angle, re-verify keys, treat as hints that bias framing, never facts (the proven Sense posture).
- **Prompt regression** — the posture rewrite touches the fast path all questions ride: re-run the Sense/Reason E2E legs before calling it done.
- **Tier-3 blast radius** — hands-off execution concentrates all of Phase 4's "a bad action ≫ a bad answer" risk into one consent moment: per-goal confirmation must show exactly what will run, with the values already known (unknown inputs are asked mid-run, in the chat); narration + safe-stop are the runtime backstops; certification (Q10) bounds staleness.
- **Profile bloat/abuse** — per-field caps and an item-count cap at compile; a bloated profile competes against itself in retrieval.

## 7. Dependencies & sequencing

- **P5-M0…M2 have no Phase-3/4 dependency** — they build on the shipped copilot and improve every tier immediately (including the already-shipped Tier 2, whose chat context currently dies on navigation).
- **P5-M3** needs M1 (goals) and consumes P4-M0 (Guide) as its first non-chat tier.
- **P5-M4** is gated on **P4-M2** (the execution driver — not yet built) and consult **P4-M1/P3** for eligibility. Build order inside Phase 4 is unchanged; this phase adds the brain on top, not a bypass.

---

> **Not in Phase 5:** server-side conversation storage or cross-device history, long-term per-user memory, proactive/unprompted messages, free-form agentic browsing (never — goals ground to approved workflows or they are not pursued), portal articles (V2).
