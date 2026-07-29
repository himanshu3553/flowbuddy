# FlowBuddy — Dev Setup & Tooling Guide

A practical reference for working in this repo, written for someone comfortable with plain `npm` who's new to pnpm/monorepos/Turborepo. **The fundamentals are the same** — `package.json`, `node_modules`, `run` scripts — we've just scaled from one app to several packages and added a few helpers.

**Mental model in one line:** *pnpm* installs/runs (like npm), *Turborepo* runs scripts across all packages in dependency order, *Docker Compose* runs the Postgres/Redis your app talks to, and *Prisma* manages the database tables.

---

## 1. The layout (a "monorepo")

One repo, multiple mini-projects ("packages"), each with its **own** `package.json`, plus **one root** `package.json` that ties them together.

```
flowbuddy/
  package.json          # root: orchestration + shared dev tools (turbo, typescript)
  pnpm-workspace.yaml   # declares packages live in packages/*
  turbo.json            # task pipeline (build/dev/typecheck across packages)
  docker-compose.yml    # local Postgres + Redis + MinIO
  packages/
    shared/     # types + zod schemas shared by everyone
    db/         # Prisma schema + client
    logger/     # the ONE structured logger (Pino) for every Node service — see §7
    synthesis/  # transcribe → clean → segment → distill steps + the copilot answer engine (OpenAI)
    api/        # Fastify ingestion + copilot routes + the BullMQ worker (worker entrypoint)
    web/        # Next.js Studio — app shell + approval gate + copilot settings/analytics (Tailwind + shadcn/ui · indigo design system)
    widget/     # embeddable copilot <script> (esbuild → flowbuddy-copilot.js + the lazy P2-M5 renderer flowbuddy-copilot-render.js) — FlowBuddy-indigo default, host-rebrandable
    extension/  # Chrome MV3 recorder — indigo UI
    landing/    # static marketing page for flowbuddyai.com (build = copy public/ → dist/)
  docs/       # the full doc set — start at the map: roadmap.md §10 / the CLAUDE.md doc table
```

> **Note:** the `portal/` package (the public help site) is not in the current workspace — it's **built in Version 2** ([`v2-portal.md`](v2-portal.md)).

Why a monorepo: the extension, api, web, and widget must agree on the same data shapes. Those shapes live once in `shared`/`db`; everyone imports them. Change a type in one place → everything else sees it (and fails to compile if it's now wrong — our main safety net).

---

## 2. The tools

### pnpm — the package manager (drop-in for npm)
Same `package.json` and registry; better at multi-package repos (one install for all packages, disk-efficient, `--filter` to target one).

- Installed via **corepack** (ships with Node): `corepack enable` creates the `pnpm` command. The root `"packageManager": "pnpm@9.x"` pins everyone to one version.
- One lockfile for the whole repo: `pnpm-lock.yaml`.
- Internal deps use `"@flowbuddy/db": "workspace:*"` — resolved to the local package, not npm.

### Turborepo — the task runner
`pnpm build` actually runs `turbo run build`: it runs each package's `build` script **in dependency order** (`shared`/`db` before `web`) and **caches** unchanged packages (the "cache miss / N cached" output).

### Docker Compose — the infrastructure (separate from pnpm)
Runs **Postgres** + **Redis** + **MinIO** as containers so you don't install them on your Mac. The app connects via `DATABASE_URL` / `REDIS_URL`. Defined in `docker-compose.yml`.

> **Postgres image = `pgvector/pgvector:pg16`** (since P1-M3 hybrid retrieval, 2026-07-07) — a
> drop-in postgres:16 with the `vector` extension the migrations need. Upgrading an existing
> checkout: `docker compose up -d postgres` recreates the container on the new image (the data
> volume survives). If Postgres then logs a *collation version mismatch* warning, run
> `ALTER DATABASE flowbuddy REFRESH COLLATION VERSION;` (and the same for `template1` — Prisma's shadow
> DB clones it and `migrate dev` fails otherwise).

### Prisma — the database toolkit (in `packages/db`)
- `prisma generate` — generates the typed client from `schema.prisma` (auto-runs on install/build).
- `prisma migrate dev` — turns schema changes into SQL and applies them (creates/updates tables).

---

## 3. npm → pnpm translation

| You're used to (npm) | Here (pnpm) |
|---|---|
| `npm install` | `pnpm install` — run **once at the repo root**, installs every package |
| `npm run dev` | `pnpm --filter @flowbuddy/web dev` — run one package's script |
| `npm run build` | `pnpm build` — build all packages (Turbo, in order) |
| `npm run start` | `pnpm --filter @flowbuddy/web start` |
| `npx <tool>` | `pnpm exec <tool>` (or `pnpm dlx <tool>` for one-off) |

`--filter @flowbuddy/web` = "only this package" (`@flowbuddy/web` is the `"name"` in `packages/web/package.json`).

---

## 4. Day-to-day cheat sheet

```bash
# one-time
corepack enable
pnpm install

# every working session
docker compose up -d                          # start Postgres + Redis + MinIO
pnpm --filter @flowbuddy/api dev                   # ingestion API + copilot endpoints → :8787
pnpm --filter @flowbuddy/api worker                # the worker (turns recordings into the KB)
pnpm --filter @flowbuddy/web dev                   # run Studio → http://localhost:3000
# for the copilot embed (Phase 1):
pnpm --filter @flowbuddy/widget build              # builds flowbuddy-copilot.js + flowbuddy-copilot-render.js (lazy P2-M5 image tier) → SERVE the demo over HTTP (cd packages/widget && python3 -m http.server 8080), not file://
pnpm --filter @flowbuddy/extension build           # build the recorder → load packages/extension/dist/ in Chrome
pnpm --filter @flowbuddy/landing build             # static marketing page → dist/

# building / checking
pnpm build                                    # build everything (Turbo)
pnpm typecheck                                # type-check everything
pnpm test                                     # vitest over the pure seams (synthesis) — the repo's
                                              # only tests; no CI, run it beside typecheck

# database
pnpm db:migrate                               # apply schema changes (creates/updates tables)
pnpm db:generate                              # regenerate the Prisma client
pnpm db:validate                              # validate schema.prisma
pnpm --filter @flowbuddy/db exec prisma studio     # browse the DB in a UI (localhost:5555)

# infra teardown
docker compose down                           # stop Postgres + Redis (add -v to wipe data)
```

### Root scripts that exist (`package.json`)
`build` · `dev` · `typecheck` · **`test`** · `lint` · `db:generate` · `db:validate` · `db:migrate`

> **Tests (added 2026-07-26 — the repo's first; 49 as of 2026-07-29).** `vitest` in
> `@flowbuddy/synthesis` only, over the *pure* seams:
> - `retrieval.test.ts` — signal-ordering invariants (route/sense outrank continuity; a real keyword
>   match still beats all of them — the rule that lets a user change subject).
> - `engine.test.ts` — the answer loop's contract (AI Chatbot = exactly one model call with no tool
>   surface; a final round never serves tools).
> - `copilot-mode.test.ts` — the mode vocabulary's safety invariants: the product default
>   (`NEW_WORKSPACE_MODE`) and the fail-closed floor (`DEFAULT_COPILOT_MODE`) are different things
>   and must not be re-collapsed, and no unrecognised value — typo, pasted label, wrong casing, null
>   column — ever reaches the agent loop. It lives here only because this is where the runner is;
>   move it if `@flowbuddy/shared` ever gets its own.
>
> Deliberately NOT tested: prompts and model output — a unit test asserting on generated text fails
> for the wrong reasons. Answer *quality* is covered by `scripts/copilot-baseline.mjs` (below) and
> the manual E2E plan. Still no CI, by standing decision.

**Answer-quality baselines** — `node scripts/copilot-baseline.mjs --key pk_… [--runs 3] [--only h2]`
asks a fixed question set and records the DECISIONS (answered vs declined, workflows cited, position,
agent intents) rather than the prose, because the model runs at `temperature 0.2` and its wording
always differs. `scripts/copilot-baseline-diff.mjs before.json after.json` reports only
decision-level changes. Runs in `preview` mode, so a capture writes no analytics. Saved reference
captures for both modes live in `scripts/`.

**Multi-turn cases (2026-07-29).** A question may carry `"after"` — the turns to play FIRST, so it
arrives as a FOLLOW-UP with real conversation state behind it (`--only t` runs just those). The
setup turns are asked for real rather than canned, so they cannot rot when the KB is re-recorded,
and `setupFailures` in the output flags a row whose SETUP declined — that row is measuring a broken
conversation, not the question under test.

> **Why this exists, and the lesson in it.** A whole class of failure is invisible to a
> one-question-at-a-time harness. The copilot shipped for months **answering the PREVIOUS question**
> whenever a conversation changed subject — asked about pricing right after a login question it
> replied with the login steps and marked itself covered — and every question in this file passed
> throughout, because none of them had a conversation in front of them. When adding a case, ask what
> STATE it needs, not just what words it uses. The `topic-shift` group is verified to fail without
> the fix (t1/t2 → 0/3) *and* to catch the opposite failure (t6 answers a weather question → 3/3),
> so it guards both wrongly-declining and wrongly-answering.

**Two things it still cannot see**, both worth knowing before trusting a green run: it sends
`--path` but never live page STATE, so the diagnostic path has no automated coverage; and `preview`
suppresses the decline→diagnostic escalation, so that retry is never exercised. Both need a real
browser — [`e2e-testing.md`](e2e-testing.md).

---

## 5. Common gotchas

- **"command not found: pnpm"** → run `corepack enable` (once per machine / Node version).
- **DB errors / "can't reach database"** → is Postgres up? `docker compose up -d`, then `docker compose ps` (postgres should be `healthy`).
- **Type changes not picked up across packages** → `pnpm build` (Turbo rebuilds deps in order); for the Prisma client specifically, `pnpm db:generate`.
- **`.env` files** are git-ignored and per-package where needed (e.g., `packages/web/.env`, `packages/api/.env`, `packages/db/.env`). The root `.env.example` documents every variable. **`OPENAI_API_KEY` is needed in `packages/api/.env` only** (worker — transcribe + segment; and the copilot answer endpoint). *(The Studio needs no OpenAI key: its copilot preview embeds the real widget, so answers go through the api.)*
- **Nothing happens after recording?** First check the badge. A recording shows **Recording** while artifacts are still arriving — that row exists from the first uploaded artifact, has no manifest yet, and the worker **deliberately skips it** (`no manifest yet — recording not finalized, skipping`); it only becomes work once you press Stop. If it says **Processing** and stays there, the **worker must be running** (`pnpm --filter @flowbuddy/api worker`) to turn an upload into the KB (`status → ready`). Once ready, open the recording's KB page to browse items and **approve workflows for the copilot**.
- **Docker must be running** (Docker Desktop) before `docker compose up`.
- **Recordings upload artifacts straight to object storage** (the api signs a PUT URL per artifact and never touches the bytes): screenshots and page snapshots **while you record**, the narration track **at Stop** — so on a healthy connection the final request carries just the manifest. The all-in-one bundle still exists as the fallback when signing or storage is unreachable. Two local implications: **(1)** `R2_ENDPOINT` must be an address the **browser** can reach — the default `http://localhost:9000` (MinIO) is correct; a docker-internal hostname would sign URLs nothing outside the compose network can use. **(2)** **MinIO is more permissive than Cloudflare R2** — it ignores the request checksums and cross-origin rules R2 enforces, so a broken signed URL passes locally and fails only in the cloud. The path as it stands is verified against real R2 (dev deploy, 2026-07-28), but a green local recording is still **not** proof for any *change* you make to signing — re-verify on the dev deploy ([`e2e-testing.md`](e2e-testing.md) Level 2).
- **Threw a recording away?** It cleans up after itself. A capture that never finished uploading is discarded — with everything it already put in storage — when you click **Start fresh** or simply start the next recording; anything that slips through (browser closed, machine slept) is swept server-side once it has sat unfinished for 12 hours, which happens the next time any recording in that workspace finalizes. So a stray **Recording** row that lingers for a few minutes is normal, not a leak.

---

## 6. What runs where

Every package, what it is, and its traps: `CLAUDE.md`. The commands to run each one are in §4 above.

*(`portal` — the V2 public help site — is built in Version 2; it's not in the current workspace.)*

---

## 7. Logging (dev vs prod, and how to turn it up/down)

**This is the canonical reference for logging** — the model, the levels, and every env knob. It's the same code everywhere; only the environment changes the default level and output shape.

### The two logger worlds

| Surface | Logger | Why |
|---|---|---|
| **Node services** — `api` (server + worker), `synthesis`, `web` **server-side** | **`@flowbuddy/logger`** (Pino). `import { createLogger } from '@flowbuddy/logger'` → `const log = createLogger('worker')` | Structured JSON for prod aggregation; secret redaction; one shared config. Fastify is wired to it via `loggerInstance`, so HTTP request logs match everything else. |
| **Browser** — `widget`, `extension`, `web` **client components** | tiny local `console` wrappers (`widget/src/log.ts`, `extension/src/log.ts`, `web/lib/log.client.ts`) | Pino is Node-only — it must never reach a client bundle. |

> **Rule:** runtime code (services + client bundles) logs through a logger; **build/tooling scripts (`*.mjs`) keep plain `console`** — they're one-shot terminal output, not a running service.

### Levels & environment defaults (Node services)

Standard Pino levels: `trace < debug < info < warn < error < fatal` (+ `silent` to mute). A logger emits everything **at or above** its threshold.

| `NODE_ENV` | Default level | Default output |
|---|---|---|
| `development` (unset) | **`debug`** | **pretty**, colorized (in an interactive TTY) |
| `production` | **`info`** | **JSON**, one line per log |

Every line is tagged with its `service` (`api` / `worker` / `synthesis` / `retrieval` / `web:*`), and **secrets are redacted** (`authorization`, `token`, `apiKey`, `password`, `secretAccessKey`, … → `[redacted]`) so they can't leak into logs.

### The env knobs

| Var | Applies to | Effect |
|---|---|---|
| `LOG_LEVEL` | all Node services | Force the threshold: `trace`·`debug`·`info`·`warn`·`error`·`fatal`·`silent`. Overrides the `NODE_ENV` default. |
| `LOG_PRETTY` | all Node services | Force the shape regardless of env: `1` = pretty, `0` = JSON. (Default: pretty in a dev TTY, JSON otherwise.) |
| `NEXT_PUBLIC_LOG_LEVEL` | Studio **client** bundle | **Build-time** browser log level (inlined by Next). Default: `warn` in prod, `debug` in dev. |

All are documented in the root [`.env.example`](../.env.example).

### Turn logging up/down — **non-prod (local)**

Default local dev already gives you `debug` + pretty. To change it, set the var in the service's `.env` (or inline for one run):

```bash
# quieten the worker to warnings+ for one run
LOG_LEVEL=warn pnpm --filter @flowbuddy/api worker
# silence a service entirely
LOG_LEVEL=silent pnpm --filter @flowbuddy/api dev
# force JSON locally (e.g. to eyeball exactly what prod emits)
LOG_PRETTY=0 pnpm --filter @flowbuddy/api dev
```

### Turn logging up/down — **prod servers**

Prod defaults to `info` + JSON (`NODE_ENV=production` is set in the Dockerfiles). `LOG_LEVEL=info` is also set explicitly on the Render services in [`render.yaml`](../render.yaml). To change it live, edit the env var in the Render dashboard — **no code redeploy needed** (Render restarts the service on an env change):

```bash
LOG_LEVEL=debug   # trace a request path in prod (verbose — set back to info after)
LOG_LEVEL=warn    # quieten a noisy service to warnings + errors only
```

Full prod steps: [`deploy.md` → Logging in production](deploy.md#25-logging-in-production).

### Browser surfaces (special cases)

- **Studio client components** — level is baked at build via `NEXT_PUBLIC_LOG_LEVEL` (default `warn` in prod so end-user consoles stay clean).
- **Widget** — runs on **customers' sites**, so it logs **nothing by default**. Opt in per embed with `data-flowbuddy-debug="true"` on the `<script>` tag, or `window.FlowBuddyDebug = true` before it loads.
- **Extension (recorder)** — `debug`/`info` are **compiled out of production builds** (`NODE_ENV=production pnpm --filter @flowbuddy/extension build` — the Web Store artifact); `warn`/`error` always print. A plain `pnpm build` / `pnpm watch` keeps verbose logging for local dev.
