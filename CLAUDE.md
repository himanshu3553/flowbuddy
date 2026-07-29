# FlowBuddy

**FlowBuddy is an embeddable AI help copilot any SaaS adds in minutes** — record your product once, approve the workflows it may use, drop in one `<script>`, and your customers get in-app answers grounded **only** in approved knowledge. The product is **copilot-first**; a help portal + articles are decoupled by-products (Version 2).

**Docs live in [`docs/`](docs/README.md).** That file is the map — which doc holds what, and the only place that says so. For what is built and what is next: [`docs/roadmap.md`](docs/roadmap.md).

---

## Doc rules (read before editing any doc)

**One fact, one home.** The same fact never appears at two altitudes — only the same topic does. If you're about to write a fact a second time, write a link.

**Owners — nothing else may state these:**

| Fact | Owner |
|---|---|
| Module/phase status, dates, backlog | [`docs/roadmap.md`](docs/roadmap.md) — the ONLY status surface |
| Which doc holds what | [`docs/README.md`](docs/README.md) — blurbs ≤25 words |
| Chrome store version + live/pending | [`docs/extension-releases.md`](docs/extension-releases.md) |
| Env var names & defaults | `.env.example` |
| Deploy spec | `render.yaml` / `render.dev.yaml` |
| npm scripts | `package.json` |
| Schema, column defaults, legal values | `packages/db/prisma/schema.prisma` |
| Mode vocabulary, defaults, fail-closed rule | `packages/shared/src/copilot-mode.ts` (test-enforced) |
| Tuning constants (weights, caps, timeouts, TTLs) | the source file's header comment |
| How to test anything | [`docs/e2e-testing.md`](docs/e2e-testing.md) |
| Logging | [`docs/dev-setup.md`](docs/dev-setup.md) §7 |

**Banned in docs:**
- **As-built file maps** ("Where it lives", route tables, component paths, `foo.ts` name-drops in prose). This file + the source own these.
- **Dated changelogs / build logs / "✅ shipped 2026-xx-xx" RCA entries.** `git log` is the changelog. A shipped fix leaves at most a one-line trap note, and only if a future editor could silently re-break it.
- **Removed-code inventories.** Standing rule: removed code is not done.
- **Status tables outside `roadmap.md`.** Phase docs carry `Status: roadmap.md §N.`
- **Second copies of a decision** ("as also noted in…"). Link instead.
- **`Last updated` / `Branch:` stamps.** Git knows.
- **Version numbers** outside `extension-releases.md` (exception: a compatibility floor, e.g. "requires recorder ≥ v0.7.0").

**Altitude scope — three layers, and two of them may not carry anything volatile:**
- `docs/*.md` = **decisions**. Why we chose this, what we rejected, what's locked. No paths, no routes, no statuses, no constants.
- [`internals/`](docs/internals/README.md) = **what the code can't tell you**: seams, contracts, invariants, failure modes, and the WHY behind a constant. If the source states it plainly, don't restate it — the source wins on conflict, so a restatement is drift waiting.
- [`plain-english/`](docs/plain-english/README.md) = the **stable core** in ordinary words. Never commands, never status, never a source path. (It has never named a `.ts` file — keep it that way.)

**Per-change budget.** A shipped change should touch **≤3 docs**. If your edit list is longer, you've found a duplication — fix the duplication instead, and say so in the commit. A change users can't SEE touches `internals/` only, or nothing.

**Before adding a section, grep for it.** If it exists, link. If it exists and is wrong, fix it there — don't write a correct version next to it.

---

## Monorepo layout

pnpm + Turborepo. Packages under `packages/`:

| Package | What it is |
|---|---|
| `shared` | Shared types + zod schemas (capture + job contracts) **and `copilot-mode.ts`, the one operating-mode vocabulary.** |
| `db` | Prisma schema + client (Postgres). The schema is the source of truth for every column default. |
| `logger` | The one structured logger for Node services (Pino). Browser surfaces use tiny local console loggers — Pino is Node-only. |
| `synthesis` | The OpenAI pipeline (capture → KB) **and the copilot answer engine: one shared loop (`engine.ts`) in three configurations** — AI Chatbot (no tools), Copilot mode (KB-reading tools), and the diagnostic path. Also owns the shared retrieval / no-leak seam and the embedding half. The repo's tests live here. |
| `api` | Fastify service (ingestion + copilot routes) **and** the BullMQ worker. Ingestion is three routes: sign presigned upload URLs, finalize, discard. |
| `web` | Next.js **Studio** — Tailwind + shadcn/ui on the indigo brand. **Convention: every server-mutating action shows a success/error toast.** The Copilot page's preview **is** the real widget. |
| `widget` | The embeddable copilot `<script>` (+ a lazy image-tier renderer bundle — deploy them as siblings). Appearance is live-served from Studio at mount; the snippet carries only src/api/key. It is an overlay and **never touches the host page's layout**. |
| `extension` | Chrome MV3 recorder. Uploads artifacts straight to object storage while recording; the finalize request carries the manifest and nothing else on a healthy connection. |
| `landing` | Static marketing page for flowbuddyai.com. |

*(`portal` — the V2 public help site — is built in Version 2 and is not in this workspace.)*

---

## Where we are

**Version 1 is a pure copilot arc:** Phase 1 **Copilot** ✅ → Phase 2 **Sense + Reason** ✅ → Phase 3 **Self-validation** (the moat, unplanned) → Phase 4 **Autopilot** (opened ahead of Phase 3; the guided walkthrough is built, the acting modules are not). **Phase 5 Converse** is draft with its first slices shipped. **Phase 6 Interop** and **Version 3** are captured directions. Per-module status: [`docs/roadmap.md`](docs/roadmap.md).

**The copilot has three operating modes**, founder-selected per workspace and switchable both ways: `AI Chatbot` (the safety floor) · `Copilot` (the read-only agent — **what every new workspace gets**) · `AI Agent` (acting; not built, never a default). The direction and the nine decisions behind it: [`docs/agent.md`](docs/agent.md).

---

## Traps — things a future change will silently re-break

- **`NEW_WORKSPACE_MODE` and `DEFAULT_COPILOT_MODE` are deliberately SEPARATE.** The product default may climb the ladder; the fail-closed floor may only descend. **Do not re-collapse them.** `parseCopilotMode` fails closed by design.
- **Web can only VALUE-import `shared` by subpath** (`@flowbuddy/shared/copilot-mode`) — Next's bundler can't resolve the barrel's `./x.js` re-exports. Type-only imports from the barrel are fine.
- **The answer loop de-dups tool calls on name + ARGUMENTS, not name.** Name alone refused the re-search-with-different-words its own prompt asks for.
- **The copilot once answered the PREVIOUS question**, because a bare `Question:` at the foot of the item block lost a salience contest to the earlier turn's short clean line. The fix was **labelling the message, not adding a prompt rule** — the rule did not work (0/10 → 10/10 both modes). Prompt *placement* beats prompt *instruction* here.
- **Prisma bakes scalar defaults at `prisma generate` time** and sends them explicitly — the client, not the column, is what a create applies.
- **The presigner runs with `requestChecksumCalculation: 'WHEN_REQUIRED'`.** The SDK default bakes an empty-body CRC32 into the signed URL, which MinIO ignores and R2 enforces — it passes local dev and fails only in production. Never simplify it back onto the shared client.
- **Two Redis connections, on purpose.** The consumer's must stay bare so BullMQ owns `maxRetriesPerRequest: null`; a blocking consumer that gives up stops consuming. Do not unify them.
- **⏸ Do not fold the diagnostic path into the agent loop yet.** Its prompt is the most heavily tuned in the product and has zero automated coverage. The prerequisite is committed page-state fixtures the baseline can replay (empty form · half-filled · invalid email · rejection banner). **Do not merge it blind.**
- **The KB is only about two workflows deep.** Copilot mode's searching and disambiguating — the whole reason it is better — has barely fired, so every judgment about it is provisional.

---

## Commands

```bash
# one-time
corepack enable && pnpm install

# infra (Postgres + Redis + MinIO)
docker compose up -d           # add -v to `down` to wipe data

# run the stack (separate terminals)
pnpm --filter @flowbuddy/api dev        # ingestion API + copilot endpoints → :8787
pnpm --filter @flowbuddy/api worker     # the worker (turns recordings into the KB)
pnpm --filter @flowbuddy/web dev        # Studio → http://localhost:3000

# build the client bundles
pnpm --filter @flowbuddy/widget build      # deploy both output bundles as siblings
pnpm --filter @flowbuddy/extension build   # → packages/extension/dist/ (load unpacked)

# check everything (Turbo, in dependency order)
pnpm build && pnpm typecheck && pnpm test && pnpm lint

# database (Prisma)
pnpm db:migrate                # apply schema changes
pnpm db:generate               # regenerate the client
pnpm db:validate               # validate schema.prisma
```
