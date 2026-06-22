# Sync — Phase 1 Product Features (as built)

> **What this is.** A detailed, section-by-section description of everything **Phase 1 of Sync delivers as a product**, end-to-end. It documents the **as-built** state (milestones M0–M7); features that belong to Phase 1 but are deferred are called out with a **🔜 Phase 1b** note. For *why* see [`PRD.md`](PRD.md); for the *technical* model see [`architecture.md`](architecture.md); for *build milestones* see [`phase-1a-plan.md`](phase-1a-plan.md).

> **⚠️ Copilot-first pivot (2026-06-22).** This reference documents the **as-built M0–M7** product, which was framed portal-first. That foundation (capture → KB → retrieval) is **core and reused** by the copilot (**Phase 1**); the portal/article surfaces it describes are now **Phase 2 by-products**. For the phase/module roadmap and the built-vs-next map, see **[`version-1-roadmap.md`](version-1-roadmap.md)** + **[`pivot-copilot-first.md`](pivot-copilot-first.md)** (§3–§4) and **[`phase-1-copilot-plan.md`](phase-1-copilot-plan.md)**.

- **Status:** Phase 1 (thin slice) feature-complete & verified end-to-end — M0–M7 done; cloud deploy (M8) pending.
- **Last updated:** 2026-06-21
- **Audience:** founders/stakeholders, onboarding, and as the seed for help/marketing content.

---

## 1. Overview

**Sync turns a narrated screen recording of your product into a clean, structured help center — that you curate, edit, and publish.**

### The core loop (Phase 1)
```
Record (Chrome extension)  →  Knowledge Base (auto)  →  Articles (you curate)  →  Edit & Publish (Studio)  →  Help Portal (your customers)
```

A founder installs the **Sync Recorder** Chrome extension, connects it to their account, and records themselves clicking through a workflow while narrating *what* they're doing and *why*. Sync captures the session in synchronized layers (interaction events, DOM, screenshots, narration audio), builds an explicit **Knowledge Base**, and lets the founder **choose** which workflows to turn into draft articles — or **type a topic** and get a grounded draft. The founder reviews/edits in **Studio** and **publishes** to a public **Help Portal**.

### What Phase 1 delivers
- A working **Chrome extension** recorder with one-click account connect and clear recording feedback.
- An explicit, persisted **Knowledge Base** per workspace, browsable in Studio.
- **Two grounded authoring paths** — curated auto-generation and prompt-to-article — both writing only from your recordings.
- A **Studio** to review, edit, reorder, and publish articles.
- A public **Help Portal** rendering published articles with screenshots and element highlights.
- Real **accounts, multi-tenant isolation, object storage, and async processing** under the hood.

### The guiding principle: grounded authorship
**Every AI-written article is synthesized only from the customer's own recordings — never the model's general knowledge.** A prompt selects the *topic*; the recordings supply the *content*. If nothing was recorded on a topic, the AI **declines and flags a coverage gap** instead of inventing steps. This is what keeps the KB accurate (and, in later phases, self-validatable).

---

## 2. The three surfaces

| Surface | Who uses it | Purpose |
|---|---|---|
| **Sync Recorder** (Chrome extension) | the builder | capture narrated product workflows |
| **Studio** (web app) | the builder | review the KB, curate/generate/edit articles, publish |
| **Help Portal** (public web) | the builder's customers | browse & read published help articles |

> **Copilot (now Phase 1 — the headline product):** an embedded in-app **Copilot** widget (the fourth surface) answers customer questions grounded in **approved-KB** (not published articles). *(Pre-pivot this doc called it "Phase 2, from published articles" — both superseded; see [`phase-1-copilot-plan.md`](phase-1-copilot-plan.md).)*

---

## 3. Module 1 — Capture (the Sync Recorder)

**Job:** get raw, un-interpreted signal in. Phase 1 ships **workflow capture** (clicks + DOM + screenshots + narration).

### 3.1 Connect with Sync (account auth)
- The popup shows **"Connect"**; clicking it opens Studio's **`/connect`** page (where you're already signed in).
- One click on **"Connect this extension"** mints a workspace token **server-side** and hands it — plus the API URL — back to the extension automatically (via a content-script bridge on the Studio origin). **No tokens or URLs are ever typed or pasted.**
- The popup then shows **"✓ Connected as you@email"** with a **Disconnect** option. Recording is disabled until connected.

> 🔜 **Phase 1b / later:** full OAuth (`chrome.identity`) if the extension is published to many third-party users.

### 3.2 Recording controls
- **Start / Stop** recording of the **active tab**.
- **Mark new workflow** button — drops a marker so one recording can be split into multiple workflows (e.g. "reset password" then "upgrade plan"); markers are the strongest segmentation signal.
- **Grant microphone** — a guided permission flow (opens a tab to approve mic access) so narration is captured.

> 🔜 **Phase 1b:** pause/resume; a keyboard hotkey for "mark workflow."

### 3.3 What gets captured (per interaction)
The recorder is **event/DOM-primary** — events are ground truth, not video. For each meaningful interaction (click, text input, submit, Enter, SPA navigation) it captures:

| Layer | Detail |
|---|---|
| **Event** | type, timestamp, typed value (passwords masked) |
| **Element semantics** | role, accessible name, text, tag, CSS path, XPath, bounding box, key attributes |
| **Route** | URL, path, hash, page title |
| **Screenshot** | a hi-res screenshot at the moment of the event |
| **DOM snapshot** | the page HTML (scripts/styles stripped, size-capped) |
| **Post-action snapshot** | a second screenshot + DOM + route **after the page settles** (mutation-quiet or network-idle) — the basis for each step's *expected outcome* |
| **Narration** | continuous microphone audio for the whole session |

### 3.4 Recording feedback
The recorder gives clear, continuous feedback so you always know its state:
- **Toolbar badge** cycles **`REC` → `↑` (uploading) → `✓` / `!`**.
- **Popup** shows a **blinking red "REC"** indicator while recording.
- **On-page toast** — a brief, **non-blocking** message (`pointer-events:none`, auto-dismiss) for *recording started* / *uploaded* / *failed*. It never covers the page.
- **No silent failures:** every outcome (success, upload error, or **zero interaction events**) surfaces a badge + popup status + toast — e.g. *"No interaction events were captured…"*.

### 3.5 Upload
On Stop, the recorder assembles the **session bundle** (a manifest JSON + audio + screenshots + DOM snapshots) and uploads it to the Sync API with the connected workspace token. The recording then appears in Studio and begins processing.

### 3.6 Known limitations (Phase 1)
- **Single active tab**; capture stops on a **full-page navigation** (the recorder detaches).
- **Top frame only** — UIs rendered inside an **`<iframe>`** aren't captured. *(Now surfaced clearly as a zero-event failure rather than failing silently.)*
- Minimal in-recording redaction (password fields masked).

> 🔜 **Phase 1b:** iframe/cross-frame capture, multi-tab/navigation resilience, productized PII redaction.

---

## 4. Module 2 — Knowledge Base

**Job:** turn raw captures into **normalized, queryable knowledge**. This is the explicit substrate everything downstream reads from.

### 4.1 One cumulative KB per workspace
There is **one Knowledge Base per workspace (per product)** — *not* one per recording. Every recording feeds its knowledge into the same KB, which **compounds over time**. Each unit of knowledge links back to **both** its source recording (provenance) and its workspace (the cumulative KB).

### 4.2 What the KB stores
- **`KnowledgeSource`** — one per recording: capture kind, app URL, status, the **persisted narration transcript**, and the raw manifest.
- **`KnowledgeItem`** — the normalized, indexed unit of knowledge. In Phase 1 these are **step items** (one per captured interaction), each with searchable text, the captured event (ground truth), and the aligned narration.

### 4.3 How a recording becomes knowledge (the worker)
When a bundle is uploaded, an async worker:
1. **Transcribes** the narration (OpenAI `whisper-1`, with timestamps) and **persists the transcript**.
2. **Normalizes** each interaction into a `KnowledgeItem`, **aligning the narration** spoken around that moment to the event.
3. **Segments** the recording into **candidate workflows** (using markers → route changes → narration cues → LLM topic segmentation) and **tags** each item with the workflow it belongs to (a title like *"How to create a project"*).
4. Sets the source status to **`ready`**.

> **Important (curated model):** the worker **stops at `ready` — it does not auto-create articles.** Segmentation produces *candidate titles*; you choose which become articles (see §5).

### 4.4 The KB browser (in Studio)
Studio mirrors the three modules — **Recordings → Knowledge Base → Articles**. Opening a recording shows its **KB page**:
- the **narration transcript**,
- the extracted **knowledge items grouped by workflow** (read-only — editing happens at the article level),
- the **articles produced** from that recording,
- and the **per-recording generate picker** (§5.1).

### 4.5 Retrieval / index
Knowledge items are indexed by their text for **keyword/LLM retrieval**, which powers prompt-to-article (§5.2). This is workspace-wide (across all recordings).

> 🔜 **Phase 1b / later:** semantic (vector / pgvector) search; a workspace-wide KB **search UI**.

### 4.6 Why the KB is kept "raw" (design note)
The KB stores fine-grained items, not pre-baked articles. Segmentation is a **persisted lens** (candidate titles), not a rigid structure. This keeps the substrate flexible: the same items can be assembled differently by curated generation, by prompt-to-article (which can cross workflow boundaries), and — later — by the copilot.

---

## 5. Module 3 — Article creation

**Job:** produce human-facing **Articles** by reading the KB. **Articles are curated outputs — not the KB itself.** Both Phase 1 paths obey **grounded authorship** (§1).

### 5.1 Curated auto-generation ("Auto Generate Articles")
Articles are **not pushed automatically**. Instead:
1. **Propose (instant, no LLM):** Studio lists the **candidate workflow titles** the KB already produced (from segmentation), each with a checkbox. A candidate that already has an article shows **"✓ generated."**
2. **Select:** you check the workflows worth an article.
3. **Generate:** Sync synthesizes **only the selected** workflows into **draft articles** (multimodal: narration + events + screenshots), grounded strictly in the recording.

**Two entry points:**
- **Per-recording** — on a recording's KB page, generate from that recording's candidates.
- **Workspace-wide "opportunities"** — on the dashboard, a list of **un-generated** candidates across **all** recordings, so you can spot opportunities to create more helpful articles.

### 5.2 Prompt-to-article ("Text → Article")
Type a topic; Sync assembles a grounded article from the **whole-workspace KB** (across recordings):
1. **Retrieve** the relevant knowledge items (keyword shortlist over the KB).
2. **Synthesize or decline:** the AI selects/orders the relevant steps into one article — or, if the recordings don't genuinely cover the topic, **declines**.
3. **Coverage gap:** a decline is logged as a **coverage gap** ("record this next") shown on the dashboard, where you can dismiss it.

Prompt-grounded articles can **span multiple recordings**; their screenshots are resolved back to whichever recording each step came from.

### 5.3 The structured Article model
Articles are stored as **structured data, not markdown blobs** — this is what makes the portal (and later the copilot and self-validation) possible.

```
Article { title, intent, tags[], routes[], preconditions[],
          source, type, status, steps[] }

Step { instruction,            // human action ("Click …")
       rationale,              // the "why", from narration
       screenshot + highlight, // image + element rectangle (viewport fractions)
       selector, route,        // robust, multi-signal — for future validation
       expectedOutcome,        // what should be true after the step
       uncertain }             // flagged when the capture didn't fully support it
```

- **`type`** = shape/self-validatability: **`workflow_backed`** (steps) vs **`static`** (prose).
- **`source`** = origin: **`recording_auto`** (curated), **`prompt_grounded`** (Text→Article), **`manual`** (human-written), `import`.
- **`status`** = **`draft`** | **`published`**.

> 🔜 **Phase 1b / V2:**
> - **Manual `static` authoring** (hand-write pricing/policy/FAQ articles) — the data model supports `source=manual`/`type=static`, but there's no authoring UI yet.
> - **Narration-derived `static`** articles (e.g. "What is the refund policy?") require **narration-only capture**, which is **Version 2**.

---

## 6. Studio (Dashboard + Editor)

**Job:** review, curate, edit, organize, and publish.

### 6.1 Accounts & connection
- **Sign up / sign in** with email + password (self-hosted auth, JWT sessions). Sign-up auto-creates your workspace.
- **API token / Connect:** generate a workspace token (or, preferably, use the extension's one-click **Connect** flow, §3.1).
- **Single-user = single-workspace** in Phase 1; full multi-tenant **isolation** is enforced (you only ever see your workspace's data).

### 6.2 Dashboard
One page with everything:
- **Recordings & Knowledge Base** — your recordings with status (`uploaded → processing → ready`); click through to the KB page.
- **Auto Generate Articles — opportunities** — un-generated workflow candidates across the workspace, with generate (§5.1).
- **Text → Article** — the prompt box + the **coverage-gaps** list (§5.2).
- **Articles** — all articles with status and step counts; click to edit.

### 6.3 Article editor
Open any article to:
- edit the **title**, **instruction**, and **rationale** of each step,
- **reorder** steps (↑/↓) and **delete** steps,
- toggle **Publish / Unpublish**,
- see each step's **screenshot with the element highlight** rendered over it, plus selector, route, and expected outcome.

### 6.4 Screenshots & element highlights
Each step's screenshot shows a **rectangle around the element** that was clicked/typed. It's computed from the captured bounding box as **viewport fractions (0–1)** and drawn as a CSS-positioned box — resolution-independent, no image processing. Screenshots are served via **short-lived signed URLs** from object storage.

> 🔜 **Phase 1b:** screenshot retake/crop, callouts/warnings, brand voice/tone, related-article links, an arrow-pointer highlight, collections/tags/versioning UI.

---

## 7. Help Portal (public)

**Job:** let the builder's customers browse and read help.

- A **public, per-workspace** site at a workspace slug (e.g. `…/your-workspace`).
- **Only published articles are visible** (drafts and the raw KB are never exposed).
- Each article renders **server-side**: title, intent, **preconditions** ("before you start"), and an ordered list of **steps with screenshots + element highlights**, plus each step's rationale and expected outcome.
- A workspace **home page** lists the published articles; each links to its article page.

> 🔜 **Phase 1b:** hybrid search, theming/branding, custom domains, public/gated visibility, SEO/structured data, "was this helpful?" feedback, i18n.

---

## 8. Cross-cutting (how it all holds together)

### 8.1 Auth & multi-tenancy
- Self-hosted auth (email+password, JWT). Each user owns one workspace; all data is **workspace-scoped**.
- The extension authenticates to the API with a **hashed workspace token** (only the SHA-256 hash is stored; the plaintext is shown once / delivered via Connect).

### 8.2 Data model (summary)
`Workspace` → `ApiToken`, `KnowledgeSource` (recordings), `Article`, `CoverageGap`.
`KnowledgeSource` → `KnowledgeItem[]` (the KB) + `Article[]`.
`Article` → `Step[]`. Articles link back to their source recording (or to no source, for prompt-grounded).

### 8.3 Object storage
Screenshots, audio, and DOM snapshots live in **S3-compatible object storage** (MinIO locally, Cloudflare R2 in production), under a `workspaces/<ws>/sessions/<id>/…` layout. Studio and the portal render them via **signed URLs**.

### 8.4 Asynchronous processing
Uploads are **enqueued** (Redis + BullMQ) and handled by a **background worker** (transcribe → KB → segment → `ready`). Studio reflects status by refetching. **Article generation runs synchronously** in Studio when you click generate (per the curated model).

### 8.5 Tech stack & run model
- **Monorepo** (pnpm + Turborepo): `shared`, `db` (Prisma/Postgres), `synthesis` (OpenAI pipeline), `api` (Fastify + worker), `web` (Studio, Next.js), `portal` (Next.js), `extension` (MV3).
- **AI:** OpenAI `whisper-1` (transcription) + `gpt-4o` (segmentation & multimodal synthesis, Structured Outputs).
- Runs locally via **docker-compose** (Postgres + Redis + MinIO) — see [`dev-setup.md`](dev-setup.md).

---

## 9. Scope boundaries — what is *not* in Phase 1

### Explicitly later phases
- **In-app Copilot** (answers customers from **approved-KB**) — **now Phase 1, the headline product** (was tagged "Phase 2, from published articles" pre-pivot).
- **Self-validation / drift detection** (replays workflows in a sandbox, flags stale docs) — **Phase 3**. *(Phase 1 deliberately captures robust selectors/routes/expected-outcomes so this is possible later.)*

### Version 2 (capture modalities)
- **Narration-only capture** (audio-only, for policies/FAQs with no clickable workflow) and the **narration-derived `static` explainer** path.
- **Video capture.**
- *(Phase 1 capture is **workflow-only**.)*

### Planned for Phase 1b (within Phase 1's wedge)
> **Now sequenced (beta-blocking first) as milestones M9–M14 in [phase-1b-plan.md](phase-1b-plan.md).**

Productized PII redaction · hybrid/semantic (vector) search + a KB search UI · brand voice/theming · screenshot retake/crop · arrow-pointer highlight · coverage-gap **analytics dashboards** · custom domains / gated portals · multi-seat/roles · manual `static` authoring UI · iframe & multi-tab capture · "was this helpful?" feedback loop.

### Operational
- **Cloud deployment (Render + R2) is M8 — not yet done.** Phase 1 currently runs locally via docker-compose. *(On deploy: add the production Studio origin to the extension manifest and set `STUDIO_URL` / `SYNC_API_URL`.)*

---

## 10. End-to-end journey (putting it together)

1. **Sign up** at Studio → your workspace is created.
2. **Install** the Sync Recorder, click **Connect** → one click links it to your account.
3. **Record:** open your product, hit **Start**, narrate while you click through a workflow (use **Mark new workflow** between tasks), then **Stop** — the recorder shows **REC → ↑ → ✓** and uploads the bundle.
4. **Knowledge Base:** the worker transcribes, normalizes, and **segments** the recording into workflow candidates; the recording turns **`ready`** in Studio. Browse the KB page to see the transcript + items grouped by workflow.
5. **Curate:** on the dashboard, **Auto Generate Articles** lists your workflow titles → check the useful ones → **Generate** → draft articles appear. (Or use **Text → Article** for a specific topic; uncovered topics become **coverage gaps**.)
6. **Edit & publish:** open a draft, refine the steps, reorder/trim, then **Publish**.
7. **Customers self-serve:** the published article is live on your **Help Portal** with screenshots and highlighted elements.
8. **The loop compounds:** coverage gaps and more recordings keep growing the same workspace KB — which (in later phases) powers the copilot and self-validation.

---

*This document describes the delivered Phase 1 product (M0–M7). For deeper context: [`PRD.md`](PRD.md) (strategy), [`architecture.md`](architecture.md) (technical model), [`phase-1-spec.md`](phase-1-spec.md) (acceptance criteria), [`phase-1a-plan.md`](phase-1a-plan.md) (milestones).*
