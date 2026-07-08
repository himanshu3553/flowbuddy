# Sync — Phase 2: Help Portal & Articles (by-products)

> **Phase 2 is the human-facing help center over the *same* Knowledge Base — a decoupled publish target.** It is **frozen**, and its build path changed on **2026-07-07 (§7)**: the pre-pivot article editor + curated generation (built, UI removed 2026-06-25, engine parked in-tree) were **removed — superseded by workflows-as-articles**: Phase 2 will render **approved distilled workflows** as articles instead of resuming a parallel engine. The public portal app validated the render path and **returns in Phase 2**; the rest is productization. No new investment here until the copilot (Phase 1) ships. Roadmap/status: [`roadmap.md`](roadmap.md) §3. Technical model: [`architecture.md`](architecture.md). Why it's a by-product: [`product.md`](product.md) §5.

- **Status:** **Frozen — UI removed 2026-06-25; engine + `Article`/`Step` tables removed 2026-07-07 (§7).** Built: P2-M0 (editor), P2-M1 (curated generation + prompt-to-article) — both later **superseded by workflows-as-articles** and swept from the tree (historical inventory: **§6**; decision + rebuild notes: **§7**). P2-M2 (public portal) **built → app removed for the clean slate, returns in Phase 2**. To build: P2-M3…P2-M6. **The to-build plan (§3), data-model deltas (§4), and risks (§5) were reconciled onto the post-sweep reality on 2026-07-08** — they no longer target the removed `Article`/`Step` model; they build a **presentation overlay + per-audience approval over the distilled workflows**.
- **⚠️ DIRECTION CHANGE 2026-07-07 — read §7 first.** The parked engine (§6) was **superseded by workflows-as-articles** and removed from the tree (full sweep, incl. the `Article`/`Step` tables — migration `20260707132717_drop_phase2_article_step_tables`): Phase 2 will render **approved distilled workflows** as articles instead of resuming this engine. §6 stays as the historical inventory (recovery: `git show c357e2e:<path>`); the rebuild notes (editing overlay · Text→Article · prose polish) live in **§7**.
- **Last updated:** 2026-07-08 · **Branch:** `dev`
- **Decoupling guardrail:** the copilot path must **never** require article authoring or portal publish. Approving a workflow for the copilot and publishing an article are **independent** actions over the same KB. Mental model: `ONE raw KB → per-target approval/visibility → { Copilot, Portal }`.

---

## 1. Overview

The same recordings that power the copilot also feed a **public help portal** — a second, *decoupled* publish target for **public/SEO readers** (vs. the copilot's in-app authenticated end-users). Since the 2026-07-07 pivot (§7), a help article **is an approved distilled workflow, rendered** (title + clean steps + screenshots/highlights the Phase-1 worker already produces) — not the output of a separate synthesis engine. Grounded authorship is preserved for free: the portal renders **only** the workspace's own approved recordings, and the copilot's decline path already flags coverage gaps when a topic isn't covered.

| Module | What it is | Status |
|:---|:---|:---|
| **P2-M0** | Studio article editor (view/edit/reorder/publish) | ✅ built → 🗑️ **removed 2026-07-07 — superseded by workflows-as-articles (§7)** |
| **P2-M1** | Curated article generation + prompt-to-article | ✅ built → 🗑️ **removed 2026-07-07 — superseded by workflows-as-articles (§7)** |
| **P2-M2** | Public Help Portal (renders published **workflows** — steps, screenshots, highlights) + per-audience approval + presentation overlay | ✅ built → app removed, **returns in Phase 2 (rebuilt to render workflows)** |
| **P2-M3** | Portal + KB **search UI** (hybrid) | 📝 to build |
| **P2-M4** | Authoring depth | 📝 to build |
| **P2-M5** | Portal productization | 📝 to build |
| **P2-M6** | Coverage analytics + collaboration | 📝 to build |

---

## 2. As built (frozen — UI parked 2026-06-25)

> **What "parked" meant — and what happened to it.** Everything in §2 was built and verified. On 2026-06-25 the **Studio UI** for it (the "Auto Generate Articles" + "Text → Article" cards, the article list, and the `/dashboard/articles/[id]` editor) was removed from the Phase-1 pages so the released product is copilot-only, while the engine stayed in-tree, dormant and type-checked. On **2026-07-07 the engine itself — and the `Article`/`Step` Prisma tables (migration `20260707132717_drop_phase2_article_step_tables`) — were removed**, superseded by workflows-as-articles (**§7**). **§2 below is the historical as-built record only** — the `Article`/`Step` model it describes no longer exists in the schema; the current KB unit is the distilled `KnowledgeItem` step (see [`phase-1-copilot.md`](phase-1-copilot.md) §7). File inventory: **§6** (recoverable at `c357e2e`).

### 2.1 Curated auto-generation ("Auto Generate Articles") — P2-M1
Articles are **not pushed automatically**:
1. **Propose (instant, no LLM):** Studio lists the **candidate workflow titles** the KB produced at segmentation, each with a checkbox; a candidate that already has an article shows **"✓ generated."**
2. **Select:** you check the workflows worth an article.
3. **Generate:** Sync synthesizes **only the selected** workflows into **draft articles** (multimodal: narration + events + screenshots), grounded strictly in the recording.

Entry points: **per-recording** (from a recording's KB page) and a workspace-wide **"opportunities"** list of un-generated candidates across all recordings.

### 2.2 Prompt-to-article ("Text → Article") — P2-M1
Type a topic; Sync retrieves the relevant items over the **whole-workspace KB** (keyword shortlist), then **synthesizes or declines**. A decline logs a **coverage gap** ("record this next") on the dashboard. Prompt-grounded articles can **span multiple recordings**; their screenshots resolve back to whichever recording each step came from. *(This shares the retrieval/grounding engine with the copilot — see [`architecture.md`](architecture.md) Module 3.)*

### 2.3 The structured Article model — P2-M0 *(removed 2026-07-07 — historical)*
> The `Article`/`Step` tables below were **dropped 2026-07-07**. Their role — structured, self-validatable, step-shaped knowledge — is now carried by the distilled `KnowledgeItem` step (`{ instruction, detail, route, narration, screenshotFile, bbox }`), which already holds the screenshot + element bbox an article needs. The prose-only fields the old model added on top (`intent`, `preconditions`, `expectedOutcome`, per-article `body`) are what the Phase-2 **presentation overlay** (§7, §4) re-provides at render time.

Articles were stored as **structured data, not markdown blobs** — what made the portal (and later self-validation) possible:

```
Article { id, title, intent, tags[], routes[], preconditions[], source, type, status, steps[] }
Step    { order, instruction,            // human action ("Click …")
          rationale,                     // the "why", from narration
          screenshot + highlight,        // image + element rectangle (viewport fractions 0–1)
          selector, route,               // robust, multi-signal — for future validation
          expectedOutcome, uncertain }   // expected state after the step; flagged when capture was thin
```
- **`type`** = shape/self-validatability: **`workflow_backed`** (steps) vs **`static`** (prose).
- **`source`** = origin: **`recording_auto`** (curated), **`prompt_grounded`** (Text→Article), **`manual`** (human-written), `import`.
- **`status`** = **`draft`** | **`published`**.

### 2.4 Studio article editor — P2-M0
Open any article to edit step **title/instruction/rationale**, **reorder/delete** steps, toggle **Publish/Unpublish**, and see each step's **screenshot with the element highlight** (computed from the captured bbox as viewport fractions; served via short-lived signed URLs).

### 2.5 Public Help Portal — P2-M2 *(built → returns in Phase 2)*
A **public, per-workspace** site rendering **only published articles** (drafts + raw KB never exposed), each server-side with title, intent, preconditions, and ordered **steps with screenshots + element highlights**.

> **Status:** built in the foundation (legacy M5) and **validated the KB→render path**; its standalone app (`packages/portal`) was **removed for the Phase-1 copilot clean slate** (commit `c9f13f4`, 2026-06-22) and **returns in Phase 2** — rebuilt to render approved workflows (§7). When it returns it picks up the productization modules (P2-M3, P2-M5) below.

---

## 3. To-build modules (P2-M2 … P2-M6)

> **Reframed onto workflows-as-articles (2026-07-08).** Every module below now builds over the **distilled workflows** (approved `KnowledgeItem` steps), not the removed `Article`/`Step` engine. Two structural pieces the pivot introduces sit under these modules and are the first things to build:
> - **P2-M2·a — a portal audience on the approval model.** Generalize the copilot trust gate into **per-audience approval** (`copilot | portal`) over the same `(sourceId, segmentIndex)` workflow key — a workflow can be approved for the copilot, the portal, both, or neither. Concretely a `PortalPublication` row mirroring `CopilotApproval` (survives the worker's item delete+recreate on reprocess). §0 guardrail realized: `ONE raw KB → per-target approval → { Copilot, Portal }`.
> - **P2-M2·b — the presentation overlay.** Portal-only prose/edits (title override, intro, per-step tweaks, reorder, callouts) layered **at render time** over the read-only workflow — never by mutating KB items (§7). One source of truth, so the copilot and portal can't drift.

> Priority within Phase 2 mirrors the old "beta-blocking" order: **portal rebuild + audience/overlay first**, then search, then authoring/portal polish, then collaboration last. Each is built one at a time, verified, with a stop for review.

> **⚠️ CARRIED OVER FROM PHASE 1 — must build before the portal goes public: PII redaction Cut 2 (screenshot OCR + region blur + DOM-pixel scrub).** Phase 1 shipped **Cut 1** (P1-M12) — scrubbing high-confidence PII from the *text* the copilot reads. But PII *displayed on the page* is captured in **screenshot pixels + DOM** (e.g. a customer name in a table, "signed in as jane@acme.com"). The copilot never surfaces those, **but the public portal renders screenshots** — so Cut 2 is a **hard prerequisite for publishing**. Build it in/with **P2-M5 (portal productization)**: OCR each screenshot → detect high-confidence PII (email/phone/card/SSN) → blur those regions in the stored image; scrub DOM-text/attributes at rest. Engine decision (self-hosted to avoid shipping screenshots to a 3rd party): **Microsoft Presidio** (text + image redactor, self-hostable) vs. Tesseract.js + a blur step. Pairs with the **Studio review-time one-click redaction** in P2-M4. Reuse the Phase-1 `redactText` detectors (`@sync/synthesis/src/redact.ts`) for the text side. See [`phase-1-copilot.md`](phase-1-copilot.md) §8.

### P2-M3 — Search (portal + KB UI) *(legacy M11, portal half)*
The user-facing half of search. **The retrieval/embedding half already shipped** — hybrid keyword ∪ pgvector RRF landed in P1-M3 (2026-07-07, `synthesis/retrieval.ts`); Phase 2 reuses that engine and adds only the UI + a query log.
- **Portal search UI** — search published workflows (rendered as articles) over the **hybrid** engine; **no-result queries logged** (new `SearchQuery` table) as coverage signals (feeds P2-M6).
- **Studio KB search UI** — a workspace-wide search over the KB (across recordings) — the search surface deferred from the foundation; can point straight at the existing `retrieveApprovedKB`/hybrid seam.
- **Done when:** portal hybrid search returns relevant published workflows, no-result queries are logged, and Studio has a working KB search.

### P2-M4 — Authoring depth (Studio) *(legacy M12)*
Raises output quality and cuts time-to-publish. **Reframed onto the presentation overlay (P2-M2·b):** the KB workflow stays read-only (the copilot's source of truth); every edit below is layered on the portal-facing overlay, not written back onto `KnowledgeItem`s. This *replaces* the old mutable-`Article`/`Step` editor.
- **Segmentation review** — split/merge/reorder the steps a portal article shows and rename it, as overlay edits over the workflow's distilled steps. *(True cross-workflow re-segmentation of the KB itself stays a heavier, separate concern; the overlay reshapes presentation, not the KB.)*
- **Screenshot retake/crop** — re-pick a frame or re-upload, and re-crop, stored on the overlay. *(Still no step-level re-record — re-recording replaces a flow.)*
- **Callouts/warnings**, **arrow-pointer highlight** (alongside the rectangle), **related-workflow links** — overlay fields.
- **Manual `static` pages** — hand-write prose pages **not backed by a workflow** (`source=manual`, `type=static`). Since the `Article` table is gone, these need a **standalone lightweight store** (a `StaticPage` with a markdown `body`), not the old `Article.body`. Badged "not self-validated"; AI never generates these.
- **Collections / tags** organization + **lightweight versioning at publish** (a snapshot of the overlay/render, not of a mutable article).
- **Reader-facing prose polish / brand voice** — an approval-time or render-time LLM pass over the approved workflow (§7 rebuild note 3), giving intro/preconditions/expected-outcome prose the terse distilled steps omit. The portal-theming half is P2-M5.
- **Done when:** a founder can reshape a workflow's portal presentation, fix screenshots, enrich steps, hand-write standalone static pages, organize the KB, and version on publish — all without mutating the underlying KB.

### P2-M5 — Portal productization *(legacy M13)*
Makes the public portal credible for a real customer-facing launch.
- **Theming/branding** — logo + colors set in Studio.
- **Custom domains** — beyond the `…/<slug>` path; map a customer domain to a workspace portal.
- **Public / gated visibility** — public default; gated/private as a fast-follow. *(Visibility is the portal audience's approval flag from P2-M2·a — a workflow is portal-visible only when published for that audience.)*
- **"Was this helpful?"** per-published-workflow feedback → analytics foundations (feeds P2-M6).
- **SEO** — server-rendered article pages (already SSR), structured data + a **sitemap**.
- **🔒 PII redaction Cut 2 (prerequisite to publishing) — screenshot OCR + region blur + DOM-pixel scrub** (carried from Phase 1 P1-M12, §3 callout). The portal renders screenshots publicly, so this gates "publish." Self-hosted engine (Presidio or Tesseract.js + blur); reuse `@sync/synthesis` `redactText` for the text side.
- **Done when:** the portal is themed, supports a custom domain + gated visibility, collects feedback, is SEO-clean, **and published screenshots are PII-redacted (Cut 2)**.

### P2-M6 — Coverage analytics + collaboration *(legacy M14, last)*
The lowest-leverage items for an invite-only beta, so they close the phase.
- **Coverage-gap analytics dashboard** — unify the live gap signals — **copilot declines** (`source=copilot`, shipped P1-M10) + **portal no-result searches** (P2-M3) — into a single "record this next" view, beyond the current basic list. *(The legacy `source=prompt` gap came from the removed Text→Article engine; historical rows may remain but no new ones are produced.)*
- **Multi-seat / minimal roles** — a workspace can have multiple members with **owner/editor** roles + invitations (V1 is single-user = single-workspace). Enforce role checks across Studio actions.
- **Done when:** the gaps dashboard surfaces all signal sources with a record-this prompt, and a second user can be invited into a workspace as an editor with correctly scoped permissions.

---

## 4. Data-model deltas (additive, per module)

**Reframed 2026-07-08 onto the post-sweep schema.** The `Article`/`Step` tables are **gone** (dropped 2026-07-07), so Phase 2 no longer *adds columns to them* — it adds **new** tables that hang off the workflow key `(sourceId, segmentIndex)` (the same key `CopilotApproval` uses) or off `KnowledgeItem`. All migrations stay **additive** — nothing in the current schema changes:

- **P2-M2 (audience + overlay — the pivot's core):**
  - `PortalPublication` — the **portal half of per-audience approval**, keyed `@@unique([sourceId, segmentIndex])` + `workspaceId` (mirrors `CopilotApproval`, so it **survives the worker's item delete+recreate on reprocess**). Absence = not portal-visible. Optional `visibility` (public | gated) folds in here (P2-M5).
  - `WorkflowOverlay` (or `ArticleOverlay`) — the **presentation overlay**, also keyed `(sourceId, segmentIndex)`: portal-only `titleOverride`, `intro`/`body` prose, per-step edits (instruction/detail overrides, hidden/reordered steps as a `steps Json`), callout/warning fields, highlight `kind` (rectangle | arrow), related-workflow links. Rendered on top of the read-only workflow; **never** written back to `KnowledgeItem`.
- **P2-M3 (search):** `KnowledgeItem.embedding` + the **pgvector** extension **already exist** (shipped in P1-M3, migration `20260706200500_pgvector_hybrid_retrieval`) — **no new retrieval migration**. Phase 2 adds only a `SearchQuery` log (workspace, query, result-count, ts) so portal **no-result** queries become coverage signals.
- **P2-M4 (authoring):** `StaticPage` (workspace, title, markdown `body`, `source=manual`, `type=static`) — a **standalone** store for prose pages not backed by a workflow (replaces the removed `Article.body`; still the modality-agnostic hook V2 narration-statics reuse); `PublishVersion` (lightweight history — a snapshot of the overlay/render at publish); `Collection` (+ a workflow/page↔Collection join). *(Callout/highlight-`kind` fields live on the overlay, above.)*
- **P2-M5 (portal):** `Workspace` theme fields (logo key, colors), `customDomain`, gated-access secret *(the `visibility` flag itself lives on `PortalPublication`, P2-M2)*; `WorkflowFeedback` (published-workflow ref, helpful bool, optional note); **PII Cut 2** — a `redactions Json` on `KnowledgeItem` (persisted blur regions) and/or redacted-image artifacts so published screenshots are scrubbed. *(No `Step` table anymore — redactions attach to the `KnowledgeItem` step.)*
- **P2-M6 (collaboration):** `Membership` (User↔Workspace + `role: owner | editor`) + `Invitation`; `CoverageGap` aggregation across sources (prompt-miss · portal-no-result · copilot-decline) for the analytics view. *(`CoverageGap.source` already carries `prompt | copilot`; add `portal` for no-result searches.)*

---

## 5. Risks / details to finalize

- **Read-only KB vs. editable portal (P2-M2·b) — the central design tension:** the copilot's source of truth must stay the workflow, but portal authors want to reshape prose/steps. Resolved in principle (§7): all edits are a **render-time overlay**, never a KB mutation — so the two audiences can't drift. The detail to finalize is how much the overlay may diverge (reorder/hide steps? full prose replace?) before it's effectively a fork.
- **pgvector on the deploy target — ✅ settled (P1-M3, 2026-07-07):** hybrid keyword ∪ pgvector RRF shipped; `text-embedding-3-small`@1536; Render `vector` support confirmed 2026-07-06. Phase-2 search reuses it — **no retrieval risk left**; only the search UI + `SearchQuery` log remain.
- **Manual `static` body shared with V2 (P2-M4):** the markdown `body` for **manual** statics now lives on the new **`StaticPage`** table (the old `Article.body` is gone) — keep it modality-agnostic so V2 narration-derived statics reuse the same hook.
- **Custom domains (P2-M5):** TLS/cert provisioning + domain-verification flow; the per-workspace routing model.
- **Multi-tenancy under multi-seat (P2-M6):** the foundation assumes single-user isolation; auditing every Studio/portal query for correct workspace + role scoping is the main correctness risk when seats are introduced.
- **Portal app restoration (P2-M2):** rebuild the removed `packages/portal` (render path proven) on the current schema; wire it to **render approved workflows** (via `PortalPublication` + the overlay) — **not** a published-`Article` view (that model is gone) — plus the P2-M5 productization.
- **🔒 PII redaction Cut 2 gates publish (P2-M5):** the portal renders screenshot pixels + DOM the copilot never surfaces; nothing goes public until screenshot OCR + region-blur + DOM-scrub lands (§3 callout). Reuse `@sync/synthesis` `redactText` for the text side.

> **Not in Phase 2:** the in-app **Copilot** (Phase 1), **self-validation/drift** (Phase 3), **Version 2 capture modalities** (narration-only + video), billing, and i18n (tracked, English-first beta).

---

## 6. Parked Phase 2 code — HISTORICAL inventory (removed 2026-07-07, see §7)

> **⚠️ This section is historical.** The re-wiring plan below is **obsolete** — the parked code was removed on 2026-07-07 (workflows-as-articles, **§7**). It is kept as the inventory of what was swept out; recover any file with `git show c357e2e:<path>`.

When Phase 1 (the copilot) was readied for release on **2026-06-25**, the Phase 2 article/portal code was **kept** (not deleted) but **disconnected from the Studio UI** so the shipped product was copilot-only. Each file carried a `// PARKED — Phase 2 …` banner pointing back here.

> Why parked, not deleted: Phase 2 is a confirmed future deliverable and these modules are ✅ built, so deleting working code we'll reuse — plus a destructive DB migration — was net-negative. We keep the engine and tables; we only hide the product surface. (The standalone `packages/portal` app is the exception — it was hard-removed earlier, commit `c9f13f4`, and returns rebuilt.)

### What was parked (the engine — removed 2026-07-07)

| File | What it is |
|---|---|
| `packages/synthesis/src/synthesize.ts` | Article synthesis (KB items → structured article) |
| `packages/synthesis/src/prompt.ts` | Prompt-to-article (retrieve → synthesize or decline) |
| `packages/shared/src/content.ts` | The structured Article/Step content model + types |
| `packages/shared/src/highlight.ts` | `Highlight` rectangle type (article screenshots) |
| `packages/web/lib/article-writer.ts` | `createDraftArticle` (persist a synthesized article) |
| `packages/web/lib/article-actions.ts` | Article edit/reorder/publish server actions |
| `packages/web/lib/generate-actions.ts` | "Auto Generate Articles" server action |
| `packages/web/lib/prompt-actions.ts` | "Text → Article" server action (`generateFromPrompt`) |
| `packages/web/lib/highlight.ts` | bbox → fractional `Highlight` conversion |
| `packages/web/app/dashboard/generate-panel.tsx` | "Auto Generate Articles" UI |
| `packages/web/app/dashboard/prompt-box.tsx` | "Text → Article" UI |
| `packages/web/app/dashboard/articles/[id]/` | Article viewer + editor route (still URL-reachable, just unlinked) |

> Note: `synthesis/src/index.ts` and `shared/src/index.ts` **still export** the parked symbols, and the **`Article` + `Step` Prisma tables are kept** — so the dormant code compiles untouched. The copilot engine (`synthesis/src/copilot.ts`, `answerFromKB`) and the worker share *none* of this.

> **⚠️ Resume gotcha — KB step distillation changed the item shape (2026-06-27).** The parked article engine (`generate-actions.ts`, `prompt-actions.ts`) reads raw events from `KnowledgeItem.data.event`, but the worker **no longer persists that** — since the [KB step-distillation](kb-step-distillation.md) work, items hold **distilled steps** (`{ instruction, detail, route, narration, screenshotFile, bbox }`) and the raw event log lives only in `KnowledgeSource.manifest`. On resume, the article engine must **re-source raw events from `manifest`** (not `data.event`). The worker also now calls `buildWorkflowKB`, not `buildKB`/`segmentItems` (both still exported for the parked engine). Don't touch parked code until Phase 2 resumes.

### What was changed in the Phase-1 code (re-wire to resume)

- **`packages/web/app/dashboard/page.tsx`** — the "opportunities", "Auto Generate Articles", "Text → Article", and Articles-list cards were removed; only Copilot / token / Recordings-KB / coverage-gaps remain. *(Restore those cards + their `GeneratePanel`/`PromptBox` imports.)*
- **`packages/web/app/dashboard/kb/[id]/page.tsx`** — the "Auto Generate Articles" and "Articles generated from this recording" cards (and the `articles` include) were removed; the Copilot approval panel stays. *(Restore the two cards + the `GeneratePanel` import + the `articles` include.)*
- **`packages/web/lib/candidates.ts`** — the `Article` join + `generatedArticleId` field were dropped (it's now Phase-1-only, feeding the approval gate). *(Re-add the `Article` query + `generatedArticleId` so generated workflows show "✓ generated".)*
- **`resolveCoverageGap`** — moved out of `prompt-actions.ts` into **`packages/web/lib/copilot-actions.ts`** (coverage-gap dismissal is a Phase-1 copilot signal). The parked `prompt-actions.ts` still *creates* gaps; dismissal now lives with the copilot. *(No change needed on resume — both can import it from `copilot-actions.ts`.)*

### Re-wiring checklist (when Phase 2 resumes)
1. Restore the removed Studio cards/imports listed above (recover the exact prior versions from git: `git show <pre-cleanup-commit>:<path>`).
2. Re-add the `Article` join to `candidates.ts`.
3. **Re-source raw events from `KnowledgeSource.manifest`** in `generate-actions.ts` / `prompt-actions.ts` — `KnowledgeItem.data.event` is gone since KB step distillation (see the resume-gotcha note above).
4. Rebuild `packages/portal` (P2-M2) on the current schema (see §5).
5. Remove the `// PARKED — Phase 2` banners as each file goes live again.
6. Then pick up the to-build modules P2-M3…M6 (§3).

---

## 7. Direction change (2026-07-07) — workflows-as-articles supersede the parked engine

> **This section supersedes §6.** §6 stays as the historical inventory of what was removed; the re-wiring checklist above is **obsolete** — Phase 2 will not resume the parked engine.

**The decision.** The parked article engine predates KB step distillation (2026-06-27). Since distillation, the Phase-1 worker **already produces what an article needs**: per-workflow `segmentTitle` + clean distilled steps `{ instruction, detail, route, narration, screenshotFile, bbox }` — one curated screenshot per step, with the bbox for the element highlight. And the `CopilotApproval` trust gate (keyed `(sourceId, segmentIndex)`, survives reprocess) generalizes to a second audience. So: **a help article ≈ an approved workflow, rendered.** The portal becomes a second publish target over the *same* distilled workflows — per-audience approval (copilot | portal) over ONE KB. This is the §0 decoupling guardrail (`ONE raw KB → per-target approval → { Copilot, Portal }`) realized with **one pipeline instead of two parallel synthesis engines**.

**Consequences (the 2026-07-07 full sweep):**
- The parked engine + UI (the §6 inventory), the `Article` + `Step` Prisma tables, and the legacy raw-event helpers in `synthesis/src/index.ts` (`buildKB`, `segmentItems`, `generateArticleForSegment`, `decodeStepData`) are **removed from the tree**. The engine was already non-functional for post-distillation data (the §6 resume gotcha — it read `KnowledgeItem.data.event`, which the worker no longer writes).
- **Recovery:** everything lives in git history at the pre-cleanup commit **`c357e2e`** — `git show c357e2e:<path>`.
- **Phase-2 resume now means:** add a portal audience to the approval model + build the portal to render approved workflows — not re-wiring §6. The to-build modules P2-M3…M6 (§3) survive, reframed onto workflows instead of `Article` rows (P2-M4's editor items become the presentation overlay below).

### Rebuild notes — what the old engine had that Phase 2 must re-provide

Three capabilities are consciously lost with the sweep; each has a better rebuild path on today's pipeline:

1. **Article editing** (rename, edit steps, reorder, publish toggle — old P2-M0). Workflows are read-only KB items — and that's arguably a **feature**: one source of truth, so the copilot and portal never drift. Re-provide as a **thin presentation overlay** on top of the workflow (portal-only edits layered at render time), **not** by making KB items mutable.
2. **Text → Article** (type a topic → grounded article, old P2-M1). No Phase-1 equivalent exists. Its main by-product — **coverage-gap detection** — already lives in the copilot decline path (`CoverageGap` rows with `source: 'copilot'`). If the authoring feature is ever wanted, rebuild it on today's **hybrid keyword+pgvector retrieval over distilled steps** — far better than the old raw-event keyword shortlist it used.
3. **Reader-facing prose polish.** Distilled steps are optimized for retrieval (terse instruction + detail); the old articles carried intro/preconditions/expected-outcomes. Re-provide as a **render-time or approval-time presentation pass** (LLM polish over the approved workflow) in Phase 2 — much cheaper than maintaining a parallel synthesis engine.
