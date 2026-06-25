# Sync

> **An embeddable AI help copilot any SaaS can add in minutes.** Record your product once, approve the workflows the copilot may use, drop in one `<script>`, and your customers get in-app answers grounded **only** in what you approved — with citations and honest "I don't know yet" on gaps.

Sync is **copilot-first**. A help portal + articles are decoupled by-products of the same recordings; the in-app copilot is the headline product.

---

## What is Sync?

Most help tools make you write articles, then hope customers find them. Sync flips that around:

1. **Show** Sync how your product works — once, by recording yourself using it and narrating *what* you do and *why*.
2. Sync **learns** it and turns it into a structured **Knowledge Base**.
3. You **approve** which workflows the copilot may use — one click each.
4. Your customers get an **in-app assistant** that answers instantly — grounded in what you actually showed it, **never made-up**.

**What your customers experience:** a clean in-app chat that gives instant, accurate answers to "how do I…" questions based only on what you recorded and approved; **shows its sources**; is **honest when it doesn't know** (no confident-sounding wrong answers); **knows which screen they're on**; and **remembers the conversation**.

**What you stay in control of:** approve before anything goes live; choose which sites may run the copilot (origin allowlist); a one-click public key you can rotate; and **sensitive data is masked in the browser before it ever leaves your machine** while recording.

**The trust model — grounded authorship + no-leak:** the Knowledge Base is the *substrate* the copilot reasons over; a lightweight per-workflow **"approve for copilot"** flag is the *trust gate*. The copilot answers **only** from approved knowledge — never raw/un-approved items, never general model knowledge — and declines + flags a coverage gap ("record this next") when something isn't covered.

*(Bonus: the same recordings can also produce step-by-step help **articles** and a public **help portal** — a decoupled Phase-2 by-product.)*

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
        └─► authoring ──► Articles (curated / prompt) ──► Help PORTAL   (by-product, Phase 2)
```

**Four surfaces:**

| Surface | Who | Purpose |
|---|---|---|
| **Sync Recorder** (Chrome extension) | the builder | capture narrated product workflows |
| **Studio** (web app) | the builder | review the KB, **approve for the copilot**, configure + monitor it *(article authoring is a parked Phase-2 by-product)* |
| **In-App Copilot** (embeddable widget) ⭐ | the builder's customers | grounded, in-context answers inside the builder's product |
| **Help Portal** (public web) — *Phase 2* | the builder's customers | browse + search published help articles |

---

## Tech stack

- **Monorepo:** pnpm + Turborepo
- **Language:** TypeScript (Node 20+)
- **Studio:** Next.js 15 + Auth.js (self-hosted, email + password) · **Tailwind CSS + shadcn/ui** (neutral)
- **API / worker:** Fastify (HTTP) + BullMQ (background jobs)
- **Database:** Postgres (Prisma)
- **Queue / cache:** Redis
- **Object storage:** S3-compatible — MinIO locally, Cloudflare R2 in production
- **AI:** OpenAI (`whisper-1` transcription · `gpt-4o` segmentation, synthesis, and the copilot answer engine)
- **Widget / extension:** esbuild bundles
- **Deploy target:** Render (Dockerized) + Cloudflare R2

---

## Repository layout

```
packages/
  shared/     # types + zod schemas (capture contract, content model, job contracts)
  db/         # Prisma schema + client (Postgres)
  synthesis/  # OpenAI pipeline — capture → KB synthesis + the copilot answer engine (answerFromKB)
  api/        # Fastify ingestion + copilot routes  AND  the BullMQ worker (worker entrypoint)
  web/        # Next.js Studio — copilot-first: approval gate + copilot settings/analytics
  widget/     # embeddable copilot <script> (esbuild → sync-copilot.js)
  extension/  # Chrome MV3 recorder
```

*(`portal` — the Phase-2 public help site — returns in Phase 2; it's not in the current workspace.)*

> **Phase-2 code is parked, not gone.** The article/portal **engine** stays dormant in-tree (type-checked), but its **Studio UI was removed (2026-06-25)** so the shipped product is copilot-only. Parked files carry a `// PARKED — Phase 2` banner; inventory + re-wiring map in [`docs/phase-2-portal.md`](docs/phase-2-portal.md) §6.

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
- **`OPENAI_API_KEY`** in `packages/api/.env` (worker: transcribe + segment; copilot answers). *(Also read by `packages/web/.env` only for the **parked Phase-2** article generation — not needed for the copilot.)*
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
pnpm --filter @sync/api dev        # ingestion API + copilot endpoints → http://localhost:8787
pnpm --filter @sync/api worker     # the worker (turns recordings into the KB) — REQUIRED
pnpm --filter @sync/web dev        # Studio → http://localhost:3000
```

Build the client bundles:

```bash
pnpm --filter @sync/widget build      # → packages/widget/dist/sync-copilot.js  (load packages/widget/demo/index.html)
pnpm --filter @sync/extension build   # → packages/extension/dist/  (load unpacked in Chrome at chrome://extensions)
```

> **The worker must be running** for an upload to become the KB (`status → ready`). Without it, recordings upload but never get processed.

---

## Testing

### Static checks (fast, no services needed)
```bash
pnpm build        # builds & type-checks all 7 packages (incl. widget + extension bundles)
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
6. **Embed & ask:** grab the **public key** from `Studio → Copilot`, set it in [`packages/widget/demo/index.html`](packages/widget/demo/index.html) (`data-sync-key`) with `data-sync-api="http://localhost:8787"`, open that file in a browser, and ask a question — you should get a **grounded answer with a citation**, an **honest decline** on something uncovered, and 👍/👎 feedback flowing back to Studio.

Teardown: `docker compose down` (add `-v` to wipe data).

---

## Environment variables

Full list + defaults in [`.env.example`](.env.example). The essentials:

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | all | Postgres connection (matches docker-compose locally) |
| `REDIS_URL` | api, worker | BullMQ queue |
| `R2_ENDPOINT` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | api, worker, web | S3-compatible storage; defaults to local MinIO |
| `OPENAI_API_KEY` | **api** (web: parked Phase-2 only) | transcription, segmentation, copilot answers |
| `TRANSCRIBE_MODEL` / `SYNTH_MODEL` | api, worker | default `whisper-1` / `gpt-4o` |
| `AUTH_SECRET` / `AUTH_URL` | web | Studio auth (Auth.js v5) |

---

## Project status

**Phase 1 (the copilot) is code-complete and verified locally** — modules **P1-M0 … P1-M12** (capture → KB → retrieval/grounding → approval gate → answer endpoint → embeddable widget → context API → embed auth → feedback/analytics → capture-reliability + PII-redaction cores). The only remaining step is **cloud deploy (P1-M4)** — Docker + `render.yaml` are ready; the deploy itself is gated on Render + Cloudflare R2 accounts.

**Phase 2** (help portal + article authoring) is a decoupled by-product, currently **frozen** — its engine is **parked dormant in-tree** and its Studio UI was removed for the copilot release ([`docs/phase-2-portal.md`](docs/phase-2-portal.md) §6). **Phase 3** (self-validation / freshness) is the moat, to be planned. See [`docs/roadmap.md`](docs/roadmap.md) for the full versions → phases → modules map and status.

---

## Documentation

Start with the roadmap; each doc links onward.

| Doc | Role |
|---|---|
| [`docs/roadmap.md`](docs/roadmap.md) | **The map** — versions → phases → modules + status + legacy-ID map |
| [`docs/product.md`](docs/product.md) | What Sync is, who it's for, **why copilot-first** (decision record + grounding model) |
| [`docs/architecture.md`](docs/architecture.md) | Technical model — the 3 modules, KB schema, data model, decisions |
| [`docs/phase-1-copilot.md`](docs/phase-1-copilot.md) | **Phase 1 (copilot)** — scope/DoD + per-module plan & as-built + capture contract + backlog |
| [`docs/phase-2-portal.md`](docs/phase-2-portal.md) | **Phase 2 (by-products)** — portal & article authoring (frozen) + to-build modules |
| [`docs/dev-setup.md`](docs/dev-setup.md) | Local dev / tooling deep-dive (pnpm · Turborepo · docker-compose · Prisma) |

`CLAUDE.md` is a short orientation file for working in this repo with Claude Code.

---

## Deployment

Production targets **Render** (Dockerized: api + worker + Studio) + **Cloudflare R2** for blobs. A `render.yaml` blueprint and per-service Dockerfiles are prepared. The deploy is the final step of Phase 1 and needs your Render + R2 accounts/secrets — see [`docs/phase-1-copilot.md`](docs/phase-1-copilot.md) §5 (P1-M4).

---

## Troubleshooting

- **`command not found: pnpm`** → run `corepack enable`.
- **"can't reach database"** → is Docker up? `docker compose ps` (postgres should be `healthy`).
- **Nothing happens after a recording** → the **worker** isn't running (`pnpm --filter @sync/api worker`).
- **Copilot says "no approved content yet"** → approve at least one workflow for the copilot on its KB page in Studio.
- **Type changes not picked up across packages** → `pnpm build`; for the Prisma client specifically, `pnpm db:generate`.
