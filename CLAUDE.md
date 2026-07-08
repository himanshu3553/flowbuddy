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
| [`phase-2-portal.md`](docs/phase-2-portal.md) | **Phase 2 (by-products)** — portal & article authoring (frozen) + to-build modules. **§7 = the 2026-07-07 workflows-as-articles direction change + rebuild notes** (the old engine is removed, not resumed). |
| [`kb-step-distillation.md`](docs/kb-step-distillation.md) | **KB step quality (built 2026-06-27)** — distill raw capture events → clean per-workflow steps (heuristics + LLM); design + as-built. |
| [`design_system/`](docs/design_system/README.md) | **Design system (indigo brand) — the source of truth for ALL UI.** Tokens (colors · type · spacing · elevation), components, the full Studio UI kit, + recorder/widget specs. Canonical since 2026-06-28; **supersedes the deleted Claude Design handoff** (`design_handoff_sync_studio/`). Studio + extension + widget are all token-aligned to it. |
| [`internals/`](docs/internals/README.md) | **How it RUNS** — low-level per-module mechanics + data flow + a connections map (engineering deep-dive; complements the product docs' *why/what*). Start at `internals/connections.md`. **Follows the code — if a mechanic disagrees with the source, the source wins.** |
| [`e2e-testing.md`](docs/e2e-testing.md) | **Manual E2E test plan** — clean slate → record → KB → approve → embed → ask → analytics, with per-step PASS signals. **3 levels:** local · dev (Render, incl. data reset — absorbed `render-reset-and-test.md` 2026-07-04) · prod (placeholder). |
| [`deploy-render.md`](docs/deploy-render.md) | **Render deploy guide** — free-tier blueprint walkthrough (first-deploy gotchas) + going-to-production deltas. |
| [`phase-1-review.md`](docs/phase-1-review.md) | **Phase-1 E2E review (2026-07-03)** — full-codebase findings + prioritized P0/P1/P2 recommendations + remediation sequence; annotated as items land. |
| [`dev-setup.md`](docs/dev-setup.md) | Local dev / tooling (pnpm · Turborepo · docker-compose · Prisma). |

---

## Monorepo layout

pnpm + Turborepo. One repo, several packages under `packages/`:

| Package | What it is |
|---|---|
| `shared` | Shared types + zod schemas (capture contract, job contracts). |
| `db` | Prisma schema + client (Postgres). |
| `logger` | **The ONE structured logger for every Node service (Pino).** `createLogger('<service>')` → env-driven level (`debug` in dev, `info` in prod; `LOG_LEVEL` overrides), pretty output in dev / JSON in prod (`LOG_PRETTY` overrides), secret redaction. Consumed by `api` (Fastify wired via `loggerInstance`), `synthesis`, and `web` server-side. Browser surfaces (widget/extension/web-client) use tiny local console loggers instead — Pino is Node-only. See [`docs/dev-setup.md`](docs/dev-setup.md) §7. |
| `synthesis` | OpenAI pipeline — capture → KB synthesis + the copilot answer engine (`answerFromKB`) **+ the shared retrieval/no-leak seam (`retrieval.ts` — HYBRID keyword+pgvector via RRF since P1-M3, 2026-07-07; used by both the api and the Studio preview; DB client injected) + the embedding half (`embeddings.ts` — model/dims source of truth, must match the `vector(1536)` column)**. *(The pre-pivot article-generation engine was **removed 2026-07-07** — see below.)* |
| `api` | Fastify HTTP service (ingestion + copilot routes) **and** the BullMQ worker (`worker` entrypoint). |
| `web` | Next.js **Studio** — copilot-first: app shell (sidebar w/ workspace switcher + user footer; per-page header) over a 6-item nav **Home · Recordings · Knowledge Base · Copilot · Analytics · Settings**; built on **Tailwind + shadcn/ui** under the **indigo brand**, token-aligned to [`docs/design_system/`](docs/design_system/README.md) (cool-gray neutrals, low-sat status palette, radii/shadow ramps, Plus Jakarta Sans + JetBrains Mono). Every screen has empty/loading/error states. **Convention: every server-mutating action shows a success/error toast** (`components/ui/toast.tsx`, top-right, filled status colors). The Copilot page's preview **is the real widget** (iframe host page, `data-sync-preview` mode — no analytics writes). *(The pre-pivot article editor + generation UI was **removed 2026-07-07** — see below.)* |
| `widget` | Embeddable copilot `<script>` (esbuild → `sync-copilot.js`); **appearance (accent/title/greeting/position/launcher) is LIVE-SERVED from Studio** via `GET /v1/copilot/config` at mount (`data-sync-*` attrs = per-page overrides that win; snippet = src/api/key only — never bake appearance attrs back in). Design-system chrome + Plus Jakarta Sans/JetBrains Mono (fonts injected document-level), Sync-indigo default. |
| `extension` | Chrome MV3 recorder; indigo UI aligned to the design system (record/danger = terracotta). |

*(`portal` — the Phase-2 public help site — was removed for the Phase-1 clean slate and returns in Phase 2; it's not in the current workspace.)*

> **Phase-2 article engine: REMOVED 2026-07-07 — superseded by workflows-as-articles.** The pre-pivot article/portal engine (parked in-tree since 2026-06-25) and its `Article`/`Step` tables were swept out: Phase 1's distilled workflows (title + clean steps with screenshots/bboxes) + the approval-gate pattern already provide everything a help article needs, so Phase 2 will **render approved workflows** instead of resuming a parallel synthesis engine. Decision record + rebuild notes (editing overlay · Text→Article · prose polish): [`docs/phase-2-portal.md`](docs/phase-2-portal.md) **§7**; historical inventory + recovery hash: **§6**.

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
