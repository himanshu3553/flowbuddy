# Sync — System Architecture (the 3 modules)

> **Canonical model.** Sync is three modules: **(1) Capture** raw data, **(2)** turn it into an explicit **Knowledge Base**, **(3)** create **Articles** from the KB. Capture *modality* and article-creation *mode* are **orthogonal** — connected only through the KB. Every other doc (PRD, specs, plans) refers here for the module structure.

- **Status:** Frozen v1.0 — 2026-06-19. (One open item: **segmentation placement**, see §6.)
- **Key principle preserved:** *grounded authorship* — AI writes **only** from the customer's own recordings (workflow **or** narration), never the model's general knowledge.

---

## Module 1 — Raw data capture (input modalities)

Job: get raw, un-interpreted signal in. Three capture **kinds**, each producing different raw layers but the **same envelope** (capture → upload → object storage + a source record). A capture carries a `kind`.

| Kind | Raw layers | Status |
|---|---|---|
| **1.1 Workflow** | interaction events + **DOM fingerprints** (role/name/selector/bbox/route) + event & post-action screenshots + DOM snapshots + audio | ✅ built |
| **1.2 Narration-only** | audio (± optional context screenshot) — **no events** | ❌ planned |
| **1.3 Video + audio** | video file + audio | ❌ out of scope (future) |

Notes:
- Capture must **accept narration-only** (today a zero-event session is rejected — that changes).
- Output of Module 1 is **raw** (artifacts + a raw manifest). It is **not** knowledge yet.

---

## Module 2 — Knowledge Base (explicit, persisted, indexed substrate)

Job: turn raw captures (any kind) into **normalized, queryable knowledge**. This is the layer we are **introducing** — today the system skips it and synthesizes capture → articles directly.

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
  // embedding  vector   // FUTURE (pgvector)
  source       KnowledgeSource @relation(fields: [sourceId], references: [id], onDelete: Cascade)
}
```

---

## Module 3 — Article creation (derived views *from* the KB)

Job: produce human-facing **Articles** by reading the KB. **Articles are not the KB** — they're curated outputs.

- **3.1 Auto** — take a `KnowledgeSource`'s items → group/segment → synthesize Article(s). Workflow step-items → `workflow_backed` step-by-step articles; narration topic-items → `static` (explainer) prose articles. ✅ *built for workflow → workflow_backed; narration path is new.*
- **3.2 Prompt-to-article** — query the **index** for items relevant to a topic *across the workspace* → synthesize one grounded Article; **decline + create a `CoverageGap`** if nothing matches. ❌ *new.*

### Article types vs. sources (clarified)
`type` describes **shape / self-validatability**; `source` describes **origin**. They're independent:

| | `type = workflow_backed` (steps, self-validatable) | `type = static` (prose, not self-validatable) |
|---|---|---|
| `source = recording_auto` | auto from a workflow capture | **auto from a narration capture** (explainer) |
| `source = prompt_grounded` | prompt → matched workflow items | prompt → matched topic items |
| `source = manual` | — | human-written (pricing/policy/FAQ) |

> **Refinement to grounded authorship (2026-06-19):** AI **may** generate `static` articles **when grounded in a narration recording** (the spoken words are the source). This does *not* break grounded authorship — narration is a recording, not general knowledge. Human-written `static` (source = `manual`) remains for content with no recording at all.

---

## End-to-end flow

```
Module 1 — CAPTURE (kind: workflow | narration | video)
   raw artifacts (R2) + raw source record
        │
        ▼
Module 2 — KNOWLEDGE BASE  (extract → normalize → index)        ◄── the new explicit layer
   KnowledgeSource + KnowledgeItem[] + transcript + index
        │
        ├──► Module 3.1 Auto    (group a source's items → Article[])
        └──► Module 3.2 Prompt   (query index → Article, or decline → CoverageGap)
        │
        ▼
   Article / Step (draft) → Studio edit/publish → Help Portal
                                   (+ Phase 2 copilot, Phase 3 self-validation read the same KB/articles)
```

---

## Current state vs. this target

| Layer | Today (Phase 1a as built) | Target (this model) |
|---|---|---|
| Module 1 | 1.1 workflow only | + 1.2 narration-only; capture carries `kind` |
| **Module 2 (KB)** | **none — worker synthesizes capture → Article directly; transcript discarded** | **explicit `KnowledgeSource` + `KnowledgeItem` + persisted transcript + keyword/LLM index** |
| Module 3 | 3.1 auto only, reading raw `RecSession.manifest` | 3.1 + 3.2, both reading the **KB** |

**Migration:** `RecSession` → `KnowledgeSource` (add `kind`, `transcript`, `status` semantics); add `KnowledgeItem`; the worker splits into **(a) capture → KB extraction** and **(b) KB → articles**; prompt-to-article becomes a second Module-3 path.

---

## Decisions

### Segmentation placement — LOCKED: Option B (2026-06-21)
**Segmentation** (splitting one recording into distinct workflows) runs at **article creation (Module 3.1)** — *not* in the KB. The KB stores **flat, ordered `KnowledgeItem`s**; the boundary signals (markers, route changes, narration) live **inline in the items**, just not pre-grouped.

Three options were considered. **All three remain valid future promotion paths** — choosing B (flat items) makes promotion purely **additive** (items never change; we layer structure on top):

| | What the KB stores | Promote to this if… |
|---|---|---|
| **B (chosen)** | flat ordered items | — (current) |
| **C (future)** | items + where-to-split **hints** | we start **re-generating articles often** (e.g., new brand voice) and want stable/inspectable splits |
| **A (future)** | first-class **Workflow** objects, as a *derived/cached retrieval layer* (not the authoritative article structure) | the **copilot** needs to retrieve whole workflows, or we need cross-recording **dedupe/supersession** |

The **marker hotkey** ("new workflow") is the main segmentation-quality lever, independent of B/C/A.

### Index — LOCKED: keyword/LLM first → pgvector later (2026-06-21)
Retrieval over `KnowledgeItem.text` starts as keyword/LLM; embeddings (pgvector) are a later upgrade.
