# KB Step Distillation — design & build plan

**Status:** [`roadmap.md`](../roadmap.md) §2 (P1-M2) · **Owner:** copilot KB pipeline

Turn the noisy, raw, 1:1 event dump that the KB currently stores into a clean, deduplicated, user-facing **step list** per workflow — so the copilot is grounded on real steps, not DOM telemetry. *(How many workflows* a recording splits into is the **segmenter's** job, separate from this doc. The segmenter ([`segment.ts`](../../packages/synthesis/src/segment.ts)) first cuts the events at the author's **"new workflow" markers — hard boundaries enforced structurally, one event-aware LLM pass per span, so a workflow can never merge across one** — and within a span is driven primarily by **goal-completion / terminal states** (redirects, route resets, dashboards, sign-outs, success toasts), with narration as the supporting signal; it emits a per-boundary `confidence` to flag splits an editor should review, and a carry-forward guard ensures no event is ever silently dropped. It went through a few iterations on 2026-06-27 — an initial single-task bias over-merged a 4-task recording, a narration-only two-stage attempt over-anchored, and the terminal-state pass landed it.)* This doc is the next layer down: the steps *inside* a workflow.

---

## 1. Problem

A simple chatful.co sign-in recording produced **13 raw "knowledge items"** for one workflow. Only ~4 are real steps; the rest are stray clicks, mechanical duplicates, and misattributed narration.

| # | Captured event | Verdict |
|---|---|---|
| 1 | click "Go Live in 5 Minutes" @ / | ❌ stray landing-page click (non-interactive `div`) |
| 2 | click "AI Assistant…Instant Replies…" @ / | ❌ stray click on chat widget |
| 3 | click "Chatful AI" @ / | ❌ stray click on logo |
| **4** | **click "Sign In" @ /** | ✅ Step 1 — open login |
| 5 | input "Password" @ /auth/login | ✅ (mis-ordered) part of Step 3 |
| 6 | input "Email" @ /auth/login | ✅ Step 2 — enter email |
| 7 | click "Email" @ /auth/login | ❌ redundant focus-click (pairs with #6) |
| 8–10 | click "Password" ×3 | ❌ focus-click + duplicates |
| **11** | **click "Sign in" @ /auth/login** | ✅ Step 4 — submit |
| 12 | submit "Email…Sign in" form | ❌ duplicate of #11 (form-level) |
| 13 | click "Here's what's happening…" @ /dashboard | ❌ stray click; useful only as the "arrived" signal |

**Target:** 13 raw events → **~4 clean steps**:
1. Click **Sign In** to open the login page
2. Enter your **email**
3. Enter your **password**
4. Click **Sign in** → you land on the dashboard

---

## 2. Root cause (three layers)

1. **Capture is permissive (extension).** [`content.ts`](../../packages/extension/src/content.ts) records every `click`/`change`/`submit`/`Enter`/`nav`. `resolveTarget` ([content.ts:164-168](../../packages/extension/src/content.ts#L164-L168)) falls back to the raw element when there's no interactive ancestor (`return interactive || el`), so clicks on non-interactive page chrome (#1, #2, #13) still emit. There's no "workflow starts here" concept, and no dedup.
2. **KB build is a 1:1 passthrough (the real gap).** [`buildKB`](../../packages/synthesis/src/index.ts#L57-L78) maps **every event to one KnowledgeItem, verbatim**. Nothing merges, dedupes, or judges relevance. The only LLM pass at build time is the *segmenter*, which groups items into a workflow but never cleans them.
3. **Narration alignment smears (time-window).** [`align.ts`](../../packages/synthesis/src/align.ts) attaches narration by a 4s-lead/1.5s-trail window. Because the user narrates continuously, the same sentence lands on multiple events (#8/#9/#10 all say "put the password also like this") and the wrong events (#5/#6 inherit "we need to click on that," which belongs to #4). *(Closed for good 2026-08-21: raw narration stopped being persisted on steps at all — the distiller's ATTRIBUTION rule folds each clause into the right step's `detail`, so the smear can no longer ship; the video talk-track re-derives narration from the transcript at render. See `DistilledStep.narration`.)*

> Note: at design time a step-distillation engine already existed in-tree — `synthesize.ts` turned events into clean prose steps; it was never wired into the copilot path, and the copilot-focused distiller built here reused its patterns.

---

## 3. Decisions (locked)

| Decision | Choice | Implication |
|---|---|---|
| Are raw items user-visible? | **No** | The KB UI + copilot read **distilled steps only**. |
| Keep the raw event log as citation evidence? | **No** | Raw events are **not** persisted as KB units and are **not** an evidence/citation source. The distilled step keeps no raw-event log. Citations — *if ever needed* — reference the **published/approved workflow**, never raw events. |
| Keep a screenshot per step? | **Yes — one curated visual** | Each distilled step keeps **one** representative screenshot + the element's `bbox`, chosen via `keyEventId`. This is published-step **content** (a visual for the workflow), *not* the raw-event log. Frame rule = **C** (action frame per step; **result** frame for the final/outcome step). |
| Highlight the clicked element (`bbox`)? | **Deferred build; capture data now** | Persist `bbox` on the step now (free); render the highlight as a later render-layer add. See §8. |
| Where does distillation run? | **At KB build** (in the worker), once, persisted | Cheaper than at retrieval; the copilot reads ready-made clean steps. |
| Approach | **A + B** — deterministic cleanup *then* LLM distillation | B kills mechanical duplicates for free; A handles semantic relevance + wording. |

---

## 4. Options considered

| Option | What | Pros | Cons | Verdict |
|---|---|---|---|---|
| **A — LLM distillation at build** | Model turns raw events + narration + transcript into clean, ordered, deduped, user-facing steps; raw events are **discarded** (not kept as evidence) | Highest quality; fixes stray clicks + narration attribution; reused existing prompt patterns | +1 LLM call/workflow; needs grounding guardrails | ✅ **chosen** |
| **B — Deterministic heuristics** | Rules: drop non-interactive clicks, dedupe consecutive same-target, merge focus-click+input, merge button-click+submit | Free, fast, predictable | Brittle; can't fix narration; would drop the "arrived" signal if naive | ✅ **chosen** (as pre-filter for A) |
| **C — Filter at capture (extension)** | Don't emit non-interactive clicks; dedupe at source | Stops noise earliest | Loses page-context signals; can't fix narration; ships in the client (slower to iterate) | ⏸ future hardening |
| **D — Workflow-start marker / narration realignment** | Recorder marks task start; attach narration at workflow level | Cleanly removes pre-workflow noise | Requires UX + capture changes | ⏸ future (A covers most of it) |

**Chosen: A + B.** B does mechanical de-duplication deterministically; A does the semantic judgment (stray vs. meaningful) and writes clean instructions, using narration context B can't reason about. C and D are deferred hardening.

---

## 5. Target design

The pipeline as it runs — stages, prompts, guards, fallbacks and every tuning constant — is
[`internals/knowledge-base.md`](../internals/knowledge-base.md). What belongs here is the *shape* the
design settled on: raw events are **cleaned deterministically first** (cheap, no LLM, no semantic
judgment), then **segmented into workflows** and **distilled into steps** by the model, which needs
narration context the cleanup stage deliberately doesn't have. That ordering — cheap filter before
expensive judgment — is the design.

**The granularity invariant (2026-08-11): one step = one actable control — and it is enforced,
never trusted to the prompt.** The model's original brief included "merge low-level interactions
into one step"; the merges that justified it (focus-click + typing, button + its duplicate submit)
had all long since moved into the deterministic cleanup, so the only merging left to the model was
the harmful kind — and it happened live: *"Enter your email address and password"* as one step
compiled to an acting plan that filled the email and silently never asked for the password, then
checked the instruction off anyway. The model now keeps exactly two judgments — which events are
stray (DROP) and how a step reads (WORDING) — and loses the third (merging). Three layers hold the
line: the prompt asks for one step per control (raises the hit rate, guarantees nothing); a
**deterministic split pass** after grounding validation breaks any step spanning several actable
controls into one step per control, at fallback wording quality (the guarantee); and the plan
compiler **refuses** a multi-control step at enable time (the alarm, should enforcement ever
regress). Repeated commits to the *same* control remain one step, keyed on the last commit — the
final value is the one a run must reproduce. Each step now persists the event ids it was built
from, which is what makes the invariant checkable forever rather than a one-time cleanup.

---

## 6. Build plan & sequence

Built in six phases over 2026-06-26/27 (deterministic cleanup → LLM distillation → rewire → consumers → verify), commit `e5f81d8`, **user-verified E2E 2026-06-27**. The sequence itself is spent; `git log -- packages/synthesis` has it if the order ever matters again.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| LLM invents steps not in the recording | Require every step to cite real event ids; validate + drop unknowns (segmenter-style) |
| Over-aggressive cleanup drops a real step | B is mechanical-only; semantic drops are A's job with narration context; 0-step fallback to cleaned events |
| Cost/latency: +1 call per workflow | Build-time only (not per query); one call per workflow, not per event |
| Route-boost (P1-M8) regresses | Carry `route` onto every distilled step |
| Wrong/empty step screenshot | Frame rule C is deterministic; fallback chain (keyEventId → last sourceEventId → null); result-frame falls back to action-frame if no post-shot |
| Future citations need a source | Citations (if ever) reference the **published/approved workflow**, not raw events — no raw log to preserve |
| Reprocess churn | Worker already deletes+recreates items idempotently; the approval is identity-keyed and re-matched **by content**, so it survives where the content still agrees and fails closed where it does not ([`workflow-identity.md`](workflow-identity.md)); the `manifest` remains the reprocess record |

---

## 8. Out of scope (future hardening)

- **bbox highlight rendering** — ✅ **shipped 2026-07-03** on Studio's KB detail page ([`web/.../step-screenshot.tsx`](../../packages/web/components/dashboard/step-screenshot.tsx)): the step screenshot opens in a **same-page lightbox** and the `bbox` is drawn as a CSS overlay expressed in **viewport fractions** (`bbox / manifest.app.viewport`) — DPR-independent, no coordinate calibration needed. Pure render-layer add (no pipeline change, no reprocess). *(The KB page's self-contained fraction-math implementation is the only one in the tree.)*
- **Prune unreferenced screenshots**: only ~1 screenshot per step is referenced; the dropped/stray events' shots sit unused in MinIO.
- **C — capture-source filtering**: stop emitting non-interactive clicks / dedupe in the extension.
- **D — workflow-start marker**: let the recorder mark where the task begins (kills pre-workflow noise at the source); workflow-level narration instead of per-event smear.
- First-class Prisma columns for step fields (currently in `data` JSON — migrate only if we need to query them).

---
