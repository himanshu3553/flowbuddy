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
    synthesis/  # transcribe → KB → segment → generate (OpenAI); used by worker + web
    api/        # Fastify ingestion HTTP service + the BullMQ worker (worker entrypoint)
    web/        # Next.js Studio app (dashboard/editor + curated generation)
    portal/     # Next.js public help site
    extension/  # Chrome MV3 recorder
  spike/      # Phase-0 reference code (NOT part of the workspace)
  docs/       # PRD, specs, plans, this file
```

Why a monorepo: the extension, api, web, and portal must agree on the same data shapes. Those shapes live once in `shared`/`db`; everyone imports them. Change a type in one place → everything else sees it (and fails to compile if it's now wrong — our main safety net).

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
pnpm --filter @sync/web dev                   # run Studio → http://localhost:3000
pnpm --filter @sync/api worker                # run the worker (turns recordings into the KB)
# optional, for the full loop:
pnpm --filter @sync/api dev                   # ingestion API (extension upload) → :8787
pnpm --filter @sync/portal dev                # public help portal → :3001

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
- **`.env` files** are git-ignored and per-package where needed (e.g., `packages/web/.env`, `packages/api/.env`, `packages/db/.env`). The root `.env.example` documents every variable. **`OPENAI_API_KEY` is needed in BOTH `packages/api/.env`** (worker — transcribe + segment) **and `packages/web/.env`** (Studio — curated article generation runs synchronously there).
- **Nothing happens after recording?** The **worker must be running** (`pnpm --filter @sync/api worker`) to turn an upload into the KB (`status → ready`). Articles then appear only when you click **"Auto Generate Articles"** in Studio — they are no longer auto-created.
- **Docker must be running** (Docker Desktop) before `docker compose up`.

---

## 6. What runs where (once all packages exist)

| Package | What it is | Run locally |
|---|---|---|
| `web` | Next.js Studio (dashboard/editor) | `pnpm --filter @sync/web dev` → :3000 |
| `portal` | Next.js public help site | `pnpm --filter @sync/portal dev` |
| `api` | Fastify HTTP service (ingestion) | `pnpm --filter @sync/api dev` |
| `worker` | BullMQ synthesis worker | `pnpm --filter @sync/api worker` |
| `extension` | Chrome MV3 recorder | `pnpm --filter @sync/extension build` → load `dist/` |
| `shared`, `db` | shared types + Prisma | built as dependencies of the above |

(Deploy maps these to Render services + Cloudflare R2 — see [phase-1a-plan.md](phase-1a-plan.md).)
