# Sync — Dev Setup & Tooling Guide

A practical reference for working in this repo, written for someone comfortable with plain `npm` who's new to pnpm/monorepos/Turborepo. **The fundamentals are the same** — `package.json`, `node_modules`, `run` scripts — we've just scaled from one app to several packages and added a few helpers.

**Mental model in one line:** *pnpm* installs/runs (like npm), *Turborepo* runs scripts across all packages in dependency order, *Docker Compose* runs the Postgres/Redis your app talks to, and *Prisma* manages the database tables.

---

## 1. The layout (a "monorepo")

One repo, multiple mini-projects ("packages"), each with its **own** `package.json`, plus **one root** `package.json` that ties them together.

```
sync/
  package.json          # root: orchestration + shared dev tools (turbo, typescript)
  pnpm-workspace.yaml   # declares packages live in packages/*
  turbo.json            # task pipeline (build/dev/typecheck across packages)
  docker-compose.yml    # local Postgres + Redis
  packages/
    shared/     # types + zod schemas shared by everyone
    db/         # Prisma schema + client
    synthesis/  # transcribe → clean → segment → distill steps + the copilot answer engine (OpenAI)
    api/        # Fastify ingestion + copilot routes + the BullMQ worker (worker entrypoint)
    web/        # Next.js Studio — app shell + approval gate + copilot settings/analytics (Tailwind + shadcn/ui · indigo design system)
    widget/     # embeddable copilot <script> (esbuild → sync-copilot.js) — Phase 1 · Sync-indigo default, host-rebrandable
    extension/  # Chrome MV3 recorder — indigo UI
  docs/       # product · architecture · roadmap · phase-1-copilot · phase-1-modules-map · phase-2-portal · kb-step-distillation · design_system/ · e2e-testing · this file
```

> **Note:** the `portal/` package (Phase-2 public help site) and the throwaway `spike/` were **removed for the Phase-1 copilot clean slate** (commit `c9f13f4`, 2026-06-22). The portal **returns in Phase 2**.

Why a monorepo: the extension, api, web, and widget must agree on the same data shapes. Those shapes live once in `shared`/`db`; everyone imports them. Change a type in one place → everything else sees it (and fails to compile if it's now wrong — our main safety net).

---

## 2. The tools

### pnpm — the package manager (drop-in for npm)
Same `package.json` and registry; better at multi-package repos (one install for all packages, disk-efficient, `--filter` to target one).

- Installed via **corepack** (ships with Node): `corepack enable` creates the `pnpm` command. The root `"packageManager": "pnpm@9.x"` pins everyone to one version.
- One lockfile for the whole repo: `pnpm-lock.yaml`.
- Internal deps use `"@sync/db": "workspace:*"` — resolved to the local package, not npm.

### Turborepo — the task runner
`pnpm build` actually runs `turbo run build`: it runs each package's `build` script **in dependency order** (`shared`/`db` before `web`) and **caches** unchanged packages (the "cache miss / N cached" output).

### Docker Compose — the infrastructure (separate from pnpm)
Runs **Postgres** + **Redis** as containers so you don't install them on your Mac. The app connects via `DATABASE_URL` / `REDIS_URL`. Defined in `docker-compose.yml`.

> **Postgres image = `pgvector/pgvector:pg16`** (since P1-M3 hybrid retrieval, 2026-07-07) — a
> drop-in postgres:16 with the `vector` extension the migrations need. Upgrading an existing
> checkout: `docker compose up -d postgres` recreates the container on the new image (the data
> volume survives). If Postgres then logs a *collation version mismatch* warning, run
> `ALTER DATABASE sync REFRESH COLLATION VERSION;` (and the same for `template1` — Prisma's shadow
> DB clones it and `migrate dev` fails otherwise).

### Prisma — the database toolkit (in `packages/db`)
- `prisma generate` — generates the typed client from `schema.prisma` (auto-runs on install/build).
- `prisma migrate dev` — turns schema changes into SQL and applies them (creates/updates tables).

---

## 3. npm → pnpm translation

| You're used to (npm) | Here (pnpm) |
|---|---|
| `npm install` | `pnpm install` — run **once at the repo root**, installs every package |
| `npm run dev` | `pnpm --filter @sync/web dev` — run one package's script |
| `npm run build` | `pnpm build` — build all packages (Turbo, in order) |
| `npm run start` | `pnpm --filter @sync/web start` |
| `npx <tool>` | `pnpm exec <tool>` (or `pnpm dlx <tool>` for one-off) |

`--filter @sync/web` = "only this package" (`@sync/web` is the `"name"` in `packages/web/package.json`).

---

## 4. Day-to-day cheat sheet

```bash
# one-time
corepack enable
pnpm install

# every working session
docker compose up -d                          # start Postgres + Redis + MinIO
pnpm --filter @sync/api dev                   # ingestion API + copilot endpoints → :8787
pnpm --filter @sync/api worker                # the worker (turns recordings into the KB)
pnpm --filter @sync/web dev                   # run Studio → http://localhost:3000
# for the copilot embed (Phase 1):
pnpm --filter @sync/widget build              # build sync-copilot.js → SERVE the demo over HTTP (cd packages/widget && python3 -m http.server 8080), not file://
pnpm --filter @sync/extension build           # build the recorder → load packages/extension/dist/ in Chrome

# building / checking
pnpm build                                    # build everything (Turbo)
pnpm typecheck                                # type-check everything

# database
pnpm db:migrate                               # apply schema changes (creates/updates tables)
pnpm db:generate                              # regenerate the Prisma client
pnpm db:validate                              # validate schema.prisma
pnpm --filter @sync/db exec prisma studio     # browse the DB in a UI (localhost:5555)

# infra teardown
docker compose down                           # stop Postgres + Redis (add -v to wipe data)
```

### Root scripts that exist (`package.json`)
`build` · `dev` · `typecheck` · `lint` · `db:generate` · `db:validate` · `db:migrate`

---

## 5. Common gotchas

- **"command not found: pnpm"** → run `corepack enable` (once per machine / Node version).
- **DB errors / "can't reach database"** → is Postgres up? `docker compose up -d`, then `docker compose ps` (postgres should be `healthy`).
- **Type changes not picked up across packages** → `pnpm build` (Turbo rebuilds deps in order); for the Prisma client specifically, `pnpm db:generate`.
- **`.env` files** are git-ignored and per-package where needed (e.g., `packages/web/.env`, `packages/api/.env`, `packages/db/.env`). The root `.env.example` documents every variable. **`OPENAI_API_KEY` is needed in `packages/api/.env` only** (worker — transcribe + segment; and the copilot answer endpoint). *(The Studio needs no OpenAI key: its copilot preview embeds the real widget, so answers go through the api.)*
- **Nothing happens after recording?** The **worker must be running** (`pnpm --filter @sync/api worker`) to turn an upload into the KB (`status → ready`). Once ready, open the recording's KB page to browse items and **approve workflows for the copilot**.
- **Docker must be running** (Docker Desktop) before `docker compose up`.

---

## 6. What runs where (once all packages exist)

| Package | What it is | Run locally |
|---|---|---|
| `web` | Next.js Studio (dashboard/editor + approval + copilot settings) | `pnpm --filter @sync/web dev` → :3000 |
| `api` | Fastify HTTP service (ingestion + copilot endpoints) | `pnpm --filter @sync/api dev` → :8787 |
| `worker` | BullMQ synthesis worker | `pnpm --filter @sync/api worker` |
| `widget` | embeddable copilot `<script>` (esbuild) | `pnpm --filter @sync/widget build` → serve `demo/` over HTTP (`python3 -m http.server 8080`) |
| `extension` | Chrome MV3 recorder | `pnpm --filter @sync/extension build` → load `dist/` |
| `shared`, `db` | shared types + Prisma | built as dependencies of the above |

*(`portal` — the Phase-2 public help site — returns in Phase 2; it's not in the current workspace.)*

(Deploy maps these to Render services + Cloudflare R2 — see [`phase-1-copilot.md`](phase-1-copilot.md) §5 P1-M4.)
