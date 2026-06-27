# Sync — End-to-End Testing Guide

The full manual test plan for the Sync copilot, top to bottom: from a clean slate → record a product → build the Knowledge Base → approve workflows → embed the copilot → ask questions → verify analytics. Follow it in order; each part lists what to do and the **PASS** signal.

> **Scope.** This covers the **Phase-1 copilot** product end-to-end (P1-M0…M12). Phase-2 article/portal features are parked and out of scope. There is no automated test harness — verification is `pnpm typecheck` + `pnpm build` + this manual walkthrough.
>
> **Workflow-segmentation quality** (the "one task = one workflow" fix) is covered inline in **Part 6**.

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

Stores: **Postgres** (data), **MinIO** (screenshots/audio), **Redis** (job queue).

---

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
- API terminal: `Sync api on :8787` (and the MinIO bucket is ensured on boot).
- Worker terminal: `[worker] listening on queue "synthesis"`.
- `curl -s http://localhost:8787/healthz` → `{"ok":true}`.
- http://localhost:3000 loads and redirects to `/signin`.

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
2. Extension popup → **Start**. Grant mic permission if prompted. **Narrate continuously** — narration is a primary segmentation signal. Example:
   > "I'm going to show how to sign in on Chatful. This is the landing page. Click **Sign in** at the top-right. The login page opens. Enter your email, then your password. Optionally tick **Remember me**. Click **Sign in** — and you land on the dashboard. You're signed in."
3. Perform: click **Sign in** → type email → type password → (optional) toggle **Remember me** → click **Sign in** → land on dashboard.
4. **Do NOT add markers** (the popup's marker button) — reproduces the "absent markers → one workflow" path.
5. Extension popup → **Stop**. The bundle (events + screenshots + audio + manifest) uploads to `POST /v1/sessions`.

### 6b. Worker processing
Watch the **worker terminal**:
```
[worker] processing session <id>
[worker] ready <id>: 1 workflow(s), M distilled step(s) from transcript(N seg)
```
*(The worker cleans + distills raw events into clean per-workflow steps — see [`kb-step-distillation.md`](kb-step-distillation.md). `M` is the **distilled step** count, not the raw event count.)*

✅ **PASS criteria:**
- Upload returns a `sessionId` (extension shows success; no 401).
- Worker reaches `status → ready`.
- **The recording produces exactly ONE workflow** (`1 workflow(s)`), titled by its goal (e.g. *"Sign in"*), not split into *Navigating…/Filling…/Setting Remember Me…/Submitting…*.

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
   - **Embed snippet** is shown (`<script src=… data-sync-api data-sync-key data-sync-title>`).
2. In the **Allowed origins** control, add `http://localhost:8080` (where the demo page is served in Part 10). Save.

✅ **PASS:** a public key exists; the snippet renders with it; the allowed-origins list saves.

---

## 10. Widget embed — end-to-end copilot answer

The widget must be served over **HTTP**, not `file://` (or no launcher icon appears).

1. Build the widget + serve the demo:
   ```bash
   pnpm --filter @sync/widget build      # → packages/widget/dist/sync-copilot.js
   cd packages/widget && python3 -m http.server 8080
   ```
2. Edit `packages/widget/demo/index.html`: set `data-sync-key` to the **public key** from Part 9 and `data-sync-api="http://localhost:8787"`.
3. Open **http://localhost:8080/demo/** → a launcher appears bottom-right → open it.

**Test matrix:**

| # | Ask | Expected |
|---|---|---|
| 10a | *"How do I sign in?"* | **Answered**, grounded in the approved sign-in workflow, with citation(s). |
| 10b | *"How do I delete my account?"* (not recorded) | **Honest decline** ("I don't have that in approved help…"), no hallucination. |
| 10c | Thumbs **up/down** on an answer | Accepted (`/v1/copilot/feedback`). |
| 10d | Origin not allowlisted | Serve demo from a different port not in the allowlist → answer request rejected (origin/`x-sync-key` check). |
| 10e | Rapid-fire questions | Eventually `429` rate-limit. |

✅ **PASS:** 10a answers and cites; 10b declines honestly; feedback + origin + rate-limit behave as above.

> If you wiped data (Part 2), the demo's old `data-sync-key` is stale — refresh it from the Copilot page.

---

## 11. Analytics & coverage gaps (the feedback loop)

1. Studio → **Copilot** page → **Copilot activity**: shows total questions, % answered, 👍/👎 counts, and the recent Q&A list (each tagged answered/declined). Confirm your Part-10 questions appear with correct tags + feedback.
2. Studio → **Home** (`/dashboard`) → **Coverage gaps — record these next**: the *declined* question from 10b appears as an open gap (source `copilot`).
3. Click **Dismiss** on the gap → it resolves and disappears.

✅ **PASS:** answered/declined counts + feedback reflect Part 10; the declined question shows as a coverage gap; dismiss works.

---

## 12. Reprocess / idempotency

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
| Security | API | origin allowlist + rate limit enforced |
| Redaction | Synthesis | PII scrubbed from KB text/narration/transcript |
| Idempotency | Worker | reprocess doesn't duplicate; approval survives |

---

## Troubleshooting

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

*Last updated 2026-06-27 (worker now cleans + distills events into clean per-workflow steps — see [`kb-step-distillation.md`](kb-step-distillation.md)). Local data was wiped 2026-06-26 as part of preparing a clean retest (Parts 2–11 start from empty).*
