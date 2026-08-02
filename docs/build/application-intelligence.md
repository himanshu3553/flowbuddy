# FlowBuddy — The Application Intelligence Layer (direction + decisions)

> **The pipeline already derives what the founder DOES; this layer derives what the founder KNOWS.**
> A recording's narration carries more than tasks — what things *are*, how they relate, what a plan
> includes, when you'd pick one path over another — and today everything in it that isn't a workflow
> is thrown away. The Application Intelligence Layer harvests it into a small set of **linked,
> founder-approved knowledge pages**, derived from the same narration workflows come from, served
> through the same retrieval seam, inside the same trust boundary. One KB, two kinds of knowledge:
> workflows say how things are **done**; this layer says what things **are**.

- **Status:** [`roadmap.md`](../roadmap.md) §0. This doc records what was decided and why — nothing in it is built.
- **Companions:** the consumer and the gap it closes → [`agent.md`](agent.md) §9 Gap 1 (this layer **evolves P5-M2 Product Profile**, §G3 there) · the identity + liveness pattern it inherits → [`workflow-identity.md`](workflow-identity.md) · the steps half of the no-overlap contract → [`kb-step-distillation.md`](kb-step-distillation.md) · outward consumers, later → [`interop.md`](interop.md)

---

## 0. Start here (plain language)

The copilot is a support person who learned the product by watching recordings. It knows every
recipe and nothing else: it can say *how* to create an account, but not what a workspace *is*, how
the plans differ, or that the user doesn't need a new project for what they're attempting. Real
support traffic skews heavily toward exactly those orienting questions, and today every one of them
declines — correctly, and uselessly.

Yet the founder already answers them **while recording**. The narration of a full product tour is
half tasks and half explanation — concepts, comparisons, what's included where, why a thing exists.
The segmenter keeps the task-shaped half and turns it into workflows; the explanatory half lands
nowhere.

This layer collects that other half into **knowledge pages**: a product overview, a page per
concept, a page per product area — plus a description on each recording saying what it covers.
Pages link to each other and to the workflows they explain. The founder approves each page the way
they approve a workflow, and every consumer — Copilot, the diagnostic path, the future acting tier,
and eventually third-party agents — reads them through the same approved-only retrieval the workflows
already ride.

## 1. Why — and why this shape

Two facts meet:

1. **The biggest limit on Copilot mode is product understanding, not reasoning** — recorded as its
   top capability gap the day Copilot mode shipped ([`agent.md`](agent.md) §9 Gap 1).
2. **The raw material is already being captured and discarded.** No new recording modality, no new
   founder effort — a richer read of the narration we have.

### What this deliberately is NOT

The ambitious version of "application intelligence" is a hand-modeled application graph: an admin
authors entities, screens, actions, preconditions, permissions and API executors, and agents operate
the product through them. **Rejected as the road** (2026-08-01), for one decisive reason: it inverts
the wedge. FlowBuddy's promise is *record once, approve, minutes to value*; a product whose
onboarding is ontology-authoring is an integration project — the exact cost the recorder exists to
delete. It also duplicates the host app's own permission system (a second copy that drifts), and it
starts at the acting tier while the read-only tier is still proving itself.

What that thinking *contributes* survives here: the vocabulary (concepts, areas, relations), and the
rules it shares with our existing trust boundary — models propose, founders publish; recordings are
evidence, not truth; anything gate-shaped stays deterministic. If the agent tier later needs
preconditions and executors, they grow out of **this layer's approved pages plus the replay core**
([`agent.md`](agent.md), the acting layer) — never out of a parallel hand-modeled graph.

## 2. Decisions (captured 2026-08-01)

The trust spine — **AI-3, AI-5, AI-6, AI-7** — was explicitly founder-aligned 2026-08-01.

| # | Decision | Rationale |
|:---:|:---|:---|
| **AI-1** | **Derived, never authored.** Every page is extracted from recorded narration; the founder **approves and edits** — never models from a blank form. | The wedge. The founder's one job stays "record and explain." Derived prose also carries provenance (AI-7), which blank-form authoring cannot. Inverts P5-M2, whose "distill a starter from narration" footnote becomes the mechanism and whose authoring becomes editing. |
| **AI-2** | **Pages say what things ARE and how they RELATE — never how to DO.** A page must not restate steps; it links to the workflow instead. | The proven no-overlap contract, one altitude up: a description never restates a click target, and ([`agent.md`](agent.md) §G3) **background may orient and redirect; only workflows may instruct** — adopted verbatim. No overlap ⇒ no precedence rules ⇒ the layers cannot contradict. |
| **AI-3** | **A small set of page types, not one blob** (§3): overview · concept · area · the per-recording description. The page is the unit of retrieval, approval, citation, and staleness. | Retrieval wants focused chunks; approval wants reviewable pieces; a re-recording should suspect three pages, not one monolith. |
| **AI-4** | **Links are the graph.** Pages link to pages and to workflows; nothing more structured until a consumer demands it. No graph database, no relation tables, no typed ontology in v1. | A folder of linked pages IS the application graph in its cheapest honest form. Structure is extracted at the second consumer, not speculated at the first. |
| **AI-5** | **Same trust boundary, page-sized.** Pages are model prose inside the trust boundary ⇒ **born unapproved**, shown in full at approval, served only while approved **and live** (the one liveness column, same as workflows), through the **same retrieval seam and approval gate** — a second corpus in the same search, never a side door. | The description lesson: model output a founder never saw must never reach an end-user. One deliberate change from P5-M2: *approved-by-authorship* applied to founder-typed prose; it does **not** apply to derived prose. |
| **AI-6** | **Durable identity, re-matched by content.** Pages regenerate on reprocess; each re-match must agree on content or fail closed — a new page is born unapproved, a page that lost its content detaches to review. Never matched by position or title. | [`workflow-identity.md`](workflow-identity.md), inherited wholesale. The reprocess hazard was closed once for workflows; this layer must not reopen it one level up. |
| **AI-7** | **Provenance is anchored.** Every page cites the recording(s) and the narration span(s) it derives from — the knowledge-layer equivalent of steps citing captured events. | Approval then *means* something concrete: "this is what I said, and it's right." Staleness becomes detectable: re-record an area and the pages citing its narration become suspect. |
| **AI-8** | **Narration is the raw material — so guiding it is product work.** The recorder should coach the founder toward a *tour* ("explain it like onboarding a new employee"), not a silent click-through. | The layer's ceiling is narration richness. Click-commentary yields workflows and nothing else; a tour yields the product. Cheapest lever on quality in the whole design. |
| **AI-9** | **Capability lands in every tier at once.** Whatever pages feed the answer engines lands in the safety floor, the agent, and the diagnostic path alike — each on its own baseline. | The renderer freeze is about tuning, not capability. A knowledge layer only the agent reads would leave the sold safety floor answering worse than the tier above it for no reason. |

## 3. The pages (v1 sketch)

Example product: FlowBuddy itself.

| Page type | Holds | Example |
|:---|:---|:---|
| **Overview** (one) | What the product is, who it's for, the major areas — the orienting page. | "FlowBuddy adds an AI copilot to your SaaS…" |
| **Concept** (many) | One noun: what it is, what it isn't, how it relates. The glossary, one page per entry. | "A **workspace** is… each workspace has its own KB, mode, and widget key." |
| **Area** (some) | One region of the product: what lives there, which workflows operate there. | "**Analytics** shows questions asked, coverage gaps…" |
| **Recording description** (one per recording) | What this recording covers — the recording-level sibling of the workflow description. | "A tour of Studio: sign-up, first recording, approval, embedding." |

Every page carries: its narration citations (AI-7), its links (AI-4), its approval + liveness state
(AI-5), its identity (AI-6). Relations stay as links in v1 — "prerequisite-of," "alternative-to" and
friends become typed only when a consumer needs to query them (AI-4).

## 4. What it inherits from P5-M2 — and what changes

P5-M2 Product Profile ([`agent.md`](agent.md) §G3) designed the product-understanding KB as
founder-authored. This layer is its successor; the design home moves here.

**Kept:** the goal (orient, compare, redirect — close Gap 1) · the two-evidence-layer answer rule
(AI-2) · the bloat guard (per-page caps at extraction; an oversized layer competes against itself
in retrieval).

**Changed:** authored → **derived** (AI-1) · auto-approved-by-authorship → **born unapproved**
(AI-5) · one profile blob → **typed, linked pages** (AI-3, AI-4) · no provenance → **narration
anchoring** (AI-7).

**Changed at build time (2026-08-01) — storage.** P5-M2's compile-into-a-synthetic-source assumed
pages could ride the workflow item table with retrieval untouched. They cannot: a page belongs to
no workflow, and the item table's "every item has a workflow" invariant is worth keeping. Pages are
instead a **second corpus at the same retrieval seam** — their own rows, their liveness gate a
single WHERE clause inside retrieval and the vector scan (live-by-existence in the candidate set,
so the no-leak property stays structural), ranked in the same fusion, rendered in every engine as a
labelled PRODUCT BACKGROUND layer. One v1 cut rides along: pages inform answers but **emit no
citations** — every citation consumer (the Source pill, citation analytics, continuity) is
workflow-keyed today; the "Source: product knowledge" pill is a recorded follow-up.

## 5. Open questions — and how the build resolved them (2026-08-01)

1. ~~**Extraction unit.**~~ **Resolved:** per-recording extraction, merged into the workspace's pages by embedding identity (same greedy matcher as workflow identity, one vector) with a same-type title fallback. **Silence never retires:** a recording that doesn't mention a concept leaves its page untouched — only the founder retires pages.
2. **Editing semantics — half-resolved.** The reprocess half is built: a re-derivation that no longer agrees with an *approved* page parks as a **pending update** (its embedding rides along, so accepting keeps vector and text in step); accepting re-approves in the same act, dismissing drops it; unapproved drafts are simply overwritten. **Founder free-editing of page text is still open** (the one place AI-1 and AI-5 rub against each other).
3. ~~**Approval surface.**~~ **Resolved:** a "Product knowledge" section on the KB page beside the workflow list — full text always readable, provenance quotes shown, approve/retire/re-approve, pending-update review inline.
4. **Retrieval slot — v1 is pure competition** (pages rank in the same fusion; no reserved slot). Whether the overview should *always* ride as background is deliberately left for calibration on real questions.
5. **Recorder coaching shape** (AI-8). In-product prompts, a pre-recording checklist, or nothing but docs — and what it must never do (make recording feel like homework). *(The narration checklist that produced the first rich tour is the prototype copy.)*
6. ~~**The empirical gate**~~ — ran 2026-08-01: the pre-coaching transcripts were ~90% click-commentary (AI-8 confirmed as a real dependency); the coached re-recording carried the register the extractor needs.
7. ~~**Does the recording description ship first?**~~ — it did (slice 1), and proved the derive→approve→show pattern at the cheapest granularity.
8. **Links v1 (slice 3, 2026-08-02): workflow links only, structural, outside the pending flow.** A page's `related` titles are anchored against the recording's real workflow list (the quote rule, applied to links), resolved to durable workflow ids at sync, and surfaced in answers ONLY as live-approved `key=`s — so a link can never open unapproved content (`get_workflow` re-checks anyway), which is what makes auto-refreshing them without founder review safe. **Page↔page links stay deferred** until a consumer needs them (AI-4's second-consumer rule, applied to itself).

## 6. The road (slices, each independently shippable)

0. **Look at the transcripts.** Inspect existing recordings' narration for extractable product knowledge. Cheap falsification: if it's click-commentary, AI-8 comes first.
1. **Recording description.** Smallest end-to-end slice of the whole pattern: derive → approve → show in Studio.
2. **Overview + concept pages.** Extraction, the approval surface, retrieval integration (AI-5), citations reading "Source: product knowledge."
3. **Links + area pages.** Pages reference workflows and each other; answers can redirect ("you don't need a new project for that — see *projects*").
4. **Later, evidence permitting:** concept vocabulary feeding retrieval synonyms · Sense consuming area context · pages exposed through the interop surface · the agent tier growing preconditions out of approved pages.

**Sequencing rule (standing):** this layer builds **after the KB has depth** — the same gate Gap 1
already carries. On a two-workflow KB an improvement can't be attributed, most orienting questions
can't even be asked, and every page would derive from a sliver of narration. Record more first; it
is also this layer's raw material.

---

> **Not in scope:** hand-modeled graph objects (entities/actions/permissions as admin-authored
> tables) · acting, preconditions-as-gates, executors, policy engines — the agent tier's business
> ([`agent.md`](agent.md)) · publishing pages to third-party agents ([`interop.md`](interop.md),
> later) · a graph database or typed relation store · auto-publishing any derived page — never.
