# FlowBuddy

**FlowBuddy is an embeddable AI help copilot any SaaS adds in minutes** — record your product once, approve the workflows it may use, drop in one `<script>`, and your customers get in-app answers grounded **only** in approved knowledge. The product is **copilot-first**; a help portal + articles are decoupled by-products (Version 2).

**Docs (`docs/`) — start with the map:**

*Grouped by role: orientation → build specs (shipped · forward) → operations → reference → go-to-market → archive.*

**Orientation — start here**

| Doc | Role |
|---|---|
| [`roadmap.md`](docs/roadmap.md) | **The map** — versions → phases → modules + status + legacy-ID map. Start here. |
| [`product.md`](docs/product.md) | What FlowBuddy is, who it's for, **why copilot-first** (decision record + grounding model). |
| [`architecture.md`](docs/architecture.md) | Technical model — the 3 modules (Capture → KB → Article creation), KB schema, decisions. |

**Build specs — shipped (Version 1, live)**

| Doc | Role |
|---|---|
| [`phase-1-copilot.md`](docs/phase-1-copilot.md) | **Phase 1 (copilot)** — scope/DoD + per-module plan & as-built + capture contract + backlog. |
| [`phase-2-sense.md`](docs/phase-2-sense.md) | **Phase 2 (Sense + Reason) — ✅ BUILT + live.** **Part A · Sense** (P2-M0…M4): the copilot localizes the end-user to **workflow + step** (ask-time read-only locator probe; hybrid — client scores → top-k hypotheses ride `/answer` → the LLM disambiguates with the question) and answers **positionally** (unstick step k → path; position re-measured every message, never advances from chat alone; tie → "X or Y?") + Studio toggles (Sense, "show me") + the Analytics "Where users get stuck" card. **Part B · Reason** (P2-M5): diagnostic — selective trigger (diagnostic wording · blocked step · fast-path-decline escalation) → ask-time structured page-state capture (web-standards only; values masked; end-user-silent, founder toggle + disclosure snippet) ± a lazy clone-masked page image → `diagnoseFromKB` agentic read-tool loop over expected-vs-actual (the founder's TRUE step screenshot + captured DOM); the loop is the skeleton Phase 4 inherits. Doc holds the trust-ladder posture split, the image value analysis, the Sense→Reason flow, and both as-built file maps. |
| [`kb-step-distillation.md`](docs/kb-step-distillation.md) | **KB step quality (built)** — distill raw capture events → clean per-workflow steps (heuristics + LLM); design + as-built. |

**Build specs — forward (planned · draft · direction)**

| Doc | Role |
|---|---|
| [`unified-agent.md`](docs/unified-agent.md) | **The Unified Agent — 📝 DIRECTION · decisions locked 2026-07-25, design not yet written. Read before Phase 4/5 work — §0 is the plain-language orientation (Phase 4 = hands · Phase 5 = brain · unified agent = one assistant using both), with the end-to-end user scenario and the where-we-are table.** One chat, one agentic loop, one grounded tool surface: **Tell · Show · Do become tools the agent calls turn by turn**, not tiers it routes to once — because help isn't modal but the product currently is. **The line: unify deliberation, never actuation** — *the agent's action space is the KB, not the DOM* (`execute_step(workflowId, k, inputs)`, never `click(selector)`), enforced in the tools, not the prompt. Most primitives already exist (retrieval · `probeForAsk` · `read_page_state` · `spotlight` · walkthrough); `diagnoseFromKB` is the loop, promoted. **⭐ D9 — THREE OPERATING MODES, and the boundary is at *acting*, not at *the agent*: `1 Copilot` (today, unchanged — and the runtime fallback) · `2 Agent (read-only)` (the unified loop; Tell+Show+diagnose fluidly, `execute_step` NOT bound) · `3 Agent (acting)`. Founder-selected per workspace, strictly ordered, and ALSO THE PRICING TIERS (2026-07-26).** Tell/Guide are copilot (the user is the actor); **Do transfers accountability** — a wrong button is a tooltip in Guide and a liability event in Do. The read-only half is ~zero-risk, so it is *not* gated behind the risky half. Build spec per mode = §4 "D9 in practice"; two triads not to conflate — Tell/Guide/Do = what the user gets, Copilot/read-only/acting = how it's orchestrated + what's permitted. **9 locked decisions (§4):** one agent · triage per question (fast path preserved, loop = escalation) · **point-and-type for sensitive input** (agent highlights the *host app's own* field, user types there — the value never enters FlowBuddy) · manual-only advancement · sensing informs / the click decides · never infer intent but always detect navigation · founder control = capability posture + spend cap, not a latency dial · **conversational offer / structured consent** ("Want me to do this?" is an agent move; the commitment is a typed affordance — and an un-permitted workflow gets **absence, not refusal**: don't bind the tool). §5 answers **"do we still need Phase 4?"** — yes, 3 of 4 modules survive; the UX half is absorbed, **P4-M2 stays the critical path**, and M1/M3 become *more* load-bearing once the discrete "act" button disappears. Dissolves P5-M3. Carries the **`CopilotQuery.question` raw-PII finding** (§6) + the 5 open questions blocking design (§7 — transport is load-bearing). |
| [`phase-4-autopilot.md`](docs/phase-4-autopilot.md) | **Phase 4 (Autopilot / agentic execution) — 🔄 opened ahead of Phase 3.** **P4-M0 guided walkthrough ✅ BUILT (§8 as-built)** — "Walk me through it" on positional answers: sticky highlight per step + progression observation (auto-detect + Next fallback), cross-nav resume via the widget's only sessionStorage key, safe-stop over guessing, one `CopilotWalkthrough` row per run; zero-acting, default OFF, needs Sense. The acting modules (P4-M1…M3: gate · execution driver · safety rails) remain to plan — M1's eligibility gate takes pluggable signals so Phase-3 certification slots in later. **⚠️ Structure superseded in spirit by [`unified-agent.md`](docs/unified-agent.md) (2026-07-25)** — Phase 4 becomes the *acting tool layer* under one agent; module detail here stays authoritative, and **P4-M2 is the critical path**. |
| [`phase-5-converse.md`](docs/phase-5-converse.md) | **Phase 5 (Converse / the goal-based agent) — 📝 DRAFT design.** The copilot as a goal agent: understand what the user is trying to accomplish → offer the right intensity — **Tell** (SOP in chat) → **Guide** (P4-M0 walkthrough) → **Do** (confirmed end-to-end execution, narrated in chat). **P5 = brain (goal → plan → consent → narration → chaining), P4 = hands (execute one approved workflow).** Modules P5-M0…M4: conversational foundation (chat persistence + continuity retrieval + condensation) · goal thread + posture · Product Profile KB (founder-authored, compiled into the existing KB pipeline) · tier router · execution orchestration. Locked so far: mid-run input prompting = base mechanism; per-goal consent. Open questions §5. **⚠️ Structure superseded in spirit by [`unified-agent.md`](docs/unified-agent.md) (2026-07-25)** — the tier ladder becomes tool choice (P5-M3 dissolves) and §5 Q3 resolves to always-confirm; **P5-M0 remains the correct next build**. |
| [`phase-6-interop.md`](docs/phase-6-interop.md) | **Phase 6 (Interop / the open agent interface) — 📝 DIRECTION · feasibility assessed + transport recommendation drafted (not locked), not yet designed.** Open the approved KB to **third-party AI agents** (Claude-class browser agents, internal agent fleets, custom automations) so they can operate the customer's product — the same grounding opened outward: only workflows approved for the `agents` audience (+ workspace opt-in), recorded values masked, one **two-layer export** (instructional universal · locator machine layer optional; screenshots gated by PII Cut 2). Transports: **remote MCP (v1 lead: per-workspace endpoint, `find_workflow` over hybrid retrieval) · markdown/`llms.txt` (v1 rider) · WebMCP registered by the widget snippet (fleet-wide prepared bet) · bespoke REST skipped.** Feasibility = weeks-scale knowledge-only v1: the P2-M0 sense-plan compiler is P6-M0 in embryo. Extends `ONE KB → per-target approval → {Copilot, Portal, Agents}`; makes "AI-agent compatible" literal for **any web app with workflows** (SaaS · fintech · internal tools). Candidate modules P6-M0…M4 + build sequence. |
| [`v2-portal.md`](docs/v2-portal.md) | **Version 2 portal track (by-products)** — the forward feature list for the help portal & article authoring: render approved workflows as articles + per-audience approval + presentation overlay + productization. All 7 modules (V2 · P0…P6) to build in Version 2. |
| [`v3-company-agent.md`](docs/v3-company-agent.md) | **Version 3 (the company agent / buyer-side track) — 📝 DIRECTION, not designed/scheduled.** The ownership flip: any company records the tools and processes it **uses** (same extension + Studio) → an owned, internal-use-approved workflow/SOP KB → a **second Chrome extension: FlowBuddy's own browser-use agent** that runs those apps for the company — **executes only recorded + approved workflows, never free-form browsing** (the grounded answer to Claude-for-Chrome-class improvisation). One replay core, three drivers (P3 sandbox · P4 widget · V3 extension); consumes P6's export seam; SOP/document renderings sibling to the V2 portal. Candidate modules V3-M0…M4. |

**Operations — build, run, ship, test**

| Doc | Role |
|---|---|
| [`dev-setup.md`](docs/dev-setup.md) | Local dev / tooling (pnpm · Turborepo · docker-compose · Prisma) — and the **canonical logging reference** (§7). |
| [`deploy.md`](docs/deploy.md) | **Render deploy guide — both environments in one doc.** Shared foundations (the **two-blueprint model**: root `render.yaml` = prod from `main` · `render.dev.yaml` = dev from `dev`, custom path; R2, the URL-suffix gotcha, logging, worker-folded-into-api) + the **dev/staging** free-tier walkthrough (first-deploy gotchas) + **production** (FlowBuddyAI.com, ~$30/mo: paid api/web/Postgres + paid persistent Redis, free statics; `app.`/`api.`/`widget.` + apex landing; DNS, as-run runbook incl. extension rebuild + Resend, release flow, upgrades, scaling ladder). **Prod deployed; V1 launched + user-verified E2E.** |
| [`e2e-testing.md`](docs/e2e-testing.md) | **Manual E2E test plan** — clean slate → record → KB → approve → embed → ask → analytics, with per-step PASS signals. **3 levels:** local · dev (Render, incl. data reset) · prod. |
| [`extension-releases.md`](docs/extension-releases.md) | **Chrome Web Store release log (LIVING DOC)** — one entry per store build of the recorder (what shipped · permissions deltas · baked targets · status) + the cut-a-release checklist. **Update it every time a new store build is packaged.** |

**Reference — deep dives**

| Doc | Role |
|---|---|
| [`internals/`](docs/internals/README.md) | **How it RUNS** — low-level per-module mechanics + data flow + a connections map (engineering deep-dive; complements the product docs' *why/what*). Start at `internals/connections.md`. **Follows the code — if a mechanic disagrees with the source, the source wins.** |
| [`design_system/`](docs/design_system/README.md) | **Design system (indigo brand) — the source of truth for ALL UI.** Tokens (colors · type · spacing · elevation), components, the full Studio UI kit, + recorder/widget specs. **Supersedes the Claude Design handoff** (`design_handoff_sync_studio/` — the bundle is retained in-tree as source material). Studio + extension + widget are all token-aligned to it. |
| [`competitive-claude-chrome.md`](docs/competitive-claude-chrome.md) | **Competitive reference: Claude for Chrome (LIVING DOC)** — Anthropic's user-side browser agent (capabilities · permissions/safety model incl. published prompt-injection ASR numbers · rollout timeline) + head-to-head vs FlowBuddy (where we win / lag) + the beat-Claude plays. Feeds Phase-4 design (§5: steal their permissions UX). Re-check on major Anthropic releases. |

**Go-to-market**

| Doc | Role |
|---|---|
| [`landing-page.md`](docs/landing-page.md) | **Landing page (ideas, positioning & structure)** — the flowbuddyai.com marketing page plan: the one-KB → three-consumers story (record → copilot ✅ · portal V2 · third-party agents P6), the "make your product AI-agent-ready" positioning direction (not locked — copilot-first stays canonical), proposed sections + open decisions. Current page = coming-soon card. |

**Archive — historical record**

| Doc | Role |
|---|---|
| [`archive/phase-1-review.md`](docs/archive/phase-1-review.md) | **Phase-1 E2E review (2026-07-03), archived** — the full-codebase audit that drove the post-Phase-1 hardening; nearly all findings landed. Its still-open items live as the **Phase 1 backlog** (roadmap §9). |

---

## Monorepo layout

pnpm + Turborepo. One repo, several packages under `packages/`:

| Package | What it is |
|---|---|
| `shared` | Shared types + zod schemas (capture contract, job contracts). |
| `db` | Prisma schema + client (Postgres). |
| `logger` | **The ONE structured logger for every Node service (Pino).** `createLogger('<service>')` → env-driven level (`debug` in dev, `info` in prod; `LOG_LEVEL` overrides), pretty output in dev / JSON in prod (`LOG_PRETTY` overrides), secret redaction. Consumed by `api` (Fastify wired via `loggerInstance`), `synthesis`, and `web` server-side. Browser surfaces (widget/extension/web-client) use tiny local console loggers instead — Pino is Node-only. See [`docs/dev-setup.md`](docs/dev-setup.md) §7. |
| `synthesis` | OpenAI pipeline — capture → KB synthesis + the copilot answer engine (`answerFromKB`) **+ the shared retrieval/no-leak seam (`retrieval.ts` — HYBRID keyword+pgvector via RRF since P1-M3, 2026-07-07; used by both the api and the Studio preview; DB client injected) + the embedding half (`embeddings.ts` — model/dims source of truth, must match the `vector(1536)` column)**. |
| `api` | Fastify HTTP service (ingestion + copilot routes) **and** the BullMQ worker (`worker` entrypoint). |
| `web` | Next.js **Studio** — copilot-first: app shell (sidebar w/ workspace switcher + user footer; per-page header) over a 6-item nav **Home · Recordings · Knowledge Base · Copilot · Analytics · Settings**; built on **Tailwind + shadcn/ui** under the **indigo brand**, token-aligned to [`docs/design_system/`](docs/design_system/README.md) (cool-gray neutrals, low-sat status palette, radii/shadow ramps, Plus Jakarta Sans + JetBrains Mono). Every screen has empty/loading/error states. **Convention: every server-mutating action shows a success/error toast** (`components/ui/toast.tsx`, top-right, filled status colors). The Copilot page's preview **is the real widget** (iframe host page, `data-flowbuddy-preview` mode — no analytics writes). |
| `widget` | Embeddable copilot `<script>` (esbuild → `flowbuddy-copilot.js` **+ the lazy P2-M5 image-tier renderer `flowbuddy-copilot-render.js`** — html2canvas, loaded on demand, never in the base bundle, deploy beside the widget); **appearance (accent/title/greeting/position/launcher) is LIVE-SERVED from Studio** via `GET /v1/copilot/config` at mount (`data-flowbuddy-*` attrs = per-page overrides that win; snippet = src/api/key only — never bake appearance attrs back in). Design-system chrome + Plus Jakarta Sans/JetBrains Mono (fonts injected document-level), FlowBuddy-indigo default. The open panel is **draggable by its header** (viewport-clamped, per page view) and a header toggle **expands it to near-full viewport height** — always a floating window; it never touches the host page's layout. **P4-M0:** positional answers can offer a **guided walkthrough** (config-gated, zero-acting — step card + sticky highlight + progression observation, resumes across navigations via `sessionStorage`). |
| `extension` | Chrome MV3 recorder; indigo UI aligned to the design system (record/danger = terracotta). |
| `landing` | Static marketing page for **flowbuddyai.com** (v1 = a minimal "coming soon + sign in" card on the design-system tokens; `build` = copy `public/` → `dist/`, served by the `flowbuddy-landing` Render service). |

*(`portal` — the V2 public help site — is not in the current workspace; it's built in Version 2.)*

> **Version 1 = a pure copilot arc (restructured 2026-07-08):** Phase 1 **Copilot** (✅ shipped) → Phase 2 **Sense** (✅ built + user-verified 2026-07-09 — in-context help: read-only locator probe → workflow/step localization → positional answers; **+ P2-M5 Reason** — diagnostic reasoning, ✅ built + user-verified 2026-07-13) → Phase 3 **Self-validation** (sandbox replay, drift — the moat) → Phase 4 **Autopilot** (agentic execution — **opened ahead of Phase 3**, sequencing decision 2026-07-15; **P4-M0 guided walkthrough ✅ built**; the acting modules M1…M3 consume Phase 3's replay core when it lands). **Phase 5 Converse** (the goal-based agent: Tell → Guide → Do) is designed in draft — [`docs/phase-5-converse.md`](docs/phase-5-converse.md). **Phase 6 Interop** (open the approved KB to third-party agents — make any web app AI-agent compatible) is a captured direction — [`docs/phase-6-interop.md`](docs/phase-6-interop.md). **Version 3** (the company agent — buyer-side: any company records the tools it *uses*; a second Chrome extension = FlowBuddy's own grounded browser agent runs them from that KB) is a captured direction — [`docs/v3-company-agent.md`](docs/v3-company-agent.md). **Version 2** holds the by-products + depth: the **Help Portal & Articles track** (renders approved workflows as articles — [`docs/v2-portal.md`](docs/v2-portal.md)), narration/video capture modalities, and the deferred depth buckets. Map: [`docs/roadmap.md`](docs/roadmap.md).

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
pnpm --filter @flowbuddy/api dev        # ingestion API + copilot endpoints → :8787
pnpm --filter @flowbuddy/api worker     # the worker (turns recordings into the KB)
pnpm --filter @flowbuddy/web dev        # Studio → http://localhost:3000

# build the client bundles
pnpm --filter @flowbuddy/widget build      # → dist/flowbuddy-copilot.js + flowbuddy-copilot-render.js (deploy as siblings; load demo/index.html)
pnpm --filter @flowbuddy/extension build   # → packages/extension/dist/ (load unpacked in Chrome)

# build / check everything (Turbo, in dependency order)
pnpm build
pnpm typecheck
pnpm lint

# database (Prisma)
pnpm db:migrate                # apply schema changes
pnpm db:generate               # regenerate the Prisma client
pnpm db:validate               # validate schema.prisma
pnpm --filter @flowbuddy/db exec prisma studio   # browse the DB → :5555
```
