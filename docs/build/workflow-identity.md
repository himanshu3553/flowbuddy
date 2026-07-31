# Workflow identity, supersession & variants

**Status:** [`roadmap.md`](../roadmap.md) §4.

A workspace records the same task twice. The product changed, or a second person recorded their own
route to the same goal. Today FlowBuddy has no way to notice, because it has no concept of *the same
task* — only of recordings. This doc decides what that concept is, when the founder is asked about
it, and how the copilot chooses between two true answers.

It is the slice of Phase 3 that needs **no sandbox and no replay**. Drift detection asks "is this
workflow still true?" and needs to drive the live app to find out. Supersession-by-re-recording asks
"which of these two is current?" and the founder already knows. That makes this buildable well
ahead of Phase 3's riskiest bet, and it is why it is specified separately here.

---

## 1. Problem

A workflow's identity is the coordinate of a slice of one recording — the approval-key contract in
[`internals/knowledge-base.md`](../internals/knowledge-base.md) §6. Approval is granted against that
coordinate, and the approval screen renders one recording at a time. So at the moment the founder
decides whether to approve "Invite a teammate," the product **structurally cannot show them** that
they approved "Invite a teammate" three weeks ago. Nothing in the pipeline ever looks outside the
recording it is processing.

Retrieval then pools every approved workflow in the workspace and ranks it flat. Two recordings of
one task produce two sets of steps that both match the question strongly, and the consequences
compound:

| | What happens |
|---|---|
| **Budget** | Both rank high, so both fill the candidate budget. One task can crowd out the rest of the KB. |
| **Coherence** | Steps interleave in an order derived from record ids, so the model reads two tellings shuffled together. |
| **Authority** | Nothing marks either as current. If the UI changed, the stale telling sits in the prompt with equal weight. |
| **Measurement** | Analytics group by the same coordinate, so one task appears as two rows with split query counts and split thumbs. |
| **Localization** | The on-page probe resolves two candidate positions for one real screen. |

None of it surfaces as an error. The founder sees an approved workflow and a working copilot.

---

## 2. Root cause

**The KB models recordings; the founder and the end-user model capabilities.**

"Invite a teammate" is one thing the product does, which happens to have been recorded twice. The KB
has no noun for that. It only has recordings, and a workflow is a region of one. Every symptom above
is that single missing concept surfacing somewhere different.

The same gap explains why a re-processed recording can re-point an approval onto content nobody
reviewed (the standing trap in `CLAUDE.md`). Both failures are the coordinate being asked to carry an
identity it was never able to guarantee. A durable identity dissolves them together, which is a
strong argument for fixing the concept rather than patching each symptom.

---

## 3. Decisions (locked)

| Decision | Choice | Implication |
|---|---|---|
| Does the system auto-resolve overlaps? | **No — it surfaces, the founder decides** | Similarity proves overlap. It cannot prove *which kind* (§4). |
| Where is an overlap raised? | **At approval time** | A decision point that already exists; it only has to stop being recording-blind. |
| What can the founder choose? | **Both: "replaces" and "both are real"** | Replacement and variance are both ordinary; neither may be the only path. |
| What does "replaces" do? | **Supersedes — never deletes** | The recording, the history and the analytics survive, and the call is reversible. |
| Is approval still binary? | **No — a third state is required** | "Was true, is no longer current" is currently inexpressible. |
| Which variant answers a question? | **The one matching the screen the user is on** | Reuses the route and on-page signals already feeding retrieval. |
| Tiebreak when no screen matches? | **The more generic variant** | Its prerequisites are satisfied by definition (§6). |
| How is the choice applied? | **A pick made *before* ranking, not a ranking weight** | A weight leaves both variants in the prompt — the original problem. |
| Where does generic/specific come from? | **Inferred once at KB build; founder can override** | Cheap, and a wrong inference is one click to correct. |
| Which layer owns identity? | **The KB, not the copilot** | The portal and third-party agents need it too — neither should publish one how-to twice. |
| What resolves *redundancy*? | **Supersession — selection cannot reach it** | Two tellings of one route give the answer-time rules nothing to choose between (§5, §6). |
| How is overlap measured? | **Two signals — and the DESTINATION decides** | A workflow's identity is where it ends, not the path it took. Averaging a workflow into one score lets shared navigation outvote the goal (§5). |

**Vocabulary (locked — REVISED at build time).** A **workflow** keeps the meaning it already has
everywhere in the product: *the thing the founder approves and the copilot cites*. What changes is
that it gains a durable identity, so it survives the recording slot it came from. When two workflows
turn out to be two routes to one goal, they are grouped under a shared **task**.

The first draft of this doc promoted "workflow" to mean the capability and called each recorded route
a *variant*. Implementing it showed that fights the product — Studio, the UI copy and the founder's
own speech all use "workflow" for the thing you approve, so redefining it would have rippled through
every screen to no benefit. Same design, one less word to relearn. "Variant" survives only as
informal shorthand for *one workflow among siblings sharing a task*.

---

## 4. Why the system must not decide

Overlap comes in three kinds, and they demand opposite handling:

| Kind | What it is | Correct outcome |
|---|---|---|
| **Replacement** | Same task; the product changed. | The old variant must stop answering — it now teaches a UI that no longer exists. |
| **Variance** | Same goal, different route (from Settings vs. from the Team page). | Both are true. Both stay. |
| **Redundancy** | Same task, same route, one telling finer-grained than the other. | Keep the better one; supersede the other. **Selection cannot help here** — see §5. |

A similarity score separates *overlapping* from *unrelated*. It cannot separate these three, because
the distinguishing fact — whether the product changed — is not in the recordings. It is in the
founder's head. Guessing wrong in the first case is the expensive error: the copilot keeps confidently
teaching a screen that no longer exists, and nothing in the system can detect that it is doing so.

So the product's job is to **present the overlap with enough evidence for a five-second human call**,
not to resolve it.

---

## 5. What the first real pair showed

Measured against the first genuine duplicate to appear in a live KB: a signup flow recorded twice
into one workspace, both tellings approved, the whole KB embedded.

**Detection works on meaning, not on names.** The two tellings were titled *"Create an account"* and
*"Create a new account"* — exact-title matching would have missed the duplicate entirely. Comparing
the mean of a workflow's step embeddings caught it cleanly.

**The separation was wide, but the floor is high.** The true pair scored **0.81** cosine; the
next-closest cross-recording pair scored **0.61** — and *that* pair was genuinely unrelated. Every
workflow in one product shares its vocabulary, its UI nouns and its phrasing, so unrelated content
does not sit near zero. The usable band is therefore narrow and sits high. **One pair cannot
calibrate a threshold**, and a replacement pair and a variant pair are needed before any number is
trusted.

**The overlap was redundancy, and it defeated the answer-time rules.** Identical routes, identical
first and last step; the older telling had collapsed four form fields into a single step, the newer
split them out. Nothing had changed in the product. Every rule in §6 failed to discriminate: both
tellings cover the same screens, so screen-match cannot choose; both start from a cold entry point,
so both are equally generic; and neither had usage history. **This is the case supersession exists
for** — where there is one route recorded twice, selection has nothing to select on.

### A whole-workflow average is the wrong measure

A second recording produced the first **false** positive, and it is more instructive than the true
ones. *"View analytics"* and *"View billing"* both open by clicking Home and then diverge — different
destinations, genuinely different tasks. Averaged into a single fingerprint they cleared the
similarity gate anyway, because in a two-step workflow the shared navigation step is **half the
content**. Measured on their opening steps alone, that pair scored the *highest* first-step
similarity of any pair in the KB.

The correction is not a higher threshold — that would be fitting a number to three observations.
It is a second signal: **compare where two workflows END**, and require both signals to agree. This
is structural rather than fitted. Two routes to billing are the same task however differently they
begin; two journeys that begin identically and finish in different places are not the same task, and
no amount of shared prefix should be able to say otherwise.

The margins say the same thing. Across the measured set, the averaged score separated true duplicates
from the false one by **0.054**; the final step separated them by **0.280** — five times the
discrimination, from a signal that was already sitting in the KB unused. The gates themselves live in
the detector's header comment, where a future editor will actually read them.

Still unmeasured, and the case most likely to stress this: a genuine **variant** — one goal, two real
routes. Those *should* end alike, but nothing has yet confirmed they do.

**Re-recording generates duplicates on its own.** The two tellings differ only in step granularity,
which is a model judgment made during distillation — not a consequence of the product changing or of
the founder recording differently. Any re-recording can produce this. It means overlap is a **normal
operating condition**, not an edge case triggered by product change, and it raises the expected
frequency of §1's failure accordingly.

---

## 6. Choosing between variants at answer time

These rules resolve **variance** — two real routes to one goal. They do not resolve redundancy;
§5 is why, and supersession is that path.

Two rules, in order.

**1 — Match the screen.** If the user is standing on a screen one variant covers, that variant wins.
This is not a new mechanism: the customer's route and the on-page probe already feed retrieval as
ranking signals. What is new is the job they are given — today they choose between *different*
workflows, and here they choose between *variants of one*.

**2 — Otherwise prefer the generic variant.** Where a variant can be started from a cold start, it is
generic; where it presupposes being mid-flow, it is specific. Inviting a teammate from Settings is
generic. Inviting one inside a particular flow carries prerequisites.

The tiebreak holds because **the failure modes are asymmetric.** Hand someone the specific variant
when they are not in that flow and step one is impossible — the screen it names does not exist for
them, and the answer dead-ends. Hand them the generic variant and it always works; at worst the path
is longer. The rule picks the option that degrades gracefully, which is why it stays correct in cases
nobody has enumerated.

That also defines *generic* operationally — **can this be started cold, or does it presuppose
context?** — which is answerable from what the KB already holds, at build time, once.

**3 — Floor.** If nothing matches the screen and neither variant is the generic one, fall back to the
most-asked-about variant. Rare, but the rules need a terminating case.

### Picking, not weighting

A ranking weight would leave both variants in the prompt, merely better ordered — which is the
crowding and interleaving this doc exists to remove. So one variant is selected as the workflow's
representative *before* ranking, and ranking then runs over distinct workflows. A useful side effect:
the prompt budget is spent on distinct capabilities rather than repeated tellings, which matters more
as the KB grows.

The cost is real and worth stating: a wrong pick makes the right answer **absent**, not merely
lower-ranked. That is acceptable only because of how the modes differ — in **Copilot** mode the agent
can search out the sibling variant when the first does not fit, so a wrong pick is recoverable; in
**AI Chatbot** mode there are no tools, so the pick is the whole answer. The conservative tiebreak in
rule 2 is what protects the mode that cannot recover. Mode vocabulary and the ceiling each mode
implies: [`agent.md`](agent.md).

---

## 7. What has to exist that does not

Two concepts, both small, both at the KB layer:

1. **A durable workflow identity** that variants attach to, independent of which recording produced
   them. Without it, two variants remain strangers that happen to resemble each other, and every
   consumer keeps double-counting them.
2. **A non-current state for a variant.** Approval today is presence-or-absence, which cannot express
   "this was reviewed, was true, and has been replaced." Supersession needs it, and so does any later
   drift signal that wants to retire a workflow without erasing it.

Everything else in this doc is a consumer of those two.

---

## 8. Options considered

| Option | What | Verdict |
|---|---|---|
| **Auto-merge on similarity** | Detect overlap at build, merge or drop automatically | ❌ Cannot distinguish replacement from variance (§4); silently wrong in the expensive direction |
| **Reject the duplicate at ingest** | Refuse to extract a workflow that already exists | ❌ The second recording is often the *better* or *newer* one — refusing it is backwards |
| **Prefer-newest as a ranking weight** | Bias retrieval toward recent recordings | ❌ Both variants still consume the budget and still interleave; stale content still answers |
| **Dedupe only at answer time** | Collapse duplicates during retrieval, tell nobody | ❌ Hides a KB the founder should be curating; analytics stay wrong; still a silent pick |
| **Ask at approval, resolve at retrieval** | Surface overlap to the founder; select one variant per workflow before ranking | ✅ **chosen** |
| **Do nothing** | Status quo | ❌ Documented in §1 — silent, compounding, and invisible in Studio |

---

## 9. Build split — two cuts

The two concepts in §7 have very different costs, and only one of them is needed for the overlap kind
observed so far. They ship separately.

**Cut 1 — detection and supersession.** Overlap is detected against already-approved workflows and
raised at approval time; the founder can supersede the older telling; retrieval excludes superseded
content. **No durable identity, no migration** — a superseded telling only needs to point at the one
that replaced it. This resolves both **replacement** and **redundancy**, and it removes the dangerous
failure: a copilot confidently teaching a screen that no longer exists.

Note what "keep both" means in Cut 1: **nothing happens** — which is the status quo. The gain is that
keeping both becomes an *informed* choice rather than an accident nobody was told about.

**Detection must not hang off the moment of approval.** Checking only as a workflow is approved
catches overlaps arriving from now on; a workspace whose duplicates are **already both approved** is
never prompted, because that moment has passed. The first real pair (§5) was in exactly that state,
so it is the common case on day one, not an edge.

What resolves this is *where* the comparison is anchored rather than *when*: the approval surface is
already workspace-wide, so comparing **every** workflow against everything currently live covers both
cases in one pass — an arriving duplicate and a long-standing one are the same query. Unapproved
against unapproved is deliberately not compared: neither is answering anyone, so there is nothing to
resolve yet.

**Cut 2 — identity and selection.** Workflows gain a durable identity; siblings that share a task get
one selected before ranking. Only *keep-both* genuinely needs the selection half, because only
keep-both must know that two tellings are siblings.

Cut 2 was originally justified by that selection. **The stronger reason turned out to be the
reprocess hazard**: an approval following a position onto content nobody reviewed was the last way
unapproved content could reach an end-user, and durable identity is what closes it. That reason
stands on its own even in a workspace that never sees two routes to one goal — which, so far, is
every workspace.

This cut is not small in blast radius, whatever its conceptual size: **every consumer keyed on the
recording coordinate** — retrieval, the sense plan, the walkthrough, the on-page probe, the widget's
citation payload and analytics. Introducing a durable identity is a migration across all of them, and
it changes retrieval's shape from weighting to selection, which existing signal-ordering guarantees
must be re-established against.

**What "drop the old key" turned out to mean.** Two things looked alike and are not:

- On an **approval**, the position was a second key — the very thing that let a re-split walk it onto
  unreviewed content. Those columns are gone, and Studio's mutations key on identity too, so nothing
  can approve "whatever is at index 2".
- On a **step**, the position is a denormalized cache of its workflow's, written in the same pass
  from the same value, exactly like the `workspaceId` the schema already carries for the same reason.
  It cannot drift, ~200 readers use it, and removing it would buy joins where a column already sits.
  **It stays**, and that is a decision rather than an omission.

The distinction worth keeping: a duplicated *key* is a hazard, a duplicated *fact* is a cache.

**Why this order.** The only overlap observed in a live KB was redundancy, which Cut 2's rules cannot
resolve at all (§5) — so Cut 1 is not merely the safer first step, it is the one that addresses the
case that exists. Cut 1 also generates the evidence Cut 2 needs: how often overlaps occur, how
cleanly they separate, and whether variance ever shows up in practice.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Founder supersedes the wrong variant — a real workflow goes dark | Nothing is deleted; supersession is a state and is reversible |
| Overlap prompts become noise on every recording | Compare only against *approved* workflows, and only above a confidence threshold — an unreviewed workspace should not nag |
| The threshold is set from too little evidence | The band is narrow and sits high, because one product's workflows share vocabulary (§5). Calibrate against a replacement pair and a variant pair, not one observation |
| Non-deterministic segmentation jitters the comparison | Overlap sits downstream of segmentation and distillation, both model passes. The threshold must tolerate boundary and granularity drift rather than assume stable input |
| Variant pick is wrong and the answer is absent, not just demoted | Agent modes can retrieve the sibling; the generic-first tiebreak protects the mode that cannot |
| Generic/specific inferred wrongly | Founder override at approval; the inference is a default, never a lock |
| Identity built inside the copilot, then needed by the portal and agents | It is a KB-layer concept by decision (§3) — the copilot is one consumer of three |
| Overlap detection costs a model pass per recording | Build-time only, against a shortlist the existing embeddings already produce — never per query |

---

## 11. Out of scope

- **Replay-based drift detection** — "is this still true?" needs the sandbox and the replay core.
  Phase 3's larger bet; this doc deliberately does not depend on it.
- **Merging two variants into one branched workflow.** Keeping both as siblings is the committed
  scope. A single workflow with conditional branches is a bigger idea and is not decided here.
- **Cross-workspace identity.** Workflows are workspace-scoped; nothing here changes tenancy.
- **Automatic supersession from production signals** (locators that stop resolving on real users'
  pages). A passive drift input that Phase 3 may later feed into the same supersession state.
