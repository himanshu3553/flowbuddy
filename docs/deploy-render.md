# Deploying Sync to Render.com

Step-by-step guide to deploy the Phase-1 copilot stack to [Render](https://render.com) on the
**free tier ($0/mo)**, with every gotcha we hit on the first real deploy baked in. For local dev see
[`dev-setup.md`](dev-setup.md); for what the modules are see [`phase-1-copilot.md`](phase-1-copilot.md).

> The single Render-specific file is [`render.yaml`](../render.yaml) (a Render **Blueprint**). The app
> code stays host-agnostic. This doc tracks the **free/testing** configuration that ships in `render.yaml`;
> a [Going to production](#going-to-production) section lists the deltas for an always-on paid setup.

---

## 1. What gets deployed (topology)

The blueprint provisions **5 resources** (all free):

| Resource | Type | Runtime | Role |
|---|---|---|---|
| `sync-db` | PostgreSQL | Postgres 18 | the database |
| `sync-redis` | Key Value | Valkey 8 | BullMQ job queue (synthesis) |
| `sync-api` | Web service | Docker | copilot answer API + recorder ingestion **+ the synthesis worker** (folded in — see below) |
| `sync-web` | Web service | Docker | the Next.js **Studio** (approve workflows, copilot settings, analytics) |
| `sync-widget` | Static site | Static | hosts the embeddable `sync-copilot.js` bundle |

Plus an **environment group** `sync-r2` holding the shared Cloudflare R2 credentials.

**Why the worker is folded into the API:** Render background workers are **paid-only**. For a $0 deploy,
the synthesis worker runs *inside* the `sync-api` web service via the `start:all` entrypoint
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

1. Cloudflare → **R2** → **Create bucket** → name it exactly `sync-artifacts`.
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
3. Render parses `render.yaml` and shows the 5 resources + the `sync-r2` group. Click **Apply**.

---

## 7. Set the secrets

Render prompts for every `sync: false` value. Set them as below. **URLs are not guaranteed** — see the
[suffix gotcha](#8-fix-the-service-urls-the-suffix-gotcha) — but set your best guess now and correct in step 8.

| Variable | Where | Value |
|---|---|---|
| `R2_ENDPOINT` | `sync-r2` group | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | `sync-r2` group | R2 token access key |
| `R2_SECRET_ACCESS_KEY` | `sync-r2` group | R2 token secret |
| `R2_BUCKET` | `sync-r2` group | `sync-artifacts` |
| `OPENAI_API_KEY` | **`sync-api`** + **`sync-web`** | your `sk-…` (api = synthesis; web = the in-Studio copilot tester) |
| `AUTH_SECRET` | `sync-web` | output of step 4 |
| `AUTH_URL` | `sync-web` | the real `sync-web` URL (see step 8) |
| `SYNC_API_URL` | `sync-web` | the real `sync-api` URL (see step 8) |
| `SYNC_WIDGET_URL` | `sync-web` | the real `sync-widget` URL + `/sync-copilot.js` |
| `RESEND_API_KEY` | `sync-web` | Resend key — **enables** email verification + password reset (§3.6). ⚠️ Before first enable, backfill: `UPDATE "User" SET "emailVerified" = now() WHERE "passwordHash" IS NOT NULL AND "emailVerified" IS NULL;` — pre-existing accounts can't sign in otherwise. Optional `EMAIL_FROM` needs a Resend-verified domain (default `onboarding@resend.dev` only delivers to the account owner). |

Auto-wired by the blueprint (do **not** set): `DATABASE_URL`, `REDIS_URL`, `PORT`, `R2_REGION`,
`TRANSCRIBE_MODEL`, `SYNTH_MODEL`, `AUTH_TRUST_HOST`.

> **All three of `OPENAI_API_KEY`, `AUTH_SECRET`, and the R2 group are mandatory for a working stack** —
> and each one fails at a *different* moment (see the [troubleshooting table](#troubleshooting-real-errors-we-hit)).

---

## 8. Fix the service URLs (the suffix gotcha)

**Render appends a random suffix to a service's hostname if the plain name is already taken** — e.g. you
may get `https://sync-web-uir8.onrender.com` even though the service is named `sync-web` (in our deploy
`sync-widget` stayed clean but `sync-web` got `-uir8`). There is **no blueprint reference** for a service's
public URL, so:

1. After the services appear, open **each** of `sync-api`, `sync-web`, `sync-widget` and copy its **real** URL.
2. On `sync-web`, set the URL secrets to the **real** values:
   - `AUTH_URL` = real `sync-web` URL
   - `SYNC_API_URL` = real `sync-api` URL (this is baked into the browser embed snippet **and** the extension connect payload — it must be the public URL, never an internal address)
   - `SYNC_WIDGET_URL` = real `sync-widget` URL + `/sync-copilot.js`
3. **Redeploy `sync-web`** so the embed snippet and auth callbacks use the corrected URLs.

---

## 9. First deploy — what happens

- Each Docker image builds (full `pnpm install` per image — a few minutes).
- `sync-api` start command runs `prisma migrate deploy` (creates all tables) **then** boots Fastify + the embedded worker. Success in the `sync-api` logs:
  ```
  All migrations have been successfully applied.
  Sync api on :8787
  [worker] listening on queue "synthesis"
  ```
- A `503` on the first hit to `sync-web` / `sync-api` is a **free-tier cold start** (~1 min), **not** a crash.

---

## 10. Smoke test

- `sync-widget` URL + `/sync-copilot.js` serves a minified JS bundle (it's a global static site — no cold start).
- `sync-web` URL renders the **Sync Studio** sign-in page.
- Create an account in Studio (this exercises `AUTH_SECRET` + the DB).

---

## 11. Connect the recorder extension (prod build)

The Chrome extension is **not** deployed to Render — you build it locally pointed at your prod Studio. A
single env var (`STUDIO_URL`) bakes both the popup links (`__STUDIO_URL__`) and the connect-bridge
content-script `matches` (handled in [`packages/extension/build.mjs`](../packages/extension/build.mjs)).
**Since `ffa11a2` it accepts a comma-separated list** — the FIRST entry is the primary (what the popup
opens); ALL entries get the connect bridge, so one artifact connects against prod *and* local dev:

```bash
STUDIO_URL="https://<your-sync-web-url>,http://localhost:3000" pnpm --filter @sync/extension build
```

Then `chrome://extensions` → **Load unpacked** → `packages/extension/dist` (or **Reload** if already loaded).
Click **Connect** — it opens `<your-sync-web-url>/connect`, relays the token + prod API URL into the
extension, and shows as connected. *(Plain `pnpm --filter @sync/extension build` with no `STUDIO_URL`
reverts to localhost — the committed `src/manifest.json` stays localhost so local dev is unaffected.)*

**Chrome Web Store (published 2026-07-06):** v0.1.0 is live and v0.2.1 (the first prod-targeted build:
`https://sync-web-uir8.onrender.com` + localhost) is submitted for review — 0.1.0/0.2.0 were dev builds
whose bridge only matched localhost, so store installs couldn't connect to the deployed Studio. The
store zip is built from `dist/` (`cd dist && zip -r ../sync-recorder-<version>.zip .`). ⚠️ The baked
Studio URL is part of the store artifact — moving to a custom domain later means a rebuild +
resubmission (add the new domain to the list; keep the old one during the transition).

---

## 12. End-to-end test

1. **Record** a narrated workflow → it uploads to the prod API → the embedded worker synthesizes it.
   Success log: `[worker] ready <id>: N workflow(s), M distilled step(s)…`.
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

## Troubleshooting (real errors we hit)

| Symptom in the logs | Cause | Fix |
|---|---|---|
| Blueprint: `basic_256mb not a valid plan` | Render plan ids use **hyphens** | `basic-256mb` (Postgres). Service plans: `starter`, `standard`, … |
| Static build: `EROFS: read-only file system, unlink '/usr/bin/pnpx'` | `corepack enable` in Render's static builder (read-only `/usr/bin`) | Drop `corepack enable`; the builder already provides pnpm. Just `pnpm install --frozen-lockfile && pnpm --filter @sync/widget build` |
| `sh: 1: <whole command>: not found` · `Exited with status 127` | A `dockerCommand: sh -c "… && …"` — Render already wraps the command in its own `sh -c`, so the nested quotes/`&&` parse as one command | Make `dockerCommand` a **single token** (`pnpm --filter @sync/api start:all`) and put the `&&` chain **inside the npm script** |
| `AggregateError [ECONNREFUSED] … 127.0.0.1:9000` | `R2_ENDPOINT` unset → API defaults to local MinIO; `ensureBucket()` runs at **boot** | Set the `sync-r2` group (R2_ENDPOINT/keys/bucket) and redeploy `sync-api` |
| `[auth][error] MissingSecret: Please define a 'secret'` (signup/signin) | `AUTH_SECRET` unset (pages still render — it's GET-only) | Set `AUTH_SECRET` on `sync-web`; also set `AUTH_URL` to the real URL |
| `[worker] failed …: 401 You didn't provide an API key` | `OPENAI_API_KEY` unset on `sync-api` (API boots fine; only synthesis needs it) | Set `OPENAI_API_KEY` on `sync-api`; **re-record** (failed jobs don't auto-retry — `attempts=1`, no reprocess route) |
| `500` on the Copilot page "Test live" (POST `/dashboard/copilot`) | `OPENAI_API_KEY` unset on **`sync-web`** — the in-Studio copilot tester calls OpenAI from the web process | Set `OPENAI_API_KEY` on `sync-web` and redeploy |
| `503` on first request | Free web service **cold start** (~1 min after 15 min idle) | Wait ~1 min; it's not a crash |
| Widget launcher doesn't appear | Page served via `file://`, or origin not in the allowlist (403) | Serve over HTTP; add the origin or empty the allowlist |
| `Eviction policy is allkeys-lru … should be "noeviction"` | Free Key Value default eviction (BullMQ prefers `noeviction`) | Non-fatal for testing; set `maxmemoryPolicy: noeviction` if you want it clean |

---

## Free-tier caveats (this config)

- **Free Postgres is deleted 30 days after creation** (14-day grace) — recreate when it lapses.
- **Free Key Value has no persistence** — a restart drops queued synthesis jobs (low risk: jobs run right after upload).
- **Free web services spin down after ~15 min idle** (~1 min cold start). The embedded worker only runs while `sync-api` is awake.
- **750 free instance-hours/month per workspace** (shared); spun-down services don't consume them.

---

## Going to production

To run always-on and reliable, edit `render.yaml`:

1. **Split the worker out** again into its own `type: worker` service (`dockerCommand: pnpm --filter @sync/api worker`; set `sync-api` back to plain `start`). *(The standalone-worker blueprint is in git history — commit `3488326`.)*
2. **Move migrations** to a `preDeployCommand` on `sync-api` (`pnpm --filter @sync/db exec prisma migrate deploy`) — paid plans support it; free plans don't, which is why the free config runs migrations in the start command.
3. **Paid plans:** Postgres → `basic-256mb`; web/worker/key-value → `starter` (or higher).
4. Optionally set the Key Value `maxmemoryPolicy: noeviction`.

---

## Reference: the secrets you provide (all `sync: false`)

```
sync-r2 group : R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
sync-api      : OPENAI_API_KEY
sync-web      : OPENAI_API_KEY, AUTH_SECRET, AUTH_URL, SYNC_API_URL, SYNC_WIDGET_URL, RESEND_API_KEY
```

Everything else (`DATABASE_URL`, `REDIS_URL`, `PORT`, `R2_REGION`, `TRANSCRIBE_MODEL`, `SYNTH_MODEL`,
`AUTH_TRUST_HOST`) is wired automatically by [`render.yaml`](../render.yaml).
