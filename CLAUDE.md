# FlowBuddy

**FlowBuddy is an embeddable AI help copilot any SaaS adds in minutes** — record your product once, approve the workflows it may use, drop in one `<script>`, and your customers get in-app answers grounded **only** in approved knowledge. The product is **copilot-first**; a help portal + articles are decoupled by-products (Version 2).

**Docs (`docs/`) — start with the map:**

| Doc | Role |
|---|---|
| [`roadmap.md`](docs/roadmap.md) | **The map** — versions → phases → modules + status + legacy-ID map. Start here. |
| [`product.md`](docs/product.md) | What FlowBuddy is, who it's for, **why copilot-first** (decision record + grounding model). |
| [`architecture.md`](docs/architecture.md) | Technical model — the 3 modules (Capture → KB → Article creation), KB schema, decisions. |
| [`phase-1-copilot.md`](docs/phase-1-copilot.md) | **Phase 1 (copilot)** — scope/DoD + per-module plan & as-built + capture contract + backlog. |
| [`phase-1-modules-map.md`](docs/phase-1-modules-map.md) | **Phase 1 visual** — Mermaid end-to-end flow (capture → KB → approval → copilot) + package/module map. |
| [`v2-portal.md`](docs/v2-portal.md) | **V2 portal track (by-products)** — the forward feature list for the help portal & article authoring (moved out of Version 1 on 2026-07-08): render approved workflows as articles + per-audience approval + presentation overlay + productization. All 7 modules (V2 · P0…P6) to build in Version 2. |
| [`phase-2-sense.md`](docs/phase-2-sense.md) | **Phase 2 (Sense / in-context help) — ✅ BUILT + user-verified E2E 2026-07-09.** The copilot localizes the end-user to **workflow + step** (ask-time read-only locator probe; hybrid: client scores → top-k hypotheses ride `/answer` → the LLM disambiguates with the question) and answers **positionally** (unstick step k → remaining path; position re-measured every message — never advances from chat flow alone; tie → "X or Y?"). Modules P2-M0…M4 + Studio toggles (Sense, "show me" highlight) + the Analytics "Where users get stuck" card. |
| [`phase-2-reason.md`](docs/phase-2-reason.md) | **P2-M5 (Reason / diagnostic reasoning) — ✅ BUILT + user-verified E2E 2026-07-13 (§8 as-built + hardening + deploy checklist).** Sense locates, Reason diagnoses: selective trigger (diagnostic wording · blocked step · fast-path-decline escalation) → ask-time structured page-state capture (web-standards only; values masked; end-user-silent, founder toggle + disclosure snippet) ± a lazy clone-masked page image → `diagnoseFromKB` agentic read-tool loop over expected-vs-actual (the founder's TRUE step screenshot + captured DOM). Supersedes the old fuzzy-fallback idea; the loop is the skeleton Phase 4 inherits. |
| [`phase-4-autopilot.md`](docs/phase-4-autopilot.md) | **Phase 4 (Autopilot / agentic execution) — 🔄 opened ahead of Phase 3 (sequencing decision 2026-07-15).** **P4-M0 guided walkthrough ✅ BUILT 2026-07-15 (§8 as-built)** — "Walk me through it" on positional answers: sticky highlight per step + progression observation (auto-detect + Next fallback), cross-nav resume via the widget's only sessionStorage key, safe-stop over guessing, one `CopilotWalkthrough` row per run; zero-acting, default OFF, needs Sense. The acting modules (P4-M1…M3: gate · execution driver · safety rails) remain to plan — M1's eligibility gate takes pluggable signals so Phase-3 certification slots in later. |
| [`phase-5-converse.md`](docs/phase-5-converse.md) | **Phase 5 (Converse / the goal-based agent) — 📝 DRAFT design (2026-07-16).** The copilot as a goal agent: understand what the user is trying to accomplish → offer the right intensity — **Tell** (SOP in chat) → **Guide** (P4-M0 walkthrough) → **Do** (confirmed end-to-end execution, narrated in chat). **P5 = brain (goal → plan → consent → narration → chaining), P4 = hands (execute one approved workflow).** Modules P5-M0…M4: conversational foundation (chat persistence + continuity retrieval + condensation) · goal thread + posture · Product Profile KB (founder-authored, compiled into the existing KB pipeline) · tier router · execution orchestration. Locked so far: mid-run input prompting = base mechanism; per-goal consent. Open questions §5. |
| [`competitive-claude-chrome.md`](docs/competitive-claude-chrome.md) | **Competitive reference: Claude for Chrome (LIVING DOC, written 2026-07-15)** — Anthropic's user-side browser agent (capabilities · permissions/safety model incl. published prompt-injection ASR numbers · rollout timeline) + head-to-head vs FlowBuddy (where we win / lag) + the beat-Claude plays. Feeds Phase-4 design (§5: steal their permissions UX). Re-check on major Anthropic releases. |
| [`kb-step-distillation.md`](docs/kb-step-distillation.md) | **KB step quality (built 2026-06-27)** — distill raw capture events → clean per-workflow steps (heuristics + LLM); design + as-built. |
| [`design_system/`](docs/design_system/README.md) | **Design system (indigo brand) — the source of truth for ALL UI.** Tokens (colors · type · spacing · elevation), components, the full Studio UI kit, + recorder/widget specs. Canonical since 2026-06-28; **supersedes the deleted Claude Design handoff** (`design_handoff_sync_studio/`). Studio + extension + widget are all token-aligned to it. |
| [`internals/`](docs/internals/README.md) | **How it RUNS** — low-level per-module mechanics + data flow + a connections map (engineering deep-dive; complements the product docs' *why/what*). Start at `internals/connections.md`. **Follows the code — if a mechanic disagrees with the source, the source wins.** |
| [`e2e-testing.md`](docs/e2e-testing.md) | **Manual E2E test plan** — clean slate → record → KB → approve → embed → ask → analytics, with per-step PASS signals. **3 levels:** local · dev (Render, incl. data reset — absorbed `render-reset-and-test.md` 2026-07-04) · prod (placeholder). |
| [`deploy-render.md`](docs/deploy-render.md) | **Render deploy guide (dev/free tier)** — free-tier blueprint walkthrough (first-deploy gotchas) + the service mechanics shared by every environment. |
| [`deploy-production.md`](docs/deploy-production.md) | **Production deploy (FlowBuddyAI.com) — the plan, locked 2026-07-16.** Topology + plans (~$20/mo: paid api/web/Postgres, free Redis/static, worker folded into api), domain/DNS layout (`flowbuddyai.com` landing · `app.` Studio · `api.` · `widget.`), first-deploy runbook (incl. extension rebuild + Resend), release flow, and the **scaling ladder** (worker split → durable queue → headroom → ops). |
| [`extension-releases.md`](docs/extension-releases.md) | **Chrome Web Store release log (LIVING DOC)** — one entry per store build of the recorder (what shipped · permissions deltas · baked targets · status) + the cut-a-release checklist. **Update it every time a new store build is packaged.** |
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
| `synthesis` | OpenAI pipeline — capture → KB synthesis + the copilot answer engine (`answerFromKB`) **+ the shared retrieval/no-leak seam (`retrieval.ts` — HYBRID keyword+pgvector via RRF since P1-M3, 2026-07-07; used by both the api and the Studio preview; DB client injected) + the embedding half (`embeddings.ts` — model/dims source of truth, must match the `vector(1536)` column)**. |
| `api` | Fastify HTTP service (ingestion + copilot routes) **and** the BullMQ worker (`worker` entrypoint). |
| `web` | Next.js **Studio** — copilot-first: app shell (sidebar w/ workspace switcher + user footer; per-page header) over a 6-item nav **Home · Recordings · Knowledge Base · Copilot · Analytics · Settings**; built on **Tailwind + shadcn/ui** under the **indigo brand**, token-aligned to [`docs/design_system/`](docs/design_system/README.md) (cool-gray neutrals, low-sat status palette, radii/shadow ramps, Plus Jakarta Sans + JetBrains Mono). Every screen has empty/loading/error states. **Convention: every server-mutating action shows a success/error toast** (`components/ui/toast.tsx`, top-right, filled status colors). The Copilot page's preview **is the real widget** (iframe host page, `data-flowbuddy-preview` mode — no analytics writes). |
| `widget` | Embeddable copilot `<script>` (esbuild → `flowbuddy-copilot.js` **+ the lazy P2-M5 image-tier renderer `flowbuddy-copilot-render.js`** — html2canvas, loaded on demand, never in the base bundle, deploy beside the widget); **appearance (accent/title/greeting/position/launcher) is LIVE-SERVED from Studio** via `GET /v1/copilot/config` at mount (`data-flowbuddy-*` attrs = per-page overrides that win; snippet = src/api/key only — never bake appearance attrs back in). Design-system chrome + Plus Jakarta Sans/JetBrains Mono (fonts injected document-level), FlowBuddy-indigo default. The open panel is **draggable by its header** (viewport-clamped, per page view) and a header toggle **expands it to near-full viewport height** — always a floating window; it never touches the host page's layout. **P4-M0:** positional answers can offer a **guided walkthrough** (config-gated, zero-acting — step card + sticky highlight + progression observation, resumes across navigations via `sessionStorage`). |
| `extension` | Chrome MV3 recorder; indigo UI aligned to the design system (record/danger = terracotta). |

*(`portal` — the V2 public help site — is not in the current workspace; it's built in Version 2.)*

> **Version 1 = a pure copilot arc (restructured 2026-07-08):** Phase 1 **Copilot** (✅ shipped) → Phase 2 **Sense** (✅ built + user-verified 2026-07-09 — in-context help: read-only locator probe → workflow/step localization → positional answers; **+ P2-M5 Reason** — diagnostic reasoning, ✅ built + user-verified 2026-07-13) → Phase 3 **Self-validation** (sandbox replay, drift — the moat) → Phase 4 **Autopilot** (agentic execution — **opened ahead of Phase 3**, sequencing decision 2026-07-15; **P4-M0 guided walkthrough ✅ built**; the acting modules M1…M3 consume Phase 3's replay core when it lands). **Phase 5 Converse** (the goal-based agent: Tell → Guide → Do) is designed in draft — [`docs/phase-5-converse.md`](docs/phase-5-converse.md). **Version 2** holds the by-products + depth: the **Help Portal & Articles track** (renders approved workflows as articles — [`docs/v2-portal.md`](docs/v2-portal.md)), narration/video capture modalities, and the deferred depth buckets. Map: [`docs/roadmap.md`](docs/roadmap.md).

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
