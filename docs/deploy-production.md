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
| **Cloud dev / staging** | Render, free tier | `dev` | the original `sync-*` services ([`deploy-render.md`](deploy-render.md)); free Postgres self-deletes every 30 days — treat as disposable | cloud E2E testing (recorder → prod-like URLs), demoing |
| **Production** | Render, paid | `main` | the `flowbuddy-*` services below, fronted by **FlowBuddyAI.com** custom domains | the live product |

`main` receives code only by explicit fast-forward from `dev`, so **every push to `main` is a
production deploy** (Render auto-deploys the connected branch).

---

## 2. Production topology + cost (locked 2026-07-16)

**~$20/month.** Seven resources, distinct `flowbuddy-*` names (so they coexist with the dev
`sync-*` services in the same Render workspace):

| Resource | Type | Plan | Custom domain | Role |
|---|---|---|---|---|
| `flowbuddy-landing` | Static site | **Free** | `flowbuddyai.com` + `www` | marketing landing page (`packages/landing`) |
| `flowbuddy-web` | Web (Docker) | **Starter $7** | `app.flowbuddyai.com` | the Studio (Next.js) |
| `flowbuddy-api` | Web (Docker) | **Starter $7** | `api.flowbuddyai.com` | copilot answer API + ingestion **+ the embedded synthesis worker** (`start:all`) |
| `flowbuddy-widget` | Static site | **Free** | `widget.flowbuddyai.com` | serves `sync-copilot.js` + `sync-copilot-render.js` (both, always, from one build) |
| `flowbuddy-db` | PostgreSQL | **Basic-256mb $6** (+$0.30/GB extra storage) | — | the database (durable — no 30-day deletion) |
| `flowbuddy-redis` | Key Value | **Free** | — | BullMQ synthesis queue |
| `flowbuddy-r2` | Env group | — | — | shared Cloudflare R2 credentials (prod bucket) |

### Decisions recorded (and their trade-offs)

- **Worker stays folded into the API** (`start:all`, exactly like the free config). Synthesis is
  almost entirely I/O-bound (Whisper/GPT-4o/embedding network calls), so it barely contends with
  answer traffic, and the combo is proven on the same 512MB footprint. Trade-off: a deploy restarts
  the process and kills an in-flight synthesis job (`attempts=1`, no auto-retry — fix is
  re-recording). Split it out at **Scale step 1** (§7) when that starts to hurt.
- **Key Value stays free** (with `maxmemoryPolicy: noeviction` set — a config field, not a paid
  feature). The queue holds tiny job payloads; 25MB is plenty. Trade-off: no persistence — a Redis
  restart in the seconds between upload and pickup drops that job (fix: re-record). Revisit at
  **Scale step 2** (§7).
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

Registrar: FlowBuddyAI.com. Host DNS on **Cloudflare** (account already exists for R2). Keep
records **DNS-only (grey cloud)** so Render provisions and renews TLS itself; if you later want
Cloudflare's proxy, follow Render's Cloudflare guide (Full-strict mode) — don't flip it on blindly.

| Record | Type | Points to |
|---|---|---|
| `flowbuddyai.com` | A (or Cloudflare CNAME-flattened) | the apex IP Render shows when you add the domain to `flowbuddy-landing` (currently `216.24.57.1`) |
| `www.flowbuddyai.com` | CNAME | `flowbuddy-landing`'s `*.onrender.com` hostname |
| `app.flowbuddyai.com` | CNAME | `flowbuddy-web`'s `*.onrender.com` hostname |
| `api.flowbuddyai.com` | CNAME | `flowbuddy-api`'s `*.onrender.com` hostname |
| `widget.flowbuddyai.com` | CNAME | `flowbuddy-widget`'s `*.onrender.com` hostname |

Render auto-redirects `www` ↔ apex once both are added to the landing site. The `*.onrender.com`
hostnames may carry a random suffix (the [suffix gotcha](deploy-render.md#8-fix-the-service-urls-the-suffix-gotcha)) —
copy the real ones from the dashboard.

**Why custom domains are set up BEFORE onboarding anyone:** the Studio-generated embed snippet
bakes `SYNC_API_URL` + `SYNC_WIDGET_URL` into every customer's `<script>` tag. Whatever URL is live
when a customer embeds is a URL you serve forever. With all env URLs set to the custom domains from
day one, `onrender.com` never leaks into a snippet — and the underlying Render service can be
swapped later without breaking a single embed.

---

## 4. The production blueprint (target `render.yaml`)

The repo's single `render.yaml` becomes the **production** blueprint (the dev services keep running
unmanaged — see the runbook step about detaching the old blueprint). Target spec:

```yaml
databases:
  - name: flowbuddy-db
    plan: basic-256mb
    databaseName: sync
    user: sync

envVarGroups:
  - name: flowbuddy-r2
    envVars:
      - { key: R2_ENDPOINT, sync: false }
      - { key: R2_REGION, value: auto }
      - { key: R2_ACCESS_KEY_ID, sync: false }
      - { key: R2_SECRET_ACCESS_KEY, sync: false }
      - { key: R2_BUCKET, sync: false }          # flowbuddy-artifacts (pre-created, prod-only)

services:
  - type: keyvalue
    name: flowbuddy-redis
    plan: free                                    # decision §2 — queue payloads are tiny
    maxmemoryPolicy: noeviction                   # BullMQ-clean semantics (config, not paid)
    ipAllowList: []

  # API + embedded synthesis worker (start:all) — always-on
  - type: web
    name: flowbuddy-api
    runtime: docker
    plan: starter
    dockerfilePath: ./packages/api/Dockerfile
    dockerContext: .
    dockerCommand: pnpm --filter @sync/api start:all
    envVars:
      - fromGroup: flowbuddy-r2
      - { key: PORT, value: 8787 }
      - { key: LOG_LEVEL, value: info }
      - { key: DATABASE_URL, fromDatabase: { name: flowbuddy-db, property: connectionString } }
      - { key: REDIS_URL, fromService: { name: flowbuddy-redis, type: keyvalue, property: connectionString } }
      - { key: OPENAI_API_KEY, sync: false }
      - { key: TRANSCRIBE_MODEL, value: whisper-1 }
      - { key: SYNTH_MODEL, value: gpt-4o }
      - { key: EMBED_MODEL, value: text-embedding-3-small }   # must stay 1536-dim (vector(1536))
      - { key: SYNC_STUDIO_URL, sync: false }                 # https://app.flowbuddyai.com
      # - { key: REASON_MODEL, sync: false }                  # optional stronger vision model for P2-M5

  # Studio — paid so customer dashboards never cold-start
  - type: web
    name: flowbuddy-web
    runtime: docker
    plan: starter
    dockerfilePath: ./packages/web/Dockerfile
    dockerContext: .
    envVars:
      - fromGroup: flowbuddy-r2
      - { key: LOG_LEVEL, value: info }
      - { key: DATABASE_URL, fromDatabase: { name: flowbuddy-db, property: connectionString } }
      - { key: REDIS_URL, fromService: { name: flowbuddy-redis, type: keyvalue, property: connectionString } }
      - { key: AUTH_SECRET, sync: false }
      - { key: AUTH_URL, sync: false }            # https://app.flowbuddyai.com
      - { key: AUTH_TRUST_HOST, value: true }
      - { key: SYNC_API_URL, sync: false }        # https://api.flowbuddyai.com
      - { key: SYNC_WIDGET_URL, sync: false }     # https://widget.flowbuddyai.com/sync-copilot.js
      - { key: RESEND_API_KEY, sync: false }
      - { key: EMAIL_FROM, sync: false }          # no-reply@flowbuddyai.com (Resend-verified domain)
      - { key: SYNC_EXTENSION_URL, sync: false }  # Chrome Web Store listing URL

  # Widget host — publishes BOTH bundles from one build
  - type: web
    name: flowbuddy-widget
    runtime: static
    buildCommand: pnpm install --frozen-lockfile && pnpm --filter @sync/widget build
    staticPublishPath: packages/widget/dist

  # Marketing landing page (packages/landing — static, free)
  - type: web
    name: flowbuddy-landing
    runtime: static
    buildCommand: pnpm install --frozen-lockfile && pnpm --filter @sync/landing build
    staticPublishPath: packages/landing/dist
```

*(The landing service's exact build command/publish path is finalized when `packages/landing` is
built; if it ships as plain static files the build step collapses to a copy.)*

### Prod secrets (all `sync: false`)

| Variable | Service | Prod value |
|---|---|---|
| `R2_*` | `flowbuddy-r2` group | the **prod** bucket `flowbuddy-artifacts` + its own Object R/W token — never share the dev bucket, so dev resets can't touch prod artifacts |
| `OPENAI_API_KEY` | `flowbuddy-api` | your `sk-…` |
| `SYNC_STUDIO_URL` | `flowbuddy-api` | `https://app.flowbuddyai.com` (Studio origin allowlist-exemption for the real-widget tester) |
| `AUTH_SECRET` | `flowbuddy-web` | fresh `openssl rand -hex 32` — do NOT reuse dev's |
| `AUTH_URL` | `flowbuddy-web` | `https://app.flowbuddyai.com` |
| `SYNC_API_URL` | `flowbuddy-web` | `https://api.flowbuddyai.com` |
| `SYNC_WIDGET_URL` | `flowbuddy-web` | `https://widget.flowbuddyai.com/sync-copilot.js` |
| `RESEND_API_KEY` | `flowbuddy-web` | **required in prod** — the default `onboarding@resend.dev` sender only delivers to the Resend account owner, so real signups would never get verification/reset emails |
| `EMAIL_FROM` | `flowbuddy-web` | `no-reply@flowbuddyai.com` (after verifying `flowbuddyai.com` in Resend) |
| `SYNC_EXTENSION_URL` | `flowbuddy-web` | the Chrome Web Store listing URL |

Because every URL secret is a custom domain, the onrender suffix gotcha only matters for DNS CNAME
targets — never for env vars or snippets.

---

## 5. First-deploy runbook

**A. Repo prep** (on `dev`, then FF `main`):
1. Rewrite `render.yaml` to the §4 spec.
2. Build `packages/landing` (marketing page — design-system tokens, CTA → `app.flowbuddyai.com`).
3. Update docs; commit code + docs together; FF-sync `main`.

**B. Detach the old dev blueprint — BEFORE the new render.yaml reaches `dev`.** The existing
blueprint instance watches `dev`; if it syncs the rewritten file it will try to create the
`flowbuddy-*` resources and drop the `sync-*` ones. Render dashboard → the old Blueprint → disable
auto-sync (or delete the blueprint instance — deleting it keeps the services running and they keep
auto-deploying code from `dev`; only infra-from-yaml management stops).

**C. Third-party accounts:**
1. Cloudflare R2 → create bucket `flowbuddy-artifacts` + an Object R/W token scoped to it.
2. Resend → add + verify `flowbuddyai.com` (DNS records at Cloudflare) → key ready.
3. `openssl rand -hex 32` → the prod `AUTH_SECRET`.

**D. Apply the prod blueprint:** Render → New + → Blueprint → this repo → branch **`main`** → fill
the §4 secrets (URL vars get the final custom-domain values immediately) → Apply. Watch
`flowbuddy-api` logs for `All migrations have been successfully applied.` — a fresh DB runs all
migrations (including `CREATE EXTENSION vector`) from scratch; there is no pending-migration bookkeeping.

**E. Domains:** on each service add its custom domain(s) (§3) → create the DNS records at
Cloudflare (grey cloud) → wait for certs to issue → verify `https://app.flowbuddyai.com` renders
the sign-in page and `https://widget.flowbuddyai.com/sync-copilot.js` + `/sync-copilot-render.js`
both serve. Do this **before** creating any account — `AUTH_URL` already points at the custom
domain, so sign-in via the onrender URL would mis-callback.

**F. Recorder extension (new store build):** the store artifact bakes the Studio URL, so prod needs
a rebuild + resubmission (the packaged-but-unsubmitted v0.4.0 zip bakes the OLD dev URL — don't
upload it as-is):
```bash
STUDIO_URL="https://app.flowbuddyai.com,https://sync-web-uir8.onrender.com,http://localhost:3000" \
  pnpm --filter @sync/extension build
```
Bump the version, zip from `dist/`, submit, log it in [`extension-releases.md`](extension-releases.md),
set `SYNC_EXTENSION_URL` on `flowbuddy-web`, then re-run a plain build to restore the localhost dev
`dist/`. Keep the old dev URL in the list during the transition.

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
- New `type: worker` service `flowbuddy-worker`, `dockerCommand: pnpm --filter @sync/api worker`, Starter plan.
- `flowbuddy-api` `dockerCommand` → plain `pnpm --filter @sync/api start`.
- Move migrations to `preDeployCommand: pnpm --filter @sync/db exec prisma migrate deploy` on
  `flowbuddy-api` (paid plans support it). *(The standalone-worker blueprint shape is in git
  history — commit `3488326`.)*

**Step 2 — durable queue.**
*Trigger:* a dropped job actually happens, or upload volume grows.
Either pay for Key Value (Starter $10/mo, persistence) — zero code change — or swap BullMQ for a
Postgres-backed queue (pg-boss) and delete Redis entirely (a small project: `packages/api/src/queue.ts`,
`worker.ts`, `packages/web/lib/queue.ts`).

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

- **Branding:** app/widget/extension say "Sync"; the domain says FlowBuddyAI. Decide whether the
  landing page introduces *FlowBuddy* while the app keeps "Sync", or a rename pass runs through
  Studio/widget/extension strings. (The widget title is per-workspace configurable either way.)
- **`packages/landing`** — to build (content: hero · how-it-works · features · CTA; indigo design
  system; optionally dogfood the live widget as the demo).
- **Walkthrough (P4-M0)** lives on `feature-walkthrough` (`711a18b`), not `main` — merges later;
  its 2 migrations auto-apply on the next prod deploy after merge.
