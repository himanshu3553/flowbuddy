# Deploying FlowBuddy to Render.com

Step-by-step guide to deploy the Phase-1 copilot stack to [Render](https://render.com) on the
**free tier ($0/mo)**, with every gotcha we hit on the first real deploy baked in. For local dev see
[`dev-setup.md`](dev-setup.md); for what the modules are see [`phase-1-copilot.md`](phase-1-copilot.md).

> The single Render-specific file is [`render.yaml`](../render.yaml) (a Render **Blueprint**). The app
> code stays host-agnostic. This doc tracks the **free/testing** configuration; the **production**
> deployment (FlowBuddyAI.com — topology, domains, runbook, scaling ladder) lives in
> [`deploy-production.md`](deploy-production.md), and the [Going to production](#going-to-production)
> section below lists the mechanical deltas it builds on.

---

## 1. What gets deployed (topology)

The blueprint provisions **5 resources** (all free):

| Resource | Type | Runtime | Role |
|---|---|---|---|
| `flowbuddy-dev-db` | PostgreSQL | Postgres 18 | the database |
| `flowbuddy-dev-redis` | Key Value | Valkey 8 | BullMQ job queue (synthesis) |
| `flowbuddy-dev-api` | Web service | Docker | copilot answer API + recorder ingestion **+ the synthesis worker** (folded in — see below) |
| `flowbuddy-dev-web` | Web service | Docker | the Next.js **Studio** (approve workflows, copilot settings, analytics) |
| `flowbuddy-dev-widget` | Static site | Static | hosts the embeddable `flowbuddy-copilot.js` bundle **+ its sibling `flowbuddy-copilot-render.js`** (the lazy P2-M5 image-tier renderer — always publish BOTH from the same `packages/widget/dist/` build; the widget derives the renderer URL as a sibling of its own `src`, and a missing file degrades diagnostics to structure-only, silently) |

Plus an **environment group** `flowbuddy-dev-r2` holding the shared Cloudflare R2 credentials.

**Why the worker is folded into the API:** Render background workers are **paid-only**. For a $0 deploy,
the synthesis worker runs *inside* the `flowbuddy-dev-api` web service via the `start:all` entrypoint
([`packages/api/src/all.ts`](../packages/api/src/all.ts) imports both the server and the worker into one
process). It works because a recorder upload (an HTTP request) wakes the free web service, and the
embedded worker then drains the queued job.

Object storage (screenshots / audio / DOM) lives in **Cloudflare R2** (S3-compatible). Artifacts stay
**private**; the app serves them via presigned URLs.

---

## 2. Prerequisites

- A **Render** account.
- A **Cloudflare** account with **R2** enabled.
- An **OpenAI API key** (`sk-…`) with billing/credit — used for `whisper-1` (transcription) + `gpt-4o` (synthesis).
- The repo on **GitHub** (Render deploys from GitHub) and permission to authorize Render to read it.

---

## 3. Cloudflare R2 setup

1. Cloudflare → **R2** → **Create bucket** → name it exactly `flowbuddy-artifacts`.
   **Pre-create it** — the API runs `HeadBucket` at boot, so it never needs bucket-create permission.
2. R2 → **Manage R2 API Tokens** → **Create API token** → permission **Object Read & Write**, scoped to that bucket.
3. Note three values:
   - **Access Key ID**
   - **Secret Access Key**
   - **S3 endpoint** — `https://<YOUR_ACCOUNT_ID>.r2.cloudflarestorage.com` (account ID is on the R2 overview page).

---

## 4. Generate the auth secret

```bash
openssl rand -hex 32
```
Keep the output for `AUTH_SECRET` (Studio / Auth.js).

---

## 5. Push the code to your deploy branch

Render reads `render.yaml` from the branch you connect. Make sure the final code **and** `render.yaml`
are committed and pushed to that branch (e.g. `main`) before creating the blueprint.

---

## 6. Create the Blueprint on Render

1. Render dashboard → **New +** → **Blueprint**.
2. Connect/authorize the GitHub repo → select the **branch**.
3. Render parses `render.yaml` and shows the 5 resources + the `flowbuddy-dev-r2` group. Click **Apply**.

---

## 7. Set the secrets

Render prompts for every `sync: false` value. Set them as below. **URLs are not guaranteed** — see the
[suffix gotcha](#8-fix-the-service-urls-the-suffix-gotcha) — but set your best guess now and correct in step 8.

| Variable | Where | Value |
|---|---|---|
| `R2_ENDPOINT` | `flowbuddy-dev-r2` group | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | `flowbuddy-dev-r2` group | R2 token access key |
| `R2_SECRET_ACCESS_KEY` | `flowbuddy-dev-r2` group | R2 token secret |
| `R2_BUCKET` | `flowbuddy-dev-r2` group | `flowbuddy-artifacts` |
| `OPENAI_API_KEY` | **`flowbuddy-dev-api`** only | your `sk-…` (synthesis + the copilot answer engine; the Studio makes no OpenAI calls — its tester embeds the real widget → flowbuddy-dev-api) |
| `EMBED_MODEL` | `flowbuddy-dev-api` (blueprint sets it) | `text-embedding-3-small` — P1-M3 hybrid retrieval. ⚠️ Must be a **1536-dim** model (the `vector(1536)` column); the migration runs `CREATE EXTENSION vector` on deploy (Render Postgres supports it). |
| `FLOWBUDDY_STUDIO_URL` | **`flowbuddy-dev-api`** | the real `flowbuddy-dev-web` URL (see step 8) — the Studio origin is exempt from workspace origin allowlists so the Copilot page's real-widget tester keeps working after a customer restricts origins. ⚠️ Unset = the tester 403s for allowlisted workspaces. |
| `REASON_MODEL` | `flowbuddy-dev-api` (optional) | the P2-M5 diagnostic path's stronger (vision-capable) model; unset = falls back to `SYNTH_MODEL` (default `gpt-4o`) |
| `AUTH_SECRET` | `flowbuddy-dev-web` | output of step 4 |
| `AUTH_URL` | `flowbuddy-dev-web` | the real `flowbuddy-dev-web` URL (see step 8) |
| `FLOWBUDDY_API_URL` | `flowbuddy-dev-web` | the real `flowbuddy-dev-api` URL (see step 8) |
| `FLOWBUDDY_WIDGET_URL` | `flowbuddy-dev-web` | the real `flowbuddy-dev-widget` URL + `/flowbuddy-copilot.js` |
| `RESEND_API_KEY` | `flowbuddy-dev-web` | Resend key — **enables** email verification + password reset (§3.6). ⚠️ Before first enable, backfill: `UPDATE "User" SET "emailVerified" = now() WHERE "passwordHash" IS NOT NULL AND "emailVerified" IS NULL;` — pre-existing accounts can't sign in otherwise. Optional `EMAIL_FROM` needs a Resend-verified domain (default `onboarding@resend.dev` only delivers to the account owner). |

Auto-wired by the blueprint (do **not** set): `DATABASE_URL`, `REDIS_URL`, `PORT`, `R2_REGION`,
`TRANSCRIBE_MODEL`, `SYNTH_MODEL`, `AUTH_TRUST_HOST`, `LOG_LEVEL` (`info` — tunable live, see
[Logging in production](#logging-in-production)).

> **All three of `OPENAI_API_KEY`, `AUTH_SECRET`, and the R2 group are mandatory for a working stack** —
> and each one fails at a *different* moment (see the [troubleshooting table](#troubleshooting-real-errors-we-hit)).

---

## 8. Fix the service URLs (the suffix gotcha)

**Render appends a random suffix to a service's hostname if the plain name is already taken** — e.g. you
may get `https://flowbuddy-dev-web-uir8.onrender.com` even though the service is named `flowbuddy-dev-web` (in our deploy
`flowbuddy-dev-widget` stayed clean but `flowbuddy-dev-web` got `-uir8`). There is **no blueprint reference** for a service's
public URL, so:

1. After the services appear, open **each** of `flowbuddy-dev-api`, `flowbuddy-dev-web`, `flowbuddy-dev-widget` and copy its **real** URL.
2. On `flowbuddy-dev-web`, set the URL secrets to the **real** values:
   - `AUTH_URL` = real `flowbuddy-dev-web` URL
   - `FLOWBUDDY_API_URL` = real `flowbuddy-dev-api` URL (this is baked into the browser embed snippet **and** the extension connect payload — it must be the public URL, never an internal address)
   - `FLOWBUDDY_WIDGET_URL` = real `flowbuddy-dev-widget` URL + `/flowbuddy-copilot.js`
3. **Redeploy `flowbuddy-dev-web`** so the embed snippet and auth callbacks use the corrected URLs.

---

## 9. First deploy — what happens

- Each Docker image builds (full `pnpm install` per image — a few minutes).
- `flowbuddy-dev-api` start command runs `prisma migrate deploy` (creates all tables) **then** boots Fastify + the embedded worker. Logs are **structured JSON at `info`+** in prod (see [Logging in production](#logging-in-production)). Success in the `flowbuddy-dev-api` logs:
  ```
  All migrations have been successfully applied.
  {"level":"info","service":"api","port":8787,"env":"production","msg":"FlowBuddy api listening"}
  {"level":"info","service":"worker","queue":"synthesis","msg":"listening on queue"}
  ```
- A `503` on the first hit to `flowbuddy-dev-web` / `flowbuddy-dev-api` is a **free-tier cold start** (~1 min), **not** a crash.

---

## 10. Smoke test

- `flowbuddy-dev-widget` URL + `/flowbuddy-copilot.js` serves a minified JS bundle (it's a global static site — no cold start).
- `flowbuddy-dev-widget` URL + `/flowbuddy-copilot-render.js` serves the P2-M5 renderer bundle too (the widget lazy-loads it as a sibling of its own `src` when "Include page image" is on).
- `flowbuddy-dev-web` URL renders the **FlowBuddy Studio** sign-in page.
- Create an account in Studio (this exercises `AUTH_SECRET` + the DB).

---

## 11. Connect the recorder extension (prod build)

The Chrome extension is **not** deployed to Render — you build it locally pointed at your prod Studio. A
single env var (`STUDIO_URL`) bakes both the popup links (`__STUDIO_URL__`) and the connect-bridge
content-script `matches` (handled in [`packages/extension/build.mjs`](../packages/extension/build.mjs)).
**Since `ffa11a2` it accepts a comma-separated list** — the FIRST entry is the primary (what the popup
opens); ALL entries get the connect bridge, so one artifact connects against prod *and* local dev:

```bash
STUDIO_URL="https://<your-flowbuddy-dev-web-url>,http://localhost:3000" pnpm --filter @flowbuddy/extension build
```

Then `chrome://extensions` → **Load unpacked** → `packages/extension/dist` (or **Reload** if already loaded).
Click **Connect** — it opens `<your-flowbuddy-dev-web-url>/connect`, relays the token + prod API URL into the
extension, and shows as connected. *(Plain `pnpm --filter @flowbuddy/extension build` with no `STUDIO_URL`
reverts to localhost — the committed `src/manifest.json` stays localhost so local dev is unaffected.)*

**Chrome Web Store** (full per-version history + the cut-a-release checklist: [`extension-releases.md`](extension-releases.md)): **v0.3.0 is LIVE** (stop→upload feedback + resilience; approved after the
2026-07-06 submission) — prod-targeted (`https://flowbuddy-dev-web-uir8.onrender.com` + localhost):
<https://chromewebstore.google.com/detail/sync-recorder/njkfcfpehcklldmeofolnpdljdhcgofk>. Its
listing URL goes in `FLOWBUDDY_EXTENSION_URL` on `flowbuddy-dev-web` so the Home checklist's install CTA reads
"Add to Chrome". *(0.1.0/0.2.0 were dev builds whose bridge only matched localhost, so store installs
couldn't connect to the deployed Studio; v0.2.1 was the first prod-targeted release.)* **v0.4.0**
(**R13 ranked multi-signal locators** — the Sense-localization / Phase-3-replay enabler — + the
structured-logging pass; no new permissions) was **built + packaged 2026-07-13**
(`sync-recorder-0.4.0.zip`, upload to the dashboard pending). The store zip is built from
`dist/` (`cd dist && zip -r ../sync-recorder-<version>.zip .`). ⚠️ The baked Studio URL is part of the
store artifact — moving to a custom domain later means a rebuild + resubmission (add the new domain
to the list; keep the old one during the transition). ⚠️ After zipping, re-run a plain
`pnpm --filter @flowbuddy/extension build` so your local `dist/` goes back to the localhost-primary dev build.

---

## 12. End-to-end test

1. **Record** a narrated workflow → it uploads to the prod API → the embedded worker synthesizes it.
   Success log (JSON): `{"level":"info","service":"worker","sessionId":"<id>","workflows":N,"steps":M,…,"msg":"ready"}`.
2. In Studio → **Knowledge Base** → **approve** the workflow (the copilot only answers from approved content).
3. **Test the widget:** Studio → **Copilot** → copy the embed `<script>` (pre-filled with your prod API
   URL, widget URL, and public key). Set the **origin allowlist** (or leave empty = allow any). Drop the
   snippet into an HTML page **served over HTTP** (not `file://`):
   ```bash
   mkdir /tmp/widget-test && cd /tmp/widget-test
   # create index.html containing the snippet, then:
   python3 -m http.server 8080      # open http://localhost:8080
   ```
   The indigo launcher appears → ask a question about the approved workflow → expect a **grounded answer
   with citations**; ask something off-topic → expect an **honest decline** (logged as a coverage gap).
   The **first** question may take ~1 min (API cold start).

---

## Logging in production

The Node services log **structured JSON at `info`+** in prod (`NODE_ENV=production` is set in the
Dockerfiles; each line carries its `service` and secrets are redacted). The [`render.yaml`](../render.yaml)
blueprint sets `LOG_LEVEL: info` explicitly on **`flowbuddy-dev-api`** and **`flowbuddy-dev-web`** so the level is visible
and tunable in the dashboard.

**Change the level without a code redeploy** — Render → the service → **Environment** → edit `LOG_LEVEL`
→ save. Render restarts the service with the new value:

| Set `LOG_LEVEL` to | To… |
|---|---|
| `debug` | trace a request/synthesis path in prod (verbose — **set back to `info`** after) |
| `warn` | quieten a chatty service to warnings + errors only |
| `silent` | mute a service entirely |

`LOG_PRETTY=1` would switch a service to human-readable lines (rarely wanted in prod — JSON is what log
search ingests). The **Studio browser console** level is separate and **build-time** (`NEXT_PUBLIC_LOG_LEVEL`,
default `warn` in prod) — changing it means a rebuild, not just an env edit. Full model + local usage:
[`dev-setup.md` §7](dev-setup.md#7-logging-dev-vs-prod-and-how-to-turn-it-updown).

---

## Troubleshooting (real errors we hit)

| Symptom in the logs | Cause | Fix |
|---|---|---|
| Blueprint: `basic_256mb not a valid plan` | Render plan ids use **hyphens** | `basic-256mb` (Postgres). Service plans: `starter`, `standard`, … |
| Static build: `EROFS: read-only file system, unlink '/usr/bin/pnpx'` | `corepack enable` in Render's static builder (read-only `/usr/bin`) | Drop `corepack enable`; the builder already provides pnpm. Just `pnpm install --frozen-lockfile && pnpm --filter @flowbuddy/widget build` |
| `sh: 1: <whole command>: not found` · `Exited with status 127` | A `dockerCommand: sh -c "… && …"` — Render already wraps the command in its own `sh -c`, so the nested quotes/`&&` parse as one command | Make `dockerCommand` a **single token** (`pnpm --filter @flowbuddy/api start:all`) and put the `&&` chain **inside the npm script** |
| `AggregateError [ECONNREFUSED] … 127.0.0.1:9000` | `R2_ENDPOINT` unset → API defaults to local MinIO; `ensureBucket()` runs at **boot** | Set the `flowbuddy-dev-r2` group (R2_ENDPOINT/keys/bucket) and redeploy `flowbuddy-dev-api` |
| `[auth][error] MissingSecret: Please define a 'secret'` (signup/signin) | `AUTH_SECRET` unset (pages still render — it's GET-only) | Set `AUTH_SECRET` on `flowbuddy-dev-web`; also set `AUTH_URL` to the real URL |
| `[worker] failed …: 401 You didn't provide an API key` | `OPENAI_API_KEY` unset on `flowbuddy-dev-api` (API boots fine; only synthesis needs it) | Set `OPENAI_API_KEY` on `flowbuddy-dev-api`; **re-record** (failed jobs don't auto-retry — `attempts=1`, no reprocess route) |
| Copilot page real-widget tester returns nothing / errors | Since **Approach B** (2026-07-08) the tester embeds the real widget → it answers via **`flowbuddy-dev-api`** `/v1/copilot/answer`, **not** the web process. So the cause is on `flowbuddy-dev-api`: `OPENAI_API_KEY` unset, **or** a `403` because `FLOWBUDDY_STUDIO_URL` isn't set (the Studio origin must be allowlist-exempt) | Set `OPENAI_API_KEY` **and** `FLOWBUDDY_STUDIO_URL` (= the real `flowbuddy-dev-web` URL) on **`flowbuddy-dev-api`**; `flowbuddy-dev-web` needs **no** OpenAI key |
| `503` on first request | Free web service **cold start** (~1 min after 15 min idle) | Wait ~1 min; it's not a crash |
| Widget launcher doesn't appear | Page served via `file://`, or origin not in the allowlist (403) | Serve over HTTP; add the origin or empty the allowlist |
| `Eviction policy is allkeys-lru … should be "noeviction"` | Free Key Value default eviction (BullMQ prefers `noeviction`) | Non-fatal for testing; set `maxmemoryPolicy: noeviction` if you want it clean |

---

## Free-tier caveats (this config)

- **Free Postgres is deleted 30 days after creation** (14-day grace) — recreate when it lapses.
- **Free Key Value has no persistence** — a restart drops queued synthesis jobs (low risk: jobs run right after upload).
- **Free web services spin down after ~15 min idle** (~1 min cold start). The embedded worker only runs while `flowbuddy-dev-api` is awake.
- **750 free instance-hours/month per workspace** (shared); spun-down services don't consume them.

---

## Upgrading an existing deploy — the Phase 2 drop (Sense + Reason)

Taking a running deploy from Phase 1 to the Phase-2 code (Sense `8187af5` + Reason `cb143ca`), in order:

1. **Merge to the deploy branch & push** → Render rebuilds the Docker services.
2. **Migrations run automatically** on `flowbuddy-dev-api` boot (`prisma migrate deploy` in the start command — §9): `20260708121649_sense_in_context_help` + `20260713090000_reason_diagnostic`. Both are additive (new `Workspace` / `CopilotQuery` columns, defaults included) — no data backfill, no downtime concern. Confirm `All migrations have been successfully applied.` in the `flowbuddy-dev-api` logs.
3. **Set `FLOWBUDDY_STUDIO_URL` on `flowbuddy-dev-api`** (the real `flowbuddy-dev-web` URL) if it isn't set yet — without it the Studio's real-widget tester 403s once a workspace restricts origins (§7).
4. **Publish BOTH widget bundles** to `flowbuddy-dev-widget` from one `pnpm --filter @flowbuddy/widget build`: `flowbuddy-copilot.js` **and** `flowbuddy-copilot-render.js`, side by side (the widget derives the renderer URL as a sibling of its own `src`). A missing renderer never breaks answers — diagnostics silently degrade to structure-only.
5. *(Optional)* set `REASON_MODEL` on `flowbuddy-dev-api` for a stronger vision model on the diagnostic path (unset = `SYNTH_MODEL`, default `gpt-4o`).
6. **No other new env vars.** Behavior toggles are per-workspace in Studio → Copilot → Settings, with safe defaults: Sense **ON** · show-me OFF · Reason **ON** (masked, structure-only) · page image OFF · typed values OFF.
7. **Smoke test:** run [`e2e-testing.md`](e2e-testing.md) Part 11 against the deployed embed — a positional "what do I do next?" and a "why is this button disabled?" diagnosis; verify `CopilotQuery.reasonTrigger` is populated on the diagnostic row.

---

## Upgrading an existing deploy — the walkthrough drop (P4-M0, branch `feature-walkthrough`)

When `feature-walkthrough` (`711a18b` — P4-M0 guided walkthrough + Reason diagnosis hardening) merges to the deploy branch, on top of the Phase-2 steps above:

1. **Migrations run automatically** on `flowbuddy-dev-api` boot: `20260715155642_walkthrough_guided` (`Workspace.copilotWalkthrough` + the `CopilotWalkthrough` run table) and `20260715183302_reason_image_default_on` (a column-default flip only — **existing workspaces keep their current image-tier setting**; new workspaces default ON). Both additive, no backfill.
2. **Publish BOTH widget bundles again** — the base bundle grew (walkthrough module + alert-surface detection): `flowbuddy-copilot.js` + `flowbuddy-copilot-render.js`, side by side, from one `pnpm --filter @flowbuddy/widget build`.
3. **No new env vars.** New per-workspace toggle: Studio → Copilot → Settings → **Guided walkthrough** (default OFF, requires Sense).
4. **Smoke test:** [`e2e-testing.md`](e2e-testing.md) §11 — the walkthrough leg (offer → manual Next-driven steps → one `CopilotWalkthrough` row) and the rejected-action diagnosis (error banner beats form theories; fast-path follow-up acknowledges the banner).

---

## Upgrading an existing deploy — the FlowBuddy rename (2026-07-17)

The product was renamed **Sync → FlowBuddy**: blueprint service names (`sync-*` → `flowbuddy-dev-*`),
env-var names (`SYNC_*` → `FLOWBUDDY_*`), the widget bundles (`sync-copilot*.js` → `flowbuddy-copilot*.js`),
the embed contract (`data-sync-*` attrs → `data-flowbuddy-*`, key header `x-sync-key` → `x-flowbuddy-key`,
`window.SyncCopilot` → `window.FlowBuddy`), and the extension listing ("Sync Recorder" → "FlowBuddy Recorder").

**Render matches blueprint services by NAME, so this deploy is a re-create, not an upgrade:** syncing the
renamed `render.yaml` creates brand-new `flowbuddy-dev-*` services (new `*.onrender.com` URLs, fresh empty
free Postgres) and flags the old `sync-*` services for removal. Treat it as a first deploy — run §§6–10 —
with these rename-specific notes:

1. **Migrations:** the fresh database applies **every** migration from scratch on first `flowbuddy-dev-api`
   boot — the previously pending Sense/Reason/walkthrough migrations (the two "upgrading" sections above)
   are absorbed; no manual step. Old dev data is gone (disposable by design; `e2e-testing.md` starts clean).
2. **Secrets are NOT carried over** — re-enter the §7 table on the new services, using the **renamed** keys:
   `FLOWBUDDY_API_URL`, `FLOWBUDDY_WIDGET_URL` (now pointing at `flowbuddy-copilot.js`),
   `FLOWBUDDY_STUDIO_URL`, optional `FLOWBUDDY_EXTENSION_URL`. The `flowbuddy-dev-r2` group can keep the
   existing R2 credentials — pointing `R2_BUCKET` at the old `sync-artifacts` bucket still works, or
   pre-create `flowbuddy-artifacts-dev` for a clean cut (the api tries to auto-create a missing bucket,
   but a scoped R2 Object R/W token can't create buckets — pre-create it as in §3).
3. **New URLs everywhere** (suffix gotcha §8): `AUTH_URL`, `FLOWBUDDY_*` URLs, and any bookmarks.
4. **Embed snippets do not survive:** old test embeds load `sync-copilot.js` with `data-sync-*` attrs —
   both are gone. Re-copy the snippet from Studio → Copilot (new bundle URL + `data-flowbuddy-*` attrs).
5. **Extension:** rebuild with `STUDIO_URL="https://<new flowbuddy-dev-web URL>,http://localhost:3000"`;
   the packaged-but-never-uploaded v0.4.0 zip is **obsolete** (bakes the old dev URL — do not upload).
   Next store release = v0.5.0 as **FlowBuddy Recorder** — see [`extension-releases.md`](extension-releases.md).
6. **Delete the old `sync-*` services** (and the old `sync-r2` env group) once the new stack passes the
   §12 end-to-end test — nothing references them afterwards.

---

## Going to production

**The actual production plan (FlowBuddyAI.com — chosen plans, domains, runbook, scaling ladder) is
[`deploy-production.md`](deploy-production.md).** The mechanical deltas it draws from:

1. **Split the worker out** again into its own `type: worker` service (`dockerCommand: pnpm --filter @flowbuddy/api worker`; set `flowbuddy-dev-api` back to plain `start`). *(The standalone-worker blueprint is in git history — commit `3488326`.)*
2. **Move migrations** to a `preDeployCommand` on `flowbuddy-dev-api` (`pnpm --filter @flowbuddy/db exec prisma migrate deploy`) — paid plans support it; free plans don't, which is why the free config runs migrations in the start command.
3. **Paid plans:** Postgres → `basic-256mb`; web/worker/key-value → `starter` (or higher).
4. Optionally set the Key Value `maxmemoryPolicy: noeviction`.

---

## Reference: the secrets you provide (all `sync: false`)

```
flowbuddy-dev-r2 group : R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
flowbuddy-dev-api      : OPENAI_API_KEY, FLOWBUDDY_STUDIO_URL (= real flowbuddy-dev-web URL — Studio origin allowlist-exempt for the real-widget tester)
flowbuddy-dev-web      : AUTH_SECRET, AUTH_URL, FLOWBUDDY_API_URL, FLOWBUDDY_WIDGET_URL, RESEND_API_KEY   # NO OpenAI key — the Studio makes no OpenAI calls (Approach B: its tester embeds the real widget → flowbuddy-dev-api)
```

Everything else (`DATABASE_URL`, `REDIS_URL`, `PORT`, `R2_REGION`, `TRANSCRIBE_MODEL`, `SYNTH_MODEL`,
`AUTH_TRUST_HOST`) is wired automatically by [`render.yaml`](../render.yaml).
