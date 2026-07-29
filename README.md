# FlowBuddy

> **An embeddable AI help copilot any SaaS can add in minutes.** Record your product once, approve the workflows the copilot may use, drop in one `<script>`, and your customers get in-app answers grounded **only** in what you approved — with citations and honest "I don't know yet" on gaps.

FlowBuddy is **copilot-first**. A help portal + articles are decoupled by-products of the same recordings; the in-app copilot is the headline product.

---

## What is FlowBuddy?

Most help tools make you write articles, then hope customers find them. FlowBuddy flips that around:

1. **Show** FlowBuddy how your product works — once, by recording yourself using it and narrating *what* you do and *why*.
2. FlowBuddy **learns** it and turns it into a structured **Knowledge Base**.
3. You **approve** which workflows the copilot may use — one click each.
4. Your customers get an **in-app assistant** that answers instantly — grounded in what you actually showed it, **never made-up**.

**What your customers experience:** a clean in-app chat that gives instant, accurate answers to "how do I…" questions based only on what you recorded and approved; **shows its sources**; is **honest when it doesn't know** (no confident-sounding wrong answers); **knows where they are** — the screen, and since Sense the **workflow + step** — and **remembers the conversation**.

**What you stay in control of:** approve before anything goes live; choose which sites may run the copilot (origin allowlist); a one-click public key you can rotate; and **sensitive data is masked in the browser before it ever leaves your machine** while recording.

**The trust model — grounded authorship + no-leak:** the Knowledge Base is the *substrate* the copilot reasons over; a lightweight per-workflow **"approve for copilot"** flag is the *trust gate*. The copilot answers **only** from approved knowledge — never raw/un-approved items, never general model knowledge — and declines + flags a coverage gap ("record this next") when something isn't covered.

*(Bonus: the same recordings can also produce step-by-step help **articles** and a public **help portal** — a decoupled Version-2 by-product: [`docs/build/portal.md`](docs/build/portal.md).)*

---

## How it works

Three modules, connected through one Knowledge Base; the copilot and the portal are **decoupled** consumers of it:

```
Module 1 — CAPTURE          Chrome extension records events + DOM + screenshots + narration
        │
        ▼
Module 2 — KNOWLEDGE BASE   worker → transcript + normalized, indexed KnowledgeItems + workflow segmentation
        │
        │   ── ONE KB → per-target approval/visibility ──
        │
        ├─► approved-for-copilot ──►  IN-APP COPILOT  (primary; grounded answer + citations, or honest decline)
        │
        └─► approved-for-portal ──► Help PORTAL   (approved workflows rendered as articles — Version 2)
```

**Four surfaces:**

| Surface | Who | Purpose |
|---|---|---|
| **FlowBuddy Recorder** (Chrome extension) | the builder | capture narrated product workflows |
| **Studio** (web app) | the builder | review the KB, **approve for the copilot**, configure + monitor it *(portal & article publishing land in Version 2)* |
| **In-App Copilot** (embeddable widget) ⭐ | the builder's customers | grounded, in-context answers inside the builder's product |
| **Help Portal** (public web) — *Version 2* | the builder's customers | browse + search approved workflows rendered as articles |

---

## Tech stack

- **Monorepo:** pnpm + Turborepo
- **Language:** TypeScript (Node 20+)
- **Studio:** Next.js 15 + Auth.js (self-hosted, email + password) · **Tailwind CSS + shadcn/ui** (indigo brand · Plus Jakarta Sans + JetBrains Mono — codified in [`docs/design_system/`](docs/design_system/README.md))
- **API / worker:** Fastify (HTTP) + BullMQ (background jobs)
- **Database:** Postgres (Prisma)
- **Queue / cache:** Redis
- **Object storage:** S3-compatible — MinIO locally, Cloudflare R2 in production
- **AI:** OpenAI — Whisper for transcription, a chat model for segmentation, distillation and the copilot answer engine, and `text-embedding-3-small` for hybrid retrieval. Exact model ids: `.env.example`.
- **Widget / extension:** esbuild bundles (both on the indigo design system; the widget's appearance — accent/title/greeting/launcher — is **live-served from Studio** via `GET /v1/copilot/config`, with `data-flowbuddy-*` attrs as per-page overrides)
- **Deploy target:** Render (Dockerized) + Cloudflare R2

---

## Repository layout

```
packages/
  shared/     # types + zod schemas (capture contract, content model, job contracts)
  db/         # Prisma schema + client (Postgres)
  logger/     # the ONE structured logger for Node services (Pino) — api / synthesis / web server-side
  synthesis/  # OpenAI pipeline — capture → KB synthesis + the copilot answer engine + the shared hybrid retrieval seam
  api/        # Fastify ingestion + copilot routes  AND  the BullMQ worker (worker entrypoint)
  web/        # Next.js Studio — copilot-first: approval gate + copilot settings/analytics
  widget/     # embeddable copilot <script> (esbuild → flowbuddy-copilot.js + lazy flowbuddy-copilot-render.js, deployed as siblings)
  extension/  # Chrome MV3 recorder
  landing/    # static marketing page for flowbuddyai.com (v1 = coming-soon + sign-in card)
```

*(`portal` — the public help site — is built in Version 2 ([`docs/build/portal.md`](docs/build/portal.md)); it's not in the current workspace.)*

---

## Getting started (local)

### Prerequisites
- **Node 20+** and **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** (running)
- **pnpm** via corepack (ships with Node): `corepack enable`
- An **OpenAI API key** (needed to turn recordings into the KB and to answer questions)

### 1. Install
```bash
corepack enable
pnpm install
```

### 2. Environment
Env files are per-package and git-ignored. The root [`.env.example`](.env.example) documents every variable.
```bash
cp .env.example packages/api/.env
cp .env.example packages/web/.env
cp .env.example packages/db/.env
```
Then edit:
- **`OPENAI_API_KEY`** in `packages/api/.env` (worker: transcribe + segment + embed; copilot answers). The Studio makes no OpenAI calls.
- An **auth secret** for Studio in `packages/web/.env` (`AUTH_SECRET` — `openssl rand -hex 32`).

Local defaults for Postgres/Redis/MinIO already match `docker-compose.yml`, so you don't need to change those.

### 3. Infrastructure
```bash
docker compose up -d        # Postgres (:5432) + Redis (:6379) + MinIO (:9000 / console :9001)
```

### 4. Database
```bash
pnpm db:migrate             # apply migrations (creates the tables)
pnpm db:generate            # regenerate the Prisma client
```

---

## Running locally

Run these in separate terminals:

```bash
pnpm --filter @flowbuddy/api dev        # ingestion API + copilot endpoints → http://localhost:8787
pnpm --filter @flowbuddy/api worker     # the worker (turns recordings into the KB) — REQUIRED
pnpm --filter @flowbuddy/web dev        # Studio → http://localhost:3000
```

Build the client bundles:

```bash
pnpm --filter @flowbuddy/widget build      # → dist/flowbuddy-copilot.js + flowbuddy-copilot-render.js (siblings; serve the demo over HTTP — see Testing step 6, not file://)
pnpm --filter @flowbuddy/extension build   # → packages/extension/dist/  (load unpacked in Chrome at chrome://extensions)
```

> **The worker must be running** for an upload to become the KB (`status → ready`). Without it, recordings upload but never get processed.

---

## Testing

### Static checks (fast, no services needed)
```bash
pnpm build        # builds & type-checks all packages (incl. widget + extension bundles)
pnpm typecheck    # tsc --noEmit across the workspace
pnpm db:validate  # validate the Prisma schema
```

### API runtime smoke (no OpenAI needed)
With infra up and the api running:
```bash
curl http://localhost:8787/healthz
# → {"ok":true}

# the copilot endpoint enforces auth before doing any work:
curl -s -o /dev/null -w "%{http_code}\n" -XPOST http://localhost:8787/v1/copilot/answer \
  -H 'content-type: application/json' -d '{"question":"hi"}'
# → 401  (missing copilot key)
```
The copilot answer endpoint enforces a **public embeddable key** + **origin allowlist** + **rate limit (30/min)**; an un-provisioned copilot returns `covered:false` ("no approved content yet") without calling OpenAI.

### End-to-end (the full loop — needs a browser + OpenAI)
1. **Sign up** at http://localhost:3000/signup → your workspace is created.
2. **Install the recorder:** `chrome://extensions` → enable Developer mode → **Load unpacked** → `packages/extension/dist/`. Click **Connect** in the popup → links it to your account (no token paste).
3. **Record:** open the product you want to document, hit **Start**, narrate while clicking through a workflow (use **Mark new workflow** to separate tasks), then **Stop**. The recorder shows `REC → ↑ → ✓` and uploads.
4. **Knowledge Base:** the worker transcribes + segments the recording; it turns **`ready`** in Studio. Open its KB page to see the transcript + items grouped by workflow.
5. **Approve for the copilot:** on the KB page, toggle **"approve for copilot"** on the workflows worth answering.
6. **Embed & ask:** grab the **public key** from `Studio → Copilot`, set it in [`packages/widget/demo/index.html`](packages/widget/demo/index.html) (`data-flowbuddy-key`) with `data-flowbuddy-api="http://localhost:8787"`. **Serve the demo over HTTP** (opening it via `file://` shows no launcher — Chrome blocks the script + the API call): `cd packages/widget && python3 -m http.server 8080`, then open **http://localhost:8080/demo/index.html**. Ask a question — you should get a **grounded answer with a citation**, an **honest decline** on something uncovered, and 👍/👎 feedback flowing back to Studio.

Teardown: `docker compose down` (add `-v` to wipe data).

---

## Environment variables

Full list + defaults in [`.env.example`](.env.example). The essentials:

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | all | Postgres connection (matches docker-compose locally) |
| `REDIS_URL` | api, worker | BullMQ queue |
| `R2_ENDPOINT` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | api, worker, web | S3-compatible storage; defaults to local MinIO |
| `OPENAI_API_KEY` | **api** only | transcription, segmentation, copilot answers (the Studio makes no OpenAI calls) |
| `TRANSCRIBE_MODEL` / `SYNTH_MODEL` / `REASON_MODEL` | api, worker | model ids; defaults in `.env.example` |
| `AUTH_SECRET` / `AUTH_URL` | web | Studio auth (Auth.js v5) |

---

## Project status

**Version 1 is launched.** The full loop — record → KB → approve → embed → grounded answers — runs in **production at [flowbuddyai.com](https://flowbuddyai.com)** (Studio `app.` · api `api.` · widget `widget.`; launched 2026-07-23), with **FlowBuddy Recorder v0.7.0 live on the Chrome Web Store** (the upload-identity release production requires). **Phase 1 (Copilot, P1-M0…M12)** ✅ shipped — incl. hybrid keyword+pgvector retrieval, live-served widget appearance, and a Studio preview that **is** the real widget; only P1-M12 Cut 2 (screenshot-pixel PII) remains, deferred to the Version-2 portal track as a publish prerequisite. **Phase 2 (Sense + Reason)** ✅ built + user-verified — the copilot localizes the end-user to **workflow + step**, answers positionally, and diagnoses "why can't I proceed?". **Phase 4:** the **P4-M0 guided walkthrough** ✅ built (zero-acting); the acting modules are to plan and consume **Phase 3** (self-validation — the moat, to be planned) when its replay core lands.

**Version 2** holds the by-products + depth: the **Help Portal & Articles track** (approved workflows rendered as articles — [`docs/build/portal.md`](docs/build/portal.md)), narration/video capture modalities, and the deferred backlogs. Captured directions beyond it: **Phase 5 Converse** (the goal agent: Tell → Guide → Do), **Phase 6 Interop** (expose the approved KB to third-party AI agents), and **Version 3** (buyer-side: the company agent). The authoritative map: [`docs/roadmap.md`](docs/roadmap.md).

---

## Documentation

Everything lives in [`docs/`](docs) — start at **[`docs/README.md`](docs/README.md)**, the doc map.
For what is built and what is next, see [`docs/roadmap.md`](docs/roadmap.md).
The gentlest way in is [`docs/plain-english/`](docs/plain-english/README.md).

## Deployment

The stack is **deployed on Render** (Dockerized: api + embedded worker + Studio + static widget/landing hosts) + **Cloudflare R2** for blobs, driven by two blueprints: [`render.yaml`](render.yaml) (**production**, read from `main`) and [`render.dev.yaml`](render.dev.yaml) (**dev/staging** free tier, read from `dev` via a custom blueprint path; spin-down + non-persistent Redis caveats documented in the file). Step-by-step deploy guide for both environments (every first-deploy gotcha + the production runbook): [`docs/ops/deploy.md`](docs/ops/deploy.md). Cloud E2E test + data reset: [`docs/ops/e2e-testing.md`](docs/ops/e2e-testing.md) **Level 2**.

---

## Troubleshooting

- **`command not found: pnpm`** → run `corepack enable`.
- **"can't reach database"** → is Docker up? `docker compose ps` (postgres should be `healthy`).
- **Nothing happens after a recording** → the **worker** isn't running (`pnpm --filter @flowbuddy/api worker`).
- **Copilot says "no approved content yet"** → approve at least one workflow for the copilot on its KB page in Studio.
- **Type changes not picked up across packages** → `pnpm build`; for the Prisma client specifically, `pnpm db:generate`.
