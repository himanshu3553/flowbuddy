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
| Chrome store version + live/pending | [`docs/ops/extension-releases.md`](docs/ops/extension-releases.md) |
| Env var names & defaults | `.env.example` |
| Deploy spec | `render.yaml` / `render.dev.yaml` |
| npm scripts | `package.json` |
| Schema, column defaults, legal values | `packages/db/prisma/schema.prisma` |
| Mode vocabulary, defaults, fail-closed rule | `packages/shared/src/copilot-mode.ts` (test-enforced) |
| Tuning constants (weights, caps, timeouts, TTLs) | the source file's header comment |
| How to test anything | [`docs/ops/e2e-testing.md`](docs/ops/e2e-testing.md) |
| Logging | [`docs/ops/dev-setup.md`](docs/ops/dev-setup.md) §7 |

**Banned in docs:**
- **As-built file maps** ("Where it lives", route tables, component paths, `foo.ts` name-drops in prose). This file + the source own these.
- **Dated changelogs / build logs / "✅ shipped 2026-xx-xx" RCA entries.** `git log` is the changelog. A shipped fix leaves at most a one-line trap note, and only if a future editor could silently re-break it.
- **Removed-code inventories.** Standing rule: removed code is not done.
- **Status tables outside `roadmap.md`.** Phase docs carry `Status: roadmap.md §N.`
- **Second copies of a decision** ("as also noted in…"). Link instead.
- **`Last updated` / `Branch:` stamps.** Git knows.
- **Status or version in a folder name.** `docs/` groups by *who's asking*, never by what's shipped — a doc must not move when it ships. (The portal already migrated V1 → V2 once.)
- **Version numbers** outside `extension-releases.md` (exception: a compatibility floor, e.g. "requires recorder ≥ v0.7.0").

**Altitude scope — three layers, and two of them may not carry anything volatile:**
- `docs/product/` · `docs/build/` · `docs/ops/` = **decisions**. Why we chose this, what we rejected, what's locked. No paths, no routes, no statuses, no constants.
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
| `synthesis` | The OpenAI pipeline (capture → KB) **and the copilot answer engine: one shared loop (`engine.ts`) in three configurations** — Copilot mode (KB-reading tools), the floor beneath it (same prompt, one round, nothing bound), and the diagnostic path. Also owns the shared retrieval / no-leak seam and the embedding half. The repo's tests live here. |
| `api` | Fastify service (ingestion + copilot routes) **and** the BullMQ worker. Ingestion is three routes: sign presigned upload URLs, finalize, discard. |
| `web` | Next.js **Studio** — Tailwind + shadcn/ui on the indigo brand. **Convention: every server-mutating action shows a success/error toast.** The Copilot page's preview **is** the real widget. |
| `widget` | The embeddable copilot `<script>` (+ a lazy image-tier renderer bundle — deploy them as siblings). Appearance is live-served from Studio at mount; the snippet carries only src/api/key. It is an overlay and **never touches the host page's layout**. |
| `extension` | Chrome MV3 recorder. Uploads artifacts straight to object storage while recording; the finalize request carries the manifest and nothing else on a healthy connection. |
| `landing` | Static marketing page for flowbuddyai.com. |

*(`portal` — the V2 public help site — is built in Version 2 and is not in this workspace.)*

---

## Where we are

**Version 1 is a pure copilot arc:** Phase 1 **Copilot** ✅ → Phase 2 **Sense + Reason** ✅ → Phase 3 **Self-validation** (the moat, unplanned) → Phase 4 **Autopilot** (opened ahead of Phase 3; the guided walkthrough is built, the acting modules are not). **Phase 5 Converse** is draft with its first slices shipped. **Phase 6 Interop** and **Version 3** are captured directions. Per-module status: [`docs/roadmap.md`](docs/roadmap.md).

**The copilot has two operating modes**, founder-selected per workspace and switchable both ways: `Copilot` (the read-only agent — **what every workspace gets, and the fail-closed floor**) · `AI Agent` (acting; not built, never a default). A third rung, `AI Chatbot`, was **retired 2026-08-02** (D10) — its engine survives as the unsellable fallback beneath a failed loop. The direction and the ten decisions behind it: [`docs/build/agent.md`](docs/build/agent.md).

---

## Traps — things a future change will silently re-break

- **`NEW_WORKSPACE_MODE` and `DEFAULT_COPILOT_MODE` are deliberately SEPARATE — and now hold the SAME VALUE, which makes collapsing them look like obvious tidying.** It isn't: the day the product default climbs to `AI Agent`, the floor must not follow, or every typo and every rolled-back row becomes an acting agent. Since AI Chatbot was retired the floor's rule is no longer "the rung that can do least" but **the rung that cannot ACT** — `copilot-mode.test.ts` enforces exactly that. `parseCopilotMode` fails closed by design, which is also how a pre-retirement `chatbot` row reads forward with no special case.
- **Web can only VALUE-import `shared` by subpath** (`@flowbuddy/shared/copilot-mode`) — Next's bundler can't resolve the barrel's `./x.js` re-exports. Type-only imports from the barrel are fine.
- **The answer loop de-dups tool calls on name + ARGUMENTS, not name.** Name alone refused the re-search-with-different-words its own prompt asks for.
- **The copilot once answered the PREVIOUS question**, because a bare `Question:` at the foot of the item block lost a salience contest to the earlier turn's short clean line. The fix was **labelling the message, not adding a prompt rule** — the rule did not work (0/10 → 10/10 on every path). Prompt *placement* beats prompt *instruction* here.
- **The FLOOR's prompt must never promise a tool it does not have.** The agent's prompt is assembled in two configurations (`agentSystem(hasTools)`); with nothing bound, "search first, then answer" and `get_workflow` become instructions the model cannot follow, and it invents a decline at the exact moment the user has already hit one failure. `agent-prompt.test.ts` pins it. Also note the floor is **no longer exercised by ordinary traffic** now that it is not a sold tier — a run of `engine: "floor"` rows is a reliability signal, and the only thing that will tell you it fired.
- **Prisma bakes scalar defaults at `prisma generate` time** and sends them explicitly — the client, not the column, is what a create applies.
- **Every model call speaks `/v1/responses`, and must keep doing so.** Reasoning models reject an explicit `temperature`, and refuse function tools alongside reasoning on `/v1/chat/completions` — both as hard 400s. "Simplifying" any call back to chat-completions re-breaks the agent loop and the diagnostic path while leaving the no-tools floor working, which makes it look like a feature bug rather than a transport one. Decision + costs: [`docs/product/architecture.md`](docs/product/architecture.md) §Provider API.
- **Segmentation is no longer deterministic.** `temperature: 0` is not expressible on a reasoning model, so workflow boundaries and titles drift between runs of identical code. Never judge segmentation quality from a single run — `pnpm kb:drift` measures the spread.
- **Liveness is enforced in SIX independent approval readers, not one.** `CopilotApproval` is queried directly by retrieval, the sense plan, sense-hypothesis validation, continuity keys, the agent's by-key `get_workflow` and walkthrough-start. Every one must filter **`inactiveReason: null`** — the ONE test, deliberately a single column so a new way to be retired is a new *value*, never a second flag six places have to remember. A reader that forgets it silently serves content the founder retired, and the by-key fetch bypasses ranking entirely so it leaks a whole workflow. Any new reader must choose live-only (almost always) or all-approvals (Studio's "Not answering" view) **on purpose**.
- **Routes are compared as PATTERNS, never as strings — and there is exactly ONE implementation.** `shared/route-pattern.ts` is used by retrieval, the sense shard, the widget probe and the walkthrough; it was three copies of string equality, which meant nothing localized at all on any product whose URLs carry record ids. Two edges a future change will reach for: the id classifier is narrow **on purpose** (a slug like `2024-year-in-review` must never read as an id, because a false positive fuses two different screens, while a missed id merely costs a signal), and `routePattern` is **idempotent** — that is what lets the widget send a pattern as its sense-plan key and the server pattern it again. Anything a human is SHOWN goes through `displayRoute`: a recorded route is the founder's own URL, and an id in it is a real record out of their account.
- **A retrieval bias that can evict is a filter — the window reserves 8 of 24 slots for pure relevance.** Route/sense/continuity are documented as biases the answer model may overrule, but they are applied in RETRIEVAL, which decides what the model is ever shown. Nothing bounded how many items could claim one: on a hub page holding 23 of 46 items the route boost evicted the only step that answered the question, and the copilot declined honestly on evidence it never saw. Two rules follow. `RELEVANCE_RESERVE` guarantees membership, never ORDER (promoting reserved items puts keyword noise above what a positional question needs); and the agent's **`search_knowledge` passes no context at all** — it has already read the page and stated its intent in its own words, and it only sees the top 12 results, so a page bias there silently costs it the answer. Do not "make the call sites consistent" by handing them back.
- **Sense ships a CANDIDATE LIST for the question to choose from — do not narrow it back to the top two.** On a hub page many workflows tie on DOM evidence alone (measured: eight, all at 0.80), so pre-filtering before the question is consulted makes the winner arbitrary and the answer then replays a workflow from step 1 while the user stands on step 3's screen. The probe is question-blind ON PURPOSE; the answer model is the chooser. Two rules keep that from backfiring: the list is capped at 6, and only the **top 2** become retrieval boosts — a list is for choosing from, a boost applied to six workflows floods the window it exists to nudge.
- **Sense places a user by URL *and* by what the page SHOWS — and the second one exists because the first has a floor.** Screen fingerprints (`shared/screen-fingerprint.ts`) are founder-derived data shipped DOWN and compared on the user's machine — the same posture as the sense plan, NOT the "scrape the end-user's page and send it up" architecture §A2 rejected. Three edges: matching is **recall of the recorded anchors, never equality** (the founder's account says "Acme", the customer's says "Globex"); the title **multiplies** that evidence rather than adding to it, or a shared "MyApp" title would carry half-matches over the line; and a screen is keyed by a RUN of events, not by its route, or a one-path app collapses into one screen and identifies nothing. The precedence **exact route → recognised screen → ancestor route** is deliberate — the middle rung outranks the loose match that once pointed users at a sidebar link.
- **The approval GATE keys on workflow identity; the ranking SIGNALS key on position. That asymmetry is deliberate.** Route, sense and continuity match `sourceId:segmentIndex` because that is what the widget reports about where the user is standing; the gate reads `workflowId`. It looks like an inconsistency and is not: a wrong signal costs one mediocre answer, a wrong gate leaks unapproved content. Do not "unify" them by moving the gate back onto positions.
- **A workflow's DESCRIPTION is model output inside the trust boundary.** Steps are anchored — each cites a real captured event and is validated against those ids. The description is prose a model wrote, and the copilot answers from it in BOTH modes. Any surface where a founder approves a workflow must therefore SHOW it; a new approval screen that omits it silently narrows what approval covers. Its safety rule is that it never restates a click target — no overlap is what makes plan-and-steps unable to contradict each other, which is why nothing downstream needs a precedence rule.
- **The DIAGNOSTIC path renders knowledge items separately from the agent, on purpose.** `engine.ts formatItems` is the agent's — and, since AI Chatbot was retired, also the floor's, because the floor is now that same prompt with nothing bound. Only the diagnostic path still inlines its own. The freeze is about TUNING, not capability: something wrong for both (the workflow plan was) lands in both deliberately, each measured on its own baseline. *(This trap used to have three copies and a sharper edge — forgetting the third left the safety floor answering worse than the tier above it. Retiring that mode deleted the copy rather than documenting it, which is the cheaper way to close a trap when you can.)*
- **Duplicate detection needs TWO signals — and the last step is the one that works.** A workflow's identity is its destination, not its journey. A single averaged similarity lets shared navigation ("Click Home") outvote the goal in a short workflow, which produced a real false positive between two unrelated tasks. Measured: the average separated true from false by 0.054, the last step by 0.280. Never collapse it back to one score.
- **A workflow's identity is a row, not a position — and a reprocess re-matches it BY CONTENT.** This closed the last hole in the trust boundary (an approval used to follow `segmentIndex` onto whatever a re-split put there). The worker fingerprints the stored workflows *before* deleting their steps, embeds the new ones, and only reuses an identity when the content still agrees. Both kinds of no-match fail closed: a new workflow is born unapproved, and one that lost its content is detached with its approval moved to `needs_review`. **Never reintroduce position-matching in the worker**, and note the corollary: on a reprocess an embedding failure is FATAL by design — without vectors identity cannot be verified, and the alternatives are guessing (the original bug) or unapproving a whole KB over a transient API blip.
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
