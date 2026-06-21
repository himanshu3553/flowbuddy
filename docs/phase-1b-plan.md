# Sync — Phase 1b Plan (Feature Breadth)

> **Goal of Phase 1b:** take the proven thin slice and make it **beta-ready for real external users** — close the *unmet* items in the [phase-1-spec.md](phase-1-spec.md) definition-of-done so the wedge holds up when a founder records their *own* product against *real* data and ships a portal their customers actually use. 1a proved the architecture on one clean path; 1b makes it trustworthy, searchable, and editable enough to invite people in.

- **Status:** Draft v0.2
- **Last updated:** 2026-06-21
- **Precedes/zooms into:** [phase-1-spec.md](phase-1-spec.md) (acceptance criteria). **Builds on** the completed thin slice ([phase-1a-plan.md](phase-1a-plan.md), M0–M7) and the as-built product reference ([phase-1-features.md](phase-1-features.md)).
- **Merged in (2026-06-21):** the standalone **recorder improvement backlog** (formerly `docs/recorder-improvements.md`) is now folded into this plan — its items (R1–R13) appear **inline under M9 / M10** with code-grounded evidence (`file:line`) and effort estimates, and are cross-indexed in [§5 → R-item index](#r-item-index-recorder-backlog--milestone). That separate file has been removed to prevent drift; this is the single source of truth for recorder work.
- **Prerequisite (not in this doc):** **M8 — cloud deploy (Render + Cloudflare R2)** is a Phase **1a** milestone and is assumed done before/alongside 1b. The product isn't truly end-to-end until it's live; 1b features are built on the deployed system. *(On deploy: add the production Studio origin to the extension manifest and set `STUDIO_URL` / `SYNC_API_URL`.)*
- **Priority driver (locked 2026-06-21): beta-blocking first.** Order milestones by what unblocks real external beta users recording their own product against real data — **capture reliability** and **PII redaction** lead (the spec's unmet DoD + the B2B trust gate), then **search**, then authoring/portal **polish**, with **multi-seat/roles last** (single-user = single-workspace is fine for an invite-only beta). Within M9, **"no silent data loss" reliability bugs are the highest priority** — they lose recordings the user *successfully made* — followed by **coverage**, then **recorder UX/quality** (ride-along, can slip).
- **Carried-forward locked decisions:** monorepo (pnpm + Turborepo) • Node/TS + Next.js • Postgres • Redis/BullMQ • Auth.js (self-hosted) • Render + R2 • the **3-module model** Capture → Knowledge Base → Article creation ([architecture.md](architecture.md)) • **grounded authorship** (AI writes only from the workspace's own recordings) • **V1 capture is workflow-only** (narration-only + video = **Version 2**).

---

## 1. Scope

**In 1b** (everything below maps to an unmet or partial item in [phase-1-spec.md](phase-1-spec.md) §1 / §5, called out as `🔜 Phase 1b` in [phase-1-features.md](phase-1-features.md)):

- **Capture reliability (M9)** — four sub-areas:
  - **No silent data loss** — survive full-page navigations (R1), retry instead of discarding the bundle on upload failure (R2), protect narration audio on long recordings (R3), service-worker-eviction resilience (R4).
  - **Coverage** — iframe / cross-frame capture (R8), multi-tab handling (R9), richer event vocabulary: scroll / hover / keyboard (R10).
  - **Recorder UX & segmentation** — marker hotkey **+ labels** (R5), live mic level meter + pre-flight (R6), on-page floating control bar (R7), pause / resume.
  - **Capture quality** — screenshot timing & cost (R12), ranked multi-signal selectors (R13).
- **Productized PII redaction (M10)** — client-side masking beyond passwords + pre-record controls (R11), Studio review-time redaction, server-side OCR/DOM backstop, test-account nudge.
- **Search (M11)** — pgvector hybrid (keyword + semantic) retrieval; portal search UI; workspace-wide KB search UI.
- **Authoring depth — Studio (M12)** — segmentation review (split/merge/move steps), screenshot retake/crop, callouts/warnings, arrow-pointer highlight, related-article links, **manual `static` authoring UI**, collections/tags, lightweight versioning at publish, brand voice/tone at (re)generation.
- **Portal productization (M13)** — theming/branding (logo + colors), custom domains, public/gated visibility, "was this helpful?" feedback, SEO/structured data + sitemap.
- **Coverage analytics + collaboration (M14)** — coverage-gap analytics dashboards (prompt misses + portal no-result searches), multi-seat / minimal roles (owner/editor).

**Explicitly NOT in 1b:**
- **Version 2 capture modalities** — narration-only capture (Module 1.2) + narration-derived `static` explainers, and video capture (Module 1.3). *(The data-model hooks added in 1b — e.g. `Article.body` — let these slot in additively later.)*
- **Phase 2** — in-app Copilot. **Phase 3** — self-validation / drift detection (note: **R13 ranked selectors** is captured in 1b but the *locator-healing/validation* logic that consumes them is Phase 3).
- **Recorder parking-lot ideas** — pre-upload review, undo-last-event, configurable capture profiles, network/console capture (see [§5 → Recorder parking lot](#recorder-parking-lot-post-1b--opportunistic)); tracked, not scheduled.
- **Billing** — free invite-only beta; monetization stays out of Phase 1.
- **i18n** — lowest-value for an English-first beta; track but don't build unless a beta user blocks on it.

---

## 2. Prioritization rationale (why this order)

The thin slice already satisfies most of the spec's [definition-of-done](phase-1-spec.md#1-goal--definition-of-done). The **unmet** items, and what each requires, drive the order:

| Unmet DoD item | Requires | Milestone |
|---|---|---|
| **≥80% of generated steps accepted with minor edits** (primary quality bar) | Real apps must capture *cleanly and completely* first — silent data-loss bugs (nav/upload/audio/SW), iframe UIs, and full-page navs are the known root-cause of zero/partial captures | **M9** (gates everything; you can't measure or hit the quality bar on broken or lost captures) |
| **PII redaction works** (passwords never captured; manual redaction; no raw PII by default) | Client masking + pre-record controls + Studio redaction + server OCR backstop | **M10** (the B2B trust gate — you can't ask beta users to record real data without it) |
| **Published portal is browsable *and* searchable** | pgvector index + hybrid retrieval + portal/KB search UIs | **M11** |
| **Time-to-first-published-portal < 1 hr** for a first-timer | Faster editing/curation + a credible-looking portal | **M12–M13** (authoring + portal polish reduce friction and raise the floor on output quality) |

Everything after M11 raises quality and credibility rather than unblocking the core loop, so it follows. **Multi-seat/roles is last** — single-user works for the beta, so collaboration is the lowest-leverage item in the window.

**Within M9** the recorder deep-dive surfaced that "capture reliability" has two distinct halves that were previously conflated: **(a) not *losing* a recording the user already made** (the silent data-loss bugs R1–R4) and **(b) being able to *capture* more app types** (coverage R8–R10). (a) is the more acute beta risk — a founder who narrated a 10-minute walkthrough and lost it to a Wi-Fi blip churns immediately — so it leads, then coverage, then ride-along UX/quality polish (R5–R7, R12–R13) which can slip without blocking the gate.

---

## 3. Data-model deltas (additive, per milestone)

All changes are **additive migrations** on the [existing schema](phase-1a-plan.md#3-data-model-postgres--prisma) — the slice's `Workspace / ApiToken / KnowledgeSource / KnowledgeItem / Article / Step / CoverageGap` model stays. Final shapes are decided during each milestone (see §6 risks); sketch:

- **M9 (capture):** **mostly client-side, no core schema change** — the upload-retry buffer (R2), SW reconnect (R4), mic meter (R6), control bar (R7), and marker labels (R5) all live in the extension / bundle manifest, not the DB. The [capture contract](phase-1-spec.md#6-the-capture-contract-session-bundle) already carries `target.frame_path` (iframe chain) and per-event `route`. The bundle manifest gains: **labelled markers** (`{t, label}`, R5), **scroll/hover/keyboard** event types (R10), and a **ranked locator set** per `target` (R13). Possibly a capture-quality/`degraded` flag + reason on `KnowledgeSource` for surfacing partial captures (set when R1/R4 detect a gap).
- **M10 (redaction):** persisted redaction regions/spans on artifacts — e.g. a `redactions Json` on `Step` (and/or `KnowledgeItem`) for review-time blurs; client-side masking (R11) needs no schema. Server backstop writes blurred derivatives to R2. A per-workspace **redaction selector list** (configurable capture profile) may be persisted on `Workspace` and fetched by the extension at connect time.
- **M11 (search):** `KnowledgeItem.embedding` (pgvector) + the **pgvector** extension; a `SearchQuery` log (workspace, query, result-count, ts) so portal **no-result** queries become coverage signals.
- **M12 (authoring):** `Article.body` (markdown — for **manual `static`** articles; also the hook V2 narration reuses); `ArticleVersion` (lightweight history at publish); `Collection` (+ Article↔Collection); `Step` callout/warning fields + a highlight `kind` (rectangle | arrow).
- **M13 (portal):** `Workspace` theme fields (logo key, colors), `customDomain`, `visibility` (public | gated) + access secret; `ArticleFeedback` (article, helpful bool, optional note).
- **M14 (collaboration):** `Membership` (User↔Workspace + `role: owner | editor`) + `Invitation`; `CoverageGap` gains aggregation/source fields (prompt-miss vs portal-no-result) for the analytics view.

---

## 4. Build milestones (Phase 1b)

> Continues the global milestone sequence (1a ended at **M8**). Built **one milestone at a time, each verified, with a stop for review** — same cadence as 1a.

| # | Milestone | Done when |
|---|---|---|
| **M9** | **Capture reliability** | No recording the user *made* is silently lost (nav / upload / audio / SW-eviction); a recording on an app whose UI lives in an `<iframe>` and that does full-page navigations produces **complete, correctly-segmented** captures; multi-tab is handled or cleanly messaged; the recorder confirms the mic is live and offers in-page controls + a marker hotkey. |
| **M10** | **Productized PII redaction** | Spec §8 holds end-to-end: passwords never captured; input values masked by default (opt-in per field); pre-record + Studio review redaction works and persists; server OCR/DOM backstop blurs detected PII. |
| **M11** | **Search (portal + KB)** | Portal visitors search published articles (**hybrid** keyword + semantic); no-result queries log coverage signals; Studio has a workspace-wide KB search. |
| **M12** | **Authoring depth (Studio)** | Founder can fix segmentation (split/merge/move), retake/crop screenshots, add callouts + arrow highlights + related links, **hand-write `static` articles**, organize with collections/tags, set brand voice; versions are kept at publish. |
| **M13** | **Portal productization** | Portal is **themed** (logo/colors), supports a **custom domain** and **public/gated** visibility, has a **"was this helpful?"** widget, and emits SEO/structured data + a sitemap. |
| **M14** | **Coverage analytics + collaboration** | A **coverage-gaps dashboard** unifies prompt misses + portal no-result searches with "record this"; a workspace supports **multiple seats** with owner/editor roles. |

**Definition of done for Phase 1b:** **all** items in the [phase-1-spec.md definition-of-done](phase-1-spec.md#1-goal--definition-of-done) are true on the deployed system — including the ones the slice didn't cover: **PII redaction works**, the **portal is searchable**, and the **≥80%-steps-accepted** quality bar is *measurable and met* on real third-party apps (which M9 unblocks). At that point Phase 1 is complete end-to-end and ready for an invite-only beta.

---

## 5. Per-milestone detail

### R-item index (recorder backlog → milestone)

Every recorder-improvement item is folded into the milestones below. Effort key: **S** ≈ <½ day, **M** ≈ 1–2 days, **L** ≈ 3+ days / its own work-stream.

| # | Item | Milestone / group | Tier rationale | Effort |
|---|---|---|---|---|
| **R1** | Survive full-page navigations | M9 · No silent data loss | data loss — capture stops after any hard nav | M |
| **R2** | Don't destroy bundle on upload failure; retry | M9 · No silent data loss | data loss — a network blip wipes the recording | S |
| **R3** | Protect audio on long recordings | M9 · No silent data loss | data loss — finalize race drops narration (the moat) | S–M |
| **R4** | Service-worker-eviction resilience | M9 · No silent data loss | data loss — quiet-narration windows drop events | M |
| **R5** | Marker hotkey + labels | M9 · Recorder UX & segmentation | moat — the stated #1 segmentation lever, not built | S |
| **R6** | Live mic level meter + pre-flight | M9 · Recorder UX & segmentation | UX — catch a dead mic *before* wasting a session | S |
| **R7** | On-page floating control bar | M9 · Recorder UX & segmentation | UX — stop/marker/timer without opening the popup | M |
| **R8** | iframe capture | M9 · Coverage | coverage — Stripe / embedded editors / chat widgets | L |
| **R9** | Multi-tab / popup workflows | M9 · Coverage | coverage — OAuth popups, "open in new tab" | L |
| **R10** | Scroll / hover / richer keys | M9 · Coverage | coverage — "scroll to section X", hover menus, kbd apps | M |
| **R11** | PII redaction at capture time | **M10** | trust — DOM + screenshots ship PII; only passwords masked | L |
| **R12** | Screenshot timing & cost | M9 · Capture quality | quality — shots can lag the click; PNGs are heavy | M |
| **R13** | Ranked multi-signal selectors | M9 · Capture quality | quality / Phase-3 enabler — positional paths are brittle | M |

---

### M9 — Capture reliability (gates the quality bar)
**Why first:** the spec's primary quality bar (**≥80% of steps accepted**) is unmeasurable until real apps capture cleanly *and the captures aren't lost*. Two documented root causes: (1) the recorder is **top-frame only** (`all_frames:false`) so iframe-hosted UIs capture nothing, and the content script **detaches on full-page navigation** ([phase-1a-plan.md §8](phase-1a-plan.md#8-risks--details-to-finalize-during-build)); (2) a recorder deep-dive found several **silent data-loss bugs** that throw away recordings the user successfully made. Beta users hit both immediately. Build order within M9: **(A) no silent data loss → (B) coverage → (C) recorder UX & segmentation → (D) capture quality.**

#### A. No silent data loss *(highest priority — lose nothing the user recorded)*

- **R1 — Survive full-page navigations** *(the big one)* — **Effort: M.**
  - **Problem.** Capture stops after any real page load (signup → email-verify → dashboard, OAuth redirect, server-rendered/MPA apps). SPA route changes are handled (History API is patched), but a hard navigation is not.
  - **Evidence.** `recording` is module-level state in [`content.ts:7`](../packages/extension/src/content.ts#L7), set only when the background sends `startCapture` once in [`background.ts:203`](../packages/extension/src/background.ts#L203). On a hard nav the manifest re-injects a **fresh** `content.js` (`recording=false`) at `document_idle`, and **nothing re-arms it** — there is no `tabs.onUpdated` / `webNavigation` listener. The capture port drops; `send()` swallows the error ([`content.ts:64`](../packages/extension/src/content.ts#L64)). Audio (a separate offscreen doc) keeps going, so you get narration describing steps that have **no events**. The failure is even surfaced as advice in the upload error: *"avoid full-page reloads while recording"* ([`background.ts:280`](../packages/extension/src/background.ts#L280)).
  - **Impact.** Any workflow that crosses a page boundary is half-captured — common in exactly the SaaS onboarding flows we most want to document. **Highest-impact recorder fix.**
  - **Proposed fix.** Add a `chrome.tabs.onUpdated` (or `webNavigation.onCommitted`) listener in the background, scoped to the recording `tabId`. On a committed navigation while `rec.recording`, re-inject `content.js` and re-send `startCapture` with the **original** `startTime` (so the `t` timeline stays continuous). Persist enough state in `chrome.storage.session` that the re-armed content script resumes seamlessly. Optionally emit a synthetic `nav` event on hard nav so synthesis sees the page boundary explicitly. **Scope note:** prioritize same-origin/first-party navs; OAuth/cross-origin redirects ride along where the browser allows. **Permissions:** none new — `tabs` is already granted. **Test:** record across a hard navigation; assert events from the second page land in the bundle with monotonically increasing `t`.

- **R2 — Don't destroy the bundle on upload failure; offer retry** — **Effort: S.**
  - **Problem.** A transient upload failure throws away the entire buffered recording.
  - **Evidence.** `finalize()` calls `await kvClear()` **unconditionally**, before recording the result ([`background.ts:257`](../packages/extension/src/background.ts#L257)); `assembleAndUpload` returns `{ok:false}` on a network error but the IDB buffer is already gone ([`background.ts:325`](../packages/extension/src/background.ts#L325)).
  - **Impact.** A 10-minute session lost to a Wi-Fi blip, with no recourse. Brutal for trust.
  - **Proposed fix.** Only `kvClear()` on a **successful** upload. On failure, keep the buffer, set the `fail` badge, store `lastUpload={ok:false, retryable:true}`, and add a **Retry upload** action in the popup that re-runs `assembleAndUpload` against the existing buffer. Bound it (keep one pending bundle; warn before a new recording overwrites it). Pairs with **local draft persistence** (parking lot) — the buffer already survives in IDB, so a "resume/retry previous recording?" prompt is a small add.

- **R3 — Protect audio on long recordings** — **Effort: S (timeout) / M (chunked streaming).**
  - **Problem.** Narration can be dropped from long sessions.
  - **Evidence.** `onStop` schedules a hard `finalize()` 5s after Stop ([`background.ts:229`](../packages/extension/src/background.ts#L229)). If MediaRecorder's stop/encode/`blobToDataUrl` takes longer (long recording), `finalize` runs first; the `finalizing` guard ([`background.ts:244`](../packages/extension/src/background.ts#L244)) then **drops** the late `audioData` message, shipping a session with no narration — losing the *why*, which is our core moat.
  - **Proposed fix.** Make the fallback a real timeout, not a fixed 5s: wait on the offscreen `audioData` with a generous cap (e.g. 30–60s) plus a "still finalizing…" UI state; only fall back to no-audio if the offscreen genuinely never reports. Consider streaming audio chunks to IDB during recording (`recorder.start(timeslice)`) so a final flush is cheap and partial audio survives a crash.

- **R4 — Service-worker-eviction resilience (MV3)** — **Effort: M.**
  - **Problem.** During quiet narration (user talking, not clicking), the MV3 service worker can be evicted; the capture port drops and subsequent events are lost until the next interaction wakes the SW.
  - **Evidence.** Durable state lives in `chrome.storage.session` + IDB (good), but capture relies on a long-lived `chrome.runtime.connect` port ([`content.ts:39`](../packages/extension/src/content.ts#L39)); if the SW sleeps, `port.postMessage` throws and is swallowed ([`content.ts:64`](../packages/extension/src/content.ts#L64)). In-memory `idToKey`/`captureChain` are also lost (the `findEventKey` IDB scan covers the map, so that part already degrades gracefully — [`background.ts:137`](../packages/extension/src/background.ts#L137)).
  - **Proposed fix.** Detect `port.onDisconnect` in the content script and reconnect (re-`connect('capture')`) on the next event; buffer events locally in the content script and flush on reconnect. Optionally keep the SW warm during recording via a periodic `chrome.alarms` heartbeat. Make screenshot capture tolerant of a brief SW gap (event still recorded with `screenshot:undefined` rather than dropped). **Permissions:** possibly `alarms` if we add the heartbeat.

#### B. Coverage *(capture more app types)*

- **R8 — iframe / cross-frame capture** — **Effort: L.**
  - **Problem.** Anything inside an iframe is invisible to capture — Stripe/checkout, embedded editors, chat widgets, many embedded SaaS surfaces.
  - **Evidence.** Both content scripts are `all_frames:false` in the [manifest](../packages/extension/src/manifest.json); already noted as a 1b gap and now surfaced (not silent) in the upload error ([`background.ts:280`](../packages/extension/src/background.ts#L280)).
  - **Proposed fix.** `all_frames:true` for the capture content script; coordinate per-frame events with the top frame (frame id + offset), populate `target.frame_path`, and resolve element bbox/screenshot coordinates across the frame chain. `captureVisibleTab` already grabs the composited viewport, so screenshots include iframe pixels — the gap is **event/DOM/bbox attribution**. Cross-origin iframes need per-frame injection and offset math; document the limit and degrade gracefully (priority = same-origin/first-party frames).

- **R9 — Multi-tab / popup workflows** — **Effort: L.**
  - **Problem.** Capture is bound to a single `tabId`; "open in new tab", OAuth popups, and multi-tab flows lose capture.
  - **Evidence.** `Rec.tabId` is fixed at start ([`background.ts:196`](../packages/extension/src/background.ts#L196)); all lifecycle messaging targets that one tab.
  - **Proposed fix.** Track a **set** of tabs in the recording session; inject/arm content scripts into newly opened tabs that belong to the flow (heuristics: opener relationship, same window). Merge their events into one timeline. **Decide scope during build:** follow the workflow across tabs *or* detect + clearly message the limit (no silent loss) — decide UX for "which tabs count."

- **R10 — Scroll, hover, and richer keyboard** — **Effort: M.**
  - **Problem.** Scrolling (revealing/finding content), hover menus, and non-Enter keys (Esc, Tab, shortcuts, arrows) are invisible — yet some workflows depend on them.
  - **Evidence.** Handlers are limited to `click`/`change`/`submit`/`keydown(Enter)`/`popstate` ([`content.ts:42-46`](../packages/extension/src/content.ts#L42-L46)); `onKeydown` early-returns on anything but Enter ([`content.ts:94-99`](../packages/extension/src/content.ts#L94-L99)).
  - **Proposed fix.** Add a **debounced** scroll event (record scroll-to target/section, not every pixel); optional hover capture for `[role=menu]`/`:hover`-revealed UI; a small keyboard-shortcut allowlist. Keep it semantic and low-noise so synthesis isn't flooded.

#### C. Recorder UX & segmentation *(ride-along — can slip without blocking the gate)*

- **R5 — Marker hotkey + labels** *(the stated #1 segmentation lever; US-EXT-3)* — **Effort: S.**
  - **Problem.** Our architecture notes call the **marker hotkey "the main segmentation-quality lever"** ([`architecture.md`](architecture.md) §Decisions), but there is **no hotkey** and markers carry **no label**.
  - **Evidence.** Markers are triggered only via a popup message (`cmd:'marker'` handled at [`background.ts:42`](../packages/extension/src/background.ts#L42) / [`background.ts:232`](../packages/extension/src/background.ts#L232)) and are timestamp-only — `meta.markers.push({ t })`. The `Marker` type even has an optional `label` ([`types.ts:38`](../packages/extension/src/types.ts#L38)) that is never populated. There is no `commands` key in the [manifest](../packages/extension/src/manifest.json).
  - **Impact.** Opening the popup mid-flow to mark a workflow boundary is disruptive enough that it won't get used — so segmentation quality (Module 2/3, Option C titles) is worse than it needs to be. Small change, directly serves the moat.
  - **Proposed fix.** Add a `commands` entry (e.g. `Alt+Shift+M`) that fires `onMarker`; optionally prompt for a one-line label via the on-page indicator and store `{t, label}`. Surface labelled markers in the bundle so the worker's `segmentItems()` can use them as strong boundary signals. **Permissions:** `commands` (manifest key, not a runtime permission).

- **R6 — Live mic level meter + pre-flight check** — **Effort: S** (pairs with R7).
  - **Problem.** Users record blind: a muted/dead mic is only discovered **after** uploading a wasted session (transcription happens server-side).
  - **Evidence.** The offscreen doc records but never reports a level; on `getUserMedia` failure it silently proceeds with `dataUrl:null` ([`offscreen.ts:23-27`](../packages/extension/src/offscreen.ts#L23-L27)). No level is surfaced anywhere.
  - **Proposed fix.** A pre-flight mic test in the popup (or first 1s of recording) using a `WebAudio` `AnalyserNode` in the offscreen doc, streaming a level value to a meter in the popup / on-page control bar. Block or warn-loudly on `getUserMedia` denial instead of recording a silent video-of-clicks.

- **R7 — On-page floating control bar** — **Effort: M.**
  - **Problem.** Stop, marker, and status require opening the extension popup, which interrupts the flow and isn't discoverable.
  - **Evidence.** Controls live in the popup; the on-page presence today is the transient toast in [`indicator.ts`](../packages/extension/src/indicator.ts) (`showToast`, used from [`content.ts:26`](../packages/extension/src/content.ts#L26)).
  - **Proposed fix.** Promote the indicator to a small persistent, draggable, shadow-DOM control bar (Loom/Scribe-style): timer, event counter, **mic meter (R6)**, **Marker (R5)**, **Pause/Resume**, **Stop**. `pointer-events` only on the bar itself so it never blocks the page.

- **Pause / resume** — **Effort: S–M.** Pause recording for sensitive screens, breaks, or context switches; needs timeline-gap handling (and pairs with the control bar R7). Rides along with R5/R7 here (was a standalone M9 bullet in the prior plan).

#### D. Capture quality *(accuracy & Phase-3 enablers)*

- **R12 — Screenshot timing & cost** — **Effort: M.**
  - **Problem.** (a) The screenshot is taken **after** the event round-trips to the background through a 700ms-spaced queue, so on rapid clicks the shot can lag the actual click state, and if the page scrolled the stored bbox no longer matches. (b) Full PNGs are heavy for bundle size / upload time.
  - **Evidence.** `captureShot` serializes + spaces calls ≥700ms apart ([`background.ts:151-177`](../packages/extension/src/background.ts#L151-L177)); the bbox is captured client-side at event time ([`content.ts:177-187`](../packages/extension/src/content.ts#L177-L187)) but the pixels are captured later in the background.
  - **Proposed fix.** Capture (or at least snapshot the scroll position + bbox) as close to the event as possible; consider downscaling to devicePixelRatio-aware JPEG/WebP for non-highlight context, keeping PNG only where fidelity matters; re-validate the highlight bbox against scroll at capture time.

- **R13 — Ranked, multi-signal selectors** *(quality now; Phase-3 enabler)* — **Effort: M.**
  - **Problem.** The slice captures positional `cssPath`/`xpath` chains (`nth-of-type`), which are brittle and the thing **Phase 3 self-validation** depends on resolving correctly months later.
  - **Evidence.** Single positional path built per element in `cssPath()` / `xpath()` ([`content.ts:238-272`](../packages/extension/src/content.ts#L238-L272)); `pickAttrs` already collects `id`/`data-testid`/`aria-label` ([`content.ts:190-198`](../packages/extension/src/content.ts#L190-L198)) but they aren't promoted to a ranked locator.
  - **Proposed fix.** Since the recorder is already open for the frame/nav work, capture a **ranked, multi-signal locator set** per element — preferring stable `id` / `data-testid` / `aria` over positional paths — rather than a single fragile path. **Not beta-blocking** (1b highlights use the captured bbox, not selectors, and articles aren't re-run yet), so harden *capture* here but **defer any locator-healing/validation logic to Phase 3.**

**Done when:** no recording the user made is silently lost (nav / upload / audio / SW-eviction all recover or surface); an app that renders its UI in an iframe and performs full-page navigations yields complete, correctly-segmented captures; the earlier "zero interaction events" cases now actually capture (not just surface a friendly failure); multi-tab is followed or cleanly messaged; the mic is confirmed live before/at record start; and a marker hotkey makes workflow boundaries usable.

#### Recorder parking lot *(post-1b / opportunistic — tracked, not scheduled)*
- **Pre-upload review** — let the user see event count / duration / thumbnails and discard before sending.
- **Local draft persistence / crash recovery** — survive a browser crash (IDB already buffers; needs a "resume previous recording?" prompt on SW restart). Overlaps R2/R4.
- **Undo last event** / delete a misclick before upload.
- **Configurable capture profile** per workspace (which event types, redaction selector list) fetched at connect time — overlaps R10/R11; the redaction-list half may land with M10.
- **Network/console capture** (advanced) for debugging-oriented docs — probably out of product scope.

---

### M10 — Productized PII redaction (the B2B trust gate)
Implements [spec §8](phase-1-spec.md#8-privacy--redaction) + US-EXT-4 / US-PROC-4 / US-STU-3. The slice masks only password fields; this makes redaction real. (Subsumes recorder item **R11 — PII redaction at capture time**, whose code evidence is inlined below.)
- **Client-side (before upload) — R11.** Mask **all input values by default** with per-field opt-in; **pre-record "mask this field/region"** controls; **pause-and-skip** for sensitive screens; redact DOM text + screenshot regions in-browser; surface a "redaction on" indicator.
  - **Evidence (current gap).** `serializeDom()` only strips `<script>`/`<style>` ([`content.ts:278-287`](../packages/extension/src/content.ts#L278-L287)); `maskValue()` masks only `type=password` ([`content.ts:170-174`](../packages/extension/src/content.ts#L170-L174)) — emails, tokens, names land in DOM + raw `captureVisibleTab` PNGs. First easy win: also mask `input[type=email|tel]` and a configurable selector list.
- **Studio review-time redaction:** one-click blur of any **screenshot region or text span**, persisted to the stored artifact.
- **Server-side backstop:** OCR screenshots + scrub DOM text for high-confidence PII (emails, phone, card/SSN-like) on ingest → blur/scrub detected regions.
- **Onboarding nudge:** "use a test/dummy account" guidance.
- **Effort:** L (R11 client-side is the recorder slice; Studio + server backstop are the rest of M10).
- **Done when:** passwords are never captured (value or region); values masked by default; manual redaction works **both** pre-record and in review and persists; the server backstop blurs detected PII.

### M11 — Search (portal + KB)
Closes the spec's **"browsable *and* searchable"** DoD item (US-POR-2, US-STU-6) and the deferred index from [spec §7](phase-1-spec.md#7-content--storage-model) ("keyword/LLM now → pgvector later").
- **Index:** add the **pgvector** extension; embed `KnowledgeItem.text`; **hybrid** keyword + semantic retrieval. Reuse the same index for **prompt-to-article** (M7) to improve its recall.
- **Portal search UI** — search published articles; **no-result queries logged** as coverage signals (feeds M14).
- **Studio KB search** — a workspace-wide search over the KB (across recordings), the search UI deferred in [phase-1-features.md §4.5](phase-1-features.md).
- **Done when:** portal hybrid search returns relevant published articles, no-result queries are logged, and Studio has a working KB search.

### M12 — Authoring depth (Studio)
Raises output quality and cuts time-to-publish (US-STU-1/2/4/5/6, US-PROC-3 highlight variants). The slice ships edit-text + reorder/delete + publish; this fills out the editor.
- **Segmentation review** — split/merge articles, move steps between articles, rename (US-STU-1).
- **Screenshot retake/crop** — re-pick a frame or re-upload, and re-crop (US-STU-2). *(Still no step-level re-record — re-recording replaces a flow.)*
- **Callouts/warnings**, **arrow-pointer highlight** (alongside the existing rectangle), **related-article links**.
- **Manual `static` authoring UI** — hand-write prose articles (`source=manual`, `type=static`); the model already supports it (needs `Article.body`). Clearly badged "not self-validated"; AI never generates these.
- **Collections / tags / draft-published organization** + **lightweight versioning at publish**.
- **Brand voice / tone** applied at (re)generation (the generation half of US-STU-4; the portal theming half is M13).
- **Done when:** a founder can reshape segmentation, fix screenshots, enrich steps, hand-write static pages, organize the KB, and version on publish.

### M13 — Portal productization
Makes the public portal credible for a real customer-facing launch (US-POR-2/3/4, [spec §9 portal NFRs](phase-1-spec.md#9-non-functional-requirements)).
- **Theming/branding** — logo + colors set in Studio (the portal half of US-STU-4 / US-POR-4).
- **Custom domains** — beyond the `…/<slug>` path; map a customer domain to a workspace portal.
- **Public / gated visibility** — public is the default; gated/private as a fast-follow within 1b.
- **"Was this helpful?"** per-article feedback → analytics foundations (feeds M14).
- **SEO** — server-rendered article pages (already SSR), structured data + a **sitemap**.
- **Done when:** the portal is themed, supports a custom domain + gated visibility, collects feedback, and is SEO-clean.

### M14 — Coverage analytics + collaboration (last)
The lowest-leverage items for an invite-only beta, so they close the phase.
- **Coverage-gap analytics dashboard** — unify prompt-to-article misses (M7's `CoverageGap`) **and** portal no-result searches (M11) into a single "record this next" view (US-STU-7), beyond the current basic list.
- **Multi-seat / minimal roles** — a workspace can have multiple members with **owner/editor** roles + invitations (the slice is single-user = single-workspace). Enforce role checks across Studio actions.
- **Done when:** the gaps dashboard surfaces both signal sources with a record-this prompt, and a second user can be invited into a workspace as an editor with correctly scoped permissions.

---

## 6. Risks / details to finalize during build

- **Navigation re-arm + buffer durability (M9 · R1).** Persisting the in-progress session across full-page navs (storage choice, size caps) without janking the host page; making the `t` timeline continuous across the content-script re-injection; deciding whether to emit a synthetic `nav` boundary event.
- **Upload-retry bounds (M9 · R2).** Keep exactly one pending bundle; warn before a new recording overwrites an un-uploaded one; decide IDB size caps / eviction.
- **Audio finalize race (M9 · R3).** Replace the fixed 5s fallback with a bounded wait on the offscreen report (30–60s) + a "still finalizing" UI; if we add chunked-to-IDB streaming, handle partial-blob assembly.
- **SW-eviction reconnect semantics (M9 · R4).** Content-script local buffering + `port.onDisconnect` reconnect ordering; whether to add `alarms` for a keep-warm heartbeat (extra permission).
- **Iframe capture (M9 · R8).** Cross-origin iframes are constrained by the browser — document the limit and degrade gracefully (per [spec §11](phase-1-spec.md#11-phase-1-open-items--risks)). Same-origin/first-party frames are the priority.
- **Multi-tab scope (M9 · R9).** Follow-across-tabs vs. detect-and-message; opener heuristics; "which tabs count" UX.
- **Event-vocabulary noise (M9 · R10).** Debounce scroll and constrain hover/keyboard capture so synthesis isn't flooded with low-signal events.
- **Screenshot timing & cost (M9 · R12).** Capturing pixels closer to the event vs. the `captureVisibleTab` ~2/s rate limit; image format/size trade-offs; re-validating the highlight bbox against scroll.
- **Selector robustness (M9 · R13).** Capture a ranked, multi-signal locator set (prefer stable `id` / `data-testid` / `aria` over positional paths). **Not beta-blocking** (1b highlights use the captured bbox, not selectors, and articles aren't re-run yet), so harden *capture* here but defer any locator-healing/validation logic to **Phase 3**.
- **OCR redaction accuracy (M10).** False negatives are a privacy risk — client-side defaults + test-account guidance remain the primary protection; the server OCR is a backstop, not the guarantee.
- **pgvector on the deploy target (M11).** Confirm the managed Postgres supports the `vector` extension; pick an embedding model + dimensions; tune hybrid ranking (keyword vs semantic weight).
- **`Article.body` shared with V2 (M12).** The markdown body added for **manual** static authoring is the same hook V2 narration-derived statics reuse — keep it modality-agnostic so V2 slots in additively.
- **Custom domains (M13).** TLS/cert provisioning + domain-verification flow on the host; the per-workspace routing model.
- **Multi-tenancy under multi-seat (M14).** The slice assumes single-user isolation; auditing every Studio/portal query for correct workspace + role scoping is the main correctness risk when seats are introduced.
- **Quality-bar measurement.** Decide *how* "≥80% of steps accepted with minor edits" is measured (edit-distance/acceptance instrumentation in Studio) so the DoD is verifiable, not asserted.

---

> **Cadence:** one milestone at a time, each verified end-to-end, with a stop for review — same working agreement as 1a. M9 (capture reliability) is the gate: until real third-party apps capture cleanly **and the captures the user made aren't silently lost**, the quality bar can't be measured, so nothing downstream is truly "done." Within M9, ship **(A) no-silent-data-loss first**, then coverage, then UX/quality polish.
