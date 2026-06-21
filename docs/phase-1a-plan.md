# Sync — Phase 1a Plan (Thin Slice)

> **Goal of the slice:** prove the *real* product architecture end-to-end on **one path** — record → async synthesis → edit → publish → public portal — with real accounts, multi-tenancy, database, object storage, and a background worker. Feature breadth comes in Phase 1b.

- **Status:** Draft v0.1
- **Last updated:** 2026-06-18
- **Precedes/zooms into:** [phase-1-spec.md](phase-1-spec.md). Builds on the validated [spike](SPIKE.md) (verdict: GO).
- **Decisions locked:** port-into-fresh • monorepo (pnpm + Turborepo) • Node/TS + Next.js • Postgres • Redis/BullMQ • **Auth.js (self-hosted)** • **Render** (compute + Postgres + Redis) + **Cloudflare R2** (blobs) • single-user = single-workspace.
- **Architecture (frozen 2026-06-19):** 3-module model — **Capture → Knowledge Base → Article creation** ([`architecture.md`](architecture.md)). **Course-correction:** introduce the explicit **KB layer** (`KnowledgeSource` + `KnowledgeItem` + persisted transcript + keyword/LLM index); the worker does **capture → KB**, and article creation (curated auto + prompt) reads the KB. **Prompt-to-article (3.2)** is **in 1a**.
- **Version scope (locked 2026-06-21):** **Version 1 = Phases 1–3, capture is workflow-only (1.1).** **Narration-only capture (1.2) and video capture (1.3) are deferred to Version 2** (see [`architecture.md`](architecture.md) → Product versions). Article generation is **curated, not auto-pushed** (M6.1). The **copilot grounds on PUBLISHED articles, not the raw KB.**

---

## 1. Scope

**In the slice:** accounts + one workspace (multi-tenant isolation), ported Recorder uploading to the real API with a workspace token, ingestion → R2 + Postgres → **enqueue**, **async worker** that builds the **Knowledge Base** (Module 2), **curated** article generation (Module 3.1 — propose titles → select → generate), minimal Studio (list/view/edit-text/reorder/delete/publish), basic public Help Portal, **element-highlight rectangles** on step screenshots. **Added 2026-06-19:** the explicit **KB layer** and **prompt-to-article** (3.2).

**Deferred to Version 2:** **narration-only capture (1.2)** and **video capture (1.3)** — V1 capture is **workflow-only (1.1)**.

**Deferred to 1b:** productized redaction, hybrid/semantic search (vector DB), brand voice/theming, screenshot retake/crop, highlight **arrow** pointer, coverage-gap analytics dashboards, custom domains/gated portals, multi-seat/roles.

---

## 2. Monorepo layout

Lives in the existing repo root alongside `docs/` and `spike/` (kept as reference to port from).

```
sync/
  pnpm-workspace.yaml        # workspaces: packages/*
  turbo.json                 # build/dev pipeline
  render.yaml                # the ONLY Render-specific file (deploy manifest)
  docker-compose.yml         # local dev: Postgres + Redis + the services
  packages/
    shared/                  # types + zod schemas: content model, capture contract, job payloads
    db/                      # Prisma schema + client + repositories (used by api, worker, web, portal)
    synthesis/               # PORTED pipeline: transcribe → segment → synthesize (pure; artifact accessor injected)
    extension/               # PORTED Recorder (MV3); repointed to the real API + token auth
    api/        + Dockerfile # Fastify server (ingestion + status) + worker entrypoint (BullMQ consumer)
    web/        + Dockerfile # Next.js Studio (Auth.js, dashboard, editor)
    portal/     + Dockerfile # Next.js public help site
```

**Tooling:** pnpm workspaces + Turborepo. `shared` and `db` are the cross-cutting packages everything imports.

**Data-access style (pragmatic for the slice):** `api` owns the *ingestion* path (extension upload, enqueue, status). `web` and `portal` are Next.js apps that read/write via the shared `db` package server-side (server actions / route handlers) — no extra HTTP hop for Studio edits. The extension can't use browser sessions, so it always goes through `api` with a token. *(If we later want strict separation, web/portal move behind `api`.)*

---

## 3. Data model (Postgres / Prisma)

```prisma
// Auth.js core tables (User, Account, Session, VerificationToken) via @auth/prisma-adapter — omitted here.

model Workspace {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique            // -> portal subdomain (yourco.synchelp.app)
  ownerId   String                       // User.id
  createdAt DateTime @default(now())
  tokens    ApiToken[]
  sessions  RecSession[]
  articles  Article[]
}

model ApiToken {                          // extension auth (Bearer)
  id          String   @id @default(cuid())
  workspaceId String
  hashedToken String   @unique
  label       String?
  createdAt   DateTime @default(now())
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
}

model RecSession {                        // a recording session (capture bundle)
  id          String   @id @default(cuid())
  workspaceId String
  createdById String
  status      String   @default("uploaded") // uploaded | processing | done | error
  appBaseUrl  String?
  manifest    Json                          // raw capture manifest (events, markers, meta) — for synth + future reprocess/validation
  error       String?
  createdAt   DateTime @default(now())
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  articles    Article[]
}

model Article {
  id            String  @id @default(cuid())
  workspaceId   String
  sessionId     String?
  title         String
  intent        String?
  tags          String[]
  routes        String[]
  preconditions String[]
  source        String  @default("recording_auto") // recording_auto | prompt_grounded | manual
  type          String  @default("workflow_backed") // workflow_backed | static
  status        String  @default("draft")           // draft | published
  orderIndex    Int     @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  steps         Step[]
  workspace     Workspace  @relation(fields: [workspaceId], references: [id])
  session       RecSession? @relation(fields: [sessionId], references: [id])
}

model Step {
  id              String  @id @default(cuid())
  articleId       String
  orderIndex      Int
  instruction     String
  rationale       String?
  screenshotKey   String?   // R2 object key (resolved to a signed/public URL at render time)
  selector        String?
  route           String?
  expectedOutcome String?
  uncertain       Boolean  @default(false)
  highlight       Json?     // element bbox as viewport fractions {x,y,w,h} (0..1) — the highlight rectangle
  article         Article  @relation(fields: [articleId], references: [id], onDelete: Cascade)
}
```

**Element highlight (enhancement, shipped in 1a):** each step's screenshot shows a rectangle around the element that was clicked/typed. The worker computes `Step.highlight` from `event.target.bbox / manifest.app.viewport` (already captured); Studio and the portal overlay a CSS `%`-positioned box (`.shot-frame` + `.hl`) — resolution-independent, no image processing. (An arrow pointer is a possible future add.)

**Knowledge Base layer (Module 2 — implemented in M6, 2026-06-21).** `RecSession` → **`KnowledgeSource`** (via `@@map`; + `kind: workflow|narration|video`, + persisted `transcript`) and a new **`KnowledgeItem`** (the normalized, indexed unit — `step` or `topic` — searchable `text` + keyword/LLM index). The worker now does **capture → KB**, and article creation reads the KB. Full schema in [`architecture.md`](architecture.md).

**Segmentation + curated generation (Option C, finalized in M6.1, 2026-06-21).** Segmentation now runs at **KB build** (the worker calls `segmentItems` after extracting items) and its output is **persisted** on `KnowledgeItem` (`segmentIndex`/`segmentTitle`) — these become the candidate titles. The worker **stops at `status = ready`** (no articles). Article generation is **curated**: Studio lists candidates → user selects → a synchronous server action synthesizes only the selected, writing an `Article` linked by **`Article.segmentIndex`/`segmentTitle`** (the "generated" marker). (Full Option A — first-class Workflow entities — remains future, needed only for the copilot / supersession.)

**R2 object layout:** `workspaces/<wsId>/sessions/<sessionId>/{shots/<eventId>.png, dom/<eventId>.html, audio.webm}`. Screenshots referenced from `Step.screenshotKey`. Served via **server-generated signed URLs** (Studio) / a public-read path for published portal content *(final choice in §8 risks)*.

---

## 4. API surface (`api` service, Fastify)

Minimal — ingestion + status only (human CRUD lives in `web`).

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /v1/sessions` | workspace token | multipart bundle upload → write artifacts to R2 + `RecSession` (status=uploaded) → **enqueue** `{sessionId}` → return `{sessionId}` |
| `GET /v1/sessions/:id` | token | status polling for the extension |
| `GET /healthz` | — | health |

Bundle upload reuses the spike's **field-name-as-path** trick (multipart strips directory names): each file's relative path rides on the form field name; the server streams it to R2 at that key.

---

## 5. Queue + worker

- **Redis** (Render Key Value) + **BullMQ**, queue `synthesis`.
- `api` enqueues `{ sessionId }` after a successful upload.
- **Worker** (the `api` package's worker entrypoint, deployed as a Render Background Worker):
  1. Load `RecSession.manifest` + pull artifacts from R2.
  2. Run the **ported synthesis** pkg: transcribe (audio from R2) → align → segment → multimodal synthesize (screenshots from R2).
  3. Write `Article` + `Step` rows; set `RecSession.status = done` (or `error` with message).
- Studio reflects status by refetching; concurrency low (1–2) with retries.

> **Update (2026-06-19; revised 2026-06-21):** the worker is **split** — (a) **capture → KB extraction** (transcribe + persist transcript + normalize into `KnowledgeSource`/`KnowledgeItem` + **segment + tag** + index), then it **stops** at status `ready` (**no articles**). Article generation (b) is now a **curated, user-triggered** Studio action (M6.1 — propose titles → select → generate), not an auto worker step. **Prompt-to-article (3.2)** is a second Module-3 path (synchronous in Studio for v1; movable to the queue later). *(Narration-only captures (1.2) → `static` explainer articles = **Version 2**.)* See [`architecture.md`](architecture.md).

---

## 6. What's ported vs. built new

| Ported from `spike/` (port + harden) | Built new |
|---|---|
| **Extension capture engine** → `packages/extension` (repoint upload to `api`; add `Authorization: Bearer <token>`; keep the field-name upload fix) | `packages/db` (Prisma), `packages/api` (auth, R2, queue), worker entrypoint |
| **Synthesis pipeline + prompts** → `packages/synthesis` (refactor file reads behind an **artifact-accessor interface** so it reads from R2 instead of local fs) | `packages/web` (Studio + Auth.js), `packages/portal` |
| **Capture contract + content types** → `packages/shared` | `render.yaml`, R2 wiring |

**Key migration note:** the spike's synthesis reads files via local `bundleFilePath`. Refactor each stage to take an injected `getArtifact(key) → Buffer/stream` so the same code works against R2 (worker) and could work locally (tests). Transcription streams the audio object to OpenAI; synthesis fetches screenshots as base64 for the multimodal call.

---

## 7. Deploy: `render.yaml` + secrets

Services (all from the monorepo; **each built from its package `Dockerfile`**):

| Render service | Type | Start |
|---|---|---|
| `sync-api` | Web Service | run `api` server |
| `sync-worker` | Background Worker | run `api` worker entrypoint |
| `sync-web` | Web Service | Next.js Studio |
| `sync-portal` | Web Service | Next.js portal |
| `sync-db` | Postgres | — |
| `sync-redis` | Key Value (Redis) | — |

**Env / secrets:**
- DB/queue: `DATABASE_URL`, `REDIS_URL` (Render injects from linked services).
- R2: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`.
- LLM (worker): `OPENAI_API_KEY`, `TRANSCRIBE_MODEL`, `SYNTH_MODEL`.
- Auth (web): `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.
- Extension: configured with the `api` base URL + a **workspace API token** (generated in Studio, pasted into the popup) — no OAuth in the extension for the slice.

Dev uses free tiers (note: free web services spin down; free Postgres expires ~90 days). Flip `sync-api`/`sync-portal` to paid before launch.

### Portability (no lock-in)

The app is host-agnostic; **`render.yaml` is the only Render-specific file.** Guarantees we follow:
- **A `Dockerfile` per deployable service** (`api` serves both the HTTP server and the worker via different commands) → runs unchanged on any container host (Railway, Fly, Cloud Run, ECS, a VPS).
- **All infra access via env vars** (`DATABASE_URL`, `REDIS_URL`, `R2_*`, `OPENAI_API_KEY`) — nothing Render-hardcoded.
- **R2 via the standard AWS S3 SDK** → swappable to S3/B2/any S3-compatible store.
- **No Render-proprietary features** — no Render Disks (we use R2); later (Phase 3) scheduling will be **in-app** (a BullMQ repeatable job), not Render Cron.
- **`docker-compose.yml`** runs the whole stack locally (Postgres + Redis + services), matching prod.

Migrating off Render = provision Postgres/Redis elsewhere, set the same env vars, replace `render.yaml` with that platform's manifest. **No app-code changes.**

---

## 8. Risks / details to finalize during build

- **Screenshot serving:** signed URLs (server-generated, short-lived) vs. a public-read R2 bucket for published content. Lean: signed URLs for Studio; decide public-vs-signed for the portal during M5.
- **Synthesis R2 refactor:** the artifact-accessor change is the main porting effort — do it first (M3).
- **Next.js + Prisma on Render (monorepo):** ensure `prisma generate` runs in build; pnpm + turbo filters per service.
- **Extension hardening (from spike findings):** single-tab only, capture stops on full-page nav, in-memory buffer, minimal redaction — acceptable for the slice; track for 1b.
- **Auth.js in the slice:** credentials/email provider; create a Workspace + first ApiToken on signup.

---

## 9. Build milestones (the slice)

| # | Milestone | Done when |
|---|---|---|
| **M0** | Monorepo scaffold | pnpm + turbo + `shared` + `db` (Prisma schema, first migration) + per-service `Dockerfile`s + `docker-compose.yml` (Postgres/Redis) + `render.yaml` skeleton; stack builds & runs locally |
| **M1** | Auth + workspace | Sign up/in (Auth.js), workspace auto-created, generate an API token in Studio |
| **M2** | Ingestion | `api` upload (token) → artifacts in R2 + `RecSession` row + job enqueued; ported extension uploads successfully |
| **M3** | Worker + synthesis | synthesis ported to R2 accessor; worker turns a session into `Article`/`Step` rows; status → done |
| **M4** | Studio | list sessions/articles, view article (steps + screenshots), edit text + reorder/delete, publish toggle |
| **M5** | Portal | public subdomain renders published articles with screenshots |

**Definition of done for Phase 1a (thin slice):** a real user signs up → records with the extension → KB builds async in the worker → user curates + generates articles → edits and publishes in Studio → the article is live on the public portal, running on Render + R2. ✅ **M0–M5 done.** The KB layer, curated authoring, prompt-to-article, and deploy follow as **M6–M8** (§10).

---

## 10. KB layer, curated authoring & deploy (M6–M8)

Implements the [frozen architecture](architecture.md): the explicit **Module 2 KB**, **curated article generation** (3.1, M6.1), **prompt-to-article** (3.2, M7), then **Render deploy** (M8). **M6 is the foundation; M6.1 and M7 build on it; M8 (deploy) runs once the slice is feature-complete** (it can also be pulled earlier if you want the thin slice live sooner).

**Build sequence (V1, locked 2026-06-21):** **M6** (KB layer ✅) → **M6.1** (curated generation ✅) → **M7** (prompt-to-article — *next*) → **M8** (Render deploy). **Narration-only capture is removed from V1 → see "Version 2 backlog" at the end of this section.**

### M6 — Knowledge Base layer (the foundational refactor)
The big one: introduce Module 2 and route article creation through it.
- **Schema:** evolve `RecSession` → **`KnowledgeSource`** (+ `kind: workflow|narration|video`, persisted **`transcript`**, `status … ready`); add **`KnowledgeItem`** (`step` items now; searchable `text`). Migration + update api/worker/web/portal references.
- **Worker → two stages:** **(A) capture → KB** — transcribe (persist transcript), normalize events into `KnowledgeItem`s; **(B) KB → articles** — auto-create reads *items* (not the raw manifest), **segments at creation (Option B)**, writes `Article`/`Step`. *(Note: stage (B) was **superseded by M6.1** — segmentation moved to KB build and auto-creation was replaced by curated generation.)*
- **Regression guard:** existing auto output must stay equivalent.
- **KB browser (Studio):** a read-only **"Knowledge Base"** section — open a recording → transcript + items **grouped by workflow** + the articles it produced (Studio mirrors the 3 modules: Recordings → Knowledge Base → Articles). Workspace-wide *search* arrives with M7's index.
- **Persisted segmentation (promoted toward C, 2026-06-21):** the segmentation computed at article creation is stored on `KnowledgeItem` (`segmentIndex`/`segmentTitle`) so the KB view groups by workflow.
- **Done when:** re-processing the Chatful session produces a `KnowledgeSource` + `KnowledgeItem`s + persisted transcript, the **same auto articles** (now from the KB), and the Studio KB view shows items grouped by workflow. ✅ **DONE 2026-06-21.**

### M6.1 — Curated article generation (correction to M6 auto-gen) ✅ DONE 2026-06-21
**Change (decided 2026-06-21):** articles are **no longer auto-generated**. Generation becomes a **two-phase, user-curated** action — propose candidate titles (free — from the segment titles **Option C already persists**) → user selects → generate **only the selected**. **Stays on Option C** (no `Workflow` table / Option A — the titles already live in the KB as segment tags; A's only extra is stable workflow IDs, not needed until the copilot / supersession).

- **Worker (behavior change):** `capture → KB → segment + tag items` (`segmentIndex`/`segmentTitle`) → **status `ready`**. **No synthesis, no articles.** (Supersedes M6's auto-synthesis step; the segmentation/tagging stays.)
- **Schema:** `Article.segmentIndex` + `segmentTitle` (links an article to the candidate it came from → "generated" state + avoids duplicates); `KnowledgeSource.status` gains **`ready`** (KB built, candidates available, no articles yet).
- **Studio — "Auto Generate Articles" (TWO entry points, resolved 2026-06-21 — user wants both):**
  - **Propose (instant, no LLM):** the picker **lists** candidate titles — it does **not** generate them. Titles already exist: they are the `segmentTitle`s produced at **KB build** (step 2) and persisted by Option C. A candidate is "un-generated" when **no `Article` is linked to its `(sourceId, segmentIndex)`**. Each row has a **checkbox**.
    - **(a) Per-recording** — on the recording's KB page (`/dashboard/kb/[id]`): list that recording's candidate titles (generated ones shown as "✓ generated" → link; un-generated ones checkable).
    - **(b) Workspace-wide "opportunities"** — in the Articles section: list **un-generated** candidates across **all `ready` recordings** (grouped by recording) so the founder spots opportunities to create more helpful articles.
  - **Generate selected:** a **synchronous server action** synthesizes each checked segment (synthesis over that segment's items, screenshots via an S3 read helper) → creates a draft `Article` (`source=recording_auto`, linked by `sourceId` + `segmentIndex`/`segmentTitle`). Consistent with M7's prompt-to-article.
- **Web setup (shared with M7):** `OPENAI_API_KEY` + `@sync/synthesis` dep + an S3 `getObject` `ArtifactReader` helper.
- **Resolved sub-decisions (2026-06-21):** candidate scope = **BOTH** per-recording (on KB page) **and** workspace-wide opportunities (Articles section); generate = **synchronous** server action.
- **Deferred (separate discussion):** supersession / re-recording the same workflow (update-vs-create an existing article).
- **Done when:** uploading a recording yields a **`ready` KB with no articles**; "Auto Generate Articles" lists candidate titles; checking a subset + generate creates **only those** articles.
- **✅ DONE 2026-06-21 — as built & verified:** schema migration `20260621081225_article_segment_link` (additive: `Article.segmentIndex`/`segmentTitle` + `@@index([sessionId, segmentIndex])`, `status` adds `ready`). `@sync/synthesis` split into `segmentItems()` (KB-build segmentation, no synth) + `generateArticleForSegment()` (synth ONE candidate). Worker stops at `ready` (segment+tag, idempotent reset; no synthesis). Web: `lib/candidates.ts` (`listCandidates`), `lib/generate-actions.ts` (`'use server' generateArticles` — synchronous, skips already-generated), `lib/storage.ts` `artifactReader`, client `app/dashboard/generate-panel.tsx`; both entry points wired (KB page + dashboard opportunities); web gets `OPENAI_API_KEY`+`SYNTH_MODEL`, `transpilePackages` += `@sync/synthesis`, `.pill-ready` style. **Verified end-to-end:** reprocessed Chatful via the real worker → `ready` + 16 tagged items + **0 articles**; generation → draft "How to Create a New Project in Chatful AI" (`segmentIndex=0`, 9 steps w/ screenshots+highlights); candidate then reads "✓ generated". 7/7 typecheck + web `next build` clean. **Uncommitted.**

### M7 — Prompt-to-article (Module 3.2)
- **Index/retrieval:** keyword/LLM over `KnowledgeItem.text`, **workspace-scoped** (across all recordings).
- **`promptToArticle()`** in `@sync/synthesis`: retrieve relevant items → synthesize grounded article (`source = prompt_grounded`); below confidence threshold → **decline**.
- **`CoverageGap`** table (declines = "record this next").
- **Studio:** "Generate from a prompt" box (synchronous server action, per the locked decision) + a coverage-gaps list.
- **Done when:** a covered topic produces a grounded draft article; an uncovered topic declines + logs a coverage gap.

### M8 — Render deployment
- Per-service **Dockerfiles** (api, worker, web, portal) + a **`render.yaml`** blueprint (api web service + background worker + web + portal + managed Postgres + Redis).
- Wire **Cloudflare R2** (prod bucket + credentials) for blobs; set env/secrets in Render. Needs Cloudflare + Render accounts (GitHub repo is already set up).
- **Done when:** all services run on Render via `render.yaml` (Docker images); a full end-to-end smoke test passes in the cloud (record → KB → curated article → edit/publish → portal).

---

### Version 2 backlog (deferred out of V1 — 2026-06-21)

> Capture in **V1 is workflow-only**. The following are **Version 2** (see [`architecture.md`](architecture.md) → Product versions). The KB layer was deliberately built modality-agnostic (`KnowledgeSource.kind`, `KnowledgeItem.kind = step|topic`) so these slot in additively.

**V2.1 — Narration-only capture (Module 1.2) + explainer articles**
- **Extension:** an **audio-only record mode** (no interactions); upload with `kind = narration` (api/worker **accept zero-event sessions**).
- **Worker:** narration KB extraction → `topic` items; curated generation → a **`static` explainer article** (prose, grounded in the transcript).
- **Schema:** add **`Article.body`** (markdown) for prose/static articles.
- **Studio + portal:** render `body` for `static` articles (steps for `workflow_backed`).
- **Done when:** a narration recording (e.g. the refund policy) becomes an editable, publishable `static` article on the portal.

**V2.2 — Video + audio capture (Module 1.3).** A future capture modality; out of scope for now.

> **Cadence:** built one milestone at a time, each verified, with a stop for review (per the working agreement). **M6's regression guard** is the key risk — we don't advance until articles still come out right *through the KB*.
