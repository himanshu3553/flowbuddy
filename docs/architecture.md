# Sync — System Architecture (the 3 modules)

> **Canonical model.** Sync is three modules: **(1) Capture** raw data, **(2)** turn it into an explicit **Knowledge Base**, **(3)** create **Articles** from the KB. Capture *modality* and article-creation *mode* are **orthogonal** — connected only through the KB. Every other doc (PRD, specs, plans) refers here for the module structure.

- **Status:** Frozen v1.0 — 2026-06-19. Segmentation placement **locked: Option B → C** (§Decisions). Product-version scope **locked 2026-06-21** (below). **UPDATED 2026-06-22 — copilot-first pivot:** the copilot grounds on **approved-KB** (not published articles) and copilot/portal are **decoupled** targets; the 3-module model is unchanged. See [`pivot-copilot-first.md`](pivot-copilot-first.md). *(Supersedes §Decisions "copilot grounds on PUBLISHED articles".)*
- **Key principle preserved:** *grounded authorship* — AI writes **only** from the customer's own recordings, never the model's general knowledge.

### Product versions & phases (scope — **phases REDEFINED 2026-06-22, copilot-first**)
- **Version 1** = the **workflow-capture** product (**capture is workflow-only, 1.1**), released in **three phases** — authoritative roadmap: [`version-1-roadmap.md`](version-1-roadmap.md):
  - **Phase 1 — Copilot** ⭐ (the Version 1 release, ships first): the foundation we've built (capture → KB → retrieval/grounding) + the embeddable copilot. Modules **P1-M0…P1-M12** ([`phase-1-copilot-plan.md`](phase-1-copilot-plan.md)).
  - **Phase 2 — Help Portal & Articles** (the human-facing **by-products**; a decoupled publish target): Studio editor + curated generation + portal (built) + productization. Modules **P2-M0…P2-M6** ([`phase-1b-plan.md`](phase-1b-plan.md)).
  - **Phase 3 — Self-validation & freshness** (the moat; to be planned).
- **Version 2** = additional **capture modalities** — **narration-only (1.2)** and **video (1.3)** — plus the narration-derived `static` explainer-article path. Deferred out of V1.

> **⚠️ Phase numbers were redefined 2026-06-22.** The 3-module model below is **unchanged**; only the *phase grouping* and the *copilot's grounding* (**approved-KB**, not published articles) changed. Previously: Phase 1 = the wedge, Phase 2 = copilot, Phase 3 = self-validation. **Now:** Phase 1 = **copilot** (primary, ships first), Phase 2 = **portal/articles** (by-products), Phase 3 = self-validation. Module IDs are now **per-phase** (`P{phase}-M{n}`); the old global `M0–M14` are mapped in [`version-1-roadmap.md`](version-1-roadmap.md) §5. See also [`pivot-copilot-first.md`](pivot-copilot-first.md).

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

Job: turn raw captures (any kind) into **normalized, queryable knowledge**. This explicit layer is **implemented (M6)** — the worker does capture → KB (transcript + items + segment tags), and article creation reads the KB.

A processing/extraction step (the worker, repurposed) reads a raw capture and writes:

- **`KnowledgeSource`** — one per capture: `kind`, app, **persisted transcript**, status, link to raw artifacts/manifest.
- **`KnowledgeItem[]`** — the normalized, **indexed units of knowledge** (what makes the KB queryable and modality-agnostic):
  - from a **workflow** capture → *step items* (action, element label, selector, route, screenshotKey, highlight, expected outcome, aligned narration, + searchable `text`)
  - from a **narration-only** capture → *topic items* (transcript span text, time range, + searchable `text`)
- **Index** over every item's `text` — **keyword / LLM retrieval now → pgvector embeddings later** (decided 2026-06-19).

**The crucial property:** once knowledge is in the KB, **downstream stops caring how it was captured.** A step item and a topic item are both just retrievable knowledge. This is what lets workflow and narration content live in one substrate and be queried uniformly.

### KB scope (locked 2026-06-21)
There is **one cumulative KB per workspace (per product)** — *not* one KB per recording. Every recording (`KnowledgeSource`) feeds its items into the same workspace KB, which **compounds over time**. Each `KnowledgeItem` links to **both** its `sourceId` (the raw recording — provenance/evidence) and its `workspaceId` (the cumulative KB). Prompt-to-article, the index, and the future copilot all query the **whole-workspace KB** (across all recordings). 

> **Anticipate supersession (→ freshness moat):** re-recording a workflow (e.g. after a UI change) adds a newer source covering the same topic. The KB must eventually track **which source is the current authority** for a topic so stale/duplicate knowledge doesn't surface. Not solved in 1a, but sources/items carry timestamps so we can layer this in.

### KB schema (target — Prisma-style; evolves today's `RecSession`)

```prisma
model KnowledgeSource {          // evolves RecSession
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
  articles     Article[]
}

model KnowledgeItem {            // the indexed unit of knowledge (new)
  id           String   @id @default(cuid())
  sourceId     String
  workspaceId  String
  kind         String                          // step | topic
  orderIndex   Int
  text         String                          // searchable content (the index field)
  data         Json                            // kind-specific payload:
  //   step  -> { action, elementLabel, selector, route, screenshotKey, highlight, expectedOutcome, narration }
  //   topic -> { spanText, startMs, endMs }
  segmentIndex Int?    // workflow this item belongs to (persisted segmentation — promoted toward C)
  segmentTitle String?
  // embedding  vector   // FUTURE (pgvector)
  source       KnowledgeSource @relation(fields: [sourceId], references: [id], onDelete: Cascade)
}
```

---

## Module 3 — Article creation (derived views *from* the KB)

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
Module 2 — KNOWLEDGE BASE  (extract → normalize → segment+tag → index)   ◄── the explicit layer
   KnowledgeSource + KnowledgeItem[] (segmentIndex/segmentTitle) + transcript + index
        │
        │   ── ONE KB → per-target approval / visibility (DECOUPLED targets) ──
        │
        ├──► approved-for-copilot (per-workflow flag)
        │       └──► In-app COPILOT   ◄── PRIMARY product; grounds on APPROVED-KB (Stage A)
        │
        ├──► authoring (builder-internal)
        │       ├──► Module 3.1 Auto (curated)  propose titles → select → Article[]
        │       └──► Module 3.2 Prompt           query index → Article, or decline → CoverageGap
        │               └──► Article/Step (draft) → Studio edit → PUBLISH
        │                       └──► Help PORTAL (public/SEO)  ◄── BY-PRODUCT (decoupled target)
        │
        └──► Self-validation (Phase 3)  grounds on the selector-bearing KB
```

**One KB, decoupled publish targets (UPDATED 2026-06-22 — copilot-first pivot):**
- **The KB (Module 2)** is the single substrate; access is gated **per target**:
  - **Copilot (primary product)** grounds on **approved-KB** — `KnowledgeItem`s behind a lightweight **per-workflow "approve for copilot"** flag. Richer than prose (selectors/routes/expected-outcomes) → context-aware + actionable, and it's the substrate Phase-3 freshness needs.
  - **Help Portal (by-product)** serves **published articles** (Module 3 → Studio → publish) to public/SEO readers.
- **Copilot and portal are decoupled** — different audiences (in-app authenticated end-users vs. public/SEO), potentially different visibility; approving a workflow for the copilot and publishing an article are **independent** actions over the same KB.
- **No-leak preserved:** the copilot answers **only** from approved-KB — never raw/un-approved items, never draft articles. **Approval ≠ article authoring** (one click on a workflow).
- Detail: [`pivot-copilot-first.md`](pivot-copilot-first.md), [`phase-1-copilot-plan.md`](phase-1-copilot-plan.md). *(Grounding **Stage B** — also citing a published article when one exists — is **deferred**; not to be confused with product Phase 2.)*

---

## Current state vs. this target

| Layer | Today (Phase 1a as built) | Target (this model — **V1**) |
|---|---|---|
| Module 1 | 1.1 workflow only | **1.1 workflow only** (narration 1.2 + video 1.3 = **Version 2**); capture carries `kind` |
| **Module 2 (KB)** | **`KnowledgeSource` + `KnowledgeItem` + transcript + segment tags + keyword retrieval (M6/M7 done)** | + pgvector embeddings (later) |
| Module 3 | **3.1 curated** (M6.1) **+ 3.2 prompt-to-article** (M7), both reading the **KB** | — (complete for V1) |

**Migration:** `RecSession` → `KnowledgeSource` (add `kind`, `transcript`, `status` semantics); add `KnowledgeItem`; the worker splits into **(a) capture → KB extraction** and **(b) KB → articles**; prompt-to-article becomes a second Module-3 path.

---

## Decisions

### Segmentation placement — Option C (B → C, finalized in M6.1, 2026-06-21)
**Segmentation** (splitting one recording into distinct workflows) runs at **KB build** (the worker, after extracting items) and its **output is persisted** onto each `KnowledgeItem` (`segmentIndex` + `segmentTitle`). These persisted titles are the **candidates** the curated "Auto Generate Articles" picker lists.

> **History:** B (segment at article creation) → promoted to C when the KB-browser UI needed grouping → **finalized as C in M6.1**, where segmentation moved **earlier**, to KB build: it must run before any article exists, because candidate titles are now proposed *before* the user chooses what to generate. (Full Option A — first-class Workflow entities — remains a future step if needed.)

Three options were considered. **All three remain valid future promotion paths** — choosing flat items first made promotion purely **additive** (items never change; we layer structure on top):

| | What the KB stores | Status |
|---|---|---|
| **B** | flat ordered items; segmentation at article creation | superseded by C |
| **C** | + persisted segmentation **output** on items (`segmentIndex`/`segmentTitle`), computed at **KB build** → KB groups by workflow + drives candidate titles | ✅ **adopted (M6.1, 2026-06-21).** Further C step if needed: also store boundary *hints* for stable/inspectable re-gen |
| **A (future)** | first-class **Workflow** objects, as a *derived/cached retrieval layer* (not the authoritative article structure) | if the **copilot** needs whole workflows, or for cross-recording **dedupe/supersession** |

The **marker hotkey** ("new workflow") is the main segmentation-quality lever, independent of B/C/A.

### Index — LOCKED: keyword/LLM first → pgvector later (2026-06-21)
Retrieval over `KnowledgeItem.text` starts as keyword/LLM; embeddings (pgvector) are a later upgrade.

### Article generation — LOCKED: curated, not auto-pushed (2026-06-21)
Articles are **not auto-generated** on capture. Segmentation runs at **KB build** and persists candidate **titles** (`segmentTitle`, Option C). The Studio **"Auto Generate Articles"** button then **lists** those titles (instant, **no LLM** — titles already exist) → user **selects** → the system synthesizes **only the selected** segments into draft articles. Titles are produced **once** (at KB build); the button surfaces them — it does not re-generate them. Stays on Option C (no first-class `Workflow` entity). See [`phase-1a-plan.md`](phase-1a-plan.md) §10 M6.1.

### Copilot grounding — SUPERSEDED 2026-06-22 (was: "grounds on PUBLISHED articles")
> **⚠️ Superseded by the copilot-first pivot ([`pivot-copilot-first.md`](pivot-copilot-first.md)).** **New (locked 2026-06-22):** separate **substrate** from **trust gate** — the copilot grounds on the **KB** (substrate) behind a **per-workflow "approve for copilot"** flag (trust gate = *approved-KB*). The no-leak intent is preserved (only human-approved knowledge reaches end-users), but approval is **one click on a workflow, not full article authoring**, and the **copilot and portal are decoupled publish targets**. The portal still serves published articles; the copilot does **not** depend on them (grounding **Stage A**). *(Hybrid "also cite a published article when present" = grounding **Stage B**, deferred — distinct from product Phase 2.)*

**Original text (history, 2026-06-21):** the **raw KB is builder-internal** (authoring only); the **copilot and portal serve only PUBLISHED articles** — never raw/draft/un-reviewed knowledge. This prevented leaking unapproved content to customers and created the right loop. *(The "no-leak" goal survives; the mechanism changed to approved-KB.)*

> **Coverage gaps — two tiers (future; note for Phase 2/3 design):** when a customer asks the copilot something it can't answer from published articles, that's a coverage-gap signal. Two cases: **(a) KB-covered but unpublished** — the topic *was* captured and lives in the raw KB but no article was generated/published → the founder fills it fast with **Text-to-Article (3.2)** over the raw KB → review → publish. **(b) Truly uncovered** — not even captured → "**record this next**." The detection mechanism (low-confidence copilot answers + prompt-to-article declines) and the fill flow (gap → Text-to-Article vs. record) are to be designed when the copilot lands.
