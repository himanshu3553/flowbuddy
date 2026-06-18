# Sync — Phase 1a Plan (Thin Slice)

> **Goal of the slice:** prove the *real* product architecture end-to-end on **one path** — record → async synthesis → edit → publish → public portal — with real accounts, multi-tenancy, database, object storage, and a background worker. Feature breadth comes in Phase 1b.

- **Status:** Draft v0.1
- **Last updated:** 2026-06-18
- **Precedes/zooms into:** [phase-1-spec.md](phase-1-spec.md). Builds on the validated [spike](SPIKE.md) (verdict: GO).
- **Decisions locked:** port-into-fresh • monorepo (pnpm + Turborepo) • Node/TS + Next.js • Postgres • Redis/BullMQ • **Auth.js (self-hosted)** • **Render** (compute + Postgres + Redis) + **Cloudflare R2** (blobs) • single-user = single-workspace.

---

## 1. Scope

**In the slice:** accounts + one workspace (multi-tenant isolation), ported Recorder uploading to the real API with a workspace token, ingestion → R2 + Postgres → **enqueue**, **async synthesis worker** (ported pipeline), minimal Studio (list/view/edit-text/reorder/delete/publish), basic public Help Portal, **element-highlight rectangles on step screenshots** (enhancement — see §3).

**Deferred to 1b:** prompt-to-article, productized redaction, hybrid/semantic search, brand voice/theming, screenshot retake/crop, highlight **arrow** pointer, coverage-gap analytics, custom domains/gated portals, multi-seat/roles.

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
| **M6** | Deploy | all services live on Render via `render.yaml` (Docker images); end-to-end smoke test in the cloud |

**Definition of done for Phase 1a:** a real user signs up → records with the extension → synthesis runs async in the worker → edits and publishes in Studio → the article is live on the public portal, running on Render + R2.
