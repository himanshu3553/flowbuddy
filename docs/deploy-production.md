# Production deploy — FlowBuddyAI.com on Render

The production deployment plan (decided 2026-07-16): topology + plans, the domain/DNS layout,
the first-deploy runbook, how ongoing releases flow, and the **scaling ladder** for when load grows.
For the free-tier mechanics (Dockerfiles, blueprint gotchas, troubleshooting) see
[`deploy-render.md`](deploy-render.md) — everything there about *how the services work* applies to
prod too; this doc is about the *production* configuration and process.

---

## 1. The three environments

| Environment | Where | Branch | Config | Purpose |
|---|---|---|---|---|
| **Local dev** | your machine | any | `docker-compose` (Postgres + Redis + MinIO) + `pnpm dev` per package — [`dev-setup.md`](dev-setup.md) | day-to-day development |
| **Cloud dev / staging** | Render, free tier | `dev` | the `flowbuddy-dev-*` services, created fresh 2026-07-17 ([`deploy-render.md`](deploy-render.md)); free Postgres self-deletes every 30 days — treat as disposable | cloud E2E testing (recorder → prod-like URLs), demoing |
| **Production** | Render, paid | `main` | the `flowbuddy-*` services below, fronted by **FlowBuddyAI.com** custom domains | the live product |

`main` receives code only by explicit fast-forward from `dev`, so **every push to `main` is a
production deploy** (Render auto-deploys the connected branch).

---

## 2. Production topology + cost (locked 2026-07-16)

**~$30/month.** Seven resources, distinct `flowbuddy-*` names (so they coexist with the dev
`flowbuddy-dev-*` services in the same Render workspace):

| Resource | Type | Plan | Custom domain | Role |
|---|---|---|---|---|
| `flowbuddy-landing` | Static site | **Free** | `flowbuddyai.com` + `www` | marketing landing page (`packages/landing`) |
| `flowbuddy-web` | Web (Docker) | **Starter $7** | `app.flowbuddyai.com` | the Studio (Next.js) |
| `flowbuddy-api` | Web (Docker) | **Starter $7** | `api.flowbuddyai.com` | copilot answer API + ingestion **+ the embedded synthesis worker** (`start:all`) |
| `flowbuddy-widget` | Static site | **Free** | `widget.flowbuddyai.com` | serves `flowbuddy-copilot.js` + `flowbuddy-copilot-render.js` (both, always, from one build) |
| `flowbuddy-db` | PostgreSQL | **Basic-256mb $6** (+$0.30/GB extra storage) | — | the database (durable — no 30-day deletion) |
| `flowbuddy-redis` | Key Value | **Starter $10** | — | BullMQ synthesis queue (persistent) |
| `flowbuddy-r2` | Env group | — | — | shared Cloudflare R2 credentials (prod bucket) |

### Decisions recorded (and their trade-offs)

- **Worker stays folded into the API** (`start:all`, exactly like the free config). Synthesis is
  almost entirely I/O-bound (Whisper/GPT-4o/embedding network calls), so it barely contends with
  answer traffic, and the combo is proven on the same 512MB footprint. Trade-off: a deploy restarts
  the process and kills an in-flight synthesis job (`attempts=1`, no auto-retry — fix is
  re-recording). Split it out at **Scale step 1** (§7) when that starts to hurt.
- **Key Value is paid (Starter $10) — revised 2026-07-17 at first deploy.** The original "stays
  free" decision hit a platform limit: Render allows only **one free Key Value instance per
  workspace**, and the dev environment holds it (`flowbuddy-dev-redis`). Paying for the prod one
  also buys **persistence** — the "a restart drops a queued job" caveat is gone in prod, which was
  Scale step 2's first option, arrived early. (`maxmemoryPolicy: noeviction` stays set.)
- **Studio is paid (Starter)** — customers (SaaS founders) sign up and work here; a ~1-min
  free-tier cold start on the dashboard reads as "broken product".
- **The API is paid and always-on, non-negotiable** — it serves *end-users of customers* on every
  widget question; a cold start there is a broken copilot on someone else's site.
- **Postgres is paid, non-negotiable** — the free plan self-deletes after 30 days; prod data must
  be durable. Paid plans also get point-in-time recovery.
- **Migrations stay in the start command** (`start:all` runs `prisma migrate deploy` before boot).
  Migrations are additive; on paid plans Render health-checks the new instance before switching
  traffic, so the old instance keeps serving while the new one migrates. Moving to a
  `preDeployCommand` happens at Scale step 1 together with the worker split.

---

## 3. Domains & DNS

Registrar: **GoDaddy**, and DNS is hosted there too (as-built 2026-07-17 — the original plan said
Cloudflare, but only R2 lives on Cloudflare; GoDaddy has no proxy layer, so Render provisions and
renews TLS itself with no extra care). ⚠️ First-deploy gotcha (hit live): **delete the registrar's
default parking A records on the apex** (e.g. `13.248.243.5` / `76.223.105.230`) — with stray A
records present, DNS round-robins to parking servers AND Render won't verify the apex or issue its
certificate. GoDaddy doesn't flatten CNAMEs at the apex — use the A record.

| Record | Type | Points to |
|---|---|---|
| `flowbuddyai.com` | A record (GoDaddy — no apex CNAME flattening) | the apex IP Render shows when you add the domain to `flowbuddy-landing` (currently `216.24.57.1`) |
| `www.flowbuddyai.com` | CNAME | `flowbuddy-landing`'s `*.onrender.com` hostname |
| `app.flowbuddyai.com` | CNAME | `flowbuddy-web`'s `*.onrender.com` hostname |
| `api.flowbuddyai.com` | CNAME | `flowbuddy-api`'s `*.onrender.com` hostname |
| `widget.flowbuddyai.com` | CNAME | `flowbuddy-widget`'s `*.onrender.com` hostname |

Render auto-redirects `www` ↔ apex once both are added to the landing site. The `*.onrender.com`
hostnames may carry a random suffix (the [suffix gotcha](deploy-render.md#8-fix-the-service-urls-the-suffix-gotcha)) —
copy the real ones from the dashboard.

**Why custom domains are set up BEFORE onboarding anyone:** the Studio-generated embed snippet
bakes `FLOWBUDDY_API_URL` + `FLOWBUDDY_WIDGET_URL` into every customer's `<script>` tag. Whatever URL is live
when a customer embeds is a URL you serve forever. With all env URLs set to the custom domains from
day one, `onrender.com` never leaks into a snippet — and the underlying Render service can be
swapped later without breaking a single embed.

---

## 4. The production blueprint (`render.yaml`) — written 2026-07-17

**Two blueprint files ride every branch** (Render supports custom blueprint paths), so FF releases
stay clean and each environment stays YAML-managed:

| File | Environment | Blueprint instance reads it from |
|---|---|---|
| [`render.yaml`](../render.yaml) (repo root, default path) | **Production** — the §2 topology, implemented | branch `main` |
| [`render.dev.yaml`](../render.dev.yaml) (custom path) | Dev/staging — the free-tier config | branch `dev` |

The root file is authoritative for the prod spec — plans, env wiring, and the per-service notes
live there as comments. Highlights: paid api/web/db per §2, `maxmemoryPolicy: noeviction` on the
queue, migrations in the api start command, and the two static sites (widget bundles + the
`packages/landing` page) built with `pnpm install --frozen-lockfile && pnpm --filter <pkg> build`.

### Prod secrets (all `sync: false`)

| Variable | Service | Prod value |
|---|---|---|
| `R2_*` | `flowbuddy-r2` group | the **prod** bucket `flowbuddy-artifacts` + its own Object R/W token — never share the dev bucket, so dev resets can't touch prod artifacts |
| `OPENAI_API_KEY` | `flowbuddy-api` | your `sk-…` |
| `FLOWBUDDY_STUDIO_URL` | `flowbuddy-api` | `https://app.flowbuddyai.com` (Studio origin allowlist-exemption for the real-widget tester) |
| `AUTH_SECRET` | `flowbuddy-web` | fresh `openssl rand -hex 32` — do NOT reuse dev's |
| `AUTH_URL` | `flowbuddy-web` | `https://app.flowbuddyai.com` |
| `FLOWBUDDY_API_URL` | `flowbuddy-web` | `https://api.flowbuddyai.com` |
| `FLOWBUDDY_WIDGET_URL` | `flowbuddy-web` | `https://widget.flowbuddyai.com/flowbuddy-copilot.js` |
| `RESEND_API_KEY` | `flowbuddy-web` | **required in prod** — the default `onboarding@resend.dev` sender only delivers to the Resend account owner, so real signups would never get verification/reset emails |
| `EMAIL_FROM` | `flowbuddy-web` | `no-reply@flowbuddyai.com` (after verifying `flowbuddyai.com` in Resend) |
| `FLOWBUDDY_EXTENSION_URL` | `flowbuddy-web` | the Chrome Web Store listing URL |

Because every URL secret is a custom domain, the onrender suffix gotcha only matters for DNS CNAME
targets — never for env vars or snippets.

---

## 5. First-deploy runbook

**A. Repo prep** (on `dev`, then FF `main`) — **done 2026-07-17**:
1. `render.dev.yaml` added (a copy of the dev config) and the dev blueprint's file path switched to
   it in the dashboard **before** step 2 landed — so the dev blueprint never reads the prod spec.
2. `render.yaml` rewritten to the §4 prod spec.
3. `packages/landing` built — v1 is a minimal "coming soon + sign in" card on the design-system
   tokens (CTA → `app.flowbuddyai.com`); the full marketing page (hero · how-it-works · features)
   upgrades it later.
4. Docs updated; code + docs committed together; `main` FF-synced.

**B. Blueprint-file ordering rule (standing):** any change to the *dev* infra goes in
`render.dev.yaml`; any change to *prod* infra goes in `render.yaml` and reaches Render only via the
`main` FF. Never point a blueprint instance at the other environment's file.

**C. Third-party accounts:**
1. Cloudflare R2 → create bucket `flowbuddy-artifacts` + an Object R/W token scoped to it.
2. Resend → add + verify `flowbuddyai.com` (DNS records at GoDaddy) → key ready.
3. `openssl rand -hex 32` → the prod `AUTH_SECRET`.

**D. Apply the prod blueprint:** Render → New + → Blueprint → this repo → branch **`main`** → fill
the §4 secrets (URL vars get the final custom-domain values immediately) → Apply. Watch
`flowbuddy-api` logs for `All migrations have been successfully applied.` — a fresh DB runs all
migrations (including `CREATE EXTENSION vector`) from scratch; there is no pending-migration bookkeeping.

**E. Domains:** on each service add its custom domain(s) (§3) → create the DNS records at
GoDaddy → wait for certs to issue → verify `https://app.flowbuddyai.com` renders
the sign-in page and `https://widget.flowbuddyai.com/flowbuddy-copilot.js` + `/flowbuddy-copilot-render.js`
both serve. Do this **before** creating any account — `AUTH_URL` already points at the custom
domain, so sign-in via the onrender URL would mis-callback.

**F. Recorder extension — v0.6.0 (decision 2026-07-17: one review cycle):** the store artifact
bakes the Studio URL, so prod needs a rebuild + resubmission. v0.5.0 (dev-baked, in review) gets its
review **cancelled**; v0.6.0 bakes prod + dev + localhost in one artifact:
```bash
STUDIO_URL="https://app.flowbuddyai.com,https://flowbuddy-dev-web.onrender.com,http://localhost:3000" \
  NODE_ENV=production pnpm --filter @flowbuddy/extension build
```
Bump the version, zip from `dist/`, submit, log it in [`extension-releases.md`](extension-releases.md),
set `FLOWBUDDY_EXTENSION_URL` on `flowbuddy-web` once live, then re-run a plain build to restore the
localhost dev `dist/`.

**G. Seed + smoke test:** the prod DB is empty — create the founder account (email verification
works because Resend is live), connect the extension, record + approve the real workflows, then run
the [`e2e-testing.md`](e2e-testing.md) flow against prod: embed on an HTTP-served page → grounded
answer with citations → honest decline → a Sense positional question → a Reason
"why is this button disabled?" diagnosis → analytics populate.

⚠️ **Never point reset/E2E-cleanup scripts at prod** — the data-reset flow in
[`e2e-testing.md`](e2e-testing.md) is for the dev environment only.

---

## 6. Ongoing releases

1. Work lands on `dev`; the dev cloud env auto-deploys it for cloud E2E.
2. On an explicit go: FF-sync `main` → Render auto-deploys all four prod services.
3. Migrations run automatically on `flowbuddy-api` boot (additive-only keeps this safe).
4. Both widget bundles republish automatically (they're one static build).
5. The landing page redeploys only when `packages/landing` changes.
6. Extension releases are independent (store review cycle) — see [`extension-releases.md`](extension-releases.md).

---

## 7. The scaling ladder (future prod)

Each step is a dashboard/plan change plus a small `render.yaml` edit — no re-architecture, and the
custom domains make every underlying swap invisible to customers.

**Step 1 — split the worker out (~$27/mo).**
*Trigger:* synthesis jobs dying on deploys becomes annoying, or answer latency dips while jobs run.
- New `type: worker` service `flowbuddy-worker`, `dockerCommand: pnpm --filter @flowbuddy/api worker`, Starter plan.
- `flowbuddy-api` `dockerCommand` → plain `pnpm --filter @flowbuddy/api start`.
- Move migrations to `preDeployCommand: pnpm --filter @flowbuddy/db exec prisma migrate deploy` on
  `flowbuddy-api` (paid plans support it). *(The standalone-worker blueprint shape is in git
  history — commit `3488326`.)*

**Step 2 — durable queue. ✅ Arrived early (2026-07-17):** prod Key Value is already paid/persistent
(the one-free-instance limit forced it at first deploy — see §2). The remaining lever here is
**cost reduction**, not durability: swap BullMQ for a Postgres-backed queue (pg-boss) and delete
Redis entirely (−$10/mo; a small project: `packages/api/src/queue.ts`, `worker.ts`,
`packages/web/lib/queue.ts`).

**Step 3 — headroom.**
*Trigger:* sustained load. In rough order of likely need:
- Instance bumps: `starter` → `standard` on api/web; Postgres → a larger plan (more RAM/connections).
- **ANN index on the pgvector column** (deliberately deferred at P1-M3) once the KB is big enough
  that exact scans show up in answer latency.
- Horizontal scale on `flowbuddy-api` (it's stateless; the queue and DB coordinate) — requires the
  Step-1 worker split first so N api instances don't each embed a worker.

**Step 4 — ops hardening (any time, cheap):**
- Uptime monitoring on `api.flowbuddyai.com` + `app.flowbuddyai.com` (also keeps first-byte warm).
- Render health-check paths; alerting on failed deploys.
- Log level stays `info` (JSON), tunable live via `LOG_LEVEL` — see
  [`deploy-render.md` §Logging](deploy-render.md#logging-in-production).
- Postgres paid plans include point-in-time recovery; verify the recovery window fits.

---

## 8. Open items

- **Branding — RESOLVED 2026-07-17:** the product is **FlowBuddy** (domain FlowBuddyAI.com). The full
  Sync→FlowBuddy rename ran through code + docs on `dev` (packages, embed contract, env vars, service
  names, Studio/widget/extension strings). (The widget title stays per-workspace configurable.)
- **`packages/landing` v1 BUILT 2026-07-17** as the minimal "coming soon + sign in" card (user
  decision — launch first, market later). The full marketing page (hero · how-it-works · features ·
  CTA; optionally dogfood the live widget as the demo) remains to build on top.
- **Walkthrough (P4-M0)** merged to `main` 2026-07-17 (branches synced at `bf315b6`); its 2 migrations
  auto-apply on the first prod deploy.
