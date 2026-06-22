# Sync — Copilot-First Pivot (Decision Record & Plan Overview)

> **What this is.** The authoritative record of Sync's **2026-06-22 strategic pivot to a copilot-first product**, and the map of *what is already built* vs. *what to build next* to ship the copilot **before** the human-facing help portal/articles. This doc supersedes the prioritization in the portal-first plans; where this conflicts with an older doc, **this wins**. **Roadmap (phases & modules): [`version-1-roadmap.md`](version-1-roadmap.md).** Technical model: [`architecture.md`](architecture.md). Phase 1 (copilot) build detail: [`phase-1-copilot-plan.md`](phase-1-copilot-plan.md).

- **Status:** Locked v1.0 — 2026-06-22
- **Branch:** `copilot` (off `main`)
- **Audience:** us — the single source of truth for current direction and priority.

---

## 1. The pivot, in one paragraph

**Sync is an embeddable AI copilot that any SaaS can integrate very easily.** A SaaS builder records their product once (the existing recorder); Sync turns that into a grounded Knowledge Base; and an **embeddable in-app copilot** answers their end-users' questions — grounded only in what was actually recorded and approved. The **help portal and human-facing articles are by-products** — a second, *decoupled* publish target we revisit *after* the copilot ships. We put our effort behind the copilot first.

This is a **re-prioritization, not a rebuild.** The expensive, defensible foundation (capture → Knowledge Base → retrieval/grounding) is exactly what a copilot needs, and it already exists (M0–M7). The pivot is mostly **adding a delivery layer**.

---

## 2. Locked decisions (2026-06-22)

1. **Copilot is the primary product; portal/articles are by-products.** Ship the copilot first; revisit the by-products later.
2. **Decouple copilot and portal into two independent publish targets.** Different audiences (in-app **authenticated end-users** vs. **public/SEO** readers) and potentially different visibility — some knowledge is answered in-copilot but never SEO-published, and vice-versa. Decoupling is *better*, not just lighter.
3. **Grounding model — separate *substrate* from *trust gate* (supersedes the old "Flag B"):**
   - **Substrate = the Knowledge Base.** The copilot retrieves and reasons over `KnowledgeItem`s (steps with selectors/routes/expected-outcomes), **not** published articles. This is what enables context-aware and (later) actionable answers, and it's the substrate Phase-3 freshness depends on. Articles are prose/lossy and can't do where-you-are awareness.
   - **Trust gate = a lightweight per-workflow "approve for copilot" flag (approved-KB).** Preserves the old "no-leak / human-in-the-loop" intent — the copilot still answers only from human-approved knowledge — but approval is **one click on a workflow**, *not* authoring a full article.
   - **Mental model:** `ONE raw KB → per-target approval/visibility → { Copilot, Portal }`.
4. **Grounding Stage A = copilot grounds on approved-KB only.** This is what we build now (inside Phase 1). *(These grounding "Stages" sit within Phase 1 — distinct from the product Phases 1/2/3.)*
5. **Grounding Stage B = "prefer + cite a published Article when one exists" (hybrid polish) — DEFERRED.** Do **not** build Stage B; we'll discuss it later.

> **Supersedes:** [`architecture.md`](architecture.md) §Decisions "Copilot grounds on PUBLISHED articles, not the raw KB (2026-06-21)" — that decision is replaced by #3 above.

---

## 3. What is already built (and which bucket it falls in)

Phase 1a/1b delivered M0–M7 (see [`phase-1-features.md`](phase-1-features.md), [`phase-1a-plan.md`](phase-1a-plan.md)). Re-bucketed against the copilot product:

| Built | Bucket | Disposition |
|---|---|---|
| Monorepo, Postgres, R2/MinIO, Redis/BullMQ, Auth.js, **api ingestion**, **async worker**, multi-tenancy | **Core** | Keep; reused as-is by the copilot. |
| **Recorder** (Chrome extension): events + DOM + screenshots + narration | **Core** | Keep + harden (M9). The grounding *source*. |
| **Knowledge Base**: `KnowledgeSource` / `KnowledgeItem`, transcript, segmentation tags, keyword index | **Core** | Keep + extend (approval flag, embeddings). The grounding *substrate*. |
| **Retrieval/grounding engine** ([`packages/synthesis/src/prompt.ts`](../packages/synthesis/src/prompt.ts)): retrieve → ground → answer-or-decline | **Core (repurposable)** | ~70% of the copilot **answer engine**; today it emits an article. |
| **`CoverageGap`** model + flow (M7) | **Core (head start)** | The copilot's "record-this-next" feedback loop is partly modeled already. |
| **Studio** review/edit/**publish** (M4) | **Dual-use** | The *approval/publish* idea transfers; the rich prose editor is portal-shaped. |
| **Curated article generation** (M6.1) | **By-product** | Article-shaped; freeze. |
| **Help Portal** (M5) | **By-product** | Pure article consumer; freeze (it validated the KB→render path). |

**Rough effort split:** ~65% core-to-copilot · ~20% dual-use · ~15% pure by-product. **Nothing built is a write-off.**

---

## 4. What to build next (the copilot delivery layer)

Net-new work, all in **Phase 1 (the copilot)** — modules **P1-M4…P1-M12** (full detail in [`phase-1-copilot-plan.md`](phase-1-copilot-plan.md); roadmap in [`version-1-roadmap.md`](version-1-roadmap.md)):

1. **Per-workflow approval gate** — "approve this workflow for the copilot" (the trust gate; defines the answerable corpus).
2. **Copilot answer endpoint** — conversational RAG over approved-KB; grounded answer + citations; decline → `CoverageGap`. Repurposes `prompt.ts`.
3. **Embeddable widget + JS SDK** — a `<script>` snippet that drops a chat widget into the customer's app.
4. **Context API** — the widget reports the host app's current route/page/state; the copilot answers *for where the user actually is* (the differentiation).
5. **Embed auth & tenant scoping** — public embeddable key per workspace, origin allowlist, rate limiting, end-user session handling.
6. **Copilot feedback loop & analytics** — log questions + hit/miss + thumbs; surface coverage gaps ("record this next"); reuse `CoverageGap`.

*(Future / post-Phase-1: in-app actionability — highlight the real element / deep-link a route using captured selectors. Not in Phase 1.)*

---

## 5. Re-triage of the existing roadmap (what continues, what holds)

The portal-first plan ([`phase-1b-plan.md`](phase-1b-plan.md)) is **not deleted** — it's re-prioritized. **Now formalized as phases in [`version-1-roadmap.md`](version-1-roadmap.md):** the "continue/core" rows become **Phase 1** modules (M8→P1-M4, M9→P1-M11, M10→P1-M12, M11-retrieval→P1-M3 upgrade); the "hold" rows become **Phase 2** modules (M11-UI→P2-M3, M12→P2-M4, M13→P2-M5, M14→P2-M6).

| Milestone | Verdict under copilot-first | Why |
|---|---|---|
| **M8** — cloud deploy | **CONTINUE** | The copilot ships on it too. |
| **M9** — capture reliability | **CONTINUE (core)** | Copilot answer quality *is* capture quality; no-silent-data-loss + nav + iframe matter more now. |
| **M10** — PII redaction | **CONTINUE (elevated)** | The copilot speaks to the customer's end-users → redaction is even more the trust gate. |
| **M11** — search | **SPLIT** | KB embeddings + hybrid retrieval = **core** (copilot retrieval); portal-search UI = **hold**. |
| **M12** — authoring depth (Studio) | **HOLD (by-product)** | Article authoring/portal polish. |
| **M13** — portal productization | **HOLD (by-product)** | Portal theming/domains/SEO. |
| **M14** — analytics + collaboration | **HOLD** | Coverage-gap analytics resurfaces with the copilot feedback loop; multi-seat is late. |

**Frozen (built, no new investment, left running):** Studio article authoring (M4), curated generation (M6.1), Help Portal (M5).

---

## 6. How the docs fit together now

| Doc | Role after the pivot |
|---|---|
| [`version-1-roadmap.md`](version-1-roadmap.md) | **The roadmap** — Version 1 phases (1 Copilot / 2 Portal / 3 Self-validation), per-phase modules, built-vs-next, and the legacy-ID map. |
| **`pivot-copilot-first.md`** (this) | **Decision record** — *why* copilot-first, the grounding model, and the built-vs-next narrative. |
| [`phase-1-copilot-plan.md`](phase-1-copilot-plan.md) | The **Phase 1 (copilot) build plan** — modules **P1-M0…P1-M12**, DoD, data-model deltas, risks. |
| [`architecture.md`](architecture.md) | Canonical **technical** model — updated 2026-06-22: copilot is a first-class consumer; `ONE KB → per-target approval → {Copilot, Portal}`; phases redefined; supersedes Flag B. |
| [`phase-1b-plan.md`](phase-1b-plan.md) | Detailed milestone reference for **Phase 1** hardening (P1-M11/M12 + recorder backlog R1–R13) **and Phase 2** portal modules (P2-M3…M6). **Bannered.** |
| [`PRD.md`](PRD.md), [`phase-1-spec.md`](phase-1-spec.md), [`phase-1-features.md`](phase-1-features.md) | Strategy / acceptance / as-built — **bannered** as portal-first framing; reference, secondary in priority. PRD v0.2 reposition is a later follow-up. |
| [`phase-1a-plan.md`](phase-1a-plan.md) | The foundation build log (legacy M0–M7 = P1-M0…M3 + P2-M0…M2). Historical/as-built; reused by the copilot. |

---

## 7. Guardrails for this pivot

- **Decoupled, always:** the copilot path must never *require* article authoring or portal publish. Approving a workflow for the copilot and publishing an article to the portal are independent actions over the same KB.
- **No-leak preserved:** the copilot answers **only** from approved-KB — never raw/un-approved items, never draft articles.
- **Don't build grounding Stage B** (article-citation hybrid) until we explicitly revisit it.
- **By-products are frozen, not deleted** — they keep working; we just stop investing until the copilot is out.
