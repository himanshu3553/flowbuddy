# FlowBuddy — Execution Contracts (direction + decisions)

> **The compiled plan tells the agent what to do; the contract tells it what success looks like.**
> A recording already holds the founder's screen before and after every action — and today the
> acting run replays the actions while reading almost none of that evidence. An execution contract
> compiles it — where the workflow starts, what each step's success looked like, what the finished
> state looks like — into the same plan the run already executes: derived deterministically from
> the recording, pinned by the same consent, checked on the user's machine. Every miss becomes
> founder-visible telemetry. One product truth gains a checkable form: **a run is done when the app
> looks the way the founder's recording says done looks — not when the steps run out.**

- **Status:** [`roadmap.md`](../roadmap.md) §4. This doc records what was decided and why — never what is built.
- **Companions:** the acting layer this hardens → [`agent.md`](agent.md) (§A2; §A3 for the replay-core sequencing) · the privacy boundary it inherits → [`sense-and-reason.md`](sense-and-reason.md) §A2 · the graph decision it extends → [`application-intelligence.md`](application-intelligence.md) (AI-4) · the identity pattern beneath it → [`workflow-identity.md`](workflow-identity.md) · the export that later carries it outward → [`interop.md`](interop.md)

---

## 0. Start here (plain language)

The agent runs a workflow the way someone follows directions from memory: it knows every click, but
not what the journey is supposed to look like. Three consequences show up in real runs. It starts
without checking it is at the start — "am I on the right page, signed in, looking at the right
screen?" is discovered mid-run, if at all. After each act it mostly trusts that the action *took* —
the strongest checks cover only a couple of steps, and a success phrase that was already on the
screen before the act counts as success forever. And "Done" means "no steps left," which is a
statement about the plan, not about the app.

The contract writes down, from the founder's own recording and nothing else: what the **start**
looks like, what **each step's success** looked like on the founder's screen, and what the
**destination** looks like. The run checks itself against all three and reports every mismatch to
the founder — which makes ordinary production runs the drift signal self-validation has been
waiting for, well before any sandbox replay exists.

It is also the honest version of the **application workflow graph**. Once every workflow declares a
typed entry and a typed outcome, "finishing A leaves you where B can begin" stops being something to
model and becomes something to *compute* — the graph falls out of the contracts on demand, the same
way duplicate detection already falls out of the embeddings, with nothing new stored. Workflows stay
the nodes; contracts are the sockets; chaining (the goal layer, [`agent.md`](agent.md) §G3) plugs
them together when it builds.

## 1. Why — and why this shape

Three facts meet:

1. **Run verification exists, but it grew as point fixes.** Three classes of false "Done" were found
   in live runs, and each close — rejection surfaces, try-once navigation, appearance markers —
   patched one hole ([`agent.md`](agent.md) §A2.6). Markers still cover only the last and
   destructive steps, and only some of the ways a step can complete; completion itself asserts that
   the plan ran out; and no failure is recorded anywhere, so which steps are fragile in the field is
   unanswerable — the exact risk §8 of [`agent.md`](agent.md) warns about writing down and never
   instrumenting.
2. **The evidence already exists and is thrown away.** Every recorded action carries the founder's
   before-screen; every settled action carries the after — DOM, route, title, and the recorder's own
   settled-cleanly-or-timed-out signal. Only a sliver of it is read today. The core of this design
   needs **no recorder change**: it is a richer compile of artifacts every existing recording
   already has.
3. **The graph question lands here.** The founder's ask — an application-wide KB relating workflows
   to each other — has a rejected form (the hand-modeled application graph,
   [`application-intelligence.md`](application-intelligence.md) §1) and a standing rule: links are
   the graph, structure is extracted at the second consumer, never speculated at the first (AI-4).
   Typed entry and outcome contracts are that rule obeyed: relations become *computable* the day
   chaining needs to query them, and stored never.

### What this deliberately is NOT

- **Not a stored graph.** No relation tables, no graph database, no typed ontology — AI-4 stands.
  The contracts make workflow-to-workflow relations derivable on demand; chaining is the second
  consumer that gets to demand them.
- **Not sandbox replay.** Unattended validation in the customer-provisioned sandbox stays its own
  later module — but it will verify **these same contracts**, which is what makes this the live
  half of the same phase, and that runner remains the second consumer that extracts the shared
  replay core ([`agent.md`](agent.md) §A3). Nothing here pre-builds it.
- **Not a walkthrough change — in these slices.** Guided mode's behavior contract is untouched
  here: the new checks are read-only questions added to the shared step engine, and the walkthrough
  doesn't ask them yet. Its adoption is the road's last item, shadow-first and evidence-gated.
- **Not a new gate on enabling.** Eligibility analysis still alone decides what may be enabled;
  contracts tighten the verification of what runs. The rule appearance markers established
  generalizes to the whole design: **presence tightens, absence never loosens** — a plan compiled
  before contracts existed runs exactly as it does today.
- **Not model judgment.** Everything gate-shaped stays deterministic — the same rule the
  intelligence layer inherited, applied to the artifact that pins consent.

## 2. Decisions (captured 2026-08-10)

| # | Decision | Rationale |
|:---:|:---|:---|
| **EC-1** | **Derived deterministically, at processing.** The evidence is extracted from recorded artifacts when a recording is processed (and on every reprocess) and stored in the KB beside the steps it describes — no model call anywhere in it. The acting plan takes its consent-pinned copy at enable. | The artifact that pins consent must not drift between compiles of identical input. Determinism is also what keeps it auditable: "this came from the recording" is checkable, phrase by phrase. Extracting at processing rather than enable is what makes the evidence one layer with three readers (EC-10) instead of agent-only property. Rejected: model-summarized expectations — non-determinism inside the consent pin, and prose nobody can trace. |
| **EC-2** | **The contract rides the plan and feeds the consent pin.** One artifact, one hash, one drift rule: a run executes both the steps *and* the verification the user consented to. | A contract stored beside the plan is a second thing to drift; a contract outside the pin could change under a consented run. Consequence, accepted: enriching a plan re-pins it, and an in-flight consent meets the same refusal any plan change already triggers. |
| **EC-3** | **Three parts, one per question the run must answer.** Entry (*may I start here?*) · per-step expectations (*did that act take?*) · outcome (*did the workflow reach its recorded end?*). The entry part carries only what is machine-checkable — route, screen, cold-startability. What must be *true* before starting stays prose in the workflow description, where it already lives. | Each part lands at the moment its question is asked: pre-flight, post-act, at Done. Keeping prose out of the contract preserves the no-overlap rule that spares every consumer a precedence policy. |
| **EC-4** | **Fingerprints and routes stay signals; element evidence and rejection surfaces stay the gates.** An entry- or outcome-screen mismatch narrates and is audited — it never blocks. | The standing bound on screen identity ("a ranking signal and a widget aim, never the approval gate") holds under acting: a wrong fingerprint must cost a caution, never a refusal. Blocking stays where evidence is deterministic and local — an unresolvable element, a fresh rejection, a failed marker. |
| **EC-5** | **Completion is qualified, never blocked.** A run that finishes its steps is complete; the outcome check stamps it **verified** or **unverified**, and an unverified ending is narrated honestly to the end-user. | The steps *did* complete — asserting otherwise would be its own lie, and blocking Done on a soft signal violates EC-4. Rejected: a new terminal outcome value — the audit vocabulary stays closed, and analytics slices on the stamp instead. |
| **EC-6** | **Failures are first-class audit events.** Every hand-back, rejection, marker miss, label mismatch, stall, navigation timeout, entry miss and outcome miss is appended to the run's audit row, with kind, step and duration. | A risk never instrumented stops being answerable ([`agent.md`](agent.md) §8) — this is the instrument the whole design is accountable to. "Which steps are fragile in the field" becomes a query. Privacy is unchanged: kinds, booleans and durations travel up, plus at most one scrubbed snippet per event — the safe-stop reason's precedent, inside the boundary [`sense-and-reason.md`](sense-and-reason.md) §A2 draws. |
| **EC-7** | **A marker means NEWLY visible.** The run baselines marker visibility before each act — the discipline rejection detection always had — so a phrase already on screen carries no signal, and says so in the audit. Markers extend to **every step** whose snapshots support them, under a bounded compile budget, and gain their inverse: phrases that *disappeared* when the founder's step succeeded. A recording after-state that timed out rather than settling is trusted for appearance, never for disappearance. | The absolute-presence hole was real: a heading present the whole session satisfied a "success" marker indefinitely. Disappearance catches the other half of app feedback (the modal that closes, the item that leaves a list). The settle signal was captured from day one and read by nothing; this is its first honest reader. |
| **EC-8** | **A resolved element must still say what the recording said.** Each step carries its target's recorded label; a resolvable element whose live label contradicts it is handed back, not acted on. | The first selector that resolves wins today, and nothing cross-checks what it resolved *to* — a stale selector aiming at the wrong control is invisible until the wrong thing is clicked. An act is irreversible; a hand-back is annoying but never wrong. Matching is tolerant by design (labels legitimately grow counts and badges); the audit tells us within weeks if it over-fires. |
| **EC-9** | **Recorder changes ride their own tranche, store-first.** The core compiles from artifacts every existing recording already has; the capture tranche — a toggle's actual end-state, the one attribute the sensitivity rule already reads for, an after-state for typed fields — widens coverage in a separate release, behind the one already in review, with every consumer tolerating old manifests forever. | Better capture makes better contracts, and the founder's rule is to change the recorder when it buys real quality — but a store review must never sit between the core work and production, and old recordings must never become second-class. |
| **EC-10** | **One evidence layer, three consumers** (founder-set, 2026-08-10). The same stored evidence serves **answers** (state the entry, give the SOP, close with the finish line), **Sense and Reason** (progression and expected-vs-actual diagnosis), and the **acting run** (validation). The posture differs by consumer: a **checklist** for the agent — a miss blocks or hands back; **information and bias** for every read-only surface — shown to humans and weighed in scoring, never a gate. | In Copilot mode the user still has eyes; the evidence informs them. The agent has none; the evidence replaces them. Each consumer lands with its own measurement — the answer baseline, Sense's localization metrics, the run audit — and those numbers, not argument, are the rethink trigger if a consumer turns out not to be helped. |

## 3. The contract (v1 sketch)

| Part | Holds | Derived from | The run… |
|:---|:---|:---|:---|
| **Entry** | The first step's route · the screen it happened on (fingerprint) · whether the workflow starts cold or presupposes being somewhere | Step 1's recorded event, the screen-run containing it, and the same id-pattern rule direct navigation already obeys | Pre-flights before the first act: navigates when it may, waits honestly when it must, notes the mismatch when the screen disagrees |
| **Per-step expectations** | Success phrases that appeared · phrases that disappeared · the target's recorded label · the landing title, where the step navigates | Each step's before/after snapshots and recorded target | Baselines, acts, then requires *newly* appeared (and gone) phrases; cross-checks the element's label before acting; audits every miss |
| **Outcome** | The destination route · the final screen · the final success phrases | The last recorded event's after-state | Checks at Done **on every path**, and stamps the run verified or unverified |

The screen fingerprints are the ones Sense already compiles and ships — same derivation, same
scrubbing, same recall-not-equality matching — so the probe's idea of a screen and the contract's
can never drift apart.

The evidence is extracted **once, at processing**, and stored with the steps it describes; every
consumer — the answer path, the sense shard, the plan compiler — reads the stored layer rather
than re-deriving it (EC-1, EC-10). The acting plan's copy is the one that gets consent-pinned.

## 4. Run-time semantics

**Pre-flight** (before the first act only): entry route right → proceed. Wrong but the workflow
starts cold → the existing try-once navigation, now promised knowingly instead of discovered. Wrong
and the workflow presupposes context → no navigation attempt at all; the run waits with honest copy
("this starts on X — head there and I'll pick it up") and audits the entry miss. Route right but the
screen disagrees → narrate caution, proceed, audit (EC-4).

**The acting tail**, in order: baseline alerts *and* markers → act → settle → a fresh rejection
surface still beats any completion evidence — now sampled twice, the second look a beat later, on
the agent's own acts only and never after a step has completed — → completion evidence → newly
appeared markers, plus disappearance where compiled.

**What each completion path requires** — the scope table this design commits to:

| How the step completes | Today | With contracts |
|:---|:---|:---|
| The agent's own act, page stays | Evidence + markers (last/destructive only) | Evidence + **newly** appeared/disappeared markers, every step that has them |
| The agent's own act, page navigates | Route pattern only | Completes on the route as today; marker silence on arrival is audited and softens the narration, never blocks |
| The user's press on a handed-back step | Evidence + markers | Same, with baseline taken at the observed press |
| The hand-back poll (no observed act) | Evidence only, no last-step shortcut | Evidence **and** markers by presence — no act moment means no baseline; the run just keeps waiting |
| A value filled from chat or prefill | Element state; an unreadable control passes unconditionally | Readable controls unchanged (state beats markers for inputs); an **unreadable** control with markers must show them newly satisfied, else hand back |
| The user confirms an input ("Continue") | User-asserted state | Unchanged — deliberate: the user outranks a phrase list |
| Resume after a full-page navigation | Route pattern only | As today, plus the audited marker check on arrival |

**At Done**, whatever the last step's path: the outcome check — destination route, final screen,
final phrases — stamps the run verified or unverified, and the unverified ending is narrated in
founder-approved copy (§5). Nothing re-opens completed steps; the stamp and its audit event are the
whole consequence (EC-5).

**What travels where** stays inside the standing boundary: scrubbed founder-derived phrases,
labels and fingerprints ship **down** inside the plan; event kinds, booleans, durations and at most
one scrubbed snippet come **up** ([`sense-and-reason.md`](sense-and-reason.md) §A2). Only the
acting run treats these questions as **gates**; every read-only surface — the walkthrough included
— meets the same evidence as information, on EC-10's posture split and the road's schedule.

## 5. Open questions

1. **The "Done, unverified" words.** The end-user did nothing wrong and the steps did run — the
   copy must qualify, not alarm. *Recommend:* "Done — every step went through, though the finish
   didn't look quite the way the recording did. Worth a glance." Founder signs off the exact line.
2. **Verified as a stamp, or a new terminal outcome?** *Recommend:* a stamp beside the existing
   outcome (EC-5) — the outcome vocabulary stays closed, and "completed but unverified" remains
   visibly a completion.
3. **May rejection snippets persist in the audit?** The app's own words at the moment it refused
   are the most diagnostic thing a founder can read. *Recommend:* yes — scrubbed and clipped under
   the same rule as the safe-stop reason, one per event.
4. **Marker coverage budget.** Every step, under a bounded artifact budget at enable time (enable
   is a founder-facing one-off; the budget is a cap, not a target). *Recommend:* yes; the cap's
   value lives with the constant, in source.
5. **The delayed second rejection sample** on the agent's own acts — uniformly, or only on
   destructive and final steps? *Recommend:* uniformly; a false Done costs trust, a beat of
   patience costs almost nothing. Fall back to destructive+final if live runs feel it.
6. **Label cross-check: blocking or advisory?** *Recommend:* blocking (EC-8) — and the audit kind
   exists precisely so an over-firing check is measured within weeks, not argued about.
7. **Capture tranche timing.** *Recommend:* land the core slices first — they need no recorder
   change — and submit the capture release once the compiler work that consumes it is code-complete,
   behind the release already in review.
8. **Entry screen mismatch: narrate-not-block — confirmed?** *Recommend:* yes (EC-4). Revisit only
   if entry-miss audits show wrong-screen acts actually happening, which the telemetry this design
   ships will be the first thing able to prove.

## 6. The road (slices, each independently shippable)

1. **Extract and store the evidence.** Every processed recording yields entry, per-step
   expectations and outcome, stored in the KB beside the steps; the acting plan compiles its
   consent-pinned copy from the stored layer at enable. Nothing reads it at run time yet, so
   behavior is unchanged — which is the point of shipping it alone.
2. **Record the failures that already happen.** Hand-backs, rejections, stalls and navigation
   timeouts occur today and vanish; they become audit events before any new mechanism exists —
   measurement first, so every later slice lands against a baseline.
3. **Enforce.** Pre-flight, marker baselines, the per-path table above, the second rejection
   sample, the label cross-check, the outcome stamp — plus the first scripted acted-run checks,
   the minimal version of the harness [`agent.md`](agent.md) §A2.11 names as missing.
4. **Show it.** The founder sees what the agent will check at the moment they enable acting; the
   consent sheet tells the end-user where the workflow starts; the runs surface shows verified
   stamps and failure kinds — and **answers open with the starting point and close with the
   finish line** (EC-10), an answer-path change, so it lands against the answer baseline like
   every other one.
5. **Sense and Reason read it.** The shard carries per-step expectations as additive evidence:
   progression for localization ("step 2's phrases present, step 3's absent — the user stands on
   step 3") and expected-vs-actual text for diagnosis — weighed in scoring, calibrated against
   Sense's own metrics, never a gate (EC-10).
6. **Capture tranche** (EC-9): the recorder learns a toggle's end-state, the sensitivity attribute,
   and an after-state for typed fields — then fill steps get expectations too.
7. **Later, once agent telemetry proves the phrases: the walkthrough's auto-detect adopts them.**
   An acknowledge-only surface — the user still presses Next — so adoption can run shadow-first:
   the walkthrough records what it *would* have detected, the numbers are read, and only then does
   its visible behavior change.

**Sequencing rules (standing):** measurement before mechanism — slice 2 lands before slice 3 is
judged. The graph stays derived — chaining consumes contracts when the goal layer builds, and
typed relations are computed then, not stored now (EC-3). And unlike the intelligence layer, this
work does **not** wait on KB depth: each workflow is hardened from its own recording, so a
two-workflow KB benefits on day one — what waits for depth is judging marker *quality* across many
apps, which is why every threshold ships as provisional and instrumented.

---

> **Not in scope:** a stored workflow graph, relation tables, or typed ontology (AI-4) · sandbox
> replay and the shared replay-core extraction ([`agent.md`](agent.md) §A3 — the sandbox runner is
> the second consumer) · walkthrough behavior changes · any change to eligibility or the approval
> gates · a marker-labeling UI · run abandonment sweepers · CI.
