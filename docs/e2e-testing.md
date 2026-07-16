# Sync — End-to-End Testing Guide

The full manual test plan for the Sync copilot — from a clean slate → record a product → build the Knowledge Base → approve workflows → embed the copilot → ask questions → verify analytics — at **three deployment levels**:

| Level | Where | Section |
|---|---|---|
| **1 · Local** | your machine — docker-compose (Postgres + Redis + MinIO) | [Level 1 — Local testing on localhost](#level-1--local-testing-on-localhost) |
| **2 · Dev** | Render free tier (`sync-web-uir8.onrender.com`) + Cloudflare R2 | [Level 2 — Dev testing on Render](#level-2--dev-testing-on-render) |
| **3 · Prod** | Render paid tier — **not deployed yet** | [Level 3 — Prod testing on Render](#level-3--prod-testing-on-render-placeholder) |

> **Scope.** This covers the **Phase-1 copilot** product end-to-end (P1-M0…M12). Portal/article features (Version 2) are out of scope ([`v2-portal.md`](v2-portal.md)). There is no automated test harness — verification is `pnpm typecheck` + `pnpm build` + this manual walkthrough.
>
> **Workflow-segmentation quality** (the "one task = one workflow" fix) is covered inline in **Part 6** of Level 1.

---

## Architecture under test (what each step exercises)

```
Chrome Extension ──upload──▶  API (Fastify :8787)  ──enqueue──▶  Worker (BullMQ)
   (record + narrate)            /v1/sessions             transcribe → clean → segment → distill
                                                                         │
                                                                         ▼
        Studio (Next.js :3000) ◀── reads ── Postgres / MinIO ◀── writes distilled steps + segments
        Recordings · KB approval · Copilot settings · Analytics
                                                                         │
   Widget (<script>) ──ask──▶ API /v1/copilot/answer ──grounded in APPROVED KB only──▶ answer
```

Stores: **Postgres** (data) · **object storage** for screenshots/audio (**MinIO** locally, **Cloudflare R2** on Render) · **Redis** (job queue). One Render-specific difference: on the free tier the worker runs **inside** the api web service (`start:all`) instead of as a separate process.

---
---

# **LEVEL 1 — LOCAL TESTING ON LOCALHOST**

---

Everything runs on your machine: docker-compose infra + dev servers. Follow it in order; each part lists what to do and the **PASS** signal.

## 0. Prerequisites (one-time)

```bash
cd /Users/himansusingh/Documents/Code/sync
corepack enable
pnpm install
```

**Environment files** (git-ignored, already present locally — confirm contents):
- `packages/api/.env` — must contain a valid **`OPENAI_API_KEY`** (the worker calls Whisper to transcribe + the chat model to segment; the copilot endpoint calls the chat model to answer). Also `DATABASE_URL`, `REDIS_URL`, the `R2_*` MinIO vars. Defaults: `TRANSCRIBE_MODEL=whisper-1`, `SYNTH_MODEL=gpt-4o`.
- `packages/web/.env` — `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL=http://localhost:3000`, and `SYNC_API_URL=http://localhost:8787`.
- `packages/db/.env` — `DATABASE_URL`.
- `.env.example` (root) documents every variable.

**Docker Desktop must be running.**

✅ **PASS:** `pnpm install` completes; `.env` files exist with a real `OPENAI_API_KEY`.

---

## 1. Build & static checks (catch breakage before running)

```bash
pnpm typecheck     # type-check every package
pnpm build         # build every package in dependency order (Turbo)
pnpm lint          # lint
```

✅ **PASS:** all three exit 0 with no errors.

---

## 2. Reset to a clean slate (optional but recommended)

Wipes Postgres (recordings/KB/approvals/users/tokens), MinIO (artifacts), and Redis (queue). **Stop any running api/worker/web dev processes first (Ctrl-C).**

```bash
# 0. Stop any dev servers still holding the app ports (web · api · widget demo · prisma studio)
lsof -ti tcp:3000,tcp:8787,tcp:8080,tcp:5555 | xargs kill 2>/dev/null

# 1. Tear down infra + volumes
docker compose down -v

# 2. Fresh infra
docker compose up -d

# 3. Wait for Postgres healthy
until [ "$(docker inspect -f '{{.State.Health.Status}}' sync-postgres-1)" = "healthy" ]; do sleep 1; done; echo "postgres healthy"

# 4. Recreate schema (+ regenerate Prisma client)
pnpm db:migrate
```

**Verify empty:**
```bash
docker exec sync-postgres-1 psql -U sync -d sync -t -c \
  'select count(*) from "User"; select count(*) from "RecSession"; select count(*) from "KnowledgeItem"; select count(*) from "CopilotApproval";'
# → all 0
```

✅ **PASS:** all counts are 0. (The MinIO `sync-artifacts` bucket auto-creates when the API boots in Part 3.)

> Note: one Prisma model maps to a differently-named table — the **`KnowledgeSource`** model is the **`RecSession`** table (`@@map`, to preserve existing data). `KnowledgeItem` and `CopilotApproval` keep their model names (hence the `"CopilotApproval"` query above).

---

## 3. Bring up the stack

Three terminals, all from the repo root:

```bash
# Terminal 1 — ingestion API + copilot endpoints → :8787
pnpm --filter @sync/api dev

# Terminal 2 — worker (transcribe → clean → segment → distill). REQUIRED for processing.
pnpm --filter @sync/api worker

# Terminal 3 — Studio → http://localhost:3000
pnpm --filter @sync/web dev
```

✅ **PASS:**
- API terminal: an `INFO … Sync api listening` line with `port: 8787` (and the MinIO bucket is ensured on boot).
- Worker terminal: an `INFO … listening on queue` line with `service: worker`, `queue: synthesis`.
- `curl -s http://localhost:8787/healthz` → `{"ok":true}`.
- http://localhost:3000 loads and redirects to `/signin`.

> **Log format locally:** the Node services log at `debug` level, **pretty-printed** in an interactive terminal (each line = a colorized `LEVEL … msg` with its fields indented below). To quieten or change it, see the [Logging](#logging-local) note below / [`dev-setup.md` §7](dev-setup.md#7-logging-dev-vs-prod-and-how-to-turn-it-updown).

---

## Logging (local)

The Node services (`api`, `worker`, Studio server) share one structured logger (`@sync/logger`, Pino). **Locally the default is verbose + readable** — level `debug`, pretty-printed — so you can watch capture → synthesis progress in Parts 3–13. Change it with env vars on the process you're running:

```bash
LOG_LEVEL=warn   pnpm --filter @sync/api worker   # only warnings + errors
LOG_LEVEL=silent pnpm --filter @sync/api dev       # mute a service
LOG_PRETTY=0     pnpm --filter @sync/api dev        # emit prod-style JSON locally
```

The **widget** logs nothing by default (it runs on customer sites) — add `data-sync-debug="true"` to its `<script>` to see its console diagnostics. The **Studio browser console** level is `NEXT_PUBLIC_LOG_LEVEL` (build-time; `debug` in dev). Full model + prod control: [`dev-setup.md` §7](dev-setup.md#7-logging-dev-vs-prod-and-how-to-turn-it-updown).

---

## 4. Account & workspace (Studio)

1. Open **http://localhost:3000/signup**, create an account (email + password).
   - This calls `createUserWithWorkspace` → a User + an auto-created Workspace (single-user = single-workspace).
2. You land in **Sync Studio** (`/dashboard`) — the "Welcome / Get started" checklist (0 of 4 done).
3. (Re-login check) Sign out and sign back in at `/signin` with the same credentials.

✅ **PASS:** signup creates the account, signin works, the dashboard shows the 4-step "Get started" checklist.

---

## 5. Recorder extension — build, load, connect

1. Build:
   ```bash
   pnpm --filter @sync/extension build   # → packages/extension/dist/
   ```
2. Load in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `packages/extension/dist/`. (If already loaded, click the card's refresh icon.)
3. Click the **Sync Recorder** toolbar icon → it shows **Not connected** → click **Connect** (opens Studio `/connect`).
4. On the `/connect` page (signed in), click **Connect** → it mints a fresh workspace API token (`connectExtension`) and hands it to the extension via `postMessage` (API base defaults to `http://localhost:8787`). No copy/paste.
5. Reopen the extension popup → it should read **✓ Connected as &lt;email&gt;**.

✅ **PASS:** popup shows "Connected as …"; Studio **Settings** page now shows the workspace + an "Extension API token" was created (dashboard step 1 flips to done).

---

## 6. Record a workflow → KB build → **segmentation quality**

This is the core capture → knowledge path **and** the workflow-segmentation quality gate.

### 6a. Record (the canonical test case: sign-in)
1. Navigate to a real product page (the reference case is **chatful.co**).
2. Extension popup → **Start recording**. Grant mic permission if prompted. **Narrate continuously** — narration is a primary segmentation signal. Example:
   > "I'm going to show how to sign in on Chatful. This is the landing page. Click **Sign in** at the top-right. The login page opens. Enter your email, then your password. Optionally tick **Remember me**. Click **Sign in** — and you land on the dashboard. You're signed in."
3. Perform: click **Sign in** → type email → type password → (optional) toggle **Remember me** → click **Sign in** → land on dashboard.
4. **Do NOT add markers** (the popup's marker button) — reproduces the "absent markers → one workflow" path.
5. Extension popup → **Stop & upload** (the popup shows the **uploading** state, then the toolbar badge ↑→✓). The bundle (events + screenshots + audio + manifest) uploads to `POST /v1/sessions`.

### 6b. Worker processing
Watch the **worker terminal** — the worker logs (pretty-printed locally, `service: worker`) progress through these messages:
```
processing session                  (fields: sessionId, jobId)
embedded items for hybrid retrieval (fields: sessionId, count = M)
ready                               (fields: sessionId, workflows = 1, steps = M, segments = N)
```
*(The worker cleans + distills raw events into clean per-workflow steps — see [`kb-step-distillation.md`](kb-step-distillation.md). `steps` is the **distilled step** count, not the raw event count. The `embedded …` line is P1-M3 hybrid retrieval — if it's missing and a "Semantic search is unavailable" notice appears on the recording instead, embedding failed and answers fall back to keyword matching until re-processed.)*

✅ **PASS criteria:**
- Upload returns a `sessionId` (extension shows success; no 401).
- Worker reaches `status → ready`.
- **The recording produces exactly ONE workflow** (the `ready` log shows `workflows: 1`), titled by its goal (e.g. *"Sign in"*), not split into *Navigating…/Filling…/Setting Remember Me…/Submitting…*.

❌ **FAIL:** ≥2 workflows, or any workflow titled by a phase. **If it still over-splits,** the lever is the segmenter prompt + inputs in [`packages/synthesis/src/segment.ts`](../packages/synthesis/src/segment.ts): strengthen the "default to ONE workflow" framing, confirm the full transcript reaches it as `overallNarration` (needs captured audio narration), and check no markers were placed unintentionally.

**Multi-task split check (positive control):** record a second session doing **two genuinely different tasks** (e.g. *sign in*, then *change your password*), optionally pressing the **marker** button between them. PASS = it returns **two** workflows. This proves the segmenter still splits when it should.

---

## 7. Studio — review the Knowledge Base

1. Studio → **Recordings**: the session is listed with a **Ready** status badge and the app's base URL.
2. Click it → the **Knowledge Base** page (`/dashboard/kb/<id>`):
   - The **"Steps by workflow"** panel shows the step count and **N workflow(s)** (expect **1** for the sign-in case).
   - The **"Approve workflows for the copilot"** panel lists each workflow with its step count and an approve toggle.
   - Each step is a **clean, distilled instruction** (stray clicks dropped, low-level interactions merged) grounded in real captured events + aligned narration, with one curated screenshot.

✅ **PASS:** the KB page renders one goal-titled workflow with clean distilled steps; nothing is mangled or duplicated.

---

## 8. Approval gate (the trust boundary)

1. On the KB page, toggle the sign-in workflow **approved** (`Switch`). Counter updates ("1 of 1 approved").
2. (Persistence) Reload the page → the toggle stays on.

✅ **PASS:** approval persists (a `CopilotApproval` row keyed by `sourceId + segmentIndex`). Dashboard step 3 ("Approve a workflow") flips to done.

> Approval survives reprocess: it's keyed by `(sourceId, segmentIndex)`, not by the KnowledgeItem id.

---

## 9. Copilot embed key + origin allowlist

1. Studio → **Copilot** page:
   - Shows **N workflow(s) approved**.
   - **Public embeddable key** (`data-sync-key`) is generated (`getOrCreateCopilotKey`) — distinct from the secret recorder token.
   - **Embed snippet** is shown (`<script src=… data-sync-api data-sync-key>` — appearance is NOT baked in; it's served live by `GET /v1/copilot/config`).
2. In the **Allowed origins** control, add `http://localhost:8080` (where the demo page is served in Part 10). Save.

✅ **PASS:** a public key exists; the snippet renders with it; the allowed-origins list saves.

---

## 10. Widget embed — end-to-end copilot answer

The widget must be served over **HTTP**, not `file://` (or no launcher icon appears).

1. Build the widget + serve the demo:
   ```bash
   pnpm --filter @sync/widget build      # → dist/sync-copilot.js + dist/sync-copilot-render.js (siblings)
   cd packages/widget && python3 -m http.server 8080
   ```
2. Edit `packages/widget/demo/index.html`: set `data-sync-key` to the **public key** from Part 9 and `data-sync-api="http://localhost:8787"`.
3. Open **http://localhost:8080/demo/** → a launcher appears bottom-right → open it.

**Test matrix:**

| # | Ask | Expected |
|---|---|---|
| 10a | *"How do I sign in?"* | **Answered**, grounded in the approved sign-in workflow, with citation(s). |
| 10b | *"How do I delete my account?"* (not recorded) | **Honest decline** ("I don't have that in approved help…"), no hallucination. |
| 10c | *(no question)* Change the accent/title in Studio → Copilot → **Appearance** → **Save** (a green toast confirms) → reload the demo page | The embedded widget reflects the new look **without touching the snippet** (served by `GET /v1/copilot/config`). |
| 10c | Thumbs **up/down** on an answer | Accepted (`/v1/copilot/feedback`). |
| 10d | Origin not allowlisted | Serve demo from a different port not in the allowlist → answer request rejected (origin/`x-sync-key` check). |
| 10e | Rapid-fire questions | Eventually `429` rate-limit. |

✅ **PASS:** 10a answers and cites; 10b declines honestly; feedback + origin + rate-limit behave as above.

> If you wiped data (Part 2), the demo's old `data-sync-key` is stale — refresh it from the Copilot page.

> **Embedding in your own test app instead of the bundled demo?** The snippet the Studio's Install
> tab shows uses `SYNC_WIDGET_URL` for its `src` — unset locally it renders the placeholder
> `https://YOUR_WIDGET_HOST/sync-copilot.js`, which silently fails to load (**no launcher at all**).
> Either set `SYNC_WIDGET_URL=http://localhost:8080/dist/sync-copilot.js` in `packages/web/.env`
> (restart Studio) so the copied snippet just works, or point `src` there by hand. In a React/Next
> app, a `<script>` tag inside JSX does **not** execute — put the snippet in the HTML shell
> (`index.html`) or use `next/script`.

---

## 11. Sense (positional answers) · Reason (diagnostics) · Guided walkthrough (P4-M0)

All three ride the Part-10 embed (or your own test app — remember to copy **both** widget bundles there after a rebuild). Sense + Reason are ON by default per workspace (Studio → Copilot → Settings); the page image, typed values, "Show me" and **Guided walkthrough** are separate founder opt-ins.

**Sense (in-context help):**
1. Open a recorded flow mid-workflow (e.g. the sign-in form), fill some fields, open the copilot and ask *"what do I do next?"*.
2. Expect a **positional** answer anchored on the step you're actually on — and on a follow-up (*"then?"*) with an unchanged page it must **re-anchor**, never advance past an uncompleted step.
3. With **"Show me" highlight** ON (reload the host page after flipping), a positional answer also outlines the current step's element for ~6s.

✅ **PASS:** the answer names your real current step; "then?" on an unchanged page re-anchors; those rows log `CopilotQuery.senseUsed='used'`.

**Reason (diagnostic reasoning):**
1. Put the page into a blocked state (leave a required field empty / fail on-screen password rules so submit stays disabled) and ask *"why is the <button> disabled?"*.
2. Expect a plain-language diagnosis naming **every** blocker, formatted as numbered step rows with **bolded** UI names — no constraint jargon (`valueMissing` …), no re-instructing things that are already fine.
3. With **"Include page image"** ON, visual-only state (a color-coded requirements checklist) is diagnosed too; DevTools → Network shows the lazy `sync-copilot-render.js` fetch on the first diagnostic question.

4. **Rejected-action diagnosis (2026-07-16):** complete the form correctly, submit, and get a server rejection (e.g. sign up with an email that already has an account) → ask *"now what happened?"* — it must fire Reason (`reasonTrigger` set) and the answer must lead with the on-page error banner ("this email already has an account — sign in instead…"), NOT re-diagnose the healthy form, and never claim the enabled button is blocked. Then ask a **fast-path follow-up** (*"whats next?"*) over the same banner — even without Reason, the answer must acknowledge the rejection (the probe's error snippet now carries red-styled banners), never "go ahead and click it". Diagnostic answers must also never speculate ("server issue", "check your internet") — a decline says what was checked, nothing invented.

✅ **PASS:** correct blocker(s) in plain words; the rejection banner beats form theories; `CopilotQuery.reasonTrigger` = `intent`/`blocked` (+ `reasonImage=true` when the tier is on); a plain "how do I…" on the same page stays fast-path (`reasonTrigger` null).

**Guided walkthrough (P4-M0 — zero-acting):**
1. Studio → Copilot → Settings → flip **Guided walkthrough** ON (toast; switch is disabled while Sense is off) → reload the host page (config is mount-time).
2. Mid-workflow, ask a positional question → the answer carries a **"Walk me through it"** pill. Click it: the panel closes, the step card shows **your current step k/N** (not 1), and the step's element gets a persistent highlight.
3. Complete the step yourself (fill the field / click the button) → the card shows **"Detected ✓ — hit Next to continue"** and **stays put** — the pointer must move **only** on your Next click, never on its own. A navigating step survives the full-page load and **resumes on the next page with the step acknowledged** ("Detected ✓ — hit Next"; peek at `sessionStorage["sync.walkthrough.v1"]` before the nav). Try **Back**, and a stall: delete the highlighted element in DevTools → after ~3s the card safe-stops with Retry/Back/Exit. The final step ends with "hit Next to finish" → Next shows the Done card.
4. **State-awareness** (the first-E2E fixes): (a) an **invalid field** (e.g. a malformed `type=email`) must NOT advance — the status says the field doesn't look right and names the constraint; (b) an **unchecked checkbox** step must not count as done (and skip-ahead must park on it, not blow past); (c) with a **disabled submit button** as the current step, the status must read *"This button is disabled — check step k (…) first"* — never "click it" — and flip to "click the highlighted element" within ~half a second of the button enabling.
5. **Explain escalation** (Reason toggle ON): on a blocked/invalid/stalled card, the **"Explain what's blocking me"** button appears → click → the chat opens and asks *"Why can't I proceed with this step?"* for you → a full Reason diagnosis (that row logs `reasonTrigger='intent'`). With Reason OFF the button must not appear anywhere.
6. **Self-correcting pointer:** the card must always point at the **first unfinished input step on the page** — try to trick it: hard-reload mid-run so the form resets (resumes at the first empty field, not the stored step); clear an *earlier* field while the pointer is further ahead (pointer snaps back within ~0.5s); press **Next** over a genuinely empty field (explicit skip — the pointer must NOT drag you back to it; **Back** onto it re-engages the gate). A resume after a real mid-workflow navigation — earlier steps on a previous page — still resumes where you left off. For any weirdness, reload with `data-sync-debug="1"` on the snippet: every pointer decision (advance/correction, from→to) is logged.
7. Finish the workflow → "Done — you finished …" card; Prisma studio → `CopilotWalkthrough` has one row: correct `startStep/lastStep/totalSteps`, `autoAdvances`/`manualAdvances` split, `outcome='completed'` (your abort/stall experiments each leave their own row/outcome).

✅ **PASS:** offer only appears when the toggle is on + the answer is positional; the walkthrough starts at the probe's step; **the pointer never moves forward on its own — detection only shows "Detected ✓ — hit Next"** (genuine completions: checked/filled-and-valid, never a disabled click); blocked buttons are explained instead of demanded; Reason diagnosis on request; acknowledgments survive a hard navigation; safe-stops instead of guessing; every run lands one honest `CopilotWalkthrough` row (`autoAdvances` = detection-confirmed Nexts, `manualAdvances` = override Nexts).

---

## 12. Analytics & coverage gaps (the feedback loop)

1. Studio → **Copilot** page → **Copilot activity**: shows total questions, % answered, 👍/👎 counts, and the recent Q&A list (each tagged answered/declined). Confirm your Part-10 questions appear with correct tags + feedback.
2. Studio → **Home** (`/dashboard`) → **Coverage gaps — record these next**: the *declined* question from 10b appears as an open gap (source `copilot`).
3. Click **Dismiss** on the gap → it resolves and disappears.

✅ **PASS:** answered/declined counts + feedback reflect Part 10; the declined question shows as a coverage gap; dismiss works.

---

## 13. Reprocess / idempotency

1. Re-record (or re-trigger) the same workflow. The worker deletes + recreates KnowledgeItems and resets segment tags each run.
2. Confirm the previously-approved workflow's approval still holds (keyed by `sourceId + segmentIndex`).

✅ **PASS:** reprocessing doesn't duplicate items, and approval survives.

---

## Acceptance checklist (one line per module)

| Area | Module | PASS signal |
|---|---|---|
| Build | — | `pnpm typecheck` + `build` + `lint` exit 0 |
| Infra | — | Postgres healthy, Redis up, MinIO up, bucket ensured |
| Auth | Studio | signup → workspace; signin works |
| Capture | Extension | Connect mints token; record → upload `sessionId`, no 401 |
| Ingestion | API | `/v1/sessions` stores source + enqueues; `/healthz` ok |
| KB build | Worker | transcript + **distilled steps** built; `status → ready` |
| **Segmentation** | Worker | **single task → 1 workflow; multi-task → N** |
| Review | Studio KB | one goal-titled workflow, steps intact |
| Approval | Studio | toggle persists; `CopilotApproval` written |
| Embed key | Studio | public key + snippet + allowed origins |
| Copilot answer | API + Widget | grounded answer + citations |
| Honest decline | API | unknown question declines, no hallucination |
| Coverage gap | API + Studio | decline → open gap → dismiss |
| Feedback | API + Studio | thumbs recorded + shown |
| Sense | Widget + API | positional answer anchored on the measured current step; `senseUsed` logged |
| Reason | Widget + API + Synthesis | diagnostic question → plain-language blocker diagnosis; `reasonTrigger`/`reasonImage` logged; simple questions stay on the fast path |
| Walkthrough (P4-M0) | Widget + API | offer on positional answers (toggle-gated) → starts at the measured step, auto-advances on real completions, resumes across a hard nav, safe-stops on a missing element; one `CopilotWalkthrough` row per run |
| Security | API | origin allowlist + rate limit enforced |
| Redaction | Synthesis | PII scrubbed from KB text/narration/transcript |
| Idempotency | Worker | reprocess doesn't duplicate; approval survives |
| Observability | all services | structured logs at the env-default level (debug local / info prod); secrets redacted; `LOG_LEVEL` tunes it |

---

## Troubleshooting (local)

| Symptom | Cause / fix |
|---|---|
| `command not found: pnpm` | `corepack enable` |
| "can't reach database" | `docker compose up -d`; wait for Postgres `healthy` |
| Nothing happens after recording | The **worker** must be running (`pnpm --filter @sync/api worker`) |
| Recording stuck `processing` / `error` | Missing/invalid `OPENAI_API_KEY` in `packages/api/.env`; check the worker log |
| Extension upload 401 | Token wiped/expired → redo **Part 5** (`/connect`) |
| Workflow over-split into phases | Segmenter tuning — see [`packages/synthesis/src/segment.ts`](../packages/synthesis/src/segment.ts) (prompt · `overallNarration` · markers) |
| Widget shows no launcher | Serve `demo/` over **HTTP** (not `file://`); refresh stale `data-sync-key` |
| Copilot: "no approved help content" | Approve a workflow in **Part 8** |
| Answer rejected by origin | Add the demo origin in **Part 9** allowed origins |
| Type changes not picked up | `pnpm build` (Turbo) / `pnpm db:generate` for the Prisma client |

---
---

# **LEVEL 2 — DEV TESTING ON RENDER**

---

How to wipe the **data** on the live [Render](https://render.com) dev deploy and re-run the full copilot walkthrough on a clean slate — record → KB → approve → embed → ask → verify.

This is the **cloud** counterpart to Level 1 (which resets a *local* docker-compose stack). For the initial deploy + every secret, see [`deploy-render.md`](deploy-render.md).

> **You are wiping DATA, not the deploy.** The 5 Render resources and all env vars / secrets stay put.
> Only the contents of the three stores are cleared.

> 🔐 **Never commit live credentials.** The External Database URL and the R2 keys contain secrets.
> This doc uses **placeholders** — pull the real values from the Render dashboard at run time and keep
> them out of git (paste into the shell, or an **untracked** scratch file). The only hardcoded value
> here is the public Studio URL.

## D0. The three data stores (what gets wiped)

| Store | Render resource | Holds | Wiped by |
|---|---|---|---|
| Postgres | `sync-db` | users, workspaces, recordings, KB, approvals, copilot queries, **widget public key + extension connect tokens** | Step D1 |
| Object storage | Cloudflare **R2** (`sync-artifacts`) | screenshots / audio / DOM (`workspaces/<wsId>/sessions/<sessionId>/…`) | Step D2 |
| Queue | `sync-redis` (Key Value) | BullMQ synthesis jobs (transient, no persistence) | Step D3 *(optional)* |

⚠️ **Wiping Postgres deletes your account, workspace, the embed snippet's `data-sync-key`, and the
extension's connect token.** A from-scratch test therefore means: **new account → new keys →
re-connect the extension → re-copy the embed snippet** (Step D5).

---

## D1. Wipe Postgres (clear data + recreate schema)

`prisma migrate reset` drops the `public` schema and replays every migration in one shot. Run it from
**anywhere in the repo** (the `--filter` resolves the package from the workspace — no `cd` needed):

```bash
DATABASE_URL="<paste-external-database-url>" pnpm --filter @sync/db exec prisma migrate reset --force --skip-seed
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

## D2. Empty the R2 bucket

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

## D3. Flush Redis *(optional)*

Free Key Value has **no persistence** and jobs run right after upload, so this is usually unnecessary.
To be clean: Render → **sync-redis** → **Restart** (a restart flushes it). You can't `redis-cli` from
your laptop — `ipAllowList: []` blocks external access.

---

## D4. Confirm the services are healthy

Open the **sync-api** URL once to wake it (free tier cold-starts ~1 min after idle). Prod logs are **JSON at `info`+** (see [`deploy-render.md` → Logging in production](deploy-render.md#logging-in-production)); the boot should show:

```
All migrations have been successfully applied.
{"level":"info","service":"api","port":8787,"env":"production","msg":"Sync api listening"}
{"level":"info","service":"worker","queue":"synthesis","msg":"listening on queue"}
```

✅ **PASS:** all three lines present; no `ECONNREFUSED` (R2) or `MissingSecret` (auth) errors.

> **Need more detail while testing on Render?** Bump `LOG_LEVEL` to `debug` on the service (dashboard → **Environment**; no code redeploy — the service restarts), then set it back to `info`. See [`deploy-render.md` → Logging in production](deploy-render.md#logging-in-production).

---

## D5. Test from scratch

Mirrors [`deploy-render.md`](deploy-render.md) §10–12, with the **post-wipe gotchas** called out.

### D5.1 Create a new account
Open **https://sync-web-uir8.onrender.com** → sign up. This creates a fresh workspace + a **new**
public widget key and connect token.

✅ **PASS:** you land in the empty Studio (Home dashboard, no recordings).

### D5.2 Re-connect the extension
The old connect token is gone. If your prod build is still installed, just click **Connect**.

**Which Studio the extension talks to is baked at build time via `STUDIO_URL`** — since `ffa11a2` it
takes a comma-separated list (first = primary, the popup's Connect target; all entries get the
connect bridge), so one build can cover both. Pick the build for what you're testing against:

| Testing against | Build command | What gets baked |
|---|---|---|
| **Local** (docker-compose) | `pnpm --filter @sync/extension build` *(default `http://localhost:3000`)* | connect-bridge `matches` + popup links → **localhost**; handshake carries the local API (`http://localhost:8787`) |
| **Render** (this dev deploy) | `STUDIO_URL=https://sync-web-uir8.onrender.com pnpm --filter @sync/extension build` | connect-bridge `matches` + popup links → **Render**; handshake carries the deploy's `SYNC_API_URL` |
| **Both** (the Web Store artifact, v0.2.1+) | `STUDIO_URL="https://sync-web-uir8.onrender.com,http://localhost:3000" pnpm --filter @sync/extension build` | popup → **Render**; connect bridge on **both** origins — a store install can also connect to a local Studio |

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

### D5.3 Record a workflow
Record a **narrated** workflow → it uploads to the prod API → the embedded worker synthesizes it.

✅ **PASS:** `sync-api` log shows a `ready` line — `{"level":"info","service":"worker","sessionId":"<id>","workflows":N,"steps":M,…,"msg":"ready"}`; the
recording appears under Studio → **Recordings**.

### D5.4 Approve it
Studio → **Knowledge Base** → **approve** the workflow (the copilot only answers from approved content).

✅ **PASS:** the workflow flips to **approved · live**.

### D5.5 Test the widget
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

### D5.6 Verify analytics
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

## Troubleshooting (Render dev)

| Symptom | Cause | Fix |
|---|---|---|
| `prisma migrate reset` can't connect | Used the **internal** DB URL, or missing SSL | Use the **External Database URL**; append `?sslmode=require` |
| `503` on first request to sync-web / sync-api | Free-tier **cold start** (~1 min after 15 min idle) | Wait ~1 min; not a crash |
| `AggregateError [ECONNREFUSED] … :9000` in sync-api | `R2_ENDPOINT` unset → defaults to local MinIO | Confirm the `sync-r2` group is set; redeploy `sync-api` |
| Widget launcher doesn't appear | Page served via `file://`, or origin blocked (403) | Serve over HTTP; add the origin or empty the allowlist |
| `[worker] failed …: 401 … API key` | `OPENAI_API_KEY` unset on `sync-api` | Set it; **re-record** (failed jobs don't auto-retry) |
| Copilot page real-widget tester errors / returns nothing | Since Approach B it answers via **`sync-api`** (`/v1/copilot/answer`), not the web process: `OPENAI_API_KEY` unset **or** a `403` from `SYNC_STUDIO_URL` unset | Set `OPENAI_API_KEY` + `SYNC_STUDIO_URL` on **`sync-api`**; `sync-web` needs **no** OpenAI key |

More rows + the URL-suffix gotcha: [`deploy-render.md` → Troubleshooting](deploy-render.md#troubleshooting-real-errors-we-hit).

---
---

# **LEVEL 3 — PROD TESTING ON RENDER** *(placeholder)*

---

> **Not built yet — details will be added when the production deployment exists.**

There is currently no production environment; the Render deploy above is the free-tier **dev** stack. When prod is stood up (per the "TO GO PRODUCTION" recipe in [`render.yaml`](../render.yaml): standalone `type: worker` service, migrations via `preDeployCommand`, paid plans, its own R2 bucket + secrets, custom domain), this section will get its own reset procedure + walkthrough mirroring Level 2 — with the key differences expected to be:

- **No data wipes as a testing tool** — prod testing must be non-destructive (real customer data lives here).
- Worker logs live in a **separate service**, not inside `sync-api`.
- No cold-start waits (paid tier is always-on).
- The extension build targets the prod Studio URL; the embed snippet carries the stable prod API/widget URLs.

---

*Last updated 2026-07-08 — added structured logging (`@sync/logger`, Pino): refreshed the worker/API log-line PASS signals to the new structured format and added **Logging (local)** + prod (Render) notes with the enable/disable knobs (`LOG_LEVEL` · `LOG_PRETTY` · `NEXT_PUBLIC_LOG_LEVEL` · widget `data-sync-debug`); canonical reference is [`dev-setup.md` §7](dev-setup.md#7-logging-dev-vs-prod-and-how-to-turn-it-updown). (2026-07-04 — merged `render-reset-and-test.md` in as **Level 2** + **Level 3** prod placeholder. Level 1 content revised 2026-06-27: worker cleans + distills events into per-workflow steps — see [`kb-step-distillation.md`](kb-step-distillation.md).)*
