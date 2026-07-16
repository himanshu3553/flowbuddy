# FlowBuddy — System Architecture (the 3 modules)

> **Canonical model.** FlowBuddy is three modules: **(1) Capture** raw data, **(2)** turn it into an explicit **Knowledge Base**, **(3)** create **Articles** from the KB. Capture *modality* and article-creation *mode* are **orthogonal** — connected only through the KB. Every other doc ([`product.md`](product.md), [`roadmap.md`](roadmap.md), the phase docs) refers here for the module structure; the **per-phase data-model deltas** live in [`phase-1-copilot.md`](phase-1-copilot.md) §7 (copilot) and [`v2-portal.md`](v2-portal.md) §4 (the V2 portal track).

- **Status:** Frozen v1.0 — 2026-06-19. Segmentation placement **locked: Option B → C** (§Decisions). Product-version scope **locked 2026-06-21** (below). **UPDATED 2026-06-22 — copilot-first pivot:** the copilot grounds on **approved-KB** (not published articles) and copilot/portal are **decoupled** targets; the 3-module model is unchanged. See [`product.md`](product.md) §5. *(Supersedes §Decisions "copilot grounds on PUBLISHED articles".)*
- **Key principle preserved:** *grounded authorship* — AI writes **only** from the customer's own recordings, never the model's general knowledge.

### Product versions & phases (scope — **phases REDEFINED 2026-06-22, copilot-first**)
- **Version 1** = the **workflow-capture** product (**capture is workflow-only, 1.1**), released in **four phases — a pure copilot arc (answer → locate → stay fresh → act)** — authoritative roadmap: [`roadmap.md`](roadmap.md):
  - **Phase 1 — Copilot** ⭐ (the Version 1 release, ships first): the foundation we've built (capture → KB → retrieval/grounding) + the embeddable copilot. Modules **P1-M0…P1-M12** ([`phase-1-copilot.md`](phase-1-copilot.md)).
  - **Phase 2 — Sense (in-context help)**: the copilot localizes the end-user to **workflow + step** (an ask-time read-only probe of approved workflows' captured locators against the live page; **hybrid** — client scores, the answer LLM disambiguates with the question) and answers **positionally** ("you're on step 3 of X — here's how to get unstuck, then the path to done"). No acting, no end-user recording. Modules **P2-M0…M4 ✅ built + user-verified E2E 2026-07-09** ([`phase-2-sense.md`](phase-2-sense.md)); **+ P2-M5 Reason** — diagnostic reasoning over ask-time page-state capture + the founder's expected state, **✅ built + user-verified E2E 2026-07-13** ([`phase-2-reason.md`](phase-2-reason.md)).
  - **Phase 3 — Self-validation & freshness** (the moat; to be planned).
  - **Phase 4 — Autopilot** (agentic execution; opened ahead of Phase 3, sequencing decision 2026-07-15): the copilot executes approved workflows in the end-user's live session — **grounded actions** over the same replay core Phase 3 builds, entering mid-workflow via Sense's localization. **P4-M0 guided walkthrough ✅ built 2026-07-15** (zero-acting); the acting modules **P4-M1…M3** to plan ([`phase-4-autopilot.md`](phase-4-autopilot.md)). **Phase 5 — Converse** (the goal-based agent: Tell → Guide → Do; P5 = brain, P4 = hands) is designed in draft ([`phase-5-converse.md`](phase-5-converse.md)).
- **Version 2** = the **Help Portal & Articles track** (the human-facing by-products, **moved out of V1 2026-07-08**: render approved workflows as articles + per-audience approval + presentation overlay + productization — modules **V2 · P0…P6**, [`v2-portal.md`](v2-portal.md)) + additional **capture modalities** — **narration-only (1.2)** and **video (1.3)** — plus the narration-derived `static` explainer-article path, + product depth.

> **⚠️ Phase numbers were redefined 2026-06-22.** The 3-module model below is **unchanged**; only the *phase grouping* and the *copilot's grounding* (**approved-KB**, not published articles) changed. Previously: Phase 1 = the wedge, Phase 2 = copilot, Phase 3 = self-validation. **Now:** Phase 1 = **copilot** (primary, ships first), Phase 3 = self-validation. Module IDs are now **per-phase** (`P{phase}-M{n}`); the old global `M0–M14` are mapped in [`roadmap.md`](roadmap.md) §7. See also [`product.md`](product.md) §5.
>
> **⚠️ Phase 2 was redefined again 2026-07-08:** the portal/articles by-products moved **out of Version 1 into Version 2** (the portal track, `V2 · P0…P6` — [`v2-portal.md`](v2-portal.md)); the new **Phase 2 = Sense (in-context help)**.

---

## Module 1 — Raw data capture (input modalities)

Job: get raw, un-interpreted signal in. Three capture **kinds**, each producing different raw layers but the **same envelope** (capture → upload → object storage + a source record). A capture carries a `kind`.

| Kind | Raw layers | Status |
|---|---|---|
| **1.1 Workflow** | interaction events + **DOM fingerprints** (role/name/selector/bbox/route) + event & post-action screenshots + DOM snapshots + audio | ✅ built — **Version 1** |
| **1.2 Narration-only** | audio (± optional context screenshot) — **no events** | ⏭ **Version 2** |
| **1.3 Video + audio** | video file + audio | ⏭ **Version 2** |

Notes:
- **Version 1 is workflow-only.** Narration-only (zero-event) and video captures are **Version 2** — until then a zero-event session stays rejected.
- Output of Module 1 is **raw** (artifacts + a raw manifest). It is **not** knowledge yet.

---

## Module 2 — Knowledge Base (explicit, persisted, indexed substrate)

Job: turn raw captures (any kind) into **normalized, queryable knowledge**. This explicit layer is **implemented (M6)** — the worker does capture → KB (transcript + **distilled** steps grouped by workflow), and article creation reads the KB. As of 2026-06-26 the worker **cleans + distills** raw events into clean, user-facing steps rather than persisting events 1:1 — see [`kb-step-distillation.md`](kb-step-distillation.md).

A processing/extraction step (the worker, repurposed) reads a raw capture and writes:

- **`KnowledgeSource`** — one per capture: `kind`, app, **persisted transcript**, status, link to raw artifacts/manifest.
- **`KnowledgeItem[]`** — the normalized, **indexed units of knowledge** (what makes the KB queryable and modality-agnostic):
  - from a **workflow** capture → *distilled step items* (clean imperative `instruction`, optional `detail`, `route`, attributed `narration`, one curated `screenshotFile` + element `bbox`, + searchable `text`). Raw events are **not** persisted as items — they're cleaned + distilled into these steps (2026-06-26); the raw event log remains only in the source `manifest`.
  - from a **narration-only** capture → *topic items* (transcript span text, time range, + searchable `text`)
- **Index** over every item's `text` — **hybrid keyword ∪ pgvector** (RRF fusion), **shipped P1-M3 (2026-07-07)**; keyword-only is the fallback on any vector-path failure. *(Originally keyword-first with pgvector "later," decided 2026-06-19 — the "later" upgrade has landed.)*

**The crucial property:** once knowledge is in the KB, **downstream stops caring how it was captured.** A step item and a topic item are both just retrievable knowledge. This is what lets workflow and narration content live in one substrate and be queried uniformly.

### KB scope (locked 2026-06-21)
There is **one cumulative KB per workspace (per product)** — *not* one KB per recording. Every recording (`KnowledgeSource`) feeds its items into the same workspace KB, which **compounds over time**. Each `KnowledgeItem` links to **both** its `sourceId` (the raw recording — provenance/evidence) and its `workspaceId` (the cumulative KB). Prompt-to-article, the index, and the future copilot all query the **whole-workspace KB** (across all recordings). 

> **Anticipate supersession (→ freshness moat):** re-recording a workflow (e.g. after a UI change) adds a newer source covering the same topic. The KB must eventually track **which source is the current authority** for a topic so stale/duplicate knowledge doesn't surface. Not solved in 1a, but sources/items carry timestamps so we can layer this in.

### KB schema (target — Prisma-style; evolves today's `RecSession`)

```prisma
model KnowledgeSource {          // evolves RecSession (table kept as "RecSession" via @@map — data preserved)
  id           String   @id @default(cuid())
  workspaceId  String
  createdById  String
  kind         String   @default("workflow") // workflow | narration | video
  appBaseUrl   String?
  status       String   @default("uploaded") // uploaded | processing | ready | error
  transcript   Json?                          // PERSISTED: { text, segments[] }  (new)
  manifest     Json                           // raw capture (events for workflow; minimal for narration)
  error        String?
  createdAt    DateTime @default(now())
  items        KnowledgeItem[]
  // No Article relation: the V2 portal track renders approved workflows over the KB. See v2-portal.md.
}

model KnowledgeItem {            // the indexed unit of knowledge (new)
  id           String   @id @default(cuid())
  sourceId     String
  workspaceId  String
  kind         String                          // step | topic
  orderIndex   Int
  text         String                          // searchable content (the index field)
  data         Json                            // kind-specific payload:
  //   step  -> { instruction, detail, route, narration, screenshotFile, bbox }   (distilled — 2026-06-26)
  //   topic -> { spanText, startMs, endMs }
  segmentIndex Int?    // workflow this item belongs to (persisted segmentation — promoted toward C)
  segmentTitle String?
  embedding    Unsupported("vector(1536)")?  // SHIPPED P1-M3 (2026-07-07): hybrid keyword+pgvector RRF;
                                             // text-embedding-3-small over `text`, written by the worker at KB build.
  source       KnowledgeSource @relation(fields: [sourceId], references: [id], onDelete: Cascade)
}
```

---

## Module 3 — Article creation (derived views *from* the KB)

> **Mechanism (V2 portal track).** Module 3's role is to produce human-facing **articles as derived views over the KB**. Since KB step distillation the worker already emits article-shaped distilled workflows, so the V2 portal **renders approved workflows** (with a render-time presentation overlay) rather than running a separate synthesis engine — see [`v2-portal.md`](v2-portal.md). The `3.1`/`3.2` descriptions below capture the article **type/source** model (still valid conceptually); the copilot itself grounds on approved-KB, not articles.

Job: produce human-facing **Articles** by reading the KB. **Articles are not the KB** — they're curated outputs.

- **3.1 Auto (curated, M6.1)** — propose candidate **titles** (the segment titles persisted at KB build — Option C; free, no LLM) → user **selects** → synthesize Article(s) for **only the selected** segments. Workflow step-items → `workflow_backed` step-by-step articles. *(narration topic-items → `static` explainer prose = **Version 2**.)* **Not auto-pushed** — generation is user-triggered.
- **3.2 Prompt-to-article** — query the **index** for items relevant to a topic *across the workspace* → synthesize one grounded Article; **decline + create a `CoverageGap`** if nothing matches. ✅ *built (M7).*

### Article types vs. sources (clarified)
`type` describes **shape / self-validatability**; `source` describes **origin**. They're independent:

| | `type = workflow_backed` (steps, self-validatable) | `type = static` (prose, not self-validatable) |
|---|---|---|
| `source = recording_auto` | auto from a workflow capture *(V1)* | auto from a narration capture (explainer) *(**V2**)* |
| `source = prompt_grounded` | prompt → matched workflow items *(V1)* | prompt → matched topic items *(**V2** — needs narration)* |
| `source = manual` | — | human-written (pricing/policy/FAQ) *(V1 — Studio lane, not a capture)* |

> **Refinement to grounded authorship (2026-06-19; scoped V2 on 2026-06-21):** AI **may** generate `static` articles **when grounded in a narration recording** (the spoken words are the source). This does *not* break grounded authorship — narration is a recording, not general knowledge. **This narration-derived path is Version 2** (V1 has no narration capture, so V1 produces `static` only via the human `manual` lane). Human-written `static` (source = `manual`) remains for content with no recording at all.

---

## End-to-end flow

```
Module 1 — CAPTURE (kind: workflow[V1] | narration[V2] | video[V2])
   raw artifacts (R2) + raw source record
        │
        ▼
Module 2 — KNOWLEDGE BASE  (extract → clean → segment+tag → distill steps → index)   ◄── the explicit layer
   KnowledgeSource + distilled-step KnowledgeItem[] (segmentIndex/segmentTitle) + transcript + index
        │
        │   ── ONE KB → per-target approval / visibility (DECOUPLED targets) ──
        │
        ├──► approved-for-copilot (per-workflow flag)
        │       └──► In-app COPILOT   ◄── PRIMARY product; grounds on APPROVED-KB (Stage A)
        │            └── + Sense (Phase 2): read-only locator probe → workflow/step
        │                localization → positional answers ("you're on step 3 of X")
        │
        ├──► approved-for-portal (per-audience flag)
        │       └──► render approved workflow + presentation overlay
        │               └──► Help PORTAL (public/SEO)  ◄── BY-PRODUCT (decoupled target)
        │                    [Version 2 — to build]
        │
        ├──► Self-validation (Phase 3)  grounds on the selector-bearing KB
        │       └──► sandbox replay → drift flags + "validated-current" certification
        │
        └──► approved-for-autopilot (per-audience flag)   [Phase 4 — M0 walkthrough ✅; acting modules to plan]
                └──► widget EXECUTES the approved workflow in the end-user's live session
                     (grounded actions; eligibility = approved AND validated-current)
```

**One KB, decoupled publish targets (UPDATED 2026-06-22 — copilot-first pivot):**
- **The KB (Module 2)** is the single substrate; access is gated **per target**:
  - **Copilot (primary product)** grounds on **approved-KB** — `KnowledgeItem`s behind a lightweight **per-workflow "approve for copilot"** flag. Richer than prose (selectors/routes/expected-outcomes) → context-aware + actionable, and it's the substrate Phase-3 freshness needs.
  - **Help Portal (by-product)** serves **published articles** (Module 3 → Studio → publish) to public/SEO readers.
- **Copilot and portal are decoupled** — different audiences (in-app authenticated end-users vs. public/SEO), potentially different visibility; approving a workflow for the copilot and publishing an article are **independent** actions over the same KB.
- **No-leak preserved:** the copilot answers **only** from approved-KB — never raw/un-approved items, never draft articles. **Approval ≠ article authoring** (one click on a workflow).
- Detail: [`product.md`](product.md) §5, [`phase-1-copilot.md`](phase-1-copilot.md). *(Grounding **Stage B** — also citing a published article when one exists — is **deferred**; not to be confused with the V2 portal track.)*

---

## Current state vs. this target

| Layer | Today (foundation as built) | Target (this model — **V1**) |
|---|---|---|
| Module 1 | 1.1 workflow only | **1.1 workflow only** (narration 1.2 + video 1.3 = **Version 2**); capture carries `kind` |
| **Module 2 (KB)** | **`KnowledgeSource` + `KnowledgeItem` + transcript + segment tags + hybrid keyword ∪ pgvector retrieval (M6/M7 + P1-M3 pgvector, 2026-07-07)** | ✅ reached (ANN/HNSW index only if a workspace ever exceeds ~tens of thousands of items) |
| Module 3 | derived article views over the **KB** | Version 2 (portal track) — **render approved workflows** as articles + a presentation overlay ([`v2-portal.md`](v2-portal.md)) |

**Migration:** `RecSession` → `KnowledgeSource` (add `kind`, `transcript`, `status` semantics) — the **Prisma model** was renamed; the underlying **table is kept as `RecSession`** (`@@map`) so existing data is preserved; add `KnowledgeItem`; the worker splits into **(a) capture → KB extraction** and **(b) KB → articles**; prompt-to-article becomes a second Module-3 path.

---

## Decisions

### Segmentation placement — Option C (B → C, finalized in M6.1, 2026-06-21)
**Segmentation** (splitting one recording into distinct workflows) runs at **KB build** (the worker, after extracting items) and its **output is persisted** onto each `KnowledgeItem` (`segmentIndex` + `segmentTitle`). These persisted titles are the per-workflow units the **KB browser lists** and the **copilot approval gate** keys on `(sourceId, segmentIndex)`. *(They also fed the removed "Auto Generate Articles" picker — now historical; see the §Decisions note below.)*

> **History:** B (segment at article creation) → promoted to C when the KB-browser UI needed grouping → **finalized as C in M6.1**, where segmentation moved **earlier**, to KB build: it must run before any article exists, because candidate titles are now proposed *before* the user chooses what to generate. (Full Option A — first-class Workflow entities — remains a future step if needed.)

Three options were considered. **All three remain valid future promotion paths** — choosing flat items first made promotion purely **additive** (items never change; we layer structure on top):

| | What the KB stores | Status |
|---|---|---|
| **B** | flat ordered items; segmentation at article creation | superseded by C |
| **C** | + persisted segmentation **output** on items (`segmentIndex`/`segmentTitle`), computed at **KB build** → KB groups by workflow + keys the copilot approval gate | ✅ **adopted (M6.1, 2026-06-21).** Further C step if needed: also store boundary *hints* for stable/inspectable re-gen |
| **A (future)** | first-class **Workflow** objects, as a *derived/cached retrieval layer* (not the authoritative article structure) | if the **copilot** needs whole workflows, or for cross-recording **dedupe/supersession** |

The **marker hotkey** ("new workflow") is the main segmentation-quality lever, independent of B/C/A.

### Index — keyword/LLM first → pgvector (locked 2026-06-21; **pgvector shipped 2026-07-07**)
Retrieval over `KnowledgeItem.text` started keyword/LLM-only; the **pgvector upgrade landed in P1-M3** as **hybrid keyword ∪ pgvector (RRF)** — `text-embedding-3-small`@1536, embedded by the worker at KB build, keyword-only fallback on any vector failure. See [`phase-1-copilot.md`](phase-1-copilot.md) §11.

### Article publishing — LOCKED: curated, not auto-pushed (2026-06-21)
> **Principle (carries into the V2 portal).** Nothing is auto-published — the founder chooses what goes to the portal. In the V2 portal track this is the **per-audience approval** gate (copilot | portal) over approved workflows, not a generation button. See [`v2-portal.md`](v2-portal.md).

Articles are **not auto-generated** on capture. Segmentation runs at **KB build** and persists candidate **titles** (`segmentTitle`, Option C) grouped into distilled workflows. In the V2 portal track the founder **approves** which workflows go to the portal; approved workflows are **rendered** as articles (with a presentation overlay) — nothing is auto-published. Stays on Option C (no first-class `Workflow` entity). See [`v2-portal.md`](v2-portal.md).

### Copilot grounding — SUPERSEDED 2026-06-22 (was: "grounds on PUBLISHED articles")
> **⚠️ Superseded by the copilot-first pivot ([`product.md`](product.md) §5).** **New (locked 2026-06-22):** separate **substrate** from **trust gate** — the copilot grounds on the **KB** (substrate) behind a **per-workflow "approve for copilot"** flag (trust gate = *approved-KB*). The no-leak intent is preserved (only human-approved knowledge reaches end-users), but approval is **one click on a workflow, not full article authoring**, and the **copilot and portal are decoupled publish targets**. The portal still serves published articles; the copilot does **not** depend on them (grounding **Stage A**). *(Hybrid "also cite a published article when present" = grounding **Stage B**, deferred — distinct from the V2 portal track.)*

**Original text (history, 2026-06-21):** the **raw KB is builder-internal** (authoring only); the **copilot and portal serve only PUBLISHED articles** — never raw/draft/un-reviewed knowledge. This prevented leaking unapproved content to customers and created the right loop. *(The "no-leak" goal survives; the mechanism changed to approved-KB.)*

> **Coverage gaps — two tiers (as built + future):** when a customer asks the copilot something it can't answer from **approved-KB**, that's a coverage-gap signal (logged as `CoverageGap` with `source=copilot` — built in P1-M10). Two cases: **(a) KB-covered but not approved** — the topic *was* captured and lives in the KB, but its workflow isn't approved-for-copilot → the founder **approves it (one click)**. **(b) Truly uncovered** — not even captured → "**record this next**." Detection = honest declines (low-confidence copilot answers) + prompt-to-article misses, unified in Studio's "record this next" view.
