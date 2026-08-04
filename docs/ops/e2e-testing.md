# FlowBuddy — End-to-End Testing Guide

The full manual test plan for the FlowBuddy copilot — from a clean slate → record a product → build the Knowledge Base → approve workflows → embed the copilot → ask questions → verify analytics — at **three deployment levels**:

| Level | Where | Section |
|---|---|---|
| **1 · Local** | your machine — docker-compose (Postgres + Redis + MinIO) | [Level 1 — Local testing on localhost](#level-1--local-testing-on-localhost) |
| **2 · Dev** | Render free tier (`flowbuddy-dev-web.onrender.com`) + Cloudflare R2 | [Level 2 — Dev testing on Render](#level-2--dev-testing-on-render) |
| **3 · Prod** | Render paid tier — **flowbuddyai.com, live since 2026-07-23** | [Level 3 — Prod testing on Render](#level-3--prod-testing-on-render-placeholder) |

> **Scope.** This covers the copilot product end-to-end — **Phase 1** (P1-M0…M12) plus the shipped **Sense/Reason (Phase 2)** and **P4-M0 walkthrough** legs. Portal/article features (Version 2) are out of scope ([`portal.md`](../build/portal.md)). Automated coverage exists but is partial — `pnpm test` (vitest over the pure seams in `@flowbuddy/synthesis`) and `scripts/copilot-baseline.mjs` for answer quality — so verification is `pnpm typecheck` + `pnpm test` + `pnpm build` + this manual walkthrough. Nothing automated reaches the browser, which is what this plan is for.
>
> **Workflow-segmentation quality** (the "one task = one workflow" fix) is covered inline in **Part 6** of Level 1.

---

## Architecture under test (what each step exercises)

```
Chrome Extension ──sign──▶ API /v1/uploads/sign ──▶ short-lived PUT URLs   (while recording)
   (record + narrate)
        │
        ├──PUT shots + DOM (during capture)─────▶ object storage  (the API never sees these bytes)
        ├──PUT narration (at Stop)──────────────▶ object storage
        │
        └──Stop: manifest (+ any leftovers)────▶ API /v1/sessions ──enqueue──▶ Worker (BullMQ)
                                                (Fastify :8787)   transcribe → clean → segment → distill
                                                                         │
                                                                         ▼
        Studio (Next.js :3000) ◀── reads ── Postgres / MinIO ◀── writes distilled steps + segments
        Recordings · KB approval · Copilot settings · Analytics
                                                                         │
   Widget (<script>) ──ask──▶ API /v1/copilot/answer ──grounded in APPROVED KB only──▶ answer
```

Stores: **Postgres** (data) · **object storage** for screenshots/audio/DOM (**MinIO** locally, **Cloudflare R2** on Render) · **Redis** (job queue). ⚠️ Since the direct-artifact-upload change the **recorder writes every artifact to object storage itself** — screenshots and DOM snapshots during the capture, the narration track at Stop — via short-lived presigned PUT URLs, so on a healthy connection the finalize request carries **the manifest and nothing else**. **MinIO is more forgiving than R2** (R2 enforces request checksums and cross-origin PUT rules, MinIO ignores both), so any *change* to the signing path is only really proven at **Level 2/3**, never by Level 1 alone — the path as it stands was verified against real R2 on the dev deploy **2026-07-28**. The all-in-one multipart bundle survives as the **fallback** when direct upload is unavailable; a run that lands there still passes, it just isn't testing the normal path. One Render-specific difference: on Render (dev **and** prod) the worker runs **inside** the api web service (`start:all`) instead of as a separate process (a standalone worker is scaling-ladder Step 1).

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
- `packages/api/.env` — must contain a valid **`OPENAI_API_KEY`** (the worker calls Whisper to transcribe + the chat model to segment; the copilot endpoint calls the chat model to answer). Also `DATABASE_URL`, `REDIS_URL`, the `R2_*` MinIO vars. Model ids and their defaults: [`.env.example`](../../.env.example).
- `packages/web/.env` — `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL=http://localhost:3000`, and `FLOWBUDDY_API_URL=http://localhost:8787`.
- `packages/db/.env` — `DATABASE_URL`.
- `.env.example` (root) documents every variable.

**Docker Desktop must be running.**

✅ **PASS:** `pnpm install` completes; `.env` files exist with a real `OPENAI_API_KEY`.

---

## 1. Build & static checks (catch breakage before running)

```bash
pnpm typecheck     # type-check every package
pnpm test          # vitest over the pure seams in @flowbuddy/synthesis (no CI — run it here)
pnpm build         # build every package in dependency order (Turbo)
pnpm lint          # lint
```

✅ **PASS:** all three exit 0 with no errors.

---

## 2. Reset to a clean slate (optional but recommended)

Wipes Postgres (recordings/KB/approvals/users/tokens), MinIO (artifacts), and Redis (queue). **Stop any running api/worker/web dev processes first (Ctrl-C).**

```bash
# 0. Stop any dev servers still holding the app ports (web · api · widget demo · prisma studio)
kill -9 $(lsof -t -i:3000 -i:8787 -i:8080 -i:5555)

# 1. Tear down infra + volumes
docker compose down -v

# 2. Fresh infra
docker compose up -d

# 3. Wait for Postgres healthy
until [ "$(docker inspect -f '{{.State.Health.Status}}' flowbuddy-postgres-1)" = "healthy" ]; do sleep 1; done; echo "postgres healthy"

# 4. Recreate schema (+ regenerate Prisma client)
pnpm db:migrate
```

**Verify empty:**
```bash
docker exec flowbuddy-postgres-1 psql -U flowbuddy -d flowbuddy -t -c \
  'select count(*) from "User"; select count(*) from "RecSession"; select count(*) from "KnowledgeItem"; select count(*) from "CopilotApproval";'
# → all 0
```

✅ **PASS:** all counts are 0. (The MinIO `flowbuddy-artifacts` bucket auto-creates when the API boots in Part 3.)

> Note: one Prisma model maps to a differently-named table — the **`KnowledgeSource`** model is the **`RecSession`** table (`@@map`, to preserve existing data). `KnowledgeItem` and `CopilotApproval` keep their model names (hence the `"CopilotApproval"` query above).

---

## 3. Bring up the stack

Three terminals, all from the repo root:

```bash
# Terminal 1 — ingestion API + copilot endpoints → :8787
pnpm --filter @flowbuddy/api dev

# Terminal 2 — worker (transcribe → clean → segment → distill). REQUIRED for processing.
pnpm --filter @flowbuddy/api worker

# Terminal 3 — Studio → http://localhost:3000
pnpm --filter @flowbuddy/web dev
```

✅ **PASS:**
- API terminal: an `INFO … FlowBuddy api listening` line with `port: 8787` (and the MinIO bucket is ensured on boot).
- Worker terminal: an `INFO … listening on queue` line with `service: worker`, `queue: synthesis`.
- `curl -s http://localhost:8787/healthz` → `{"ok":true}`.
- http://localhost:3000 loads and redirects to `/signin`.

> **Log format locally:** the Node services log at `debug` level, **pretty-printed** in an interactive terminal (each line = a colorized `LEVEL … msg` with its fields indented below). To quieten or change it, see the [Logging](#logging-local) note below / [`dev-setup.md` §7](dev-setup.md#7-logging-dev-vs-prod-and-how-to-turn-it-updown).

---

## Logging (local)

The Node services log at `debug` in dev, pretty-printed in a terminal. Levels, the env knobs and how
to quieten a service: [`dev-setup.md`](dev-setup.md) §7 — the canonical reference.

## 4. Account & workspace (Studio)

1. Open **http://localhost:3000/signup**, create an account (email + password).
   - This calls `createUserWithWorkspace` → a User + an auto-created Workspace (single-user = single-workspace).
2. You land in **FlowBuddy Studio** (`/dashboard`) — the "Welcome / Get started" checklist (0 of 4 done).
3. (Re-login check) Sign out and sign back in at `/signin` with the same credentials.

✅ **PASS:** signup creates the account, signin works, the dashboard shows the 4-step "Get started" checklist.

---

## 5. Recorder extension — build, load, connect

1. Build:
   ```bash
   pnpm --filter @flowbuddy/extension build   # → packages/extension/dist/
   ```
2. Load in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `packages/extension/dist/`. (If already loaded, click the card's refresh icon.)
3. Click the **FlowBuddy Recorder** toolbar icon → it shows **Not connected** → click **Connect** (opens Studio `/connect`).
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
5. **While still recording** (before pressing Stop), open Studio → **Recordings** in another tab and refresh. ✅ The recording is already listed with a pending **Recording** badge — the row is created by the first directly-uploaded artifact, and it must NOT show as a red **Failed**. (Local-only check: MinIO console → `flowbuddy-artifacts` → objects are already appearing under `workspaces/<wsId>/sessions/<sessionId>/shots/`.)
6. Extension popup → **Stop & upload**. Watch the popup: it shows **Saving narration…** (the track is being stopped + encoded), then **Finishing up…** — and there is deliberately **no percentage**, because there is almost nothing left to send. Toolbar badge goes ↑→✓, in seconds. Stop sends only the **manifest plus any artifact storage never confirmed** to `POST /v1/sessions` (carrying the `X-FlowBuddy-Upload-Id` header); the narration went up through the same signed-URL path just before it.
   The extension log line tells you which path was exercised:
   ```
   [capture] summary: events=…, artifacts=N (N uploaded directly, 0 riding the bundle), audio=uploaded
   ```
   ✅ **Expected: `0 riding the bundle` and `audio=uploaded`.** `audio=in bundle` or a non-zero riding count means direct upload degraded to the fallback (see Troubleshooting) — the recording still arrives, but you have not tested the normal path.
   ❌ A percentage, a `Finishing…` label, or a bar that creeps to 90 % and stops = an **old extension build**; rebuild and reload it.
7. **If it does drag on** (a fallback run, or a cold-starting dev API): after 8 seconds the popup switches to **"Sending the rest of your recording…"** with a **running elapsed timer**. That is the honest state, not a hang — the old silent "Finishing…" with no clock is exactly what used to read as stuck forever.

### 6b. Worker processing
Watch the **worker terminal** — the worker logs (pretty-printed locally, `service: worker`) progress through these messages:
```
processing session                  (fields: sessionId, jobId)
embedded items for hybrid retrieval (fields: sessionId, count = M)
ready                               (fields: sessionId, workflows = 1, steps = M, segments = N)
```
*(The worker cleans + distills raw events into clean per-workflow steps — see [`kb-step-distillation.md`](../build/kb-step-distillation.md). `steps` is the **distilled step** count, not the raw event count. The `embedded …` line is P1-M3 hybrid retrieval — if it's missing and a "Semantic search is unavailable" notice appears on the recording instead, embedding failed and answers fall back to keyword matching until re-processed.)*

✅ **PASS criteria:**
- Upload returns a `sessionId` (extension shows success; no 401 and no `400 missing or malformed X-FlowBuddy-Upload-Id`).
- **A retry does not duplicate.** With the recording already finalized, re-send the same bundle (the popup's **Retry** if a failure offered it, otherwise by hand). ✅ Studio → **Recordings** still shows **exactly one** row for that capture, and the API answers `{ alreadyFinalized: true }` rather than rebuilding. ❌ Two rows = the `(workspaceId, uploadId)` identity is not resolving — the original defect. *(If you can get the retry screen to appear at all: it now shows **no percentage**, and a timeout there reads "your recording is still saved here — retrying is safe and cannot create a duplicate". A retry screen quoting a `%` is an old build.)*
- Worker reaches `status → ready`.
- **The recording produces exactly ONE workflow** (the `ready` log shows `workflows: 1`), titled by its goal (e.g. *"Sign in"*), not split into *Navigating…/Filling…/Setting Remember Me…/Submitting…*.

❌ **FAIL:** ≥2 workflows, or any workflow titled by a phase. **If it still over-splits,** the lever is the segmenter prompt + inputs in [`packages/synthesis/src/segment.ts`](../../packages/synthesis/src/segment.ts): strengthen the "default to ONE workflow" framing, confirm the full transcript reaches it as `overallNarration` (needs captured audio narration), and check no markers were placed unintentionally.

**Multi-task split check (positive control):** record a second session doing **two genuinely different tasks** (e.g. *sign in*, then *change your password*), optionally pressing the **marker** button between them. PASS = it returns **two** workflows. This proves the segmenter still splits when it should.

### 6c. Throwing a recording away (abandoned-recording cleanup)

Uploading during the capture means an abandoned recording has **already** written a row and objects.
Two client-side paths discard it, and a server-side sweep catches whatever they miss. Exercise at
least Path 1 once — a leak here is invisible until the storage bill or the Recordings list makes it
obvious.

**Path 1 — "Start fresh" after a failed upload.**
1. Start a recording, do a handful of clicks so screenshots actually upload, and confirm Studio →
   **Recordings** shows the pending **Recording** row (and that objects exist in MinIO under
   `workspaces/<wsId>/sessions/<sessionId>/`).
2. **Stop the api process** (Ctrl-C in terminal 1), then press **Stop & upload**. The upload fails and
   the popup lands on **Upload interrupted**.
3. Bring the api back up, then click **Start fresh** on that screen.
4. Refresh Studio → **Recordings**.

✅ **PASS:** the **Recording** row is **gone**, and so is its whole prefix in MinIO. The popup returns
to idle with no badge. *(Clicking Start fresh while the api is still down is fine too — the discard is
best-effort and the 12-hour sweep below is the backstop — but then you're testing the backstop.)*

**Path 2 — starting a new recording over an unsent one.** The same discard runs on **Start
recording**, because a locally buffered recording that still knows its upload identity is one that
never uploaded successfully — pressing Start is abandoning it. Whichever route you took above, the
observable rule is the same: **after recording again, there must be no leftover `recording` row.**

✅ **PASS:** exactly one row per capture you actually intended. ❌ A stranded row stuck on
**Recording** means neither discard fired — check the api log, then confirm the sweep below cleans it.

**Path 3 — the server-side sweep (optional, needs patience or a clock nudge).** Anything the client
misses is swept server-side: `recording` rows idle **more than 12 hours** are deleted with their
storage, piggybacked on the next finalized recording in that workspace. To see it without waiting,
age a row by hand and then finish any recording in the same workspace:

```bash
docker exec flowbuddy-postgres-1 psql -U flowbuddy -d flowbuddy -c \
  "UPDATE \"RecSession\" SET \"updatedAt\" = now() - interval '13 hours' WHERE status = 'recording';"
```

✅ **PASS:** the api log reports `swept abandoned recordings` with a count, the row is gone, and its
objects are gone from MinIO. ⚠️ Only `recording` rows are eligible — a **finalized** recording is never
swept, and asking the API to discard one answers `409` ("delete it in Studio"). Verify that guard once
if you're changing this path: a finalized recording must survive both a discard call and a sweep.

*(Why the threshold is 12 hours and not minutes — and why a false positive self-heals — is in [`internals/ingestion-api.md`](../internals/ingestion-api.md) §4.6.)*

---

## 7. Studio — review the Knowledge Base

1. Studio → **Recordings**: the session is listed with a **Ready** status badge and the app's base URL. *(Badge sequence over one capture: **Recording** while artifacts arrive → **Processing** after Stop → **Ready**. A **Failed** badge at any point before Stop is a regression.)*
2. Click it → the **Knowledge Base** page (`/dashboard/kb/<id>`):
   - The **"Steps by workflow"** panel shows the step count and **N workflow(s)** (expect **1** for the sign-in case).
   - The **"Approve workflows for the copilot"** panel lists each workflow with its step count and an approve toggle.
   - Each step is a **clean, distilled instruction** (stray clicks dropped, low-level interactions merged) grounded in real captured events + aligned narration, with one curated screenshot.

✅ **PASS:** the KB page renders one goal-titled workflow with clean distilled steps; nothing is mangled or duplicated.

---

## 8. Approval gate (the trust boundary)

1. On the KB page, toggle the sign-in workflow **approved** (`Switch`). Counter updates ("1 of 1 approved").
2. (Persistence) Reload the page → the toggle stays on.
3. Toggle it **off** and back **on**. It returns to Approved · Live — re-approving also clears any
   earlier retirement, which is what flipping the switch back on means.

✅ **PASS:** approval persists (a `CopilotApproval` row naming the workflow). Dashboard step 3
("Approve a workflow") flips to done.

> Approval names a `Workflow` — an identity that outlives both the KnowledgeItems (deleted and
> recreated on every re-process) and the position in its recording. What happens to it across a
> re-process is §13, and that is the leg that actually guards the trust boundary.

---

## 8b. Duplicate workflows (P3-M0)

Needs **two recordings that cover one task** — record the sign-in flow, then record it again. Both
must finish processing and be embedded (§6b); detection reads the same vectors retrieval uses, so a
recording whose embeddings failed simply produces no warnings.

1. On the KB page, a **duplicate warning** appears above the list, and a **"Possible duplicate of …"**
   chip appears on the tile of **both** workflows — including one that is still unapproved.
2. Click the chip (or **Compare** on the warning card) → a modal shows both step lists side by side,
   labelled *Already approved* and *Newer recording*.
3. **Replace the old one** → toast; the retired workflow greys out, reads *Replaced by "…"*, moves
   under **Not answering**, and stops counting toward "awaiting approval".
   **The duplicate warning and BOTH tiles' chips must disappear** — on the spot and after a reload.
   A resolved duplicate that keeps warning is the regression this leg exists for: a retired workflow
   has to leave both sides of the comparison, and dropping it only from the live side leaves it
   pairing with the very workflow that replaced it.
4. Ask the copilot (§10) something the retired workflow answered → the answer now cites the
   replacement, never the retired one.
5. **Restore** on the retired tile → it returns to Approved · Live, and the duplicate warning
   reappears (the pair is unresolved again).
6. **Both are real** instead → the warning disappears and **does not return** on reload.

✅ **PASS:** both sides show the warning · the modal compares them · replacing retires without
deleting · the copilot stops citing the retired workflow · restore and keep-both both stick.

> **Negative check that matters more than the positive one.** Two workflows that *share their opening
> steps but end somewhere different* (e.g. "View billing" and "View analytics", which both start
> "Click Home") must **NOT** be flagged. That was a real false positive: a single averaged score let
> the shared navigation outvote the goal. If it comes back, the last-step gate has been weakened —
> see the header of `packages/synthesis/src/overlap.ts`.

---

## 9. Copilot embed key + origin allowlist

1. Studio → **Copilot** page:
   - Shows **N workflow(s) approved**.
   - **Public embeddable key** (`data-flowbuddy-key`) is generated (`getOrCreateCopilotKey`) — distinct from the secret recorder token.
   - **Embed snippet** is shown (`<script src=… data-flowbuddy-api data-flowbuddy-key>` — appearance is NOT baked in; it's served live by `GET /v1/copilot/config`).
2. In the **Allowed origins** control, add `http://localhost:8080` (where the demo page is served in Part 10). Save.

✅ **PASS:** a public key exists; the snippet renders with it; the allowed-origins list saves.

---

## 10. Widget embed — end-to-end copilot answer

The widget must be served over **HTTP**, not `file://` (or no launcher icon appears).

1. Build the widget + serve the demo:
   ```bash
   pnpm --filter @flowbuddy/widget build      # → dist/flowbuddy-copilot.js + dist/flowbuddy-copilot-render.js (siblings)
   cd packages/widget && python3 -m http.server 8080
   ```
2. Edit `packages/widget/demo/index.html`: set `data-flowbuddy-key` to the **public key** from Part 9 and `data-flowbuddy-api="http://localhost:8787"`.
3. Open **http://localhost:8080/demo/** → a launcher appears bottom-right → open it.

**Test matrix:**

| # | Ask | Expected |
|---|---|---|
| 10a | *"How do I sign in?"* | **Answered**, grounded in the approved sign-in workflow, with citation(s). |
| 10b | *"How do I delete my account?"* (not recorded) | **Honest decline** ("I don't have that in approved help…"), no hallucination. |
| 10c | *(no question)* Change the accent/title in Studio → Copilot → **Appearance** → **Save** (a green toast confirms) → reload the demo page | The embedded widget reflects the new look **without touching the snippet** (served by `GET /v1/copilot/config`). |
| 10c | Thumbs **up/down** on an answer | Accepted (`/v1/copilot/feedback`). |
| 10d | Origin not allowlisted | Serve demo from a different port not in the allowlist → answer request rejected (origin/`x-flowbuddy-key` check). |
| 10e | Rapid-fire questions | Eventually `429` rate-limit. |
| 10f | **Change the subject mid-conversation.** Ask 10a, let it answer, then ask about a **different** recorded workflow in the same chat. | It answers the **new** question, citing the new workflow. **This is the one that shipped broken for months:** it used to answer the *previous* question instead — sometimes repeating the earlier answer's steps, sometimes claiming it had nothing on a workflow it was holding in full. Needs ≥2 approved workflows. |

✅ **PASS:** 10a answers and cites; 10b declines honestly; **10f answers the new question, not the old one**; feedback + origin + rate-limit behave as above.

> If you wiped data (Part 2), the demo's old `data-flowbuddy-key` is stale — refresh it from the Copilot page.

> **Embedding in your own test app instead of the bundled demo?** The snippet the Studio's Install
> tab shows uses `FLOWBUDDY_WIDGET_URL` for its `src` — unset locally it renders the placeholder
> `https://YOUR_WIDGET_HOST/flowbuddy-copilot.js`, which silently fails to load (**no launcher at all**).
> Either set `FLOWBUDDY_WIDGET_URL=http://localhost:8080/dist/flowbuddy-copilot.js` in `packages/web/.env`
> (restart Studio) so the copied snippet just works, or point `src` there by hand. In a React/Next
> app, a `<script>` tag inside JSX does **not** execute — put the snippet in the HTML shell
> (`index.html`) or use `next/script`.

---

## 11. Sense (positional answers) · Reason (diagnostics) · Guided walkthrough (P4-M0)

All three ride the Part-10 embed (or your own test app — remember to copy **both** widget bundles there after a rebuild). For a new workspace, Sense, Reason, the page image, "Show me" and **Guided walkthrough** are all **ON** by default (Studio → Copilot → Settings). **Unmasked typed values is the only opt-in** — it defaults OFF. Verify the switches rather than flipping them; a workspace created before 2026-07-27 may differ, since the defaults apply to new rows only.

**Sense (in-context help):**
1. Open a recorded flow mid-workflow (e.g. the sign-in form), fill some fields, open the copilot and ask *"what do I do next?"*.
2. Expect a **positional** answer anchored on the step you're actually on — and on a follow-up (*"then?"*) with an unchanged page it must **re-anchor**, never advance past an uncompleted step.
3. With **"Show me" highlight** ON (reload the host page after flipping), a positional answer also outlines the current step's element for ~6s.

✅ **PASS:** the answer names your real current step; "then?" on an unchanged page re-anchors; those rows log `CopilotQuery.senseUsed='used'`.

**Reason (diagnostic reasoning):**
1. Put the page into a blocked state (leave a required field empty / fail on-screen password rules so submit stays disabled) and ask *"why is the <button> disabled?"*.
2. Expect a plain-language diagnosis naming **every** blocker, formatted as numbered step rows with **bolded** UI names — no constraint jargon (`valueMissing` …), no re-instructing things that are already fine.
3. With **"Include page image"** ON, visual-only state (a color-coded requirements checklist) is diagnosed too; DevTools → Network shows the lazy `flowbuddy-copilot-render.js` fetch on the first diagnostic question.

4. **Rejected-action diagnosis (2026-07-16):** complete the form correctly, submit, and get a server rejection (e.g. sign up with an email that already has an account) → ask *"now what happened?"* — it must fire Reason (`reasonTrigger` set) and the answer must lead with the on-page error banner ("this email already has an account — sign in instead…"), NOT re-diagnose the healthy form, and never claim the enabled button is blocked. Then ask a **fast-path follow-up** (*"whats next?"*) over the same banner — even without Reason, the answer must acknowledge the rejection (the probe's error snippet now carries red-styled banners), never "go ahead and click it". Diagnostic answers must also never speculate ("server issue", "check your internet") — a decline says what was checked, nothing invented.

✅ **PASS:** correct blocker(s) in plain words; the rejection banner beats form theories; `CopilotQuery.reasonTrigger` = `intent`/`blocked` (+ `reasonImage=true` when the tier is on); a plain "how do I…" on the same page stays fast-path (`reasonTrigger` null).

**Reason fixtures — freezing the four states so this stops being a manual-only test:**

The four states above are the ones the diagnostic prompt's rules were learned from, and re-creating them by hand is why diagnosis has never had automated coverage. Capture each one **once** and it is replayable from a cold checkout forever — including after a database wipe, which every other form of copilot measurement does not survive.

*Capture — by hand, or by driving a browser.* The manual recipe is below; it can also be automated end-to-end with Chrome DevTools Protocol, and the one non-obvious trick is worth recording: the widget reads `window.FlowBuddyDebug` at mount, so `Page.addScriptToEvaluateOnNewDocument` turns capture on **without editing the host app at all**. Fill the form through the native value setter and dispatch `input` (React discards a bare `.value =`), then read `window.FlowBuddyLastAsk` after asking. No driver is committed here — the selectors and states belong to whichever product was recorded, and a script hardcoded to one signup form would rot the moment you record another.

**Read the form back before trusting a capture.** A selector that silently misses leaves you with several "different" fixtures that are all the same state, and every assertion still passes.

*The manual recipe (do this while you are already in the state, during the run above):*

1. Add `data-flowbuddy-debug="true"` to the widget snippet on the host page and reload.
2. Put the page in the state you want and ask the diagnostic question. (It must be a **real embed** — the Studio preview never captures page state.)
3. In the console, read `window.FlowBuddyLastAsk`. Copy `context.reason.snapshot` and `context.reason.trigger` into a new `scripts/reason-fixtures/<id>.json` — the shape and every option are documented in `_template.json` beside it.
4. **Name the workflow, never paste its ids.** The harness re-resolves `sourceId:segmentIndex` from the live sense plan on every run; a fixture holding stale ids would silently test an unlocalized engine after the next reseed. If the title can't be resolved the fixture is **skipped**, never scored.

Capture all four: **empty form · half-filled · invalid email · rejection banner showing.** The last one is the most valuable — it is the state that produced the "read the on-page error first" rule.

*Replay:*

```bash
node scripts/reason-fixtures.mjs --key pk_xxx            # add --dir for a scratch fixture folder
```

Each fixture runs a few times and reports **rates**, not pass/fail (the model is non-deterministic, so a binary would flap): `covered` · `plain-language` (no leaked constraint names or flag words) · `blockers` (did it name every machine-checked one) · `phrases` · `tools` (did it reach for the page image where pixels were the only evidence). Pace is deliberately slow — the diagnostic path has its own 6/min per-key ceiling, and running under it degrades the whole capture to the fast path.

✅ **PASS:** every fixture reports **fully measured** (nothing skipped, no runs that missed the diagnostic engine) and the rates are the ones you intend to defend. Save the capture — it is the before-half of any later change to the diagnostic prompt, and the hard prerequisite for merging that path into the agent loop ([`agent.md`](../build/agent.md) §9 Gap 3).

**Guided walkthrough (P4-M0 — zero-acting):**
1. Studio → Copilot → Settings → **confirm Guided walkthrough is ON** (it is, for any workspace created since 2026-07-27; the switch is disabled while Sense is off). If you had to flip it, reload the host page — config is mount-time.
2. Mid-workflow, ask a positional question → the answer carries a **"Walk me through it"** pill. Click it: the panel closes, the step card shows **your current step k/N** (not 1), and the step's element gets a persistent highlight.
3. Complete the step yourself (fill the field / click the button) → the card shows **"Detected ✓ — hit Next to continue"** and **stays put** — the pointer must move **only** on your Next click, never on its own. A navigating step survives the full-page load and **resumes on the next page with the step acknowledged** ("Detected ✓ — hit Next"; peek at `sessionStorage["flowbuddy.walkthrough.v2"]` before the nav). Try **Back**, and a stall: delete the highlighted element in DevTools → after ~3s the card safe-stops with Retry/Back/Exit. The final step ends with "hit Next to finish" → Next shows the Done card.
4. **State-awareness** (the first-E2E fixes): (a) an **invalid field** (e.g. a malformed `type=email`) must NOT advance — the status says the field doesn't look right and names the constraint; (b) an **unchecked checkbox** step must not count as done (and skip-ahead must park on it, not blow past); (c) with a **disabled submit button** as the current step, the status must read *"This button is disabled — check step k (…) first"* — never "click it" — and flip to "click the highlighted element" within ~half a second of the button enabling.
5. **Explain escalation** (Reason toggle ON): on a blocked/invalid/stalled card, the **"Explain what's blocking me"** button appears → click → the chat opens and asks *"Why can't I proceed with this step?"* for you → a full Reason diagnosis (that row logs `reasonTrigger='intent'`). With Reason OFF the button must not appear anywhere.
6. **Self-correcting pointer:** the card must always point at the **first unfinished input step on the page** — try to trick it: hard-reload mid-run so the form resets (resumes at the first empty field, not the stored step); clear an *earlier* field while the pointer is further ahead (pointer snaps back within ~0.5s); press **Next** over a genuinely empty field (explicit skip — the pointer must NOT drag you back to it; **Back** onto it re-engages the gate). A resume after a real mid-workflow navigation — earlier steps on a previous page — still resumes where you left off. For any weirdness, reload with `data-flowbuddy-debug="1"` on the snippet: every pointer decision (advance/correction, from→to) is logged.
7. Finish the workflow → "Done — you finished …" card; Prisma studio → `CopilotWalkthrough` has one row: correct `startStep/lastStep/totalSteps`, `autoAdvances`/`manualAdvances` split, `outcome='completed'` (your abort/stall experiments each leave their own row/outcome).

✅ **PASS:** offer only appears when the toggle is on + the answer is positional; the walkthrough starts at the probe's step; **the pointer never moves forward on its own — detection only shows "Detected ✓ — hit Next"** (genuine completions: checked/filled-and-valid, never a disabled click); blocked buttons are explained instead of demanded; Reason diagnosis on request; acknowledgments survive a hard navigation; safe-stops instead of guessing; every run lands one honest `CopilotWalkthrough` row (`autoAdvances` = detection-confirmed Nexts, `manualAdvances` = override Nexts).

**Chat + topic memory across navigations (P5-M0 cuts 1 & 2 — ✅ user-verified 2026-07-26):**

Locally the demo now has two pages — serve over **HTTP** (`python3 -m http.server 8080` from `packages/widget`), never `file://`, and put the same `data-flowbuddy-key` in **both** `demo/index.html` and `demo/page2.html`.

1. **The thread survives.** Ask a question on Dashboard → click **Team** in the top bar (a real full-page load) → the conversation is still there, scrolled to the bottom, with its Source pills and 👍/👎 state intact. The panel **re-opens itself** because you just used it.
2. **The reopen window.** Repeat, but wait >2 minutes before navigating → the thread still restores, but the panel stays **closed** at the launcher. (A copilot that pops open on a page the user navigated to for their own reasons is the failure mode this guards.)
3. **The defect that motivated the cut.** With Guided walkthrough + Reason ON, run a walkthrough through a step that navigates → on the next page the step card resumes **and the chat panel stays closed** (no flash of it opening first) → click **"Explain what's blocking me"** → the chat opens **with the earlier conversation still in it**, not an empty panel. This is the whole point of the cut.
4. **Follow-ups now carry across pages (cut 2).** After navigating, ask *"and then what?"* — it must continue the **same workflow** rather than searching the KB for those words. Two things to prove alongside it: (a) the server receives the pre-navigation turns in `history` (the one behavioral change — `history` now spans navigations), and (b) **the bias is escapable** — ask something clearly unrelated next and you must get that answer, not a forced continuation. A filter would be a bug; this is a bias.
   With source labels turned OFF in Studio (Copilot → Settings), re-run this step: no "Source" pill should appear, but the follow-up must still stay in the workflow — and Analytics → top workflows by citations should now populate for that workspace (previously it stayed empty).
5. **Hygiene.** DevTools → Application → Session Storage should show `flowbuddy.chat.v1` (and `flowbuddy.walkthrough.v2` during a run) — inspect the chat record: **no `walkOffer` plan copies**, and no message of kind `assistant.error`. Then: kill the API and ask something (the error bubble appears but must **not** persist across a nav); change `data-flowbuddy-key` on page 2 (the thread must be discarded, not shown to the wrong workspace); leave it 30+ minutes (TTL discard); open the Studio → Copilot preview (must persist **nothing** — reload it and the thread is gone); block storage / use a private window (the widget still works, just per-page-view).

**Copilot mode — the read-only agent (built + user-verified 2026-07-27):**

1. **Confirm the mode.** Studio → Copilot → Settings → **How your assistant works** → it reads **Copilot**, and there are exactly **two** rows (the AI Agent row visible but locked). If a third row appears, or the picker offers *AI Chatbot*, the retirement (2026-08-02) has been partially reverted — the mode is gone from the vocabulary, the picker and the database. If you changed anything, reload the host page — mode is read at mount, like every other config flag.
2. **Simple questions must not get worse.** Ask three or four straightforward "how do I…" questions you know are covered. They must answer as before, and at the same speed — round one of the agent loop *is* the old fast path. **This is the non-negotiable check**: a simple lookup that starts declining is the failure mode to watch (one such regression was caught during the build, at roughly 1-in-6).
3. **Ambiguity → a question back.** With two or more approved workflows that could both match, ask something ambiguous ("how do I cancel?"). It should ask *which one you mean* rather than guessing or declining. *(With a single approved workflow this cannot fire — there is nothing to disambiguate.)*
4. **It searches on its own.** Ask a follow-up that shifts topic ("what about …?"). It should find the other workflow rather than declining on the user's literal words.
5. **On-page abilities fire on a RULE, not judgment (2026-08-02).** With both switches ON, ask several positional questions mid-workflow: the highlight and the **"Walk me through it"** pill must appear **every time**, not sometimes. If they come and go, the D8 amendment has been reverted and the assistant is judging again. Then turn both switches OFF and confirm neither *ever* appears. The switch is the only decider — on means always, off means never.
6. **Including on a DIAGNOSTIC answer.** Ask *"why can't I proceed?"* from a blocked step: both must still appear. Worth testing separately because the diagnostic engine emits no intents at all, so it was the one path that went dark under the old judgment behaviour — and it is the moment the offer matters most, since the walkthrough's own **"Explain what's blocking me"** button leads here and a user must not be stranded without a way back in.
7. **Honest declines survive.** Ask two things the KB genuinely doesn't cover. Still declined, still no invention.

✅ **PASS:** simple questions unchanged in quality and speed; the assistant asks rather than guesses on genuine ambiguity; it searches again instead of declining on a topic shift; **on-page abilities appear on every positional answer when their switch is on, including on a diagnosis, and never when it is off**; declines still honest.

*(A newly created workspace is already in Copilot mode with show-me and guided walkthrough
permitted, so a clean-slate run tests this path by default. A DB-level shortcut if you ever need to
force it: `UPDATE "Workspace" SET "copilotMode"='copilot' WHERE "copilotPublicKey"='pk_…';` — and
note an unrecognised value fails closed to `copilot`, which is how a pre-retirement `chatbot` row
reads forward with no special case.)*

8. **The fallback is invisible.** There is no UI for it: if the agent loop errors, that single
   question is answered in one round with no tools and the mode setting stays put. To confirm it is
   wired rather than to force it, look for `agent path failed — falling back to the floor` in the api
   log; in normal runs you should never see it. **Since AI Chatbot's retirement nothing else
   exercises this path**, so those log lines are the only evidence it works — and a run of them means
   something upstream is failing.

---

✅ **PASS:** the conversation survives full-page navigations with citations and feedback intact; the panel re-opens only on a fresh thread and never over a resuming walkthrough; the walkthrough's "Explain what's blocking me" escalation lands in a populated thread; storage holds only allowlisted kinds with no plan copies; wrong-key/expired/preview/blocked-storage all degrade to today's single-page behavior instead of breaking.

---

## 11b. Where the user is standing — route patterns + structural screen identification (P2-M6)

**Why this leg needs its own harness.** Both changes are invisible on a product whose URLs already
name its screens — which every app tested here so far has been. `demo/serve.mjs` is a fake product
served at **every** path, so one recording can be asked about from a different URL:

```bash
pnpm --filter @flowbuddy/widget build
FLOWBUDDY_KEY=pk_xxx FLOWBUDDY_DEBUG=1 node packages/widget/demo/serve.mjs   # → :8080, any path
```

Add `http://localhost:8080` to the workspace's origin allowlist (§9). Two screens, `?screen=team`
and `?screen=billing`, deliberately share their chrome and differ in their content — that is the
discrimination a fingerprint has to make.

**Record at least three labelled things per screen.** Anchors come from what the founder *touched*,
so a two-click recording produces no fingerprint at all and the structural half silently tests
nothing. Click the nav, the fields, and the buttons.

**A. Routes are patterns.** Record a workflow at `/projects/111/settings` (fill the form, submit) →
process → approve. Now open **`/projects/222/settings`** and ask *"what do I do next?"*.

✅ **PASS:** a positional answer naming your real step, `senseUsed='used'`. Before this change the
shard came back empty and you got a generic answer. Check the wire too — `window.FlowBuddyLastAsk`
in the console shows what Sense decided, and DevTools → Network shows the `sense-plan` request
carrying the **pattern** rather than `222` (one fetch for every record, not one per record).
And the fastest server-side proof, which needs no browser at all:

```bash
curl -s -H "X-FlowBuddy-Key: pk_xxx" \
  "http://localhost:8787/v1/copilot/sense-plan?route=/projects/999/settings" | jq '.workflows[].title'
```

A workflow recorded on a *different* record id must come back. `jq '.workflows[0].screens'` shows
the fingerprints; a workflow whose steps carry no `screenKey` was recorded too sparsely to identify.

**B. The walkthrough never shows a foreign id.** Start a walkthrough, then navigate somewhere the
step doesn't live (`/somewhere-else`). The card must read *"This step happens on /projects/…/settings"*
— an elided path. **A real id there is the leak this closed**, and it is the founder's own record.

**C. Structure as the way in (slice 1).** Record a workflow at **`/`** — the root carries no screen
information by design, so nothing but the page itself can place it. Approve, reload `/`, ask a
positional question.

✅ **PASS:** it still localizes. This is the case that was previously blind no matter how
recognisable the page was. Server-side: `?route=/` must now return workflows rather than an empty
shard.

**D. Structure as a tiebreaker (slice 2).** Record one workflow on `/app?screen=team` and another on
`/app?screen=billing`. The query is stripped, so **both live at exactly the same route** and only the
page can tell them apart. Ask a positional question on each.

✅ **PASS:** each gets the workflow belonging to the screen actually showing. A tie ("are you doing X
or Y?") means the fingerprints didn't separate — check both recordings touched ≥3 labelled things.

**E. The guard: well-routed apps must not get chattier.** Re-run §11's Sense leg against the
originally recorded app. Nothing may change — no new "X or Y?" questions, same answers, same speed.
Structure is only allowed to speak where the URL doesn't; a workflow the route never mentioned is
dropped as soon as another matches the URL exactly.

**What this leg cannot tell you.** The matching halves have unit coverage (`pnpm test`); the widget's
scorer has no runner at all, so its behaviour is only ever observed here. Treat a surprise as the
scorer's, not the fingerprint's.

## 12. Analytics & coverage gaps (the feedback loop)

1. Studio → **Copilot** page → **Copilot activity**: shows total questions, % answered, 👍/👎 counts, and the recent Q&A list (each tagged answered/declined). Confirm your Part-10 questions appear with correct tags + feedback.
2. Studio → **Home** (`/dashboard`) → **Coverage gaps — record these next**: the *declined* question from 10b appears as an open gap (source `copilot`).
3. Click **Dismiss** on the gap → it resolves and disappears.
4. Studio → **Analytics** → **Questions** (`/dashboard/analytics/questions`): the searchable question log (shipped 2026-07-27). Search for part of a Part-10 question, and by host route; each row shows its answered/declined outcome.

✅ **PASS:** answered/declined counts + feedback reflect Part 10; the declined question shows as a coverage gap; dismiss works.

---

## 13. Reprocess — identity, and the trust boundary (P3-M1)

**The most important leg in this document.** An approval is the founder's signature on a piece of
content. This checks that a re-process can only carry it onto content that is still the same thing —
the failure it replaced was silent, invisible in Studio, and put unreviewed steps in front of
end-users.

Use a recording with **at least two approved workflows**, one of them cited by the copilot.

1. Studio → the recording → **Re-process**. Wait for `ready`.
2. **Approvals survive where the content didn't change.** The workflows are still Approved · Live,
   and the copilot still answers and cites them. Nothing appears under **Not answering**.
3. **Identity survived, not just the row.** The workflow's citation history is intact — its detail
   page still shows its *Cited by copilot* count and 👍/👎 tally, rather than resetting to `—`.
   (Analytics group on the identity, so a reset means a new identity was minted for old content.)
4. **Worker log:** no `workflows no longer present after reprocess` warning.

### The half that must fail closed

Force a mismatch — record the same task again but **materially differently** (add or remove a couple
of steps, or change where it ends), then re-process the ORIGINAL recording so re-segmentation moves
things.

5. A workflow whose content no longer matches is **detached**: it appears under **Not answering** as
   **Needs re-review**, with the plain-English line about the recording having changed.
6. **The copilot stops citing it** — ask a question it used to answer and confirm it is no longer the
   source. This is the actual guarantee; the badge is only how you see it.
7. Click **Looks right** on it → live again, and the copilot cites it once more.

✅ **PASS:** items aren't duplicated · approvals follow CONTENT, not position · anything unverifiable
stops answering until a human confirms it · citation history survives.

> **What "keyed by `sourceId + segmentIndex`" used to mean, and why it is gone.** Approval used to
> name a POSITION so it would survive the worker's item delete-and-recreate. That was safe only while
> re-segmentation was deterministic; once it wasn't, a re-split could put a different workflow at
> index 2 and the approval followed the index. Those columns no longer exist — an approval names a
> `Workflow`, and the worker re-matches by content. If a future change makes step 5 stop happening,
> the fail-closed path has been lost, not fixed.

> **Do not test this by killing the embeddings API.** On a re-process an embedding failure is FATAL
> by design (identity can't be verified without vectors), so the job fails and the KB is left exactly
> as it was — correct behaviour, but it tests the abort path, not the matcher.

---

## Acceptance checklist

The gate, one line per area. Each step's own **PASS** signal is inline above — not repeated here,
because a second copy is how this list drifted out of date before (it used to omit `pnpm test`).

- [ ] `pnpm typecheck && pnpm test && pnpm build && pnpm lint` all green
- [ ] Record → the recording reaches `ready` with distilled steps grouped by workflow
- [ ] Throwing a recording away removes both the row and its objects
- [ ] Approval gates answers — an un-approved workflow is invisible to the copilot
- [ ] A covered question is answered with a citation; an uncovered one declines and logs a gap
- [ ] Sense localizes to workflow + step; Reason diagnoses a blocked page
- [ ] The walkthrough advances only on Next, and survives a full-page navigation
- [ ] The conversation survives a navigation; a term-less follow-up stays on topic
- [ ] Mode switching is instant and reversible; the founder switches always win
- [ ] Analytics show the questions, the citations and the coverage gaps

## Troubleshooting (local)

| Symptom | Cause / fix |
|---|---|
| `command not found: pnpm` | `corepack enable` |
| "can't reach database" | `docker compose up -d`; wait for Postgres `healthy` |
| Nothing happens after recording | The **worker** must be running (`pnpm --filter @flowbuddy/api worker`) |
| Recording stuck `processing` / `error` | Missing/invalid `OPENAI_API_KEY` in `packages/api/.env`; check the worker log |
| Extension upload 401 | Token wiped/expired → redo **Part 5** (`/connect`) |
| Extension upload `400 missing or malformed X-FlowBuddy-Upload-Id` | An **old recorder build** (anything up to and including store v0.6.0) against the new API — the identity header didn't exist yet. Rebuild + reload the unpacked extension (`pnpm --filter @flowbuddy/extension build`); a store install needs a newer published version |
| Recording sits on **Recording** and never processes | Capture never stopped/finalized — the row has no manifest yet and the worker deliberately skips it (`no manifest yet — recording not finalized, skipping`). Stop the recording. If it was **abandoned**, it is cleaned up: the recorder discards it on **Start fresh** / on starting the next recording, and the server sweeps `recording` rows idle >12h on the next finalize (Part 6c) |
| Stop still takes minutes; the log says artifacts are `riding the bundle` (or `audio=in bundle`) | Direct upload failed (offline, `/v1/uploads/sign` 4xx/5xx, storage rejected the PUT) and fell back to the all-in-one bundle — still a valid upload, just not the path you meant to test. Check the api log for `/v1/uploads/sign`; locally confirm MinIO is up on `:9000` and that `R2_ENDPOINT` is an address the **browser** can reach, not a docker-internal hostname |
| Popup shows a **percentage** or **"Finishing…"** during upload | An extension build from before the upload rework — there is no byte-progress bar any more (`Finishing up…`, then `Sending the rest of your recording…` + an elapsed timer after 8s). Rebuild + reload the unpacked extension |
| Upload succeeded but the recording never processes; api log says `could not enqueue synthesis — recording is stored` | Redis was down/slow at finalize; the enqueue is a bounded 5s race so the upload still succeeded. Start Redis (`docker compose up -d`), then **Re-process** the recording from Studio — do **not** re-record |
| Workflow over-split into phases | Segmenter tuning — see [`packages/synthesis/src/segment.ts`](../../packages/synthesis/src/segment.ts) (prompt · `overallNarration` · markers) |
| Widget shows no launcher | Serve `demo/` over **HTTP** (not `file://`); refresh stale `data-flowbuddy-key` |
| Copilot: "no approved help content" | Approve a workflow in **Part 8** |
| Answer rejected by origin | Add the demo origin in **Part 9** allowed origins |
| Type changes not picked up | `pnpm build` (Turbo) / `pnpm db:generate` for the Prisma client |

---
---

# **LEVEL 2 — DEV TESTING ON RENDER**

---

How to wipe the **data** on the live [Render](https://render.com) dev deploy and re-run the full copilot walkthrough on a clean slate — record → KB → approve → embed → ask → verify.

This is the **cloud** counterpart to Level 1 (which resets a *local* docker-compose stack). For the initial deploy + every secret, see [`deploy.md`](deploy.md) §3 (dev/staging).

> **You are wiping DATA, not the deploy.** The 5 Render resources and all env vars / secrets stay put.
> Only the contents of the three stores are cleared.

> 🔐 **Never commit live credentials.** The External Database URL and the R2 keys contain secrets.
> This doc uses **placeholders** — pull the real values from the Render dashboard at run time and keep
> them out of git (paste into the shell, or an **untracked** scratch file). The only hardcoded value
> here is the public Studio URL.

## D0. The three data stores (what gets wiped)

| Store | Render resource | Holds | Wiped by |
|---|---|---|---|
| Postgres | `flowbuddy-dev-db` | users, workspaces, recordings, KB, approvals, copilot queries, **widget public key + extension connect tokens** | Step D1 |
| Object storage | Cloudflare **R2** (`flowbuddy-artifacts-dev` — the **dev** bucket; `flowbuddy-artifacts` is PROD, never touch it here) | screenshots / audio / DOM (`workspaces/<wsId>/sessions/<sessionId>/…`) | Step D2 |
| Queue | `flowbuddy-dev-redis` (Key Value) | BullMQ synthesis jobs (transient, no persistence) | Step D3 *(optional)* |

⚠️ **Wiping Postgres deletes your account, workspace, the embed snippet's `data-flowbuddy-key`, and the
extension's connect token.** A from-scratch test therefore means: **new account → new keys →
re-connect the extension → re-copy the embed snippet** (Step D5).

---

## D1. Wipe Postgres (clear data + recreate schema)

`prisma migrate reset` drops the `public` schema and replays every migration in one shot. Run it from
**anywhere in the repo** (the `--filter` resolves the package from the workspace — no `cd` needed):

```bash
DATABASE_URL="<paste-external-database-url>" pnpm --filter @flowbuddy/db exec prisma migrate reset --force --skip-seed
```

- `<EXTERNAL_DATABASE_URL>` → Render dashboard → **flowbuddy-dev-db** → **Connect** → **External Database URL**
  (the full `…oregon-postgres.render.com/flowbuddy_xxxx` host — **not** the internal one; your laptop can't
  reach internal). If Prisma complains about SSL, append `?sslmode=require`.
- `--force` skips the confirm prompt; `--skip-seed` suppresses the (absent) seed step.

✅ **PASS:** ends with `Database reset successful` + `All migrations have been successfully applied.`
No redeploy needed — `flowbuddy-dev-api` already points at this DB, now empty + correctly schema'd.

**Alternative (no local Prisma):** `psql "<EXTERNAL_DATABASE_URL>"` → `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
then Render → **flowbuddy-dev-api** → **Manual Deploy → Deploy latest** (its start command runs
`prisma migrate deploy`, recreating tables).

---

## D2. Empty the R2 bucket

Old artifacts are orphaned by the wipe (new workspace = new key prefix) and eat the free quota.
*(Abandoned recordings are no longer part of this problem — since 2026-07-28 the recorder discards
them on Start fresh / on the next Start, and the server sweeps any `recording` row idle >12h together
with its objects. A wipe still leaves everything else behind.)*
**Keep the bucket** (the API runs `HeadBucket` at boot) — just clear its contents:

```bash
AWS_ACCESS_KEY_ID="<R2_ACCESS_KEY_ID>" \
AWS_SECRET_ACCESS_KEY="<R2_SECRET_ACCESS_KEY>" \
AWS_DEFAULT_REGION=auto \
  aws s3 rm s3://flowbuddy-artifacts-dev --recursive \
  --endpoint-url "<R2_ENDPOINT>"
```

Values live in the `flowbuddy-dev-r2` env group (Render → **Env Groups → flowbuddy-dev-r2**) / your Cloudflare R2 token.
No AWS CLI? Cloudflare dashboard → R2 → `flowbuddy-artifacts-dev` → select objects → delete.

✅ **PASS:** `aws s3 ls s3://flowbuddy-artifacts-dev --endpoint-url "<R2_ENDPOINT>"` returns nothing.

---

## D3. Flush Redis *(optional)*

Free Key Value has **no persistence** and jobs run right after upload, so this is usually unnecessary.
To be clean: Render → **flowbuddy-dev-redis** → **Restart** (a restart flushes it). You can't `redis-cli` from
your laptop — `ipAllowList: []` blocks external access.

---

## D4. Confirm the services are healthy

Open the **flowbuddy-dev-api** URL once to wake it (free tier cold-starts ~1 min after idle). Prod logs are **JSON at `info`+** (see [`deploy.md` → Logging in production](deploy.md#25-logging-in-production)); the boot should show:

```
All migrations have been successfully applied.
{"level":"info","service":"api","port":8787,"env":"production","msg":"FlowBuddy api listening"}
{"level":"info","service":"worker","queue":"synthesis","msg":"listening on queue"}
```

✅ **PASS:** all three lines present; no `ECONNREFUSED` (R2) or `MissingSecret` (auth) errors.

> **Need more detail while testing on Render?** Bump `LOG_LEVEL` to `debug` on the service (dashboard → **Environment**; no code redeploy — the service restarts), then set it back to `info`. See [`deploy.md` → Logging in production](deploy.md#25-logging-in-production).

---

## D5. Test from scratch

Mirrors [`deploy.md`](deploy.md) §6 (end-to-end test), with the **post-wipe gotchas** called out.

### D5.1–D5.6 — run Level 1, against the dev deploy

**Level 2 is Level 1 with different URLs.** Do not re-read the steps here; work through Parts 4–12
above, substituting the dev Studio for `localhost:3000`. Only the differences matter:

- **Create a fresh account** on the dev Studio (the wipe removed yours).
- **Re-connect the extension** — the recorder token died with the database, and the store build bakes
  the dev origin, so no special build is needed.
- **Free-tier cold starts** are real: the first request after idle can take ~30 s. A timeout on the
  first call is not a failure.
- **⚠️ Only Level 2 proves the direct-upload path.** MinIO is more permissive than R2 on both
  checksums and cross-origin PUTs, so **a green Level 1 is not evidence** that signing works. This is
  the single reason Level 2 exists.
- **Worker logs appear inside the api service** — Render folds the worker into it.

## Post-wipe checklist (the things people forget)

- [ ] **New account** created (old users are gone).
- [ ] **Extension re-connected** (old token invalid).
- [ ] **Embed snippet re-copied** — new `data-flowbuddy-key`.
- [ ] **R2 emptied** so old artifacts don't linger / count against quota.
- [ ] Env vars / secrets were **not** touched — no need to re-enter them.

---

## Troubleshooting (Render dev)

Start with **Troubleshooting (local)** above — most symptoms are identical. Only these are
environment-specific:

| Symptom | Cause |
|---|---|
| First request after idle hangs ~30 s | Free-tier cold start. Not a failure. |
| Recording uploads locally but fails on dev | The signing path — R2 enforces request checksums and cross-origin PUT rules that MinIO ignores. This is the failure Level 1 structurally cannot catch. |
| Worker never picks the job up | The worker runs *inside* the api service here; check that service's logs, not a separate one. |
| Studio can't reach the api | The service URL carries a random suffix if the plain name was taken — check the real URL in the dashboard. |

# **LEVEL 3 — PROD TESTING ON RENDER** *(live since 2026-07-23)*

---

Production is the [`deploy.md`](deploy.md) §4 stack — `app.flowbuddyai.com` (Studio) · `api.flowbuddyai.com` · `widget.flowbuddyai.com` + the apex landing card — **launched 2026-07-17 and user-verified E2E on 2026-07-23** (the §5G seed + smoke test: record → approve → embed → grounded answer → Sense positional → Reason diagnosis → analytics). Prod testing rules:

- **Non-destructive only — NEVER run data wipes here.** The Level-2 reset flow (D0–D3) is for the dev environment exclusively (dev bucket `flowbuddy-artifacts-dev`, dev DB); real customer data lives in prod.
- **The walkthrough = Level-2 D5 minus the wipe steps**, pointed at the prod URLs — the embed snippet copied from `app.flowbuddyai.com` already carries the stable `api.`/`widget.` domains.
- **No cold-start waits** (paid tier is always-on).
- **Worker logs appear inside `flowbuddy-api`** — prod also folds the worker into the api (`start:all`); a separate worker service is scaling-ladder Step 1 ([`deploy.md`](deploy.md) §9).
- **Extension:** use the store build — v0.6.0+ bakes `app.flowbuddyai.com` as the primary origin, so no special build is needed. **⚠️ Since the upload rework, prod requires v0.7.0 or newer** (v0.6.0 sends no `X-FlowBuddy-Upload-Id` and gets a `400`) — confirm the installed version before concluding anything from a failed recording.

---
