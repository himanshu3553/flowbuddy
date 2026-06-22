# Sync — Phase 1: Copilot (Build Plan)

> **Phase 1 is the copilot, end-to-end — and it ships as the Version 1 release.** A SaaS records its product, approves workflows for the copilot, drops a `<script>` into its app, and its end-users get a chat widget that answers **grounded only in approved Knowledge Base content**, with citations and honest declines. **Decoupled from the human-facing portal/articles** (those are [Phase 2](version-1-roadmap.md#2-phase-2--help-portal--articles-by-products)) — the copilot path never requires authoring or publishing an article. Roadmap: [`version-1-roadmap.md`](version-1-roadmap.md). Why: [`pivot-copilot-first.md`](pivot-copilot-first.md). Technical model: [`architecture.md`](architecture.md).

- **Status:** Draft v0.2 (plan only — no code yet)
- **Branch:** `copilot`
- **Last updated:** 2026-06-22
- **Modules:** **P1-M0 … P1-M12** (per-phase numbering). **P1-M0…P1-M3 are already built** (the foundation); **P1-M4…P1-M12 are the copilot + release-hardening to build.**
- **Sequencing (locked 2026-06-22): build & verify ALL of Phase 1 locally first; cloud deploy (P1-M4) is the FINAL step.** We deploy P1 of V1 to cloud only **after** the whole copilot is built and working locally (via docker-compose). So P1-M4's module ID stays 4, but it is **executed last** in the build order below.
- **Grounding (locked 2026-06-22) — Stage A:** the copilot grounds on **approved-KB** (`KnowledgeItem`s behind a per-workflow approval flag), **not** published articles. **Stage B** (also prefer/cite a published article when one exists) is **deferred** — out of scope here. *(These "Stages" are the grounding rollout within Phase 1 — not to be confused with the product Phases 1/2/3.)*
- **Cadence:** one module at a time, each verified end-to-end, with a stop for review — same working agreement as the foundation build.

---

## 1. Scope

**In Phase 1 (to build — P1-M4…P1-M12):**
- **Cloud deploy** (P1-M4) so the copilot is live and embeddable.
- A **per-workflow approval gate** (P1-M5) — the trust gate that defines the answerable corpus.
- A **copilot answer endpoint** (P1-M6) — conversational RAG over approved-KB; grounded answer + citations; decline → `CoverageGap`.
- An **embeddable widget + JS SDK** (P1-M7) — a script snippet that renders a chat widget in the customer's app.
- A **context API** (P1-M8) — the widget reports the host app's current route/page; the copilot biases answers to where the user is.
- **Embed auth & tenant scoping** (P1-M9) — public embeddable key per workspace, origin allowlist, rate limiting, end-user sessions.
- A **copilot feedback loop & analytics** (P1-M10) — log questions, hit/miss, thumbs; surface coverage gaps.
- **Release-hardening:** capture reliability (P1-M11) and **PII redaction** (P1-M12, elevated — the copilot is end-user-facing).

**Explicitly NOT in Phase 1:**
- **Grounding Stage B** — article-citation hybrid (prefer/cite a published article when one exists).
- **In-app actionability** — highlighting the real element / deep-linking a route via captured selectors (future; the data exists, the feature doesn't).
- **Phase 2 (portal/articles)** — no new work on Studio article authoring, curated generation, or the Help Portal. They stay **frozen** (built, running). See [`version-1-roadmap.md`](version-1-roadmap.md) §2.
- **Multi-seat/roles, billing, i18n.**

---

## 2. Foundation already built (P1-M0 … P1-M3)

These ship under Phase 1 because they're the copilot's foundation; they're **done** (detail: [`phase-1a-plan.md`](phase-1a-plan.md), [`phase-1-features.md`](phase-1-features.md)).

| Module | Built | Copilot use | Pending |
|---|---|---|---|
| **P1-M0** Monorepo, infra & auth | ✅ (legacy M0/M1) | hosts everything | — |
| **P1-M1** Recorder / workflow capture | ✅ (legacy M2) | the grounding *source* | hardening → P1-M11 |
| **P1-M2** Knowledge Base | ✅ (legacy M3/M6) | the grounding *substrate* | approval flag → P1-M5 |
| **P1-M3** Retrieval & grounding engine ([`prompt.ts`](../packages/synthesis/src/prompt.ts)) | ✅ (legacy M7) | ~70% of the answer engine | pgvector upgrade (legacy M11 retrieval) |

---

## 3. Proposed package layout (planning only — not built yet)

- **`packages/api`** (existing Fastify) — add **copilot routes** (answer, context, conversation/feedback). Reuses S3/DB/queue wiring.
- **`packages/synthesis`** (existing) — generalize [`prompt.ts`](../packages/synthesis/src/prompt.ts) into a shared **answer engine** (retrieve → ground → answer-or-decline) used by both prompt-to-article and the copilot.
- **`packages/widget`** (**new**) — the embeddable chat widget + JS SDK; builds to a single `<script>` (e.g. `sync-copilot.js`) + a web-component/iframe UI. No host-framework lock-in.
- **`packages/web`** (Studio) — add the **approval toggle** (P1-M5), **copilot settings** (key/origins/greeting), and **copilot analytics** (P1-M10).

---

## 4. Data-model deltas (additive)

All **additive migrations** on the [existing schema](phase-1a-plan.md#3-data-model-postgres--prisma):

- **P1-M5 (approval):** *Lean* — `KnowledgeItem.copilotApproved Boolean @default(false)`, set per-workflow via `updateMany` over a `(sourceId, segmentIndex)` group. *Cleaner* — a first-class **`CopilotApproval`** / `Workflow` row keyed by `(workspaceId, sourceId, segmentIndex)` with `status`, `approvedById`, `approvedAt` (better audit/supersession; natural place to promote architecture's deferred "Option A"). Decide at build.
- **P1-M6 (answer):** none required beyond retrieval. Optional `KnowledgeItem.embedding vector` (pgvector) for semantic retrieval (shared with the P1-M3 upgrade).
- **P1-M7/M9 (widget + embed):** on `Workspace` — `copilotPublicKey String? @unique`, `copilotAllowedOrigins String[]`, `copilotSettings Json?` (enabled, greeting, tone, theme).
- **P1-M10 (feedback):** `CopilotConversation` (id, workspaceId, endUserRef?, context Json?, startedAt) + `CopilotMessage` (conversationId, role, text, citations Json, answered Boolean, feedback `up|down|null`). *(MVP alternative: a flat `CopilotQuery` log.)* **Reuse `CoverageGap`** for copilot misses — add a `source` discriminator (`prompt | copilot`) + optional `count`.

---

## 5. Modules (Phase 1)

| # | Module | Done when | Legacy |
|---|---|---|---|
| **P1-M0** | Monorepo, infra & auth | ✅ built | M0/M1 |
| **P1-M1** | Recorder / workflow capture | ✅ built | M2 |
| **P1-M2** | Knowledge Base | ✅ built | M3/M6 |
| **P1-M3** | Retrieval & grounding engine | ✅ built (pgvector upgrade pending) | M7 |
| **P1-M4** | **Cloud deploy** | The stack is live on Render + R2; the copilot API + widget serve from the deployed origin. | M8 |
| **P1-M5** ✅ | **Approval gate** (built 2026-06-23) | A builder marks a workflow "approved for copilot" in Studio; only approved KB items are copilot-eligible; reversible + audited. | C1 |
| **P1-M6** ✅ | **Answer endpoint** (built 2026-06-23) | An API call returns a **grounded** answer (citing source workflow/step) from **only** approved-KB, or an honest **decline → `CoverageGap`**; multi-turn works. | C2 |
| **P1-M7** ✅ | **Embeddable widget & SDK** (built 2026-06-23) | One `<script>` on a test page renders a working chat widget that talks to P1-M6 and shows answers + citations. **First end-to-end demo.** | C3 |
| **P1-M8** ✅ | **Context API** (built 2026-06-23) | The widget reports host route/page; the copilot biases retrieval/answers to "where the user is" and degrades gracefully without context. | C4 |
| **P1-M9** | **Embed auth & tenant scoping** | A workspace has a public embeddable key + origin allowlist; requests are scoped, rate-limited; end-user sessions handled. **Gate for external embed.** | C5 |
| **P1-M10** | **Feedback loop & analytics** | Every Q&A is logged with hit/miss + thumbs; Studio surfaces top questions + coverage gaps ("record this next"). | C6 |
| **P1-M11** | **Capture reliability hardening** | No recording the user made is silently lost (nav/upload/audio/SW); iframe + full-page-nav captures are complete. Detail + recorder backlog (R1–R13): [`phase-1b-plan.md`](phase-1b-plan.md) §M9. | M9 |
| **P1-M12** | **PII redaction** | Passwords never captured; input values masked by default; pre-record + review redaction persists; server backstop blurs detected PII. Detail: [`phase-1b-plan.md`](phase-1b-plan.md) §M10. | M10 |

**Definition of done for Phase 1 (= the Version 1 release):** an external SaaS embeds the snippet on a real page; its end-users ask questions in-app; the copilot answers **grounded only in approved-KB** with citations, **declines + logs a gap** when uncovered, is **scoped to the correct workspace** (public key + origin allowlist), is **PII-safe**, and **logs each Q&A + feedback** — all **without touching the portal/articles** (Phase 2, frozen). Ship it.

---

## 6. Per-module detail (to-build)

### P1-M4 — Cloud deploy (legacy M8) — **executed LAST (final step of Phase 1)**
Render (api web service + worker + web/Studio + Postgres + Redis) + Cloudflare R2 for blobs; per-service Dockerfiles + `render.yaml`. *(On deploy: serve the widget + answer API from the deployed origin; configure CORS for customer origins; set `STUDIO_URL` / `SYNC_API_URL`; add the prod Studio origin to the extension manifest.)*

### P1-M5 — Approval gate (build first — it defines the corpus) — ✅ DONE (2026-06-23)
*Built: `CopilotApproval` table keyed by (sourceId, segmentIndex) — survives the worker's item delete+recreate; `lib/copilot-approvals.ts` (`listApprovedItems` = the enforcement seam P1-M6 retrieves through); `setCopilotApproval` action; per-workflow toggle on the Studio KB page. Verified: build 6/6 + functional seam incl. survive-reprocess.*
- **Studio:** an "Approve for copilot" toggle at the **workflow** level (a `(sourceId, segmentIndex)` group — the same segment tags that drive curated-gen candidates). Bulk approve/un-approve; show approved state in the KB browser.
- **Data:** lean boolean-on-items vs. a `CopilotApproval`/`Workflow` table (§4).
- **Guardrail:** retrieval (P1-M6) filters to approved items only — the enforcement point for "no-leak."

### P1-M6 — Answer endpoint (repurpose `prompt.ts`) — ✅ DONE (2026-06-23)
*Built: `@sync/synthesis` `answerFromKB` (conversational, structured-output **covered/answer/citations** or decline; multi-turn history); api `retrieveApprovedKBItems` (keyword shortlist over the **approved-KB seam** — mirrors P1-M5 `listApprovedItems`); route `POST /v1/copilot/answer` (workspace-token auth for now; decline → dedup `CoverageGap`). Verified with a real LLM: grounded answer + citations, honest decline, coverage-gap logged, and **no-leak** (un-approved workflow not retrievable even when asked directly). Keyword retrieval; pgvector = the P1-M3 upgrade.*
- Generalize retrieve → ground → answer-or-decline into a shared engine. Input: question (+ history + optional context from P1-M8). Retrieve over **approved-KB** (keyword first; pgvector optional). Output: grounded answer + **citations** (source recording/workflow/step) + `covered` boolean.
- On `covered=false` (or zero retrieval): honest decline + log **`CoverageGap`** (`source=copilot`). Multi-turn supported.

### P1-M7 — Embeddable widget & SDK (first demo) — ✅ DONE (2026-06-23)
*Built: new `packages/widget` — esbuild → a single 5.4kb IIFE `dist/sync-copilot.js`; shadow-DOM chat (launcher + panel, isolated styles); config via `data-sync-*` script attrs (`data-sync-api`, `data-sync-key`, `data-sync-title`); POSTs `/v1/copilot/answer`, renders answers + citations + decline/error states; multi-turn history; `demo/index.html`. `data-sync-key` = workspace token for now (P1-M9 swaps in a public embeddable key). Verified: bundle builds, typecheck, monorepo build 7/7; in-browser demo is the user's to run.*
- A single script (`sync-copilot.js`) the customer adds with their public key; renders a launcher + chat panel (web component or sandboxed iframe). Calls P1-M6. Streaming answers, citation links, "was this helpful?" affordance (wired in P1-M10), graceful empty/decline states.

### P1-M8 — Context API (the differentiation) — ✅ DONE (2026-06-23)
*Built: the widget sends `context.path` (host `location.pathname`); `retrieveApprovedKBItems` boosts items whose captured `route.path` matches the current page (+3), and `answerFromKB` gets a "user is on page X" line. Soft boost — biases, never excludes (degrades gracefully with no context). Verified deterministically: on-route workflow ranks first; other workflows still retrievable.*
- The SDK reports the host's current **route/page** (+ optional app-provided context). The engine biases retrieval toward KB items whose captured `route` matches → "help **for this screen**." Degrades gracefully when absent.

### P1-M9 — Embed auth & tenant scoping (gate for external embed)
- Per-workspace **public embeddable key** (safe in client HTML), distinct from the recorder's secret token. Resolve key → workspace; enforce **origin allowlist** (CORS + server check); **rate-limit** per key/origin; handle anonymous vs. host-authenticated end-users.

### P1-M10 — Feedback loop & analytics
- Persist conversations/messages (or a query log) with `answered` + thumbs. Unify **copilot misses** + **prompt-to-article declines** into one "record this next" view in Studio (reuses/extends `CoverageGap`).

### P1-M11 — Capture reliability hardening (legacy M9)
Brought into Phase 1 because **copilot answer quality = capture quality**. Priority: no-silent-data-loss (nav/upload/audio/SW), then iframe/multi-tab coverage. Full detail + the recorder backlog **R1–R13** live in [`phase-1b-plan.md`](phase-1b-plan.md) §M9 (kept there to avoid duplication).

### P1-M12 — PII redaction (legacy M10)
Brought into Phase 1 and **elevated** — the copilot speaks to the customer's end-users, so approved-KB content (text + screenshots) must be redactable. Client masking beyond passwords + pre-record controls + Studio review redaction + server OCR/DOM backstop. Detail: [`phase-1b-plan.md`](phase-1b-plan.md) §M10.

---

## 7. Risks / decisions to finalize during build

- **Approval granularity (P1-M5):** workflow-level lean default vs. source/item-level; data shape (boolean vs. `CopilotApproval` table).
- **Retrieval quality (P1-M6 / P1-M3 upgrade):** keyword-first vs. pgvector for the MVP; embedding model + dimensions; folding conversation history into retrieval.
- **Grounding strictness (P1-M6):** tune the decline threshold so the copilot is honest without being uselessly cautious — the core quality knob.
- **Citation UX (P1-M6/M7):** Phase 1 has no articles to link (Stage A), so a citation points to the **KB/workflow/step** (e.g. a step thumbnail) — decide what's shown without leaking internal structure.
- **PII in answers (P1-M12):** approved-KB may still contain captured PII — redaction is the real protection before external beta.
- **Embed security (P1-M9):** public key + origin allowlist + rate limiting; LLM cost/abuse controls; anonymous end-user session model.
- **Context mapping (P1-M8):** mapping host routes to captured routes when paths differ (params/hashes); privacy of host-sent context.
- **Cost/latency:** streaming, caching, per-workspace LLM ceilings for an embedded, end-user-facing surface.

---

> **Cadence:** one module at a time, verified, with a stop for review. Build order (deploy last): **P1-M5 → M6 → M7** reaches a first *local* demo; **P1-M8/M10** make it differentiated and self-improving; **P1-M11/M12** harden it for real end-users; **P1-M4 cloud deploy is the FINAL step** — we deploy P1 of V1 only after the whole copilot is built & verified locally. Portal/articles (Phase 2) stay **frozen and decoupled** throughout. **When Phase 1's DoD is met (post-deploy), that's the Version 1 release.**
