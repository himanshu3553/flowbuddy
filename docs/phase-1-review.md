# Phase 1 — End-to-End Review & Recommendations

> **What this is.** A from-scratch, end-to-end review of everything built for Phase 1 (all 7 packages + docs + deploy config), done at the "Phase 1 development complete" checkpoint before deciding what to do next. **Recommendations only** — findings are annotated ✅ inline as they land, so this doc doubles as the remediation tracker.
>
> - **Reviewed:** 2026-07-03 · branch `dev` (incl. the then-uncommitted R10 / queue-hardening / render.yaml changes)
> - **Verified during review:** `pnpm typecheck` ✅ green · `pnpm build` ✅ green (all packages)
> - **Priorities:** **P0** = fix before any external user touches the deployed copilot · **P1** = fix before/while starting the next phase · **P2** = backlog, schedule deliberately

**Landed since the review (as of 2026-07-05):** the §5 in-flight batch is fully committed (R10 `328fd88`, Studio queue-hardening + render.yaml `6e174be`); **R12 screenshot timing/cost shipped** (`0c56d4b` — JPEG, pointerdown pre-click capture, bbox↔scroll re-validation; affects §4.12) with a **KB step-screenshot lightbox + bbox highlight** in the Studio (`ff35c24`); two full doc-sync passes landed (`3819dd0`, `33cc2fd` — closes §6.4; `render-reset-and-test.md` merged into `e2e-testing.md` Level 2). §6.3's missing doc-map rows and the §6.1/§6.2 stale data-shape comments were fixed 2026-07-05. Everything in §2 (P0) and §3 (P1) remains **open**.

---

## 1. Verdict

Phase 1 is in genuinely good shape. The core product promise — *record → distill → approve → embed → grounded answers with honest declines* — is implemented coherently, and several things stand out as better than typical MVP quality:

- **The trust gate is sound.** Approval is keyed by `(sourceId, segmentIndex)` so it survives the worker's delete+recreate reprocess; retrieval goes through a single documented enforcement seam; the answer engine is schema-constrained and validates citations against the item set it was given.
- **Anti-hallucination is enforced structurally, not just by prompt.** The segmenter carry-forward guard ("no event silently dropped") and the distiller's `sourceEventIds` validation ("no step without a real event") are the right mechanisms.
- **The recorder's failure-mode engineering (R1–R10) is thorough** — SW-eviction outbox, pull-based re-arm, retry-preserving buffer, honest upload progress, pause-aware timelines.
- **Docs are unusually current.** The roadmap/phase-1/architecture/internals set matches the code almost everywhere (the few drifts found are listed in §6), and the parked Phase-2 code is fenced with banners and a resume map.

Nothing found blocks the "Phase 1 done" claim. The findings below are about **hardening the deployed surface (P0), paying down a few architectural debts before they compound (P1), and queuing quality work (P2)** — plus doc touch-ups and a suggested sequencing plan.

---

## 2. P0 — before any external user touches the deployed copilot

These are all on the public, unauthenticated-ish surface (the copilot endpoints + ingestion) or affect data durability. Small fixes, high leverage.

### 2.1 BullMQ jobs are never cleaned up → Redis fills up and dies
Neither producer ([api/src/queue.ts](../packages/api/src/queue.ts), [web/lib/queue.ts](../packages/web/lib/queue.ts)) nor the worker sets `removeOnComplete` / `removeOnFail`, so **every completed/failed job is kept in Redis forever**. On Render's free Key Value (25 MB, no persistence) this is a slow-motion outage.
**Fix:** `defaultJobOptions: { removeOnComplete: { count: 100 }, removeOnFail: { count: 500 } }` on the Queue(s).

### 2.2 No retry on synthesis jobs; no "stuck" recovery
Jobs run with default `attempts: 1`. Any transient failure (OpenAI 429/timeout, R2 blip) permanently lands the recording in `status: error`; a Redis loss while `processing` leaves it stuck in a state the UI renders as "Processing" forever ([recordings.ts](../packages/web/lib/recordings.ts) maps `uploaded|processing` → Processing with no age limit).
**Fix:** (a) `attempts: 3` + exponential backoff on enqueue (the worker is already idempotent — it delete+recreates items, and approvals survive by design); (b) surface age: a source `uploaded/processing` for > ~15 min should render as "Stalled — re-process" in the Recordings UI (the re-process action already exists and covers recovery).

### 2.3 The API process has no `error` listeners on its queue/worker → crashable
The [web/lib/queue.ts](../packages/web/lib/queue.ts) hardening (committed 2026-07-04, `6e174be`) adds an `on('error')` handler *for exactly this reason* (an emitted `'error'` with no listener throws and can take the process down) — but the **API producer** (`api/src/queue.ts`) and the **Worker** (`api/src/worker.ts` has `on('failed')` but not `on('error')`) still have none. On the free tier these run in the *same process as the public API* (`all.ts`), so a Redis hiccup can crash the copilot.
**Fix:** mirror the web hardening: `synthesisQueue.on('error', …)` + `worker.on('error', …)` (throttled log).

### 2.4 Unbounded question size + no output cap → token-cost abuse
`/v1/copilot/answer` trims but never caps `question`; `answerFromKB` sets no `max_tokens` and no `temperature`. History is capped (10 × 4000 chars) but the question itself can be megabytes, multiplied by 24 KB items per call. Anyone with the public key (it's in the host page source) can run this 30×/min indefinitely — there's no spend ceiling anywhere.
**Fix (cheap):** cap `question` (~2,000 chars, 400 in the widget input via `maxlength`), set `max_tokens` (~700) and an explicit low `temperature` in `answerFromKB` (segment/distill already pin `0`), and reject absurd bodies early. **Fix (proper, can be P1):** a per-workspace daily budget counter + log OpenAI `usage` tokens per query (one extra column on `CopilotQuery` — also unlocks real cost analytics later).

### 2.5 Rate limiting covers only `/answer`
`/v1/copilot/feedback` and `/v1/copilot/seen` skip `checkRateLimit` — both are DB-writing endpoints reachable with just the public key. Feedback is also a blind write path (`queryId` cuids are hard to guess, so impact is low, but it's free spam).
**Fix:** apply the same limiter to all three copilot routes (one shared preHandler).

### 2.6 Ingestion buffers whole uploads in memory
`/v1/sessions` does `await part.toBuffer()` per file with `fileSize: 300 MB, files: 10 000` — a large (or malicious: the recorder token isn't the only thing that can hit this endpoint) bundle is fully materialized in RAM on a 512 MB instance, alongside the copilot serving traffic.
**Fix:** stream parts to storage (`@aws-sdk/lib-storage` `Upload` accepts a stream), and add a total-bundle cap. Also worth noting: if the manifest fails validation, files already streamed are orphaned in R2 — either validate the manifest part first (require it as the first field) or delete the prefix on reject.

### 2.7 Empty origin allowlist = open copilot, silently
`copilotAllowedOrigins: []` means "allow any origin" (deliberate dev default), and nothing in the Studio pushes owners to set it before going live — so the realistic steady state is *every* workspace running an unlocked endpoint + a public key visible in page source.
**Fix:** keep the dev semantics, but (a) show a prominent "origin allowlist not set — your copilot will answer from any website" warning on the Copilot page once the widget is detected live, and (b) normalize entries on save (`setCopilotOrigins` currently stores whatever string the user typed; `https://app.acme.com/` with a trailing slash or a bare `app.acme.com` will never match the browser's `Origin` header — parse with `new URL()` and store `origin` exactly).

### 2.8 Free-tier deploy is fine for testing, wrong for a real embed
Already documented in [render.yaml](../render.yaml) — but worth restating as a gate: spin-down means an end-user's first question after 15 idle minutes waits ~60 s, and free Redis losing queued jobs contradicts the recorder's "no silent data loss" promise at the last hop. **Before the first external SaaS embeds:** execute the already-written production plan (split worker service, paid Postgres/Redis, always-on API). Track it as a module (e.g. "P1-M4b — production deploy") rather than a yaml comment.

---

## 3. P1 — architectural debts to pay before building more on top

### 3.1 Retrieval is implemented twice — collapse to one module
[api/src/copilot.ts](../packages/api/src/copilot.ts) and [web/lib/copilot-preview-actions.ts](../packages/web/lib/copilot-preview-actions.ts) each carry their own copy of the STOP list, the keyword shortlist, and `sanitizeHistory`, held together by "this MUST mirror" comments (and they've already drifted: the preview lacks the route-boost). The *no-leak guarantee* — the most important invariant in the product — currently has **two** enforcement implementations (`retrieveApprovedKBItems` in the API, `listApprovedItems` in web).
**Recommendation:** extract a single `retrieval.ts` into `@sync/synthesis` (it already owns the KB item types): `shortlistItems(items, question, opts)` + `sanitizeHistory` + one approved-items query helper that takes a Prisma client. API and Studio preview both call it. This also gives pgvector (P1-M3) exactly one place to land.

### 3.2 Per-question retrieval is O(entire workspace KB)
`retrieveApprovedKBItems` loads **all** segment-tagged `KnowledgeItem`s for the workspace on every question, then filters in JS against the approvals set. Fine today; degrades linearly with recordings.
**Recommendation:** no code change yet — but define the pgvector trigger concretely (e.g. "when a workspace exceeds ~1–2k items or when decline-rate on covered topics rises"), and in the meantime the approval filter can move into SQL (join `CopilotApproval` on `(sourceId, segmentIndex)`) as a cheap intermediate. Fold into the 3.1 module.

### 3.3 Long recordings will fail transcription — and take the whole job down
`transcribe()` sends the entire `audio.webm` to Whisper; OpenAI rejects files > 25 MB (roughly ~25–40 min of opus). The throw propagates and the recording lands in `error`, discarding perfectly good event capture.
**Recommendation:** wrap transcription in a try/catch that degrades to an empty transcript (the pipeline already works transcript-less — narration just isn't attributed), and record a visible warning on the source (e.g. `error: 'narration too long to transcribe'` while still `ready`). Chunked transcription can come later.

### 3.4 Graceful shutdown
No SIGTERM/SIGINT handling anywhere; every deploy hard-kills in-flight synthesis (stalled-job recovery then depends on Redis surviving, which on the free tier it doesn't).
**Recommendation:** `process.on('SIGTERM', …)` → `await worker.close()` + `app.close()` in `api` (both entrypoints). ~10 lines.

### 3.5 Recorder token lifecycle
`connectExtension` mints a **new** `ApiToken` on every connect and nothing ever revokes old ones; there's no token list/revoke UI. One stolen laptop = permanent silent upload access.
**Recommendation:** on connect, delete previous tokens with the same label (`'Sync Recorder extension'`) so reconnecting rotates rather than accumulates; longer-term, a Settings section listing tokens (label, created, last-used) with revoke.

### 3.6 Studio auth hardening (before real customers, not before Phase 2)
Credentials auth has no sign-in rate limit / lockout, signup is open on the deployed Studio, and there's no password reset or email verification. Acceptable for a dev deploy; not for onboarding a real SaaS.
**Recommendation:** track as an explicit pre-beta module: rate-limit `signInAction` (per-email + per-IP), gate signup (invite code or allowlist) while in private beta, and add password reset via email before charging anyone.

### 3.7 The content script runs on every page the user ever visits
`manifest.json` statically injects `content.js` into `<all_urls>`, `all_frames: true`, and every load fires the `hello` handshake — even though 99.9% of pages will never be recorded. It's small and inert, but: (a) Chrome Web Store review treats static `<all_urls>` + broad host permissions as the highest-scrutiny tier; (b) privacy-conscious users will read it as "this extension watches everything".
**Recommendation:** when Web-Store publishing becomes real, switch to programmatic injection only into session tabs — the machinery already exists (`armTab` injects on demand; `tabs.onUpdated`/`onCreated` events can replace the hello-on-every-page self-arm for *recorded* tabs). Until then, no change needed for load-unpacked usage.

### 3.8 Observability before more features
The API/worker log with `console.log` + Fastify's default logger; there's no error aggregation. When the first external embed misbehaves you'll be debugging from Render's log tail.
**Recommendation:** minimum viable: route worker/segment/distill logs through one pino logger with `sessionId`/`workspaceId` fields, and add Sentry (or similar) to api + web before the first real customer. Also: `answerFromKB` should log model latency + token usage per call (pairs with 2.4's budget counter).

### 3.9 Start a thin automated test layer (revisiting the 2026-06-18 decision)
"No test harness" was the right call while the product was being found. Phase 1 is now **done and about to be built upon** — and this review found exactly the kind of regressions tests catch cheaply (duplicated retrieval logic drifting, stale data-shape decoders). The distillation work even wrote throwaway mocked-OpenAI assertions that were then discarded.
**Recommendation:** a single `vitest` setup covering only the pure seams — `cleanEvents`, `redactText` (the Luhn/phone/email edges), `shortcutCombo`, the segmenter carry-forward guard, `sanitizeHistory`, `checkRateLimit`, `distillSteps` grounding validation with a mocked client, `highlightFromBbox`. No CI, runs via `pnpm test` locally next to typecheck. ~1 day, permanent regression floor for the trickiest logic in the repo.

---

## 4. P2 — quality & correctness nits (batch when convenient)

| # | Where | Finding | Suggested fix |
|---|---|---|---|
| 1 | [distill.ts](../packages/synthesis/src/distill.ts) timeline | Every event `value` is prompted as `typed: "…"` — post-R10 that mislabels scroll depth (`typed: "45%"`) and shortcuts (`typed: "Meta+K"`) to the LLM | Type-aware label: `typed:` for `input`, `pressed:` for `keydown`, `scrolled to:` for `scroll` |
| 2 | [content.ts](../packages/extension/src/content.ts) `onScroll` | Only page-level scrolls are captured; many SPAs scroll an inner container (`<main overflow:auto>`), so R10 scroll silently no-ops there | Documented tradeoff — consider extending to the largest scrollable ancestor later; note it in the R10 as-built |
| 3 | [clean.ts](../packages/synthesis/src/clean.ts) rule 2 | An **Enter**-keydown that submits a form isn't merged with the following `submit` (rule only merges `click`+`submit`) | Extend rule 2 to `keydown(Enter)`+`submit` |
| 4 | [copilot.ts (synthesis)](../packages/synthesis/src/copilot.ts) | No `temperature` on the answer call (defaults to 1.0) while every other LLM call pins 0 | Set ~0.2–0.3 for consistent answers |
| 5 | [kb/[id]/page.tsx](../packages/web/app/dashboard/kb/%5Bid%5D/page.tsx) | "Selectors healthy · grounded and ready to cite" is a hardcoded claim — no selector-health signal exists (R13 unbuilt) | Reword to something derivable ("Approved · N steps · screenshots present") |
| 6 | [analytics.ts](../packages/web/lib/analytics.ts) `getCoverageGapsRanked` | "asked N×" counts declined queries **all-time** while the page is range-filtered; gap↔question match is exact-string | Window the count to the selected range; fuzzy/normalized matching is backlog |
| 7 | [copilot-metrics.ts](../packages/web/lib/copilot-metrics.ts) | Day bucketing uses server-local midnight (UTC on Render) — days shift for non-UTC founders | Note it; per-workspace TZ is a later feature |
| 8 | [widget/src/index.ts](../packages/widget/src/index.ts) | `history` sent to the API grows unboundedly over a long chat (server slices to 10 anyway); input has no `maxlength` | Slice client-side (last 10) + `maxlength` (pairs with 2.4) |
| 9 | widget a11y | Panel lacks `role="dialog"`/focus management; thumbs buttons lack labels | Backlog item for the widget |
| 10 | [server.ts](../packages/api/src/server.ts) | CORS is a blanket `*` on all routes incl. token-authed ingestion | Fine (auth is header-based) — add a comment stating it's deliberate, or scope the header to `/v1/copilot/*` |
| 11 | [analytics page](../packages/web/app/dashboard/analytics/page.tsx) | "Tickets deflected ≈ answered" proxy — already flagged with ≈ | Keep; replace when a real deflection metric exists (analytics backlog) |
| 12 | R12 (existing backlog) | Multi-tab screenshots: `captureVisibleTab(windowId)` shoots the *active* tab of that window — an event from a background adopted tab can screenshot the wrong tab | **Still open** — R12 shipped 2026-07-05 (`0c56d4b`) *without* this; track it with the parked "R12 follow-ups" in phase-1-copilot.md §8 (the `tabCapture`-stream rebuild would solve it) |
| 13 | Capture gap (known) | Full-page-nav form flows can lose late `change`/post-action data (documented in [internals/recorder-capture.md](internals/recorder-capture.md)) | Promote to a numbered backlog item (R14) so it stops living only in memory/internals — candidate fix: flush field values on `submit` + a `pagehide` flush |

---

## 5. The uncommitted work on `dev` (reviewed — commit it) — ✅ done 2026-07-04

*(All three changes below were committed: R10 as `328fd88`, the queue hardening + render.yaml as `6e174be`. Kept for the record.)*

The working tree held three logical changes; all reviewed, all sound:

1. **R10 richer capture** (`content.ts`, `shared/capture.ts` + doc updates) — well-scoped: debounced significant page scroll, dwell-gated `aria-haspopup` hover, normalized shortcut combos with an edit-key denylist. Listener add/remove pairs match (incl. the `{capture:true}` removal), timers are cleaned in `clearScrollHover`, and downstream tolerates the new types (`type` is a free string end-to-end). The only follow-up is the `typed:` prompt nit (§4.1).
2. **Studio queue hardening** (`web/lib/queue.ts`) — lazy Queue creation, error listener, retry backoff: exactly right, and it *exposes* that the API side lacks the same protections (§2.3).
3. **render.yaml** — `REDIS_URL` on `sync-web`: correct and necessary for the re-process action in prod.

Recommendation: commit this batch as-is (respecting your commit-then-push convention) before starting remediation work, so review fixes don't tangle with feature work. Note `git status` also shows branch drift: `dev` is 5+ commits ahead of `main` — decide whether `main` should be fast-forwarded at the "Phase 1 done" milestone like last time.

---

## 6. Doc & housekeeping updates

Docs are in excellent sync overall; these are the only drifts found:

1. ✅ **[schema.prisma](../packages/db/prisma/schema.prisma) `KnowledgeItem.data` comment** *(fixed 2026-07-05)* — said `step: { event, narration }`; now documents the distilled shape `{ instruction, detail, route, narration, screenshotFile, bbox }` (with the legacy shape noted for pre-distillation rows).
2. ✅ **[synthesis/src/index.ts](../packages/synthesis/src/index.ts) `StepItemData` / `decodeStepData`** *(fixed 2026-07-05)* — the section now carries a PARKED (Phase-2 article engine only) banner stating the worker no longer writes this shape, that it decodes the LEGACY `{ event, narration }` payload, and pointing at the phase-2-portal.md §6 re-sourcing note.
3. ✅ **Doc maps don't list the deploy doc** *(resolved 2026-07-05)*. `deploy-render.md` existed but wasn't listed in [roadmap.md](roadmap.md) §8 or the CLAUDE.md doc table. *(2026-07-04: `render-reset-and-test.md` was merged into `e2e-testing.md` as its Level-2 section; 2026-07-05: `deploy-render.md` + this review doc were added to both doc maps and the README table.)*
4. ✅ **internals/** *(resolved 2026-07-04/05)* — `33cc2fd` brought `internals/recorder-capture.md` + `connections.md` current with R4/R7/R8/R9/R10 (+ the R12 commit updated them again for JPEG/pre-click).
5. **e2e-testing.md** — optionally add a Part covering R10 events (scroll/hover/shortcut appear in the KB) and the widget feedback → analytics loop; the plan currently ends at analytics basics.

---

## 7. Suggested sequence

A realistic ordering that front-loads risk reduction without blocking product momentum:

1. ~~**Commit the in-flight batch** (§5) + the two one-line doc/comment fixes (§6.1–6.2)~~ *(✅ done — batch 2026-07-04, comment fixes 2026-07-05)*.
2. **"Public-surface hardening" PR** — all of P0 §2.1–2.6 (queue retention/retries/error-listeners/shutdown, caps + max_tokens, rate-limit all copilot routes, streamed ingestion). Small diffs, mostly config-level; one E2E pass (e2e-testing.md Parts 6–11) to verify.
3. **"Trust-surface" PR** — origin-allowlist normalization + the Studio warning (§2.7), recorder-token rotation (§3.5), KB-page honesty reword (§4.5).
4. **Retrieval consolidation** (§3.1/3.2) — one shared module in `@sync/synthesis`; deliberately *before* pgvector so the upgrade has a single landing spot.
5. **Thin test layer** (§3.9) + transcription degradation (§3.3) + observability minimum (§3.8).
6. **Production deploy plan** (§2.8) — executed whenever the first external embed is scheduled, not before.
7. Then proceed to whatever's next (Phase 2 resume / pgvector / analytics backlog) on a clean foundation.

Items deliberately **not** recommended now: pgvector (wait for the trigger), PII Cut 2 (already correctly deferred), widget a11y & multi-seat auth (pre-beta list), R5/R12/R13 (existing backlog priorities look right).
