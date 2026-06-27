# Sync

**Sync is an embeddable AI help copilot any SaaS adds in minutes** — record your product once, approve the workflows it may use, drop in one `<script>`, and your customers get in-app answers grounded **only** in approved knowledge. The product is **copilot-first**; a help portal + articles are decoupled by-products.

**Docs (`docs/`) — start with the map:**

| Doc | Role |
|---|---|
| [`roadmap.md`](docs/roadmap.md) | **The map** — versions → phases → modules + status + legacy-ID map. Start here. |
| [`product.md`](docs/product.md) | What Sync is, who it's for, **why copilot-first** (decision record + grounding model). |
| [`architecture.md`](docs/architecture.md) | Technical model — the 3 modules (Capture → KB → Article creation), KB schema, decisions. |
| [`phase-1-copilot.md`](docs/phase-1-copilot.md) | **Phase 1 (copilot)** — scope/DoD + per-module plan & as-built + capture contract + backlog. |
| [`phase-1-modules-map.md`](docs/phase-1-modules-map.md) | **Phase 1 visual** — Mermaid end-to-end flow (capture → KB → approval → copilot) + package/module map. |
| [`phase-2-portal.md`](docs/phase-2-portal.md) | **Phase 2 (by-products)** — portal & article authoring (frozen) + to-build modules. |
| [`kb-step-distillation.md`](docs/kb-step-distillation.md) | **KB step quality (in build)** — distill raw capture events → clean per-workflow steps (heuristics + LLM); design + phased build plan. |
| [`dev-setup.md`](docs/dev-setup.md) | Local dev / tooling (pnpm · Turborepo · docker-compose · Prisma). |

---

## Monorepo layout

pnpm + Turborepo. One repo, several packages under `packages/`:

| Package | What it is |
|---|---|
| `shared` | Shared types + zod schemas (capture contract, content model, job contracts). |
| `db` | Prisma schema + client (Postgres). |
| `synthesis` | OpenAI pipeline — capture → KB synthesis + the copilot answer engine (`answerFromKB`). *(Article-generation engine `synthesize.ts`/`prompt.ts` is present but **parked Phase 2** — see below.)* |
| `api` | Fastify HTTP service (ingestion + copilot routes) **and** the BullMQ worker (`worker` entrypoint). |
| `web` | Next.js **Studio** — copilot-first: app shell (sidebar + top bar) over Home/Recordings/Copilot/Settings; built on **Tailwind + shadcn/ui** (neutral). *(The article editor + generation UI is **parked Phase 2**, removed from the Studio pages but kept dormant in-tree.)* |
| `widget` | Embeddable copilot `<script>` (esbuild → `sync-copilot.js`). |
| `extension` | Chrome MV3 recorder. |

*(`portal` — the Phase-2 public help site — was removed for the Phase-1 clean slate and returns in Phase 2; it's not in the current workspace.)*

> **Phase-2 code is parked, not gone.** As of 2026-06-25 the article/portal **engine** is kept dormant in-tree (still type-checked) while its **Studio UI was removed** so the shipped product is copilot-only. Parked files carry a `// PARKED — Phase 2` banner; the full inventory + re-wiring map is in [`docs/phase-2-portal.md`](docs/phase-2-portal.md) §6. **Don't extend or wire up parked code unless resuming Phase 2.**

---

## Commands

```bash
# one-time
corepack enable
pnpm install

# infra (Postgres + Redis + MinIO)
docker compose up -d
docker compose down            # add -v to wipe data

# run the stack (separate terminals)
pnpm --filter @sync/api dev        # ingestion API + copilot endpoints → :8787
pnpm --filter @sync/api worker     # the worker (turns recordings into the KB)
pnpm --filter @sync/web dev        # Studio → http://localhost:3000

# build the client bundles
pnpm --filter @sync/widget build      # → packages/widget/dist/sync-copilot.js (load demo/index.html)
pnpm --filter @sync/extension build   # → packages/extension/dist/ (load unpacked in Chrome)

# build / check everything (Turbo, in dependency order)
pnpm build
pnpm typecheck
pnpm lint

# database (Prisma)
pnpm db:migrate                # apply schema changes
pnpm db:generate               # regenerate the Prisma client
pnpm db:validate               # validate schema.prisma
pnpm --filter @sync/db exec prisma studio   # browse the DB → :5555
```
