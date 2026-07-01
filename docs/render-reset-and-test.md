# Reset Render data & test the copilot end-to-end (from scratch)

How to wipe the **data** on a live [Render](https://render.com) deploy and re-run the full copilot
walkthrough on a clean slate — record → KB → approve → embed → ask → verify.

This is the **cloud** counterpart to [`e2e-testing.md`](e2e-testing.md) (which resets a *local*
docker-compose stack). For the initial deploy + every secret, see [`deploy-render.md`](deploy-render.md).

> **You are wiping DATA, not the deploy.** The 5 Render resources and all env vars / secrets stay put.
> Only the contents of the three stores are cleared.

> 🔐 **Never commit live credentials.** The External Database URL and the R2 keys contain secrets.
> This doc uses **placeholders** — pull the real values from the Render dashboard at run time and keep
> them out of git (paste into the shell, or an **untracked** scratch file). The only hardcoded value
> here is the public Studio URL.

---

## 0. The three data stores (what gets wiped)

| Store | Render resource | Holds | Wiped by |
|---|---|---|---|
| Postgres | `sync-db` | users, workspaces, recordings, KB, approvals, copilot queries, **widget public key + extension connect tokens** | Step 1 |
| Object storage | Cloudflare **R2** (`sync-artifacts`) | screenshots / audio / DOM (`workspaces/<wsId>/sessions/<sessionId>/…`) | Step 2 |
| Queue | `sync-redis` (Key Value) | BullMQ synthesis jobs (transient, no persistence) | Step 3 *(optional)* |

⚠️ **Wiping Postgres deletes your account, workspace, the embed snippet's `data-sync-key`, and the
extension's connect token.** A from-scratch test therefore means: **new account → new keys →
re-connect the extension → re-copy the embed snippet** (Step 5).

---

## 1. Wipe Postgres (clear data + recreate schema)

`prisma migrate reset` drops the `public` schema and replays every migration in one shot. Run it from
**anywhere in the repo** (the `--filter` resolves the package from the workspace — no `cd` needed):

```bash
DATABASE_URL="<paste-external-database-url>" pnpm --filter @sync/db exec prisma migrate reset --force --skip-seed

DATABASE_URL=postgresql://sync:QLjmYJtIONxdywYuTmgW2OTi4tQKRY1d@dpg-d913kcdckfvc73eql550-a.oregon-postgres.render.com/sync_nw1o pnpm --filter @sync/db exec prisma migrate reset --force --skip-seed
```

- `<EXTERNAL_DATABASE_URL>` → Render dashboard → **sync-db** → **Connect** → **External Database URL**
  (the full `…oregon-postgres.render.com/sync_xxxx` host — **not** the internal one; your laptop can't
  reach internal). If Prisma complains about SSL, append `?sslmode=require`.
- `--force` skips the confirm prompt; `--skip-seed` suppresses the (absent) seed step.

✅ **PASS:** ends with `Database reset successful` + `All migrations have been successfully applied.`
No redeploy needed — `sync-api` already points at this DB, now empty + correctly schema'd.

**Alternative (no local Prisma):** `psql "<EXTERNAL_DATABASE_URL>"` → `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
then Render → **sync-api** → **Manual Deploy → Deploy latest** (its start command runs
`prisma migrate deploy`, recreating tables).

---

## 2. Empty the R2 bucket

Old artifacts are orphaned by the wipe (new workspace = new key prefix) and eat the free quota.
**Keep the bucket** (the API runs `HeadBucket` at boot) — just clear its contents:

```bash
AWS_ACCESS_KEY_ID="<R2_ACCESS_KEY_ID>" \
AWS_SECRET_ACCESS_KEY="<R2_SECRET_ACCESS_KEY>" \
AWS_DEFAULT_REGION=auto \
  aws s3 rm s3://sync-artifacts --recursive \
  --endpoint-url "<R2_ENDPOINT>"
```

Values live in the `sync-r2` env group (Render → **Env Groups → sync-r2**) / your Cloudflare R2 token.
No AWS CLI? Cloudflare dashboard → R2 → `sync-artifacts` → select objects → delete.

✅ **PASS:** `aws s3 ls s3://sync-artifacts --endpoint-url "<R2_ENDPOINT>"` returns nothing.

---

## 3. Flush Redis *(optional)*

Free Key Value has **no persistence** and jobs run right after upload, so this is usually unnecessary.
To be clean: Render → **sync-redis** → **Restart** (a restart flushes it). You can't `redis-cli` from
your laptop — `ipAllowList: []` blocks external access.

---

## 4. Confirm the services are healthy

Open the **sync-api** URL once to wake it (free tier cold-starts ~1 min after idle). The logs should show:

```
All migrations have been successfully applied.
Sync api on :8787
[worker] listening on queue "synthesis"
```

✅ **PASS:** all three lines present; no `ECONNREFUSED` (R2) or `MissingSecret` (auth) errors.

---

## 5. Test from scratch

Mirrors [`deploy-render.md`](deploy-render.md) §10–12, with the **post-wipe gotchas** called out.

### 5.1 Create a new account
Open **https://sync-web-uir8.onrender.com** → sign up. This creates a fresh workspace + a **new**
public widget key and connect token.

✅ **PASS:** you land in the empty Studio (Home dashboard, no recordings).

### 5.2 Re-connect the extension
The old connect token is gone. If your prod build is still installed, just click **Connect**.

**Which Studio the extension talks to is baked at build time via `STUDIO_URL`** — one build targets one
Studio. Pick the build for what you're testing against:

| Testing against | Build command | What gets baked |
|---|---|---|
| **Local** (docker-compose) | `pnpm --filter @sync/extension build` *(default `http://localhost:3000`)* | connect-bridge `matches` + popup links → **localhost**; handshake carries the local API (`http://localhost:8787`) |
| **Render** (this dev deploy) | `STUDIO_URL=https://sync-web-uir8.onrender.com pnpm --filter @sync/extension build` | connect-bridge `matches` + popup links → **Render**; handshake carries the deploy's `SYNC_API_URL` |

Then `chrome://extensions` → **Reload** / **Load unpacked** → `packages/extension/dist` → **Connect**
(opens `…/connect`, relaying the token + API URL into the extension).

Notes when switching targets:
- **The upload API URL is _not_ baked** — the extension receives it from the connect handshake (the
  Studio's `SYNC_API_URL`). So a Render build uploads to the prod API; a localhost build to `:8787`.
- **Rebuild _and_ reconnect when you switch.** A localhost build only injects its connect bridge on
  `localhost:3000`, so it can't connect through the Render `/connect` page (and vice-versa); the old
  token won't match either. Rebuild → **Reload** the extension → **Connect** again.
- **Upload progress differs by transport:** Render serves HTTP/2 → the popup shows a real determinate
  **%**; local dev is HTTP/1.1 → an **indeterminate** bar (Chrome only allows a streamed request body
  over HTTP/2). Both upload fine — only the progress UI differs.

✅ **PASS:** the extension popup shows **Connected** (to the Studio you built against).

### 5.3 Record a workflow
Record a **narrated** workflow → it uploads to the prod API → the embedded worker synthesizes it.

✅ **PASS:** `sync-api` log shows `[worker] ready <id>: N workflow(s), M distilled step(s)…`; the
recording appears under Studio → **Recordings**.

### 5.4 Approve it
Studio → **Knowledge Base** → **approve** the workflow (the copilot only answers from approved content).

✅ **PASS:** the workflow flips to **approved · live**.

### 5.5 Test the widget
Studio → **Copilot** → **re-copy the embed `<script>`** — the `data-sync-key` is **new** after the wipe,
so don't reuse an old snippet (it's pre-filled with the prod API URL, widget URL, and new public key).
Set the **origin allowlist** (or leave empty = allow any). Drop it into an HTML page **served over HTTP**
(not `file://`):

```bash
mkdir /tmp/widget-test && cd /tmp/widget-test
# create index.html containing the snippet, then:
python3 -m http.server 8080      # open http://localhost:8080
```

✅ **PASS:** the indigo launcher appears → ask about the approved workflow → **grounded answer with
citations**; ask something off-topic → **honest decline** (logged as a coverage gap). The first question
may take ~1 min (API cold start).

### 5.6 Verify analytics
Studio → **Analytics**.

✅ **PASS:** the questions you asked appear; the answered/declined counts and citation stats reflect them.

---

## Post-wipe checklist (the things people forget)

- [ ] **New account** created (old users are gone).
- [ ] **Extension re-connected** (old token invalid).
- [ ] **Embed snippet re-copied** — new `data-sync-key`.
- [ ] **R2 emptied** so old artifacts don't linger / count against quota.
- [ ] Env vars / secrets were **not** touched — no need to re-enter them.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `prisma migrate reset` can't connect | Used the **internal** DB URL, or missing SSL | Use the **External Database URL**; append `?sslmode=require` |
| `503` on first request to sync-web / sync-api | Free-tier **cold start** (~1 min after 15 min idle) | Wait ~1 min; not a crash |
| `AggregateError [ECONNREFUSED] … :9000` in sync-api | `R2_ENDPOINT` unset → defaults to local MinIO | Confirm the `sync-r2` group is set; redeploy `sync-api` |
| Widget launcher doesn't appear | Page served via `file://`, or origin blocked (403) | Serve over HTTP; add the origin or empty the allowlist |
| `[worker] failed …: 401 … API key` | `OPENAI_API_KEY` unset on `sync-api` | Set it; **re-record** (failed jobs don't auto-retry) |
| `500` on Copilot page "Test live" | `OPENAI_API_KEY` unset on **`sync-web`** | Set it on `sync-web` and redeploy |

More rows + the URL-suffix gotcha: [`deploy-render.md` → Troubleshooting](deploy-render.md#troubleshooting-real-errors-we-hit).
