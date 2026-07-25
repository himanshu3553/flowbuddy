# Deploying FlowBuddy to Render

One deploy guide for both live environments — **dev/staging** (free tier, `$0`) and **production**
(FlowBuddyAI.com, ~`$30`/mo) — over one code base and **two blueprint files**. The dev sections are
the free-tier walkthrough with every first-deploy gotcha; the production sections are the as-run
runbook for the live product. The **shared foundations** (§2) apply to every environment. For local
dev see [`dev-setup.md`](dev-setup.md); for what the modules are see [`phase-1-copilot.md`](phase-1-copilot.md).

> **Status:** production **deployed 2026-07-17 · Version 1 launched + user-verified E2E on prod
> 2026-07-23**. §4 is the as-run production runbook; §3 tracks the dev/staging stack.

---

## 1. The three environments

| Environment | Where | Branch | Config | Purpose |
|---|---|---|---|---|
| **Local dev** | your machine | any | `docker-compose` (Postgres + Redis + MinIO) + `pnpm dev` per package — [`dev-setup.md`](dev-setup.md) | day-to-day development |
| **Cloud dev / staging** | Render, free tier | `dev` | the `flowbuddy-dev-*` services (§3), created fresh 2026-07-17; free Postgres self-deletes every 30 days — treat as disposable | cloud E2E testing (recorder → prod-like URLs), demoing |
| **Production** | Render, paid | `main` | the `flowbuddy-*` services (§4), fronted by **FlowBuddyAI.com** custom domains | the live product |

`main` receives code only by explicit fast-forward from `dev`, so **every push to `main` is a
production deploy** (Render auto-deploys the connected branch).

---

## 2. Shared foundations (every environment)

### 2.1 Two blueprint files ride every branch

App code stays host-agnostic; Render reads a **blueprint file** per environment (custom blueprint
paths make this possible), so FF releases stay clean and each environment stays YAML-managed:

| File | Environment | Blueprint instance reads it from |
|---|---|---|
| [`render.yaml`](../render.yaml) (repo root, default path) | **Production** — the §4 topology | branch `main` |
| [`render.dev.yaml`](../render.dev.yaml) (custom path) | **Dev/staging** — the §3 free-tier config | branch `dev` |

**Standing ordering rule:** any change to *dev* infra goes in `render.dev.yaml`; any change to *prod*
infra goes in `render.yaml` and reaches Render only via the `main` FF. Never point a blueprint
instance at the other environment's file (applying `render.yaml` from `dev` would build the paid prod
stack).

### 2.2 Object storage (Cloudflare R2)

Screenshots / audio / DOM snapshots live in **Cloudflare R2** (S3-compatible). Artifacts stay
**private**; the app serves them via presigned URLs. **Two separate buckets, never shared:**
`flowbuddy-artifacts-dev` (dev) and `flowbuddy-artifacts` (prod) — so a dev data reset can never
touch prod artifacts. Pre-create the bucket — the API runs `HeadBucket` at boot, so it never needs
bucket-create permission.

### 2.3 The worker is folded into the API (both environments)

The synthesis worker runs *inside* the api web service via the `start:all` entrypoint
([`packages/api/src/all.ts`](../packages/api/src/all.ts) imports both the server and the worker into
one process). In **dev** this is forced by Render (background workers are paid-only); in **prod** it's
a deliberate choice — synthesis is almost entirely I/O-bound (Whisper/GPT-4o/embedding network calls),
so it barely contends with answer traffic. Trade-off: a deploy restart kills an in-flight synthesis
job (`attempts=1`, no auto-retry — fix is re-recording). Splitting the worker out is **scaling-ladder
Step 1** (§9). Migrations run in the same start command (`prisma migrate deploy` before boot).

### 2.4 The service-URL suffix gotcha

**Render appends a random suffix to a service's hostname if the plain name is already taken** — e.g.
you may get `https://flowbuddy-dev-web-x4k2.onrender.com` even though the service is named
`flowbuddy-dev-web` (the first-ever deploy got `-uir8`; the 2026-07-17 rebuild got all plain names —
don't count on either). There is **no blueprint reference for a service's public URL**, so after the
services appear, open each in the dashboard and copy its **real** URL into the env vars that need it
(§3.8 / §4). In **prod** every URL secret is a custom domain, so this only matters for the DNS CNAME
targets, never for env vars or embed snippets.

### 2.5 Logging in production

The Node services log **structured JSON at `info`+** in prod (`NODE_ENV=production` is set in the
Dockerfiles; each line carries its `service` and secrets are redacted). Both blueprints set
`LOG_LEVEL: info` explicitly on the api + web services so the level is visible and tunable in the
dashboard.

**Change the level without a code redeploy** — Render → the service → **Environment** → edit
`LOG_LEVEL` → save. Render restarts the service with the new value:

| Set `LOG_LEVEL` to | To… |
|---|---|
| `debug` | trace a request/synthesis path in prod (verbose — **set back to `info`** after) |
| `warn` | quieten a chatty service to warnings + errors only |
| `silent` | mute a service entirely |

`LOG_PRETTY=1` would switch a service to human-readable lines (rarely wanted in prod — JSON is what
log search ingests). The **Studio browser console** level is separate and **build-time**
(`NEXT_PUBLIC_LOG_LEVEL`, default `warn` in prod) — changing it means a rebuild, not just an env edit.
Full model + local usage: [`dev-setup.md` §7](dev-setup.md#7-logging-dev-vs-prod-and-how-to-turn-it-updown).

---

## 3. Dev / staging deploy (Render free tier, $0)

### 3.1 What gets deployed (topology)

The `render.dev.yaml` blueprint provisions **5 resources** (all free):

| Resource | Type | Runtime | Role |
|---|---|---|---|
| `flowbuddy-dev-db` | PostgreSQL | Postgres 18 | the database |
| `flowbuddy-dev-redis` | Key Value | Valkey 8 | BullMQ job queue (synthesis) |
| `flowbuddy-dev-api` | Web service | Docker | copilot answer API + recorder ingestion **+ the synthesis worker** (folded in — §2.3) |
| `flowbuddy-dev-web` | Web service | Docker | the Next.js **Studio** (approve workflows, copilot settings, analytics) |
| `flowbuddy-dev-widget` | Static site | Static | hosts the embeddable `flowbuddy-copilot.js` bundle **+ its sibling `flowbuddy-copilot-render.js`** (the lazy P2-M5 image-tier renderer — always publish BOTH from the same `packages/widget/dist/` build; the widget derives the renderer URL as a sibling of its own `src`, and a missing file degrades diagnostics to structure-only, silently) |

Plus an **environment group** `flowbuddy-dev-r2` holding the shared Cloudflare R2 credentials.

### 3.2 Prerequisites

- A **Render** account.
- A **Cloudflare** account with **R2** enabled.
- An **OpenAI API key** (`sk-…`) with billing/credit — `whisper-1` (transcription) + `gpt-4o` (synthesis).
- The repo on **GitHub** (Render deploys from GitHub) and permission to authorize Render to read it.

### 3.3 Cloudflare R2 setup

1. Cloudflare → **R2** → **Create bucket** → name it exactly `flowbuddy-artifacts-dev`
   (`flowbuddy-artifacts` without the suffix is the **production** bucket — §2.2). Pre-create it.
2. R2 → **Manage R2 API Tokens** → **Create API token** → permission **Object Read & Write**, scoped to that bucket (an account-wide Object R/W token works too).
3. Note three values: **Access Key ID**, **Secret Access Key**, **S3 endpoint** (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com` — account ID is on the R2 overview page).

### 3.4 Generate the auth secret

```bash
openssl rand -hex 32
```
Keep the output for `AUTH_SECRET` (Studio / Auth.js).

### 3.5 Push the code to the deploy branch

Render reads the blueprint file from the branch you connect. Make sure the final code **and** the
blueprint file (`render.dev.yaml`) are committed and pushed to `dev` before creating the blueprint.

### 3.6 Create the Blueprint on Render

1. Render dashboard → **New +** → **Blueprint**.
2. Connect/authorize the GitHub repo → select branch **`dev`**.
3. Set the **blueprint file path** to `render.dev.yaml` (the default `render.yaml` is the PROD spec).
4. Render parses the file and shows the 5 resources + the `flowbuddy-dev-r2` group. Click **Apply**.
   ⚠️ Render does **not** prompt for env-**group** values here — fill the `flowbuddy-dev-r2` group in
   the dashboard right after Apply (the api's first boot fails harmlessly without it, then recovers
   on the save-triggered redeploy).

### 3.7 Set the secrets

Render prompts for every `sync: false` value. Set them as below. **URLs are not guaranteed** — see
the [suffix gotcha](#24-the-service-url-suffix-gotcha) — set your best guess now and correct in §3.8.

| Variable | Where | Value |
|---|---|---|
| `R2_ENDPOINT` | `flowbuddy-dev-r2` group | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | `flowbuddy-dev-r2` group | R2 token access key |
| `R2_SECRET_ACCESS_KEY` | `flowbuddy-dev-r2` group | R2 token secret |
| `R2_BUCKET` | `flowbuddy-dev-r2` group | `flowbuddy-artifacts-dev` |
| `OPENAI_API_KEY` | **`flowbuddy-dev-api`** only | your `sk-…` (synthesis + the copilot answer engine; the Studio makes no OpenAI calls — its tester embeds the real widget → flowbuddy-dev-api) |
| `EMBED_MODEL` | `flowbuddy-dev-api` (blueprint sets it) | `text-embedding-3-small` — P1-M3 hybrid retrieval. ⚠️ Must be a **1536-dim** model (the `vector(1536)` column); the migration runs `CREATE EXTENSION vector` on deploy. |
| `FLOWBUDDY_STUDIO_URL` | **`flowbuddy-dev-api`** | the real `flowbuddy-dev-web` URL (§3.8) — the Studio origin is exempt from workspace origin allowlists so the Copilot page's real-widget tester keeps working after a customer restricts origins. ⚠️ Unset = the tester 403s for allowlisted workspaces. |
| `REASON_MODEL` | `flowbuddy-dev-api` (optional) | the P2-M5 diagnostic path's stronger (vision-capable) model; unset = falls back to `SYNTH_MODEL` (default `gpt-4o`) |
| `AUTH_SECRET` | `flowbuddy-dev-web` | output of §3.4 |
| `AUTH_URL` | `flowbuddy-dev-web` | the real `flowbuddy-dev-web` URL (§3.8) |
| `FLOWBUDDY_API_URL` | `flowbuddy-dev-web` | the real `flowbuddy-dev-api` URL (§3.8) |
| `FLOWBUDDY_WIDGET_URL` | `flowbuddy-dev-web` | the real `flowbuddy-dev-widget` URL + `/flowbuddy-copilot.js` |
| `RESEND_API_KEY` | `flowbuddy-dev-web` | Resend key — **enables** email verification + password reset. ⚠️ Before first enable, backfill: `UPDATE "User" SET "emailVerified" = now() WHERE "passwordHash" IS NOT NULL AND "emailVerified" IS NULL;` — pre-existing accounts can't sign in otherwise. Optional `EMAIL_FROM` needs a Resend-verified domain (default `onboarding@resend.dev` only delivers to the account owner). |

Auto-wired by the blueprint (do **not** set): `DATABASE_URL`, `REDIS_URL`, `PORT`, `R2_REGION`,
`TRANSCRIBE_MODEL`, `SYNTH_MODEL`, `AUTH_TRUST_HOST`, `LOG_LEVEL` (`info` — tunable live, §2.5).

> **All three of `OPENAI_API_KEY`, `AUTH_SECRET`, and the R2 group are mandatory for a working stack** —
> and each fails at a *different* moment (see [Troubleshooting](#troubleshooting-real-errors-we-hit)).

### 3.8 Fix the service URLs

Per the [suffix gotcha](#24-the-service-url-suffix-gotcha):

1. After the services appear, open **each** of `flowbuddy-dev-api`, `flowbuddy-dev-web`, `flowbuddy-dev-widget` and copy its **real** URL.
2. On `flowbuddy-dev-web`, set the URL secrets to the **real** values:
   - `AUTH_URL` = real `flowbuddy-dev-web` URL
   - `FLOWBUDDY_API_URL` = real `flowbuddy-dev-api` URL (baked into the browser embed snippet **and** the extension connect payload — must be the public URL, never internal)
   - `FLOWBUDDY_WIDGET_URL` = real `flowbuddy-dev-widget` URL + `/flowbuddy-copilot.js`
3. Also set `FLOWBUDDY_STUDIO_URL` on `flowbuddy-dev-api` = the real `flowbuddy-dev-web` URL.
4. **Redeploy `flowbuddy-dev-web`** so the embed snippet and auth callbacks use the corrected URLs.

### 3.9 First deploy — what happens

- Each Docker image builds (full `pnpm install` per image — a few minutes).
- `flowbuddy-dev-api` start command runs `prisma migrate deploy` (creates all tables) **then** boots Fastify + the embedded worker. Success in the logs:
  ```
  All migrations have been successfully applied.
  {"level":"info","service":"api","port":8787,"env":"production","msg":"FlowBuddy api listening"}
  {"level":"info","service":"worker","queue":"synthesis","msg":"listening on queue"}
  ```
- A `503` on the first hit to `flowbuddy-dev-web` / `flowbuddy-dev-api` is a **free-tier cold start** (~1 min), **not** a crash.

### 3.10 Smoke test

- `flowbuddy-dev-widget` URL + `/flowbuddy-copilot.js` serves a minified JS bundle (global static site — no cold start).
- `flowbuddy-dev-widget` URL + `/flowbuddy-copilot-render.js` serves the P2-M5 renderer bundle too (the widget lazy-loads it as a sibling of its own `src` when "Include page image" is on).
- `flowbuddy-dev-web` URL renders the **FlowBuddy Studio** sign-in page.
- Create an account in Studio (this exercises `AUTH_SECRET` + the DB).

Then connect the extension (§5) and run the end-to-end test (§6).

### 3.11 Free-tier caveats (dev only)

- **Free Postgres is deleted 30 days after creation** (14-day grace) — recreate when it lapses.
- **Free Key Value has no persistence** — a restart drops queued synthesis jobs (low risk: jobs run right after upload).
- **Free web services spin down after ~15 min idle** (~1 min cold start). The embedded worker only runs while `flowbuddy-dev-api` is awake.
- **750 free instance-hours/month per workspace** (shared); spun-down services don't consume them.

### 3.12 Reference: the dev secrets you provide (all `sync: false`)

```
flowbuddy-dev-r2 group : R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
flowbuddy-dev-api      : OPENAI_API_KEY, FLOWBUDDY_STUDIO_URL (= real flowbuddy-dev-web URL)
flowbuddy-dev-web      : AUTH_SECRET, AUTH_URL, FLOWBUDDY_API_URL, FLOWBUDDY_WIDGET_URL, RESEND_API_KEY   # NO OpenAI key
```
Everything else (`DATABASE_URL`, `REDIS_URL`, `PORT`, `R2_REGION`, `TRANSCRIBE_MODEL`, `SYNTH_MODEL`,
`AUTH_TRUST_HOST`) is wired automatically by [`render.dev.yaml`](../render.dev.yaml).

---

## 4. Production deploy (FlowBuddyAI.com, ~$30/mo)

### 4.1 Topology + cost (locked 2026-07-16)

**~$30/month.** Seven resources, distinct `flowbuddy-*` names (so they coexist with the dev
`flowbuddy-dev-*` services in the same Render workspace):

| Resource | Type | Plan | Custom domain | Role |
|---|---|---|---|---|
| `flowbuddy-landing` | Static site | **Free** | `flowbuddyai.com` + `www` | marketing landing page (`packages/landing`) |
| `flowbuddy-web` | Web (Docker) | **Starter $7** | `app.flowbuddyai.com` | the Studio (Next.js) |
| `flowbuddy-api` | Web (Docker) | **Starter $7** | `api.flowbuddyai.com` | copilot answer API + ingestion **+ the embedded synthesis worker** (`start:all`) |
| `flowbuddy-widget` | Static site | **Free** | `widget.flowbuddyai.com` | serves `flowbuddy-copilot.js` + `flowbuddy-copilot-render.js` (both, always, from one build) |
| `flowbuddy-db` | PostgreSQL | **Basic-256mb $6** (+$0.30/GB extra) | — | the database (durable — no 30-day deletion) |
| `flowbuddy-redis` | Key Value | **Starter $10** | — | BullMQ synthesis queue (persistent) |
| `flowbuddy-r2` | Env group | — | — | shared Cloudflare R2 credentials (prod bucket) |

**Decisions recorded (and their trade-offs):**
- **Worker folded into the API** (`start:all`) — see §2.3; split at Scale step 1 (§9).
- **Key Value is paid (Starter $10) — revised 2026-07-17 at first deploy.** The original "stays free" plan hit a platform limit: Render allows only **one free Key Value instance per workspace**, and dev holds it (`flowbuddy-dev-redis`). Paying also buys **persistence** — the "a restart drops a queued job" caveat is gone in prod (Scale step 2's first option, arrived early). `maxmemoryPolicy: noeviction` stays set.
- **Studio is paid (Starter)** — customers work here; a ~1-min free-tier cold start reads as "broken product".
- **The API is paid and always-on, non-negotiable** — it serves customers' end-users on every widget question; a cold start there is a broken copilot on someone else's site.
- **Postgres is paid, non-negotiable** — the free plan self-deletes after 30 days; prod data must be durable, and paid plans get point-in-time recovery.
- **Migrations stay in the start command** — additive, and on paid plans Render health-checks the new instance before switching traffic, so the old one keeps serving while the new one migrates. Moving to a `preDeployCommand` happens at Scale step 1 with the worker split.

### 4.2 Domains & DNS

Registrar: **GoDaddy**, DNS hosted there too (as-built 2026-07-17 — the original plan said Cloudflare,
but only R2 lives on Cloudflare; GoDaddy has no proxy layer, so Render provisions and renews TLS
itself). ⚠️ First-deploy gotcha (hit live): **delete the registrar's default parking A records on the
apex** (e.g. `13.248.243.5` / `76.223.105.230`) — with stray A records present, DNS round-robins to
parking servers AND Render won't verify the apex or issue its certificate. GoDaddy doesn't flatten
CNAMEs at the apex — use the A record.

| Record | Type | Points to |
|---|---|---|
| `flowbuddyai.com` | A record (no apex CNAME flattening) | the apex IP Render shows when you add the domain to `flowbuddy-landing` (currently `216.24.57.1`) |
| `www.flowbuddyai.com` | CNAME | `flowbuddy-landing`'s `*.onrender.com` hostname |
| `app.flowbuddyai.com` | CNAME | `flowbuddy-web`'s `*.onrender.com` hostname |
| `api.flowbuddyai.com` | CNAME | `flowbuddy-api`'s `*.onrender.com` hostname |
| `widget.flowbuddyai.com` | CNAME | `flowbuddy-widget`'s `*.onrender.com` hostname |

Render auto-redirects `www` ↔ apex once both are added to the landing site. The `*.onrender.com`
hostnames may carry the [suffix](#24-the-service-url-suffix-gotcha) — copy the real ones from the dashboard.

**Why custom domains are set up BEFORE onboarding anyone:** the Studio-generated embed snippet bakes
`FLOWBUDDY_API_URL` + `FLOWBUDDY_WIDGET_URL` into every customer's `<script>` tag. Whatever URL is live
when a customer embeds is a URL you serve forever. With all env URLs on the custom domains from day
one, `onrender.com` never leaks into a snippet — and the underlying Render service can be swapped
later without breaking a single embed.

### 4.3 The production blueprint (`render.yaml`) — written 2026-07-17

The root [`render.yaml`](../render.yaml) is authoritative for the prod spec — plans, env wiring, and
per-service notes live there as comments (see the two-blueprint model, §2.1). Highlights: paid
api/web/db per §4.1, `maxmemoryPolicy: noeviction` on the queue, migrations in the api start command,
and the two static sites (widget bundles + the `packages/landing` page) built with
`pnpm install --frozen-lockfile && pnpm --filter <pkg> build`.

**Prod secrets (all `sync: false`):**

| Variable | Service | Prod value |
|---|---|---|
| `R2_*` | `flowbuddy-r2` group | the **prod** bucket `flowbuddy-artifacts` + its own Object R/W token — never share the dev bucket |
| `OPENAI_API_KEY` | `flowbuddy-api` | your `sk-…` |
| `FLOWBUDDY_STUDIO_URL` | `flowbuddy-api` | `https://app.flowbuddyai.com` (Studio origin allowlist-exemption for the real-widget tester) |
| `AUTH_SECRET` | `flowbuddy-web` | fresh `openssl rand -hex 32` — do NOT reuse dev's |
| `AUTH_URL` | `flowbuddy-web` | `https://app.flowbuddyai.com` |
| `FLOWBUDDY_API_URL` | `flowbuddy-web` | `https://api.flowbuddyai.com` |
| `FLOWBUDDY_WIDGET_URL` | `flowbuddy-web` | `https://widget.flowbuddyai.com/flowbuddy-copilot.js` |
| `RESEND_API_KEY` | `flowbuddy-web` | **required in prod** — the default `onboarding@resend.dev` sender only delivers to the Resend account owner, so real signups would never get verification/reset emails |
| `EMAIL_FROM` | `flowbuddy-web` | `no-reply@flowbuddyai.com` (after verifying `flowbuddyai.com` in Resend) |
| `FLOWBUDDY_EXTENSION_URL` | `flowbuddy-web` | the Chrome Web Store listing URL |

Because every URL secret is a custom domain, the suffix gotcha only matters for DNS CNAME targets —
never for env vars or snippets.

### 4.4 First-deploy runbook (as run 2026-07-17)

**A. Repo prep** (on `dev`, then FF `main`) — **done 2026-07-17**:
1. `render.dev.yaml` added (a copy of the dev config) and the dev blueprint's file path switched to it in the dashboard **before** step 2 landed — so the dev blueprint never reads the prod spec.
2. `render.yaml` rewritten to the §4 prod spec.
3. `packages/landing` built — v1 is a minimal "coming soon + sign in" card (CTA → `app.flowbuddyai.com`); the full marketing page upgrades it later.
4. Docs updated; code + docs committed together; `main` FF-synced.

**B. Blueprint-file ordering rule (standing):** see §2.1.

**C. Third-party accounts:**
1. Cloudflare R2 → create bucket `flowbuddy-artifacts` + an Object R/W token scoped to it.
2. Resend → add + verify `flowbuddyai.com` (DNS records at GoDaddy) → key ready.
3. `openssl rand -hex 32` → the prod `AUTH_SECRET`.

**D. Apply the prod blueprint:** Render → New + → Blueprint → this repo → branch **`main`** → fill the
§4.3 secrets (URL vars get the final custom-domain values immediately) → Apply. Watch `flowbuddy-api`
logs for `All migrations have been successfully applied.` — a fresh DB runs all migrations (including
`CREATE EXTENSION vector`) from scratch; there is no pending-migration bookkeeping.

**E. Domains:** on each service add its custom domain(s) (§4.2) → create the DNS records at GoDaddy →
wait for certs → verify `https://app.flowbuddyai.com` renders the sign-in page and
`https://widget.flowbuddyai.com/flowbuddy-copilot.js` + `/flowbuddy-copilot-render.js` both serve. Do
this **before** creating any account — `AUTH_URL` already points at the custom domain.

**F. Recorder extension — v0.6.0 (decision 2026-07-17: one review cycle):** the store artifact bakes
the Studio URL, so prod needs a rebuild + resubmission. v0.5.0's review is **cancelled**; v0.6.0 bakes
prod + dev + localhost in one artifact — see §5. Set `FLOWBUDDY_EXTENSION_URL` on `flowbuddy-web` once
live.

**G. Seed + smoke test:** the prod DB is empty — create the founder account (email verification works
because Resend is live), connect the extension, record + approve the real workflows, then run the
[`e2e-testing.md`](e2e-testing.md) flow against prod: embed on an HTTP-served page → grounded answer
with citations → honest decline → a Sense positional question → a Reason "why is this button disabled?"
diagnosis → analytics populate.

⚠️ **Never point reset/E2E-cleanup scripts at prod** — the data-reset flow in
[`e2e-testing.md`](e2e-testing.md) is for the dev environment only.

---

## 5. Connect the recorder extension (build mechanics — every environment)

The Chrome extension is **not** deployed to Render — you build it locally pointed at the Studio(s) you
want it to connect to. A single env var (`STUDIO_URL`) bakes both the popup links (`__STUDIO_URL__`)
and the connect-bridge content-script `matches` (in [`packages/extension/build.mjs`](../packages/extension/build.mjs)).
**It accepts a comma-separated list** — the FIRST entry is the primary (what the popup opens); ALL
entries get the connect bridge, so one artifact connects against several origins:

```bash
# dev + local
STUDIO_URL="https://<your-flowbuddy-dev-web-url>,http://localhost:3000" pnpm --filter @flowbuddy/extension build
```

Then `chrome://extensions` → **Load unpacked** → `packages/extension/dist` (or **Reload**). Click
**Connect** — it opens `<studio-url>/connect`, relays the token + API URL into the extension, and shows
as connected. *(Plain `pnpm --filter @flowbuddy/extension build` with no `STUDIO_URL` reverts to
localhost — the committed `src/manifest.json` stays localhost so local dev is unaffected.)*

**Chrome Web Store** (full per-version history + the cut-a-release checklist:
[`extension-releases.md`](extension-releases.md)): **v0.6.0 "FlowBuddy Recorder" is LIVE** (submitted
2026-07-17, confirmed live by 2026-07-23) — the production release: bakes `https://app.flowbuddyai.com`
(primary) + `https://flowbuddy-dev-web.onrender.com` + localhost, new FlowBuddy "F" icons, no new
permissions. Listing (extension ID `njkfcfpehcklldmeofolnpdljdhcgofk`, stable across the rename; the
URL below carries the pre-rename slug — Chrome resolves by ID, so it keeps working):
<https://chromewebstore.google.com/detail/sync-recorder/njkfcfpehcklldmeofolnpdljdhcgofk>. Its listing
URL goes in `FLOWBUDDY_EXTENSION_URL` on **both** `flowbuddy-web` (prod) and `flowbuddy-dev-web` so the
Home checklist's install CTA reads "Add to Chrome". *(History: 0.1.0/0.2.0 dev builds; v0.2.1 first
prod-targeted; v0.3.0 the previous live version — its pre-rename baked URL died with the FlowBuddy
re-deploy; v0.4.0 packaged but never uploaded; v0.5.0's review cancelled in favor of one v0.6.0
cycle.)* The store zip is built from `dist/` (`cd dist && zip -r ../flowbuddy-recorder-<version>.zip .`).
⚠️ The baked Studio URL is part of the store artifact — moving to a new domain later means a rebuild +
resubmission (add the new domain to the list; keep the old one during the transition). ⚠️ After
zipping, re-run a plain build so your local `dist/` goes back to the localhost-primary dev build.

---

## 6. End-to-end test

1. **Record** a narrated workflow → it uploads to the deployed API → the embedded worker synthesizes it.
   Success log (JSON): `{"level":"info","service":"worker","sessionId":"<id>","workflows":N,"steps":M,…,"msg":"ready"}`.
2. In Studio → **Knowledge Base** → **approve** the workflow (the copilot only answers from approved content).
3. **Test the widget:** Studio → **Copilot** → copy the embed `<script>` (pre-filled with the API URL,
   widget URL, and public key). Set the **origin allowlist** (or leave empty = allow any). Drop the
   snippet into an HTML page **served over HTTP** (not `file://`):
   ```bash
   mkdir /tmp/widget-test && cd /tmp/widget-test
   # create index.html containing the snippet, then:
   python3 -m http.server 8080      # open http://localhost:8080
   ```
   The indigo launcher appears → ask about the approved workflow → expect a **grounded answer with
   citations**; ask off-topic → expect an **honest decline** (logged as a coverage gap). On the dev
   free tier the **first** question may take ~1 min (API cold start); prod is always-on.

Full manual test plan (3 levels — local · dev · prod): [`e2e-testing.md`](e2e-testing.md).

---

## 7. Ongoing releases

1. Work lands on `dev`; the dev cloud env auto-deploys it for cloud E2E.
2. On an explicit go: FF-sync `main` → Render auto-deploys the prod services.
3. Migrations run automatically on the api boot (additive-only keeps this safe).
4. Both widget bundles republish automatically (they're one static build).
5. The landing page redeploys only when `packages/landing` changes.
6. Extension releases are independent (store review cycle) — see [`extension-releases.md`](extension-releases.md).

---

## 8. Upgrading an existing deploy

### 8.1 The Phase 2 drop (Sense + Reason)

Taking a running deploy from Phase 1 to the Phase-2 code (Sense `8187af5` + Reason `cb143ca`):

1. **Merge to the deploy branch & push** → Render rebuilds the Docker services.
2. **Migrations run automatically** on api boot (`prisma migrate deploy`): `20260708121649_sense_in_context_help` + `20260713090000_reason_diagnostic`. Both additive (new `Workspace` / `CopilotQuery` columns, defaults included) — no backfill, no downtime concern.
3. **Set `FLOWBUDDY_STUDIO_URL`** on the api (the real Studio URL) if not set — without it the real-widget tester 403s once a workspace restricts origins (§3.7).
4. **Publish BOTH widget bundles** from one `pnpm --filter @flowbuddy/widget build`: `flowbuddy-copilot.js` **and** `flowbuddy-copilot-render.js`, side by side. A missing renderer never breaks answers — diagnostics silently degrade to structure-only.
5. *(Optional)* set `REASON_MODEL` for a stronger vision model on the diagnostic path (unset = `SYNTH_MODEL`, default `gpt-4o`).
6. **No other new env vars.** Behavior toggles are per-workspace in Studio → Copilot → Settings, with safe defaults: Sense **ON** · show-me OFF · Reason **ON** (masked, structure-only) · page image **ON** (new workspaces, since 2026-07-16) · typed values OFF.
7. **Smoke test:** [`e2e-testing.md`](e2e-testing.md) Part 11 — a positional "what do I do next?" and a "why is this button disabled?" diagnosis; verify `CopilotQuery.reasonTrigger` is populated on the diagnostic row.

### 8.2 The walkthrough drop (P4-M0)

On top of the Phase-2 steps:

1. **Migrations run automatically**: `20260715155642_walkthrough_guided` (`Workspace.copilotWalkthrough` + the `CopilotWalkthrough` run table) and `20260715183302_reason_image_default_on` (a column-default flip only — **existing workspaces keep their current image-tier setting**; new workspaces default ON). Both additive, no backfill.
2. **Publish BOTH widget bundles again** — the base bundle grew (walkthrough module + alert-surface detection).
3. **No new env vars.** New per-workspace toggle: Studio → Copilot → Settings → **Guided walkthrough** (default OFF, requires Sense).
4. **Smoke test:** [`e2e-testing.md`](e2e-testing.md) §11 — the walkthrough leg (offer → manual Next-driven steps → one `CopilotWalkthrough` row) and the rejected-action diagnosis.

---

## 9. The scaling ladder (future prod)

Each step is a dashboard/plan change plus a small `render.yaml` edit — no re-architecture, and the
custom domains make every underlying swap invisible to customers.

**Step 1 — split the worker out (~$27/mo).** *Trigger:* synthesis jobs dying on deploys, or answer latency dipping while jobs run.
- New `type: worker` service `flowbuddy-worker`, `dockerCommand: pnpm --filter @flowbuddy/api worker`, Starter plan.
- `flowbuddy-api` `dockerCommand` → plain `pnpm --filter @flowbuddy/api start`.
- Move migrations to `preDeployCommand: pnpm --filter @flowbuddy/db exec prisma migrate deploy` (paid plans support it). *(The standalone-worker blueprint shape is in git history — commit `3488326`.)*

**Step 2 — durable queue. ✅ Arrived early (2026-07-17):** prod Key Value is already paid/persistent (the one-free-instance limit forced it — §4.1). The remaining lever is **cost reduction**: swap BullMQ for a Postgres-backed queue (pg-boss) and delete Redis (−$10/mo; touches `packages/api/src/queue.ts`, `worker.ts`, `packages/web/lib/queue.ts`).

**Step 3 — headroom.** *Trigger:* sustained load, in rough order:
- Instance bumps: `starter` → `standard` on api/web; Postgres → a larger plan.
- **ANN index on the pgvector column** (deferred at P1-M3) once exact scans show up in answer latency.
- Horizontal scale on `flowbuddy-api` (stateless) — requires the Step-1 worker split first so N api instances don't each embed a worker.

**Step 4 — ops hardening (any time, cheap):**
- Uptime monitoring on `api.flowbuddyai.com` + `app.flowbuddyai.com` (also keeps first-byte warm).
- Render health-check paths; alerting on failed deploys.
- Log level stays `info` (JSON), tunable live via `LOG_LEVEL` (§2.5).
- Postgres paid plans include point-in-time recovery; verify the recovery window fits.

---

## Troubleshooting (real errors we hit)

| Symptom in the logs | Cause | Fix |
|---|---|---|
| Blueprint: `basic_256mb not a valid plan` | Render plan ids use **hyphens** | `basic-256mb` (Postgres). Service plans: `starter`, `standard`, … |
| Static build: `EROFS: read-only file system, unlink '/usr/bin/pnpx'` | `corepack enable` in Render's static builder (read-only `/usr/bin`) | Drop `corepack enable`; the builder already provides pnpm. Just `pnpm install --frozen-lockfile && pnpm --filter @flowbuddy/widget build` |
| `sh: 1: <whole command>: not found` · `Exited with status 127` | A `dockerCommand: sh -c "… && …"` — Render already wraps in its own `sh -c` | Make `dockerCommand` a **single token** (`pnpm --filter @flowbuddy/api start:all`) and put the `&&` chain **inside the npm script** |
| `AggregateError [ECONNREFUSED] … 127.0.0.1:9000` | `R2_ENDPOINT` unset → API defaults to local MinIO; `ensureBucket()` runs at **boot** | Set the R2 group (endpoint/keys/bucket) and redeploy the api |
| `[auth][error] MissingSecret: Please define a 'secret'` | `AUTH_SECRET` unset (pages still render — GET-only) | Set `AUTH_SECRET` on the web service; also set `AUTH_URL` to the real URL. ⚠️ Secrets typed during a **failed** blueprint sync die with it — re-enter after a clean apply |
| `[worker] failed …: 401 You didn't provide an API key` | `OPENAI_API_KEY` unset on the api | Set it on the api; **re-record** (failed jobs don't auto-retry — `attempts=1`) |
| Copilot page real-widget tester returns nothing / errors | Since **Approach B** (2026-07-08) the tester embeds the real widget → it answers via the **api** `/v1/copilot/answer`. Cause is on the api: `OPENAI_API_KEY` unset, **or** a `403` because `FLOWBUDDY_STUDIO_URL` isn't set | Set `OPENAI_API_KEY` **and** `FLOWBUDDY_STUDIO_URL` (= the real Studio URL) on the api; the web service needs **no** OpenAI key |
| `503` on first request | Free web service **cold start** (~1 min after 15 min idle) | Wait ~1 min; it's not a crash (dev only — prod is always-on) |
| Widget launcher doesn't appear | Page served via `file://`, or origin not in the allowlist (403) | Serve over HTTP; add the origin or empty the allowlist |
| `Eviction policy is allkeys-lru … should be "noeviction"` | Free Key Value default eviction (BullMQ prefers `noeviction`) | The blueprints set `maxmemoryPolicy: noeviction`; on an instance created before that, flip it in the dashboard (Key Value → Settings → Maxmemory Policy) |
| Apex domain won't verify / cert won't issue | Registrar parking **A records** on the apex (§4.2) | Delete the parking A records; keep only the Render apex IP |

---

## The FlowBuddy rename cutover (done 2026-07-17)

The product was renamed **Sync → FlowBuddy** and the dev environment was **rebuilt from scratch** the
same day: the old blueprint, every `sync-*` service, and the `sync-artifacts` bucket were deleted, then
the current `flowbuddy-dev-*` stack was created fresh from `dev` (fresh DB applied all migrations on
first boot; user-verified E2E). What this means for anything pre-rename:

- **The contract renamed with the product:** env vars `SYNC_*` → `FLOWBUDDY_*`, bundles `sync-copilot*.js` → `flowbuddy-copilot*.js`, embed attrs `data-sync-*` → `data-flowbuddy-*`, key header `x-sync-key` → `x-flowbuddy-key`, `window.SyncCopilot` → `window.FlowBuddy`, extension "Sync Recorder" → "FlowBuddy Recorder".
- **Pre-rename embed snippets are dead** (old bundle URL + old attrs) — re-copy from Studio → Copilot.
- **Pre-rename extension builds can't connect** (old baked URLs + old bridge channels): store v0.3.0 and the never-uploaded v0.4.0 zip are both inert; v0.5.0's review was cancelled (superseded), and **v0.6.0 (live 2026-07-23) is the shipping post-rename build** — [`extension-releases.md`](extension-releases.md).
- **Old `*.onrender.com` URLs and the `sync_*` database are gone**; dev data was disposable by design.

---

## Open items

- **Branding — RESOLVED 2026-07-17:** the product is **FlowBuddy** (domain FlowBuddyAI.com). (The widget title stays per-workspace configurable.)
- **`packages/landing` v1 BUILT 2026-07-17** as the minimal "coming soon + sign in" card. The full marketing page (hero · how-it-works · features · CTA; optionally dogfood the live widget as the demo) remains to build on top.
- **`FLOWBUDDY_EXTENSION_URL`** to be set on **both** `flowbuddy-web` and `flowbuddy-dev-web` (the v0.6.0 store listing URL) so the Home checklist CTA reads "Add to Chrome".
