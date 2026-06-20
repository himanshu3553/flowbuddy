# Sync — Phase 1a Plan (Thin Slice)

> **Goal of the slice:** prove the *real* product architecture end-to-end on **one path** — record → async synthesis → edit → publish → public portal — with real accounts, multi-tenancy, database, object storage, and a background worker. Feature breadth comes in Phase 1b.

- **Status:** Draft v0.1
- **Last updated:** 2026-06-18
- **Precedes/zooms into:** [phase-1-spec.md](phase-1-spec.md). Builds on the validated [spike](SPIKE.md) (verdict: GO).
- **Decisions locked:** port-into-fresh • monorepo (pnpm + Turborepo) • Node/TS + Next.js • Postgres • Redis/BullMQ • **Auth.js (self-hosted)** • **Render** (compute + Postgres + Redis) + **Cloudflare R2** (blobs) • single-user = single-workspace.
- **Architecture (frozen 2026-06-19):** 3-module model — **Capture → Knowledge Base → Article creation** ([`architecture.md`](architecture.md)). **Course-correction:** introduce the explicit **KB layer** (`KnowledgeSource` + `KnowledgeItem` + persisted transcript + keyword/LLM index); the worker does **capture → KB**, and article creation (auto + prompt) reads the KB. **Prompt-to-article (3.2)** and **narration-only capture (1.2)** are now **in 1a**.

---

## 1. Scope

**In the slice:** accounts + one workspace (multi-tenant isolation), ported Recorder uploading to the real API with a workspace token, ingestion → R2 + Postgres → **enqueue**, **async worker** that builds the **Knowledge Base** (Module 2) and creates articles (Module 3), minimal Studio (list/view/edit-text/reorder/delete/publish), basic public Help Portal, **element-highlight rectangles** on step screenshots. **Added 2026-06-19:** the explicit **KB layer**, **prompt-to-article** (3.2), and **narration-only capture** (1.2).

**Deferred to 1b:** productized redaction, hybrid/semantic search (vector DB), brand voice/theming, screenshot retake/crop, highlight **arrow** pointer, coverage-gap analytics dashboards, custom domains/gated portals, multi-seat/roles, **video capture (1.3)**.

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

**Knowledge Base layer (Module 2 — being introduced, 2026-06-19).** The current `RecSession` evolves into **`KnowledgeSource`** (+ `kind: workflow|narration|video`, + persisted `transcript`, + `status: …|ready`); we add **`KnowledgeItem`** (the normalized, indexed unit — `step` or `topic` — with a searchable `text` field + keyword/LLM index). The worker changes from *capture → Article* to **capture → KB**, and **article creation (auto + prompt) reads the KB**. Full schema in [`architecture.md`](architecture.md). **Decided (2026-06-21): Option B** — workflow *segmentation* runs at **article creation (Module 3.1)**; the KB stores **flat ordered items** (boundary signals are inline). Options A/C are documented future promotion paths.

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

> **Update (2026-06-19):** the worker is being **split** — (a) **capture → KB extraction** (transcribe + persist transcript + normalize into `KnowledgeSource`/`KnowledgeItem` + index), then (b) **KB → articles** (auto). **Prompt-to-article (3.2)** is a second Module-3 path (synchronous in Studio for v1; movable to the queue later). Narration-only captures (1.2) flow through the same KB → article path producing `static` explainer articles. See [`architecture.md`](architecture.md).

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

**Definition of done for Phase 1a (thin slice):** a real user signs up → records with the extension → synthesis runs async in the worker → edits and publishes in Studio → the article is live on the public portal, running on Render + R2. ✅ **M0–M5 done.** The KB layer, advanced authoring, and deploy follow as **M6–M9** (§10).

---

## 10. KB layer, advanced authoring & deploy (M6–M9)

Implements the [frozen architecture](architecture.md): the explicit **Module 2 KB**, **prompt-to-article** (3.2), **narration-only capture** (1.2), then **Render deploy**. **M6 is the foundation; M7 and M8 depend on it (independent of each other); M9 (deploy) runs once the slice is feature-complete** (it can also be pulled earlier if you want the thin slice live sooner).

### M6 — Knowledge Base layer (the foundational refactor)
The big one: introduce Module 2 and route article creation through it.
- **Schema:** evolve `RecSession` → **`KnowledgeSource`** (+ `kind: workflow|narration|video`, persisted **`transcript`**, `status … ready`); add **`KnowledgeItem`** (`step` items now; searchable `text`). Migration + update api/worker/web/portal references.
- **Worker → two stages:** **(A) capture → KB** — transcribe (persist transcript), normalize events into `KnowledgeItem`s; **(B) KB → articles** — auto-create reads *items* (not the raw manifest), **segments at creation (Option B)**, writes `Article`/`Step` as today.
- **Regression guard:** existing auto output must stay equivalent.
- **Done when:** re-processing the Chatful session produces a `KnowledgeSource` + `KnowledgeItem`s + persisted transcript, and the **same auto articles**, now generated *from the KB*.

### M7 — Prompt-to-article (Module 3.2)
- **Index/retrieval:** keyword/LLM over `KnowledgeItem.text`, **workspace-scoped** (across all recordings).
- **`promptToArticle()`** in `@sync/synthesis`: retrieve relevant items → synthesize grounded article (`source = prompt_grounded`); below confidence threshold → **decline**.
- **`CoverageGap`** table (declines = "record this next").
- **Studio:** "Generate from a prompt" box (synchronous server action, per the locked decision) + a coverage-gaps list.
- **Done when:** a covered topic produces a grounded draft article; an uncovered topic declines + logs a coverage gap.

### M8 — Narration-only capture (Module 1.2) + explainer articles
- **Extension:** an **audio-only record mode** (no interactions); upload with `kind = narration` (api/worker **accept zero-event sessions**).
- **Worker:** narration KB extraction → `topic` items; article creation → a **`static` explainer article** (prose, grounded in the transcript).
- **Schema:** add **`Article.body`** (markdown) for prose/static articles.
- **Studio + portal:** render `body` for `static` articles (steps for `workflow_backed`).
- **Done when:** a narration recording (e.g. the refund policy) becomes an editable, publishable `static` article on the portal.

### M9 — Render deployment
- Per-service **Dockerfiles** (api, worker, web, portal) + a **`render.yaml`** blueprint (api web service + background worker + web + portal + managed Postgres + Redis).
- Wire **Cloudflare R2** (prod bucket + credentials) for blobs; set env/secrets in Render. Needs Cloudflare + Render accounts (GitHub repo is already set up).
- **Done when:** all services run on Render via `render.yaml` (Docker images); a full end-to-end smoke test passes in the cloud (record → KB → article → edit/publish → portal).

> **Cadence:** built one milestone at a time, each verified, with a stop for review (per the working agreement). **M6's regression guard** is the key risk — we don't advance until auto articles still come out right *through the KB*.
