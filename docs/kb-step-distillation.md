# KB Step Distillation — design & build plan

**Status:** ✅ **Built, verified end-to-end & committed (2026-06-27)** — Phases 1–6 done (distillation pipeline built 2026-06-26; segmenter finalized + E2E-verified + committed `e5f81d8` on 2026-06-27) · **Owner:** copilot KB pipeline

Turn the noisy, raw, 1:1 event dump that the KB currently stores into a clean, deduplicated, user-facing **step list** per workflow — so the copilot is grounded on real steps, not DOM telemetry. *(How many workflows* a recording splits into is the **segmenter's** job, separate from this doc. The segmenter ([`segment.ts`](../packages/synthesis/src/segment.ts)) is a single **event-aware** LLM pass driven primarily by **goal-completion / terminal states** (redirects, route resets, dashboards, sign-outs, success toasts), with narration + user markers as supporting signals; it emits a per-boundary `confidence` to flag splits an editor should review, and a carry-forward guard ensures no event is ever silently dropped. It went through a few iterations on 2026-06-27 — an initial single-task bias over-merged a 4-task recording, a narration-only two-stage attempt over-anchored, and the terminal-state pass landed it.)* This doc is the next layer down: the steps *inside* a workflow.

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

1. **Capture is permissive (extension).** [`content.ts`](../packages/extension/src/content.ts) records every `click`/`change`/`submit`/`Enter`/`nav`. `resolveTarget` ([content.ts:164-168](../packages/extension/src/content.ts#L164-L168)) falls back to the raw element when there's no interactive ancestor (`return interactive || el`), so clicks on non-interactive page chrome (#1, #2, #13) still emit. There's no "workflow starts here" concept, and no dedup.
2. **KB build is a 1:1 passthrough (the real gap).** [`buildKB`](../packages/synthesis/src/index.ts#L57-L78) maps **every event to one KnowledgeItem, verbatim**. Nothing merges, dedupes, or judges relevance. The only LLM pass at build time is the *segmenter*, which groups items into a workflow but never cleans them.
3. **Narration alignment smears (time-window).** [`align.ts`](../packages/synthesis/src/align.ts) attaches narration by a 4s-lead/1.5s-trail window. Because the user narrates continuously, the same sentence lands on multiple events (#8/#9/#10 all say "put the password also like this") and the wrong events (#5/#6 inherit "we need to click on that," which belongs to #4).

> Note: a step-distillation engine already exists in-tree — [`synthesize.ts`](../packages/synthesis/src/synthesize.ts) (the **parked Phase-2** article generator) turns events into clean prose steps. It is *not* wired into the copilot path. We will build a copilot-focused distiller, reusing its patterns.

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
| **A — LLM distillation at build** | Model turns raw events + narration + transcript into clean, ordered, deduped, user-facing steps; raw events are **discarded** (not kept as evidence) | Highest quality; fixes stray clicks + narration attribution; reuses parked engine | +1 LLM call/workflow; needs grounding guardrails | ✅ **chosen** |
| **B — Deterministic heuristics** | Rules: drop non-interactive clicks, dedupe consecutive same-target, merge focus-click+input, merge button-click+submit | Free, fast, predictable | Brittle; can't fix narration; would drop the "arrived" signal if naive | ✅ **chosen** (as pre-filter for A) |
| **C — Filter at capture (extension)** | Don't emit non-interactive clicks; dedupe at source | Stops noise earliest | Loses page-context signals; can't fix narration; ships in the client (slower to iterate) | ⏸ future hardening |
| **D — Workflow-start marker / narration realignment** | Recorder marks task start; attach narration at workflow level | Cleanly removes pre-workflow noise | Requires UX + capture changes | ⏸ future (A covers most of it) |

**Chosen: A + B.** B does mechanical de-duplication deterministically; A does the semantic judgment (stray vs. meaningful) and writes clean instructions, using narration context B can't reason about. C and D are deferred hardening.

---

## 5. Target design

### 5.1 Pipeline sequence (worker)

```
BEFORE:  transcribe → align → [map events 1:1 → KnowledgeItems] → segment(raw) → tag segmentIndex
AFTER:   transcribe → align → CLEAN(B) → segment(cleaned) → DISTILL(A) per workflow → persist distilled steps
```

Segment first (it already works well on the timeline), then distill **per workflow** so the model always sees one coherent task. **The distilled steps are the only KB units persisted** — raw events are *not* written as KnowledgeItems and are *not* kept as evidence. The original `KnowledgeSource.manifest` still holds the raw capture, but only as the immutable upload record needed to **reprocess** a recording — it is never surfaced and is not a citation/evidence source. Citations, if ever added, will reference the published/approved workflow.

### 5.2 B — deterministic cleanup (`clean.ts`)

Pure function `cleanEvents(events): CapturedEvent[]`. Conservative, mechanical only:

1. **Dedupe consecutive same-target events** within a short window (collapse #8/#9/#10 → 1).
2. **Merge focus-click + input on the same field** → keep the value-bearing `input`, drop the focus `click` (#7, #8).
3. **Merge submit-button click + form `submit`** → keep the labeled button click, drop the form-blob `submit` (#11 keeps, #12 drops).
4. *(Optional, conservative)* **Flag** clicks with no interactive ancestor (tag ∉ {a,button,input,select,textarea,label} and no button/link/menuitem/tab role) — but **don't drop** them here; pass the flag to A so the LLM (with narration) makes the final call on #1/#2/#3/#13.

Output feeds both the segmenter and the distiller.

### 5.3 A — distillation engine (`distill.ts`)

`distillSteps(openai, model, workflowTitle, events, narration, transcriptText): DistilledStep[]`

**Model output schema (structured JSON, `temperature: 0`):**
```ts
interface DistilledStepLLM {
  instruction: string;       // imperative, user-facing: "Click 'Sign In' to open the login page"
  detail?: string;           // optional extra ("the button is top-right")
  route: string;             // page path the step occurs on (preserves P1-M8 route-boost)
  sourceEventIds: string[];  // grounding/validation — the events this step merges (anti-hallucination)
  keyEventId: string;        // the ONE source event that best represents the step visually
}
```

The model output is then **resolved** into the persisted step. `sourceEventIds` is a build-time anti-hallucination device (forcing each step to point at real events lets us validate it isn't inventing steps); after validation the *list* is discarded. `keyEventId` is resolved to **one screenshot + bbox**:

```ts
interface DistilledStep {                 // what we persist (in KnowledgeItem.data)
  instruction: string;
  detail?: string;
  route: string;
  narration: string | null;               // attributed narration for the step
  screenshotFile: string | null;          // resolved from keyEventId + frame rule C (below)
  bbox?: { x: number; y: number; w: number; h: number }; // keyEvent's element rect — for later highlight
}
```

**Screenshot selection (frame rule C, deterministic — no LLM frame choice):**
- Resolve `keyEventId` → its event in the (cleaned) set. Default to the **action frame** `shots/<keyEventId>.jpg`.
- For the **last step of the workflow** (the outcome) → use the **result frame** `shots/<keyEventId>-post.jpg` (falls back to the action frame if no post-shot exists).
- Carry the keyEvent's `target.bbox` onto the step (free; powers the element highlight — **now rendered in Studio's KB detail page** (2026-07-03), see §8).
- Fallback if `keyEventId` is missing/invalid: the step's last valid `sourceEventId`; if none, `screenshotFile = null`.

**Prompt rules:**
- Drop orienting/stray actions not needed to reach the goal (the model sees "this is the landing page" in narration → #1/#2/#3 are non-steps).
- Merge low-level interactions into one user-facing step.
- Write clear imperative instructions; attribute narration correctly (fixes the smear).
- Preserve order; **every step must cite ≥1 real event id** and name a `keyEventId` from its own `sourceEventIds`.

**Guardrails:**
- Validate every `sourceEventId`/`keyEventId` against the known event set (same defensive filter the segmenter uses); drop steps that cite no known id.
- If distillation returns 0 steps for a non-empty workflow → **fallback** to the cleaned events as steps (never lose a workflow).

### 5.4 Data model

**No Prisma migration** — reuse the existing `KnowledgeItem` row, repurposed to hold a distilled step:

| Field | Before (raw event) | After (distilled step) |
|---|---|---|
| `kind` | `'step'` | `'step'` (unchanged) |
| `orderIndex` | event order | clean step order |
| `text` | `eventLabel + narration` | **clean instruction** (better retrieval) |
| `segmentIndex` / `segmentTitle` | per workflow | unchanged |
| `data` (Json) | `{ event, narration }` | `{ instruction, detail, route, narration, screenshotFile, bbox }` |

The persisted step keeps **no raw-event log** — but it does carry **one curated screenshot** (`screenshotFile`, resolved from `keyEventId` + frame rule C) and the element `bbox` as published-step content. `route` is carried for P1-M8 route-boost. The raw event *records* remain solely in `KnowledgeSource.manifest` as the reprocess record, never surfaced. (The unreferenced screenshots from dropped/stray events sit unused in MinIO — a future prune could remove them.)

### 5.5 Consumer impact

| Consumer | Today | Change |
|---|---|---|
| [`api/src/copilot.ts`](../packages/api/src/copilot.ts#L45) (retrieval) | route from `data.event.route.path`; `text`; `data.narration` | read `data.route` + `text` (now clean) + `data.narration` — small shape update |
| [`synthesis/src/copilot.ts`](../packages/synthesis/src/copilot.ts) (answer) | uses `text` + `narration` | unchanged (cleaner inputs) |
| [`web/.../kb/[id]/page.tsx`](../packages/web/app/dashboard/kb/%5Bid%5D/page.tsx) (KB panel) | renders raw items + per-event `data.event.screenshot.file` | render **distilled steps**: `instruction`, `detail`, attributed `narration`, and the **one curated `data.screenshotFile`** per step. Drop the raw-item rendering. Relabel "Knowledge items by workflow" → "Steps". (`bbox` highlight overlay = later.) |
| Approval (`CopilotApproval`) | keyed by `(sourceId, segmentIndex)` | **unaffected** — still per-workflow |

---

## 6. Build plan & sequence

Each phase is independently shippable and ends with a checkable DoD. Order matters: cheap filter → engine → rewire → consumers → verify.

### Phase 1 — Deterministic cleanup (B) ✅ done (2026-06-26)
- **Build:** `packages/synthesis/src/clean.ts` (`cleanEvents` + `isLikelyInteractiveTarget`), exported from the barrel.
- **DoD (met):** on a fixture of the 13 chatful events, **13 → 8** — focus-clicks (#7/#8), duplicate password clicks (#9/#10), and the form-submit (#12) dropped; the 4 stray non-interactive clicks (#1/#2/#3-ish/#13) are *flagged*, not dropped (left for A). Full repo `pnpm typecheck` green. No pipeline wiring yet.

### Phase 2 — Distillation engine (A) ✅ done (2026-06-26)
- **Built:** `packages/synthesis/src/distill.ts` — `distillSteps` + `DistilledStepLLM`/`DistilledStep` types + JSON schema + event-id validation + `keyEventId` → screenshot resolution (frame rule C) + `bbox` carry + 0-step fallback. `temperature: 0`. Text fields run through `redactText` (P1-M12).
- **DoD (met):** mocked-OpenAI unit check (10 assertions) — ungrounded steps dropped, per-step action frame, last step → result frame, `bbox` carried, narration derived, empty-model fallback. `pnpm typecheck` green.

### Phase 3 — Pipeline rewire (synthesis + worker) ✅ done (2026-06-26)
- **Built:** `buildWorkflowKB` in [`index.ts`](../packages/synthesis/src/index.ts) (transcribe → align → **clean** → segment → **distill** → distilled steps grouped by workflow). [`worker.ts`](../packages/api/src/worker.ts) now calls it and persists **distilled steps** (clean `text` = `distilledStepText` + `data: { instruction, detail, route, narration, screenshotFile, bbox }` + `segmentIndex`/`segmentTitle`, `orderIndex` within workflow). The raw 1:1 persistence + the read-back/tag round-trip are gone. `buildKB`/`segmentItems` stay exported (parked Phase-2 article engine still imports them) but the worker no longer calls them.
- **DoD (met):** `cleanEvents`/`distillSteps` are now in the live call chain; worker log = `N workflow(s), M distilled step(s)`; full repo `pnpm typecheck` + build green.
- **Known half-state (until Phase 4):** the persisted `data` shape changed, so the **KB page** still shows each step's text + narration but **no screenshot** (it reads the old `data.event.screenshot.file`), and **route-boost** (reads `data.event.route.path`) is off. Copilot *answers* still work (retrieval reads `text` + `data.narration`, both present).

> **Parked Phase-2 impact (record for resume):** the parked article engine ([`generate-actions.ts`](../packages/web/lib/generate-actions.ts), [`prompt-actions.ts`](../packages/web/lib/prompt-actions.ts)) reads raw events from `KnowledgeItem.data.event`, which **new recordings no longer store**. When Phase 2 resumes it must source raw events from `KnowledgeSource.manifest` instead. Not fixed now (don't touch parked code).

### Phase 4 — Update consumers ✅ done (2026-06-26) — closes the Phase-3 half-state
- **Built:** [`api/src/copilot.ts`](../packages/api/src/copilot.ts) route-boost now reads `data.route` (with an `event.route.path` fallback for any pre-distillation rows). The Studio KB page ([`kb/[id]/page.tsx`](../packages/web/app/dashboard/kb/%5Bid%5D/page.tsx)) now reads the distilled shape (`instruction`/`detail`/`narration`/`route`/`screenshotFile`), renders "Step N" with the curated screenshot, and is relabelled "Steps by workflow" (counts say "steps"). The answer engine needed no change (reads `text` + `narration`).
- **DoD (met):** KB page renders clean steps + curated screenshots from the new shape; route-boost reads `data.route`; full repo `pnpm typecheck` green. Flag 1 (half-state) is closed.

### Phase 5 — End-to-end verification ✅ done (2026-06-27)
- **Verified by the user** on a fresh recording (Parts 6–11 of [`e2e-testing.md`](./e2e-testing.md)): the pipeline produces clean distilled steps with curated screenshots and the copilot answers correctly. Confirmed working end-to-end.

### Phase 6 — Docs + memory ✅ done (2026-06-27)
- **Done (2026-06-26):** [`architecture.md`](./architecture.md) (Module 2 = distilled steps; raw events discarded, only in manifest), [`phase-1-copilot.md`](./phase-1-copilot.md) (KB worker pipeline + `KnowledgeItem` data shape + KB-page label), this doc's status → Built, and the auto-memory KB note updated.
- **Follow-up sync (2026-06-27):** the remaining docs that still described the pre-distillation pipeline were updated to match — [`roadmap.md`](./roadmap.md) (P1-M2 = distilled steps; doc map), [`phase-1-modules-map.md`](./phase-1-modules-map.md) (worker/KB nodes), and [`e2e-testing.md`](./e2e-testing.md) (worker-log lines, KB-page labels, architecture diagram).

**Dependency order:** 1 → 2 → 3 → 4 → 5 → 6. Phases 1 and 2 can be built in parallel (independent modules); 3 depends on both.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| LLM invents steps not in the recording | Require every step to cite real event ids; validate + drop unknowns (segmenter-style) |
| Over-aggressive cleanup drops a real step | B is mechanical-only; semantic drops are A's job with narration context; 0-step fallback to cleaned events |
| Cost/latency: +1 call per workflow | Build-time only (not per query); `temperature: 0`; one call per workflow, not per event |
| Route-boost (P1-M8) regresses | Carry `route` onto every distilled step |
| Wrong/empty step screenshot | Frame rule C is deterministic; fallback chain (keyEventId → last sourceEventId → null); result-frame falls back to action-frame if no post-shot |
| Future citations need a source | Citations (if ever) reference the **published/approved workflow**, not raw events — no raw log to preserve |
| Reprocess churn | Worker already deletes+recreates items idempotently; approval keyed by `segmentIndex` survives; the `manifest` remains the reprocess record |

---

## 8. Out of scope (future hardening)

- **bbox highlight rendering** — ✅ **shipped 2026-07-03** on Studio's KB detail page ([`web/.../step-screenshot.tsx`](../packages/web/components/dashboard/step-screenshot.tsx)): the step screenshot opens in a **same-page lightbox** and the `bbox` is drawn as a CSS overlay expressed in **viewport fractions** (`bbox / manifest.app.viewport`) — DPR-independent, no coordinate calibration needed. Pure render-layer add (no pipeline change, no reprocess). *(The parked Phase-2 article editor has its own `lib/highlight.ts` doing the same fraction math; the KB page keeps a self-contained copy rather than importing parked code.)*
- **Prune unreferenced screenshots**: only ~1 screenshot per step is referenced; the dropped/stray events' shots sit unused in MinIO.
- **C — capture-source filtering**: stop emitting non-interactive clicks / dedupe in the extension.
- **D — workflow-start marker**: let the recorder mark where the task begins (kills pre-workflow noise at the source); workflow-level narration instead of per-event smear.
- First-class Prisma columns for step fields (currently in `data` JSON — migrate only if we need to query them).

---

## 9. File-change map

**New:**
- `packages/synthesis/src/clean.ts` — deterministic event cleanup (B)
- `packages/synthesis/src/distill.ts` — LLM step distillation (A) + `DistilledStep`

**Edit:**
- `packages/synthesis/src/index.ts` — orchestration (`buildWorkflowKB`), exports
- `packages/api/src/worker.ts` — persist distilled steps
- `packages/api/src/copilot.ts` — `data.route` shape
- `packages/web/app/dashboard/kb/[id]/page.tsx` — render distilled steps (instruction/detail/narration + curated `screenshotFile`), drop raw-item rendering, relabel panel

**Unchanged:** capture contract (shared), Prisma schema (no migration), approval, answer engine ([`synthesis/copilot.ts`](../packages/synthesis/src/copilot.ts)).
