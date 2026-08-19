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
| **Answer-engine + run vocabulary** (`agent\|reason\|floor` · `completed\|aborted\|safe_stop` · `prefill\|typed\|chat`) | `packages/db/prisma/schema.prisma` comment blocks — the same rule as the mode vocabulary, and for the same reason: these are stored strings, so the column that holds them owns what they mean |
| Tuning constants (weights, caps, timeouts, TTLs) | the source file's header comment |
| **The abandoned-recording sweep threshold** | `packages/api/src/server.ts` (`ABANDONED_AFTER_MS`) — an instance of the row above, named because it is the one that keeps escaping into prose |
| **The upload-retry guarantee** ("a retry can never create a second recording") | the CONSTRAINT is `schema.prisma`; the CONTRACT it buys — the required identity header, the 400, what a late finalize replies — is [`docs/internals/ingestion-api.md`](docs/internals/ingestion-api.md) |
| **Recorder ↔ API release ordering** ("store-first") | [`docs/ops/deploy.md`](docs/ops/deploy.md) §7 |
| **Brand tokens (every hex, the indigo ramp)** | `docs/design_system/tokens/colors.css` |
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

**`pnpm docs:check` is the mechanical half of this rule** — it resolves every relative link, heading anchor and `roadmap.md §N` pointer in `docs/` + this file, and flags any doc the map has stopped listing. It cannot see a fact written twice; it does catch the pointer that rotted while nobody was looking, which is the failure a link checker normally can't report.

---

## Monorepo layout

pnpm + Turborepo. Packages under `packages/`:

| Package | What it is |
|---|---|
| `shared` | Shared types + zod schemas (capture + job contracts) **and `copilot-mode.ts`, the one operating-mode vocabulary.** |
| `db` | Prisma schema + client (Postgres). The schema is the source of truth for every column default. |
| `logger` | The one structured logger for Node services (Pino). Browser surfaces use tiny local console loggers — Pino is Node-only. |
| `synthesis` | The OpenAI pipeline (capture → KB) **and the copilot answer engine: one shared loop (`engine.ts`) in three configurations** — Copilot mode (KB-reading tools), the floor beneath it (same prompt, one round, nothing bound), and the diagnostic path. Also owns the shared retrieval / no-leak seam, the embedding half, and the acting substrate the Studio and the worker share: the `ExecutionPlan` compiler and its eligibility verdict (pure, no I/O). **And the demo-video derivation** (`video-*.ts`): a pure camera/timing plan compiler + sharp/ffmpeg renderer that turns a workflow's stored frames + narration into a branded MP4 (roadmap §13). The repo's largest test suite lives here — `widget` gained its own with the acting layer. |
| `api` | Fastify service (ingestion + copilot routes) **and** the BullMQ worker. Ingestion is three routes: sign presigned upload URLs, finalize, discard. |
| `web` | Next.js **Studio** — Tailwind + shadcn/ui on the indigo brand. **Convention: every server-mutating action shows a success/error toast.** The Copilot page's preview **is** the real widget. |
| `widget` | The embeddable copilot `<script>` (+ a lazy image-tier renderer bundle — deploy them as siblings). Appearance is live-served from Studio at mount; the snippet carries only src/api/key. It is an overlay and **never touches the host page's layout** — since the acting layer it may drive the page's own **controls**, but only inside a consented run and only through the one act module (see Traps). It also holds the shared step engine both actors stand on: the guided walkthrough and the acting run. |
| `extension` | Chrome MV3 recorder. Uploads artifacts straight to object storage while recording; the finalize request carries the manifest and nothing else on a healthy connection. |
| `landing` | Static marketing page for flowbuddyai.com. |

*(`portal` — the V2 public help site — is built in Version 2 and is not in this workspace.)*

---

## Where we are

**Version 1 is a pure copilot arc:** Phase 1 **Copilot** ✅ → Phase 2 **Sense + Reason** ✅ → Phase 3 **Self-validation** (the moat, unplanned) → Phase 4 **Autopilot** ✅ v1 (opened ahead of Phase 3; guided walkthrough + the acting layer — consented, narrated agent runs with outcome verification; deferrals in [`docs/build/agent.md`](docs/build/agent.md)). Two more phases sit **beyond** that arc: **Phase 5 Converse** (the goal layer — the brain over Phase 4's hands) and **Phase 6 Interop** (the approved KB opened to outside agents), plus **Version 3** as a captured direction. Per-module status for every one of them — and the only place any of it is asserted: [`docs/roadmap.md`](docs/roadmap.md) (Phase 5 = §11, Phase 6 = §12).

**The copilot has two operating modes**, founder-selected per workspace and switchable both ways: `Copilot` (the read-only agent — **what every workspace gets, and the fail-closed floor**) · `AI Agent` (acting — built; selectable only behind a recorded, versioned terms acceptance, and **never a default**). A third rung, `AI Chatbot`, was **retired 2026-08-02** (D10) — its engine survives as the unsellable fallback beneath a failed loop. The direction and the decisions behind it: [`docs/build/agent.md`](docs/build/agent.md).

---

## Traps — things a future change will silently re-break

*Two tiers, because this list is prepended to every session. The split is NOT "does a source state it" — it is **can the person who would break this be expected to open that file?** A trap whose victim's local run went green stays in Tier 1 however well a header they will never read explains it.*

**Tier 1 — cross-package invariants with no other home.**

- **Web can only VALUE-import `shared` by subpath** (`@flowbuddy/shared/copilot-mode`) — Next's bundler can't resolve the barrel's `./x.js` re-exports. Type-only imports from the barrel are fine.
- **The copilot once answered the PREVIOUS question**, because a bare `Question:` at the foot of the item block lost a salience contest to the earlier turn's short clean line. The fix was **labelling the message, not adding a prompt rule** — the rule did not work (0/10 → 10/10 on every path). Prompt *placement* beats prompt *instruction* here.
- **The floor is no longer exercised by ordinary traffic** now that it is not a sold tier — a run of `engine: "floor"` rows is a reliability alarm, and the only thing that will ever tell you the fallback fired. Nothing in the code says this; Analytics is where you would notice.
- **Prisma bakes scalar defaults at `prisma generate` time** and sends them explicitly — the client, not the column, is what a create applies.
- **Every model call speaks `/v1/responses`, and must keep doing so.** Reasoning models reject an explicit `temperature`, and refuse function tools alongside reasoning on `/v1/chat/completions` — both as hard 400s. "Simplifying" any call back to chat-completions re-breaks the agent loop and the diagnostic path while leaving the no-tools floor working, which makes it look like a feature bug rather than a transport one. Decision + costs: [`docs/product/architecture.md`](docs/product/architecture.md) §Provider API.
- **Segmentation is no longer deterministic.** `temperature: 0` is not expressible on a reasoning model, so workflow boundaries and titles drift between runs of identical code. Never judge segmentation quality from a single run — `pnpm kb:drift` measures the spread.
- **Liveness is enforced in MANY independent approval readers, not one — and the readers are enumerated in exactly one place, deliberately never counted.** `CopilotApproval` is queried directly all over the answer and act paths (the list, and which of them additionally require `executeState: 'enabled'`, is in [`docs/internals/knowledge-base.md`](docs/internals/knowledge-base.md) §6 — a hand-counted integer went stale in three files at once, and a number also silently hides its own scope). Every one of them must filter **`inactiveReason: null`** — the ONE test, deliberately a single column so a new way to be retired is a new *value*, never a second flag every reader has to remember. The acting flag is a SECOND QUESTION on top, not a second liveness flag: a workflow may ANSWER without being RUNNABLE, never the reverse. A reader that forgets the filter silently serves content the founder retired, and the by-key fetch bypasses ranking entirely so it leaks a whole workflow. Any new reader must choose live-only (almost always) or all-approvals (Studio's "Not answering" view) **on purpose**.
- **Routes are compared as PATTERNS, never as strings — and there is exactly ONE implementation.** `shared/route-pattern.ts` is used by retrieval, the sense shard, the widget probe, the walkthrough, the execution-plan compiler and the acting run; it was three copies of string equality, which meant nothing localized at all on any product whose URLs carry record ids. Reach for `===` in a seventh consumer and you re-break it from a file that looks fine. Anything a human is SHOWN goes through `displayRoute`: a recorded route is the founder's own URL, and an id in it is a real record out of their account. *(The matcher's own edges — why the id classifier is deliberately narrow, why patterning is idempotent, why the root matches exactly and never as a prefix while an EMPTY route means unknown — are in that file's header, where whoever changes them will be standing.)*
- **A retrieval bias that can evict is a filter — the window reserves 8 of 24 slots for pure relevance.** Route/sense/continuity are documented as biases the answer model may overrule, but they are applied in RETRIEVAL, which decides what the model is ever shown. Nothing bounded how many items could claim one: on a hub page holding 23 of 46 items the route boost evicted the only step that answered the question, and the copilot declined honestly on evidence it never saw. Two rules follow. `RELEVANCE_RESERVE` guarantees membership, never ORDER (promoting reserved items puts keyword noise above what a positional question needs); and the agent's **`search_knowledge` passes no context at all** — it has already read the page and stated its intent in its own words, and it only sees the top 12 results, so a page bias there silently costs it the answer. Do not "make the call sites consistent" by handing them back.
- **Sense ships a CANDIDATE LIST for the question to choose from — do not narrow it back to the top two.** On a hub page many workflows tie on DOM evidence alone (measured: eight, all at 0.80), so pre-filtering before the question is consulted makes the winner arbitrary and the answer then replays a workflow from step 1 while the user stands on step 3's screen. The probe is question-blind ON PURPOSE; the answer model is the chooser. Two rules keep that from backfiring: the list is capped at 6, and only the **top 2** become retrieval boosts — a list is for choosing from, a boost applied to six workflows floods the window it exists to nudge.
- **Sense places a user by URL *and* by what the page SHOWS — and screen fingerprints are founder-derived data shipped DOWN and compared on the user's machine.** Same posture as the sense plan, NOT the "scrape the end-user's page and send it up" architecture §A2 rejected. That boundary is why the feature was allowed to exist, and it is invisible from any one of the three files implementing it. *(Each mechanic sits where its breaker stands: the scoring rules — recall of recorded anchors never equality, the title multiplying rather than adding — in `shared/screen-fingerprint.ts`; keying a screen by a RUN of events rather than by route in the sense-plan builder; the **exact route → recognised screen → ancestor route** precedence in the widget's sense probe.)*
- **A workflow's DESCRIPTION is model output inside the trust boundary.** Steps are anchored — each cites a real captured event and is validated against those ids. The description is prose a model wrote, and the copilot answers from it in BOTH modes. Any surface where a founder approves a workflow must therefore SHOW it; a new approval screen that omits it silently narrows what approval covers. Its safety rule is that it never restates a click target — no overlap is what makes plan-and-steps unable to contradict each other, which is why nothing downstream needs a precedence rule.
- **Duplicate detection needs TWO signals — and the last step is the one that works.** A workflow's identity is its destination, not its journey. A single averaged similarity lets shared navigation ("Click Home") outvote the goal in a short workflow, which produced a real false positive between two unrelated tasks. Measured: the average separated true from false by 0.054, the last step by 0.280. Never collapse it back to one score.
- **A workflow's identity is a row, not a position — and a reprocess re-matches it BY CONTENT.** This closed the last hole in the trust boundary (an approval used to follow `segmentIndex` onto whatever a re-split put there). The worker fingerprints the stored workflows *before* deleting their steps, embeds the new ones, and only reuses an identity when the content still agrees. Both kinds of no-match fail closed: a new workflow is born unapproved, and one that lost its content is detached with its approval moved to `needs_review`. **Never reintroduce position-matching in the worker**, and note the corollary: on a reprocess an embedding failure is FATAL by design — without vectors identity cannot be verified, and the alternatives are guessing (the original bug) or unapproving a whole KB over a transient API blip.
- **`KnowledgeItem.text` is never written without its re-embed — text and vector move TOGETHER, or the save fails whole.** The worker matches vectors to rows BY TEXT when persisting them, so a text write that skips embedding desyncs retrieval invisibly: bad answers, no error anywhere. The only writers are the worker and Studio's edit actions; any new edit surface must follow the same rule, may touch PROSE only (never the anchor fields — `keyEventId`, `sourceEventIds`, `route`, `bbox`, `screenshotFile`, `evidence`), and must stamp the edit — the stamp is what carries a founder's words through a reprocess (step edits re-attach by `data.keyEventId`; stamped title/description fields are human-owned and the worker keeps them).
- **The presigner runs with `requestChecksumCalculation: 'WHEN_REQUIRED'`.** The SDK default bakes an empty-body CRC32 into the signed URL, which MinIO ignores and R2 enforces — it passes local dev and fails only in production. Never simplify it back onto the shared client.
- **Two Redis connections, on purpose.** The consumer's must stay bare so BullMQ owns `maxRetriesPerRequest: null`; a blocking consumer that gives up stops consuming. Do not unify them.
- **⏸ Do not fold the diagnostic path into the agent loop yet.** Its prompt is the most heavily tuned in the product and its automated coverage is only PARTIAL — three committed page-state fixtures the baseline replays (empty form · half-filled · invalid email) and passes, and the fourth, a rejection banner, is the state the strictest rules were written for and the one the recorded app produces none of. **Do not merge it blind.**
- **`act.ts` is the ONLY code in the product that touches a host page's controls — and the guided path never imports it.** The step engine was extracted from the walkthrough when the acting driver became its second consumer, and it is read-only *by contract*: it answers questions about the page and decides nothing. That is what makes guided mode structurally incapable of acting rather than merely uninterested. Bind the act verbs anywhere else — "share the click helper", "move the fill into the engine" — and the guarantee stops being structural and becomes a convention. The payoff is the other half of the trap: every guided walkthrough in production exercises the same resolution and verification path the acting run trusts, so there must never be two verification codepaths to drift.
- **A rejection surface that APPEARED since the act beats ANY completion evidence — last step included.** Three classes of false "Done" were found in live runs, and each fix is one a tidy-up would undo: only a *newly appeared* rejection convicts (a pre-existing warning does not), and it is found with the same alert-surface detector the diagnostic path uses, so what Reason can see the run cannot miss; a handed-back step gets no last-step shortcut, since with no observed act "nothing left to prove" proves nothing; and a step completed by an OBSERVED act — ours or the user's press — must also show one of its compiled appearance markers, matched by RECALL and never equality. Absence of markers changes nothing; presence tightens, and the tightening is scoped to observed acts on purpose: input steps, hand-back resolutions and navigation completions still earn "done" from element state or page evidence, which is a **known gap** wherever the compiler put markers on a step that finishes some other way. *(Sibling rule, same file, different bug: a direct navigation is tried ONCE and then waits patiently rather than retrying — a login wall resumes by itself the moment the user arrives, and a retry loop just ping-pongs.)*
- **A chat-supplied run input is a message kind that must NEVER be added to EITHER allowlist — storage (`PERSISTED_KINDS`) or the wire (`HISTORY_KINDS`).** Missing non-sensitive values are asked in the chat one at a time and the reply IS the value, so it is never written to session storage, never sent to the answer endpoint, and never logged; the audit row stores only the SOURCE. The enforcement is *absence* from an allowlist, which means a well-meaning "persist the whole thread" or "log the transcript for debugging" change re-opens it with no error anywhere. **Two allowlists because storage is not the wire** — and the wire's was a DENYLIST (everything but `assistant.error`) until it was caught leaking a typed value onto the next question, which is the whole argument: a denylist protects the kinds someone remembered. The mirror rule is just as load-bearing: run narration IS persisted, because it must survive the very navigations the run itself causes. Sensitive fields are always point-and-type into the app's own field — that value never enters FlowBuddy at all.
- **The execution plan is content-hashed and PINNED at consent — run-start answers 409 on drift rather than serving the newer plan.** The audit row's whole claim is "this user consented to exactly this", which is checkable equality; re-pinning on the fly or falling back to the latest plan silently converts consent into a guess. The complement is where the re-verification actually sits: **start** re-checks mode, liveness, the acting flag and the hash and pins consent; the step and terminal audit calls re-check only the workspace's mode and that the run row is this workspace's, then append. So a workflow retired mid-run does not stop at the next audit call — it stops at the next RESUME, where the plan is re-fetched and a revoked or re-hashed plan ends the run quietly. Do not "tighten" the audit appends into full gate checks and assume that is what stops a retired run; the resume fetch is.
- **The KB is only about two workflows deep.** Copilot mode's searching and disambiguating — the whole reason it is better — has barely fired, so every judgment about it is provisional.

**Tier 2 — you cannot break one of these without opening the file that already explains it in full.** Read that header before you change anything there.

- **`NEW_WORKSPACE_MODE` and `DEFAULT_COPILOT_MODE` hold the same value and must STAY separate** — the product default may climb the ladder, the fail-closed floor may only descend. `shared/copilot-mode.ts`, and its test then fails.
- **The answer loop de-dups tool calls on name + ARGUMENTS, not name** — name alone refused the re-search-with-different-words its own prompt asks for. `engine.ts`, `ToolCallRecord` + `canonicalArgs`.
- **The FLOOR's prompt must never promise a tool it does not have**, or it invents a decline at the moment the user has already hit one failure. The ban covers EVERY string assembled for it, not just the system prompt — the knowledge block's header sits in the USER message, closest to the question, and is the one that escaped. `agent.ts`'s `agentSystem(hasTools)` + `knowledgeItemsHeader(hasTools)`; `agent-prompt.test.ts` pins both.
- **The approval GATE keys on workflow identity while the ranking SIGNALS key on position** — deliberate, not an inconsistency, and not to be "unified". `retrieval.ts`.
- **The DIAGNOSTIC path renders knowledge items separately from the agent, on purpose** — a TUNING freeze, not a capability one: something wrong for both lands in both, each measured on its own baseline. `engine.ts formatItems`.

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
