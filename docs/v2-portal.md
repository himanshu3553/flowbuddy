# FlowBuddy — Version 2 · Portal track: Help Portal & Articles (by-products)

> **The portal track is the human-facing help center built over the same Knowledge Base the copilot uses — a decoupled, second publish target, scheduled in Version 2.** Version 1 is the pure copilot arc (Copilot → Sense → Self-validation → Autopilot); the portal + articles ship after it. This doc is the forward build plan — the features to develop, aligned to what Phase 1 already produces (distilled workflows + the approval gate + hybrid retrieval). Roadmap/status: [`roadmap.md`](roadmap.md) §6. Technical model: [`architecture.md`](architecture.md). Why it's a by-product: [`product.md`](product.md) §5.

- **Status:** **Version 2 — all 7 modules (V2 · P0…P6) to build; no investment until scheduled.** · **Branch:** `dev` · **Last updated:** 2026-07-08
- **Decoupling guardrail:** the copilot path must **never** require article authoring or portal publishing. Approving a workflow for the copilot and publishing it to the portal are **independent** actions over the same KB. Mental model: `ONE KB → per-audience approval → { Copilot, Portal }`.

---

## 1. What this track builds

The same recordings that power the copilot also feed a **public help portal** — a second publish target for **public/SEO readers** (vs. the copilot's in-app authenticated end-users). A **help article is an approved workflow, rendered**: Phase 1's worker already distills each workflow into a title + clean steps `{ instruction, detail, route, narration, screenshotFile, bbox }` (one curated screenshot + element highlight per step), so the portal renders exactly that. Grounded authorship carries over for free — the portal shows **only** the workspace's own approved recordings.

| Module | Feature |
|:---|:---|
| **V2 · P0** | **Publish foundation** — per-audience approval (`copilot | portal`) + a render-time presentation overlay |
| **V2 · P1** | **Text → Article** — grounded authoring (type a topic → article over hybrid retrieval) |
| **V2 · P2** | **Public Help Portal** — per-workspace site rendering approved workflows as articles |
| **V2 · P3** | **Search UI** — portal + Studio KB hybrid search |
| **V2 · P4** | **Authoring depth** — split/merge/reorder, screenshot retake/crop, callouts, static pages, collections, versioning, prose polish |
| **V2 · P5** | **Portal productization** — theming, custom domains, visibility, feedback, SEO + screenshot PII redaction |
| **V2 · P6** | **Coverage analytics + collaboration** — unified gaps dashboard + multi-seat/roles |

**Priority:** publish foundation + portal first, then search, then authoring/productization, then collaboration last. Build one module at a time, each verified, with a review stop.

---

## 2. Modules to build

### V2 · P0 — Publish foundation (per-audience approval + presentation overlay)
The two structural pieces every other module sits on:
- **Per-audience approval.** Generalize the copilot approval gate into per-audience approval (`copilot | portal`) over the same `(sourceId, segmentIndex)` workflow key — a workflow can be approved for the copilot, the portal, both, or neither. A `PortalPublication` row mirrors `CopilotApproval` (survives the worker's item delete+recreate on reprocess). Realizes the guardrail: `ONE KB → per-audience approval → { Copilot, Portal }`.
- **Presentation overlay.** Portal-only prose and edits (title override, intro, per-step tweaks, reorder/hide steps, callouts) layered **at render time** over the read-only workflow — never by mutating KB items, so the copilot and portal can't drift. One source of truth.
- **Done when:** a workflow can be approved specifically for the portal, and portal-only edits render on top of it without changing the underlying KB.

### V2 · P1 — Text → Article (grounded authoring)
Type a topic; FlowBuddy retrieves the relevant distilled steps over the whole-workspace KB via the **hybrid keyword+pgvector engine** (`synthesis/retrieval.ts`), then synthesizes a grounded article or declines. A decline logs a **coverage gap** ("record this next"). Prompt-grounded articles can span multiple recordings; each step's screenshot resolves back to its source recording.
- **Done when:** a topic prompt yields a grounded, cited article from approved KB, or an honest decline that logs a coverage gap.

### V2 · P2 — Public Help Portal
A **public, per-workspace** site rendering **only** workflows approved for the portal (drafts + raw KB never exposed), each server-rendered with title, ordered **steps, screenshots, and element highlights** — plus any presentation-overlay edits.
- **Done when:** a customer's approved workflows are readable at a public per-workspace URL, rendered from the live KB via the overlay.

### V2 · P3 — Search (portal + Studio KB)
The user-facing half of search over the hybrid retrieval engine (`synthesis/retrieval.ts`).
- **Portal search UI** — search published workflows; **no-result queries logged** (new `SearchQuery` table) as coverage signals (feeds V2 · P6).
- **Studio KB search UI** — a workspace-wide search across recordings, pointing at the existing retrieval seam.
- **Done when:** portal hybrid search returns relevant published workflows, no-result queries are logged, and Studio has a working KB search.

### V2 · P4 — Authoring depth (Studio)
Raises output quality and cuts time-to-publish; every edit is layered on the portal-facing overlay (V2 · P0), not written back to the KB.
- **Segmentation review** — split/merge/reorder the steps a portal article shows and rename it, as overlay edits.
- **Screenshot retake/crop** — re-pick a frame or re-upload, and re-crop, stored on the overlay.
- **Callouts/warnings**, **arrow-pointer highlight** (alongside the rectangle), **related-workflow links** — overlay fields.
- **Manual `static` pages** — hand-written prose pages **not backed by a workflow** (a lightweight `StaticPage` with a markdown body); badged "not self-validated".
- **Collections / tags** organization + **lightweight versioning at publish** (a snapshot of the render).
- **Reader-facing prose polish / brand voice** — an approval-time or render-time LLM pass over the approved workflow, giving intro/preconditions/expected-outcome prose the terse distilled steps omit.
- **Done when:** a founder can reshape a workflow's portal presentation, fix screenshots, enrich steps, hand-write static pages, organize the KB, and version on publish — all without mutating the underlying KB.

### V2 · P5 — Portal productization
Makes the public portal credible for a customer-facing launch.
- **Theming/branding** — logo + colors set in Studio.
- **Custom domains** — map a customer domain to a workspace portal (beyond the `…/<slug>` path).
- **Public / gated visibility** — public default; gated/private as a fast-follow (the visibility flag lives on `PortalPublication`).
- **"Was this helpful?"** per-article feedback → analytics foundations (feeds V2 · P6).
- **SEO** — server-rendered article pages + structured data + a **sitemap**.
- **🔒 Screenshot / DOM PII redaction (prerequisite to publishing).** The portal renders screenshots publicly, so PII *displayed* on the page (a customer name in a table, "signed in as jane@acme.com") — captured in screenshot **pixels + DOM** — must be redacted before anything goes public: **OCR each screenshot → detect high-confidence PII (email/phone/card/SSN) → blur those regions**; scrub DOM text/attributes at rest. Self-hosted engine (**Microsoft Presidio**, or Tesseract.js + a blur step) so screenshots never leave for a third party; reuse the Phase-1 text detectors (`@flowbuddy/synthesis` `redactText`) for the text side. Phase 1 already scrubs the text the copilot reads; the portal adds the public screenshot surface, so this is the remaining piece.
- **Done when:** the portal is themed, supports a custom domain + gated visibility, collects feedback, is SEO-clean, **and published screenshots are PII-redacted**.

### V2 · P6 — Coverage analytics + collaboration
The lowest-leverage items for an invite-only beta, so they close the phase.
- **Coverage-gap analytics dashboard** — unify the live gap signals — **copilot declines** (`source=copilot`) + **portal no-result searches** (V2 · P3) — into a single "record this next" view.
- **Multi-seat / minimal roles** — a workspace can have multiple members with **owner/editor** roles + invitations (V1 is single-user = single-workspace). Enforce role checks across Studio actions.
- **Done when:** the gaps dashboard surfaces all signal sources with a record-this prompt, and a second user can be invited into a workspace as an editor with correctly scoped permissions.

---

## 3. Data-model deltas (additive)

All new tables hang off the workflow key `(sourceId, segmentIndex)` (the key `CopilotApproval` uses) or off `KnowledgeItem`. Every migration is **additive** — nothing in the current schema changes.

- **V2 · P0:**
  - `PortalPublication` — the portal half of per-audience approval, keyed `@@unique([sourceId, segmentIndex])` + `workspaceId` (mirrors `CopilotApproval`, so it survives the worker's item delete+recreate on reprocess). Absence = not portal-visible. Optional `visibility` (public | gated) folds in here (V2 · P5).
  - `WorkflowOverlay` — the presentation overlay, keyed `(sourceId, segmentIndex)`: portal-only `titleOverride`, `intro`/`body` prose, per-step edits (instruction/detail overrides, hidden/reordered steps as a `steps Json`), callout/warning fields, highlight `kind` (rectangle | arrow), related-workflow links. Rendered on top of the read-only workflow; **never** written back to `KnowledgeItem`.
- **V2 · P3:** `KnowledgeItem.embedding` + the **pgvector** extension already exist — **no new retrieval migration**. Add only a `SearchQuery` log (workspace, query, result-count, ts) so portal no-result queries become coverage signals.
- **V2 · P4:** `StaticPage` (workspace, title, markdown `body`) for prose pages not backed by a workflow; `PublishVersion` (a snapshot of the render at publish); `Collection` (+ a workflow/page ↔ Collection join).
- **V2 · P5:** `Workspace` theme fields (logo key, colors), `customDomain`, gated-access secret; `WorkflowFeedback` (article ref, helpful bool, optional note); a `redactions Json` on `KnowledgeItem` (persisted blur regions) and/or redacted-image artifacts so published screenshots are scrubbed.
- **V2 · P6:** `Membership` (User ↔ Workspace + `role: owner | editor`) + `Invitation`; `CoverageGap` aggregation across sources for the analytics view (`CoverageGap.source` gains `portal` for no-result searches, alongside the existing `copilot`).

---

## 4. Risks / details to finalize

- **Read-only KB vs. editable portal — the central design tension:** the copilot's source of truth must stay the workflow, but portal authors want to reshape prose/steps. Resolved in principle — all edits are a **render-time overlay**, never a KB mutation — so the two audiences can't drift. The detail to finalize is how far the overlay may diverge (reorder/hide steps? full prose replace?) before it's effectively a fork.
- **Manual `static` body:** keep the markdown `body` modality-agnostic so a future narration-derived static path (Version 2) reuses the same hook.
- **Custom domains:** TLS/cert provisioning + domain-verification flow; the per-workspace routing model.
- **Multi-tenancy under multi-seat:** the foundation assumes single-user isolation; auditing every Studio/portal query for correct workspace + role scoping is the main correctness risk when seats are introduced.
- **🔒 Screenshot PII redaction gates publish:** the portal renders screenshot pixels + DOM the copilot never surfaces; nothing goes public until screenshot OCR + region-blur + DOM-scrub lands (V2 · P5).

> **Not in this track:** the in-app **Copilot** (Phase 1), **Sense / in-context help** (Phase 2), **self-validation/drift** (Phase 3), **Autopilot / agentic execution** (Phase 4, [`phase-4-autopilot.md`](phase-4-autopilot.md)), the **V2 capture modalities** (narration-only + video — a separate V2 track), billing, and i18n (tracked, English-first beta).
