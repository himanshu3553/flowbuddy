# Recorder (capture) — internals

> **Module:** the Chrome MV3 extension in [`packages/extension/`](../../packages/extension/).
> **Role:** Module 1 of the 3-module model — get raw, un-interpreted signal in. It turns a narrated
> screen session into a **capture bundle** and uploads it. It makes *no* judgments about meaning; that
> is the [Knowledge Base](knowledge-base.md)'s job.

---

## 1. Purpose

While the operator clicks through their own product and narrates ("now I'll create a project…"), the
recorder captures, for **every meaningful interaction**: what was clicked (a rich DOM fingerprint),
where it happened (route), a **screenshot before and after**, a DOM snapshot, and the **microphone
narration** — all timestamped against a single session clock. On stop, it assembles a
[`SessionManifest`](../../packages/shared/src/capture.ts) plus the binary artifacts and POSTs them to
the [Ingestion API](ingestion-api.md).

The guiding principle is **no silent data loss**: every outcome (success, failure, zero events) is
surfaced, and a failed upload keeps the buffer so the user can retry.

---

## 2. Where it lives

MV3 extensions are several cooperating contexts. Each file is one context:

| File | Context | Job |
|---|---|---|
| [`background.ts`](../../packages/extension/src/background.ts) | Service worker | **The brain.** Owns recording lifecycle, takes screenshots, buffers to IndexedDB, assembles + uploads the bundle. |
| [`content.ts`](../../packages/extension/src/content.ts) | Content script (injected into the recorded page, **all frames** — R8) | Listens for DOM events, builds the element fingerprint, serializes DOM, runs the post-action settle watcher, **buffers events + reconnects the capture port (R4)**, and (top frame) **mounts the on-page control bar**. |
| [`controlbar.ts`](../../packages/extension/src/controlbar.ts) | (imported into `content.ts`, top frame only) | **R7 — the on-page floating control bar** (timer, step/workflow count, live mic meter, ⚑ Mark / Pause·Resume / Stop). |
| [`offscreen.ts`](../../packages/extension/src/offscreen.ts) | Offscreen document | Records the microphone (service workers can't call `getUserMedia`); also **samples the mic level** and broadcasts it for the control-bar meter (R7). |
| [`idb.ts`](../../packages/extension/src/idb.ts) | (shared by background) | A tiny IndexedDB key/value store — the crash-safe buffer. |
| [`popup.ts`](../../packages/extension/src/popup.ts) | Popup | The state-machine UI (**disconnected · idle · recording[/paused] · uploading · retry**) with a live mic meter, timer, and step/workflow counts. |
| [`connect-bridge.ts`](../../packages/extension/src/connect-bridge.ts) | Content script on the **Studio** origin only | Relays the token handshake from Studio to the extension. |
| [`permission.ts`](../../packages/extension/src/permission.ts) | A dedicated tab | One-time microphone permission grant. |
| [`indicator.ts`](../../packages/extension/src/indicator.ts) | (legacy, **unused**) | The old on-page toast — **removed 2026-07-01**; nothing passive is drawn on the page anymore (the R7 control bar is the only on-page surface). File kept dormant in-tree. |

These talk over four Chrome messaging channels: **`chrome.runtime` messages** (popup ↔ background,
offscreen ↔ background), a **long-lived `chrome.runtime.connect` port** named `capture` (content →
background, the high-volume event stream — with a **keepalive ping + reconnect** so an evicted worker
never drops it, R4), and **`chrome.tabs.sendMessage`** (background → content, for start/stop/status,
and the **`micLevel`** relay that feeds the control-bar meter into the top frame — R7).

---

## 3. Inputs / Outputs

- **Input:** the operator's clicks/typing/navigation/scroll in the active tab (and tabs opened from it
  — R9), their microphone, and a **"new workflow" marker** dropped from the popup or the on-page
  control bar (a marker *hotkey* is R5 — deferred). Plus a stored **recorder token + API URL** (from
  the connect handshake).
- **Output:** an HTTP `POST /v1/sessions` carrying:
  - the `manifest` (a `SessionManifest` JSON),
  - `audio.webm` (if narration was captured),
  - `shots/<eventId>.jpg` and `shots/<eventId>-post.jpg` (screenshots — JPEG, R12),
  - `dom/<eventId>.html` and `dom/<eventId>-post.html` (DOM snapshots).

---

## 4. Internal mechanics

### 4.1 The session clock

On start, the background records `startTime = Date.now()` and stores it in `chrome.storage.session`.
**Every event's `t` is `Date.now() - startTime - pausedTotal`** — a millisecond offset from session
start measured in **active time**, so paused spans are excluded and events stay aligned with the
(also-paused) narration (Pause/Resume, §4.6). With zero pauses `pausedTotal` is 0 — identical to the
old `Date.now() - startTime`. This single clock is what later lets the KB align narration to events by
timestamp window. The clock is preserved across page navigations (see §4.6 R1) so the timeline never
resets mid-recording.

### 4.2 What the content script captures (the DOM fingerprint)

The content script ([`content.ts`](../../packages/extension/src/content.ts)) attaches **capture-phase**
listeners for `click`, `change` (→ `input`), `submit`, `keydown`, `popstate`, (R10) `scroll` +
`mouseover`, and (R12) `pointerdown` (which triggers the pre-click screenshot, §4.3 — it emits no event
itself), and it **monkey-patches `history.pushState`/`replaceState`** so SPA route changes also emit a
`nav` event. It runs in **all frames** (R8): sub-frame events translate their `bbox` into
top-document coordinates (cross-origin frames omit `bbox`) and record a `framePath`.

**Richer interactions (R10), kept low-noise so distillation isn't flooded:**
- **`scroll`** — debounced (450 ms), **page-level only**, emitted once per settle and only when the
  delta clears **35 % of the viewport**; a minimal (bbox-free) target so the screenshot shows the
  revealed viewport, scroll depth in `value`.
- **`hover`** — a `mouseover` on an **`aria-haspopup`** trigger, dwell-gated (450 ms) + a `:hover`
  re-check + 4 s repeat-suppression → captures a menu-reveal, highlighting the trigger.
- **`keydown`** — bare **Enter/Escape** plus **app-command modifier combos** (Cmd+K, Ctrl+S…) as a
  normalized `value`; plain typing (that's `input`), lone modifiers, and clipboard/undo edits are
  dropped.

The content script's own **on-page control bar** (R7) is real page DOM, so its clicks are filtered out
of capture — any event whose `composedPath()` contains the bar host is ignored (a capture-phase
`stopPropagation` fires too late).

For each event it resolves the *meaningful* target — `resolveTarget` walks up to the nearest
`a,button,[role=button],input,select,textarea,label,[onclick],…` ancestor, so clicking the icon
inside a button records the button. Then `buildTarget` produces the **fingerprint** that makes the
capture robust and queryable later:

| Field | How it's derived | Why it's captured |
|---|---|---|
| `role` | explicit `role` attr or `implicitRole()` (a→link, button→button, input→textbox/checkbox/…) | semantic identity |
| `accessibleName` | `aria-label` → `aria-labelledby` → `<label>` → `alt`/`title`/`placeholder` → text | human-readable name ("Sign In") |
| `text` | trimmed `textContent`, ≤120 chars | fallback label |
| `tag` | `tagName` | element kind |
| `attributes` | a whitelist: `id, name, class, type, href, placeholder, aria-label, data-testid` | re-location hints (feeds future selector ranking) |
| `cssPath` | a built CSS selector, stops at first `#id`, uses `:nth-of-type`, ≤8 levels | a locator |
| `xpath` | positional xpath | a second locator |
| `bbox` | `getBoundingClientRect()` → `{x,y,w,h}` | **powers the highlight box on the screenshot** |

The element's *value* is captured for `input` events — but run through `maskValue` first (§4.4).

The DOM snapshot is `document.documentElement.outerHTML` with `<script>`/`<style>` bodies blanked and
capped at 400 KB. It's a forensic record, not used by the live copilot path today.

### 4.3 Screenshots & the buffer (background side)

Events stream to the background over the `capture` port. For each `event` message the background:

1. Gets a screenshot via `captureShot()` → `chrome.tabs.captureVisibleTab` (a **JPEG of the visible
   tab**, quality 80 — R12, ~5–10× lighter than PNG). This API is rate-limited (~2/s), so calls are
   **serialized through a promise chain and spaced ≥700 ms apart**, with one retry on failure.
   - **R12 — snapshot closer to the event:** for a **click**, the shot starts at **`pointerdown`**
     (a `preCapture` fired *before* the click's side effect); the background stashes the in-flight
     **promise** and the click **awaits** it by `preShotId` (awaiting avoids a race — `captureVisibleTab`
     often finishes after the click arrives). So a click that opens a modal / navigates shows the target
     *before* it's covered. The **last input** before a submit reuses the same frame: its `change`
     (fired on blur by that click) references the click's pre-shot too — both claim the one frame. No
     pointerdown (keyboard/Tab) → capture at event time.
2. **R12 — bbox vs. scroll (fallback path only):** a delayed (event-time) shot may have scrolled since
   the event, so the background asks the top frame for its **current scroll** and shifts the bbox by
   the delta (or **drops it** if it scrolled out of frame). A pre-click shot skips this — it already
   matches the bbox's moment. Top frame only.
3. Stores the screenshot under `shot:<file>` (`shots/<id>.jpg`), the DOM under `dom:<file>`, and the
   event record under `event:<paddedTimestamp>:<id>` — all in **IndexedDB** ([`idb.ts`](../../packages/extension/src/idb.ts)).

The padded-timestamp key (`event:000012345:<uuid>`) means a prefix cursor scan returns events **in
chronological order** for free at assembly time.

> **Why IndexedDB and not memory?** MV3 service workers are killed aggressively when idle. Buffering
> every event/screenshot to IndexedDB as it happens means an interrupted or crashed worker doesn't
> lose the recording — assembly just reads back whatever was flushed.

### 4.4 Client-side PII masking (first line of defense)

Before a typed value ever leaves the browser, `maskValue` replaces it with `••••••` when the field is
sensitive: `password`/`email`/`tel` input types, sensitive `autocomplete` tokens
(`cc-number`, `cc-csc`, `current-password`, `one-time-code`, …), name/id patterns
(`*card*`, `*cvv*`, `*ssn*`, `*secret*`, `*token*`), or an explicit **`data-sync-redact`** opt-in the
host app can put on any field. Non-sensitive values are clipped to 200 chars.

This is **Cut 1, client half**. The [KB build](knowledge-base.md) adds a *server* backstop
(`redactText`) that scrubs structured PII (email/phone/card/SSN) from the text the copilot reads.
Screenshot/OCR redaction is Cut 2, deferred to Phase 2.

### 4.5 The post-action settle watcher

A single screenshot at click-time would miss the *result* of the action. So after a click/submit/
Enter/nav, the content script arms a watcher ([`schedulePostAction`](../../packages/extension/src/content.ts)):

- A `MutationObserver` watches the DOM; each mutation resets a **500 ms quiet timer**
  (`SETTLE_QUIET_MS`). When the DOM goes quiet for 500 ms → settle.
- A **3000 ms hard cap** (`SETTLE_MAX_MS`) forces a settle even if the page never stops mutating.
- On settle it sends a `postAction` message with a fresh DOM snapshot, the (possibly new) route, and a
  `settleReason` (`mutation_quiet` | `timeout`).

The background then takes a **post screenshot** (`shots/<id>-post.jpg`) and attaches `postAction`
(screenshot + DOM + route + reason) to the original event. This before/after pair is what lets the KB
later show "you clicked here → you landed there", and lets distillation pick the *result* frame for a
workflow's final step.

### 4.6 Reliability hardening (the "no silent loss" rules)

| Rule | Problem | Mechanism |
|---|---|---|
| **R1 — survive full-page navs (incl. cross-origin)** | A hard navigation re-injects a fresh content script that nothing re-armed, silently stopping capture; the push-based re-arm raced on cross-origin hops. | **Pull-based:** every freshly loaded page sends the background a `hello`; the background answers from `sender.tab.id` + the stored `rec` (`startTime`, `pausedTotal`) so the page **self-arms deterministically** on any origin. `chrome.tabs.onUpdated` (status `complete`) → `rearmIfRecording` is kept as a **backup** push. Timeline stays continuous. |
| **R4 — survive service-worker eviction (MV3)** | During quiet narration the MV3 worker is evicted after ~30 s idle, dropping the `capture` port; events after it are lost while audio keeps going. | **Keepalive:** the top frame pings the port every **20 s** to reset the idle timer. **Reconnect + buffer:** events flow through an in-memory `outbox`; `flush()` reconnects on a dead port (waking a fresh worker — state lives in `chrome.storage.session`, `idToKey` rebuilds from IDB) and retries in-place so the event + its screenshot land immediately. |
| **R2 — never lose a recording to a network blip** | A failed upload could discard the buffer. | The IndexedDB buffer is **only cleared on upload success**. On failure, `lastUpload` is marked `retryable` and the popup shows a **Retry** that re-runs `assembleAndUpload` from the still-intact buffer. |
| **R3 — don't drop narration by finalizing early** | The offscreen audio may take time to stop/encode/flush on long recordings. | On stop, a **generous 30 s fallback** finalizes without audio only if the offscreen doc never reports back; normally finalize is triggered by the `audioData` message. The fallback is a `setTimeout` (fast path) **plus a `chrome.alarms` twin** that survives worker eviction; both are tracked + cancelled so a stale one can't finalize a later session. |
| **Stop→upload can't strand (v0.3.0)** | The stop pipeline had no persisted state and no deadline: a worker eviction after Stop (or a fetch hung on a cold-starting server) left a stuck `↑` badge, no outcome, and a popup that claimed **idle** mid-upload. | Three mechanisms: **(1) the persisted `phase`** (`recording → saving → uploading → done/failed`, in `chrome.storage.local`) is the pipeline's single truth — the popup and the on-page pill route on it; **(2) boot-time recovery** — a fresh worker instance that finds `phase=uploading` with no outcome resumes `finalize()` (audio already banked), and an orphaned buffer (browser crash) is surfaced as a **retryable interruption**; **(3) an upload watchdog** (`AbortController`: no progress for 2 min streaming / 4 min flat plain POST) turns a hung fetch into a retryable timeout. |
| **R8 — iframe capture** | Content scripts were top-frame only, so iframe UIs (Stripe, embedded editors) captured nothing. | `all_frames:true`; each frame self-arms via the `hello` handshake; `bbox` is translated to top-document coords (cross-origin frames omit it) and `framePath` recorded; `appMeta` stays gated to the top frame. |
| **R9 — multi-tab / popups (Option A)** | Capture was bound to one `tabId`; OAuth popups / "open in new tab" lost capture. | `Rec.tabIds` is a **set**; `tabs.onCreated` + `openerTabId` **adopts tabs opened FROM a recording tab**; stop/pause/resume/hello span the set; screenshots use the event tab's `windowId`; closed tabs pruned. |
| **Pause / Resume** | The operator needs to pause for a sensitive screen or a break. | Pause detaches page listeners + `MediaRecorder.pause()` + freezes the timer; event `t` is **active-time** (`pausedTotal`) so audio and events stay aligned. Reachable from the popup and the on-page control bar. |
| **Zero-event guard** | A session with no captured events is useless and would confuse the KB. | `assembleAndUpload` rejects an empty event list with a helpful message ("Click elements directly… avoid full-page reloads…"). Version 1 is workflow-only; a zero-event session stays rejected. |

### 4.7 Audio (offscreen document)

Service workers can't use `getUserMedia`, so the background spins up an **offscreen document**
([`offscreen.ts`](../../packages/extension/src/offscreen.ts)) on start. It opens the mic, records via
`MediaRecorder` (`audio/webm;codecs=opus` preferred), and on stop converts the blob to a **data URL**
sent back as an `audioData` message. The background stores it under `audio` in IndexedDB and — if the
session is `stopping` — that message is what triggers `finalize()`. If the mic fails at start, the
offscreen doc immediately reports `null` audio so recording proceeds silently. **Pause/Resume** calls
`MediaRecorder.pause()`/`resume()` (paused spans are excluded from the encoded audio + reported
duration, matching the active-time event clock). A **second `AnalyserNode`** on the same stream (no
extra `getUserMedia`) samples the mic level ~8×/s and broadcasts `micLevel` → the background relays it
to the recording tab's top frame for the **control-bar meter** (R7).

### 4.8 Assemble & upload

`finalize()` → `assembleAndUpload()`:

1. Read `meta`, all `event:*` (sorted by key = chronological), and `audio` from IndexedDB.
2. Build the `manifest` object: `app` meta, `audio` ref, `markers`, `events[]`.
3. Build a `FormData`: the `manifest` JSON field, `audio.webm`, and every `shot:*`/`dom:*` entry.
   **The relative path is the field name** (`fd.append('shots/<id>.jpg', blob, ...)`) — because
   multipart strips directories from filenames, the path must ride on the field name so the server can
   reconstruct the object key.
4. `POST /v1/sessions` with `Authorization: Bearer <recorder token>` (falls back to the stored
   connection's URL/token if the session's own were lost to a browser restart).
5. Record the outcome once (`recordOutcome`): buffer wipe on success, `lastUpload` for the popup's
   result/retry screens, `lastSession` for the persistent **Recent** row, the terminal `phase`, and
   the toolbar badge. The popup's status bar and the control bar's **status pill** both read from
   this — one write, every surface consistent.

### 4.9 The popup state machine + the on-page control bar

[`popup.ts`](../../packages/extension/src/popup.ts) is a state view driven by `body.dataset.state`:

```
disconnected ──connect handshake──▶ idle ──Start──▶ recording[⇄ paused] ──Stop──▶ uploading ──▶ idle
                                      ▲                                                          │
                                      └───────────────── Retry ◀── retry ◀── upload fails────────┘
```

During **recording** it shows *real* data read from the background's `getState`: a live pause-aware
`REC`/`PAUSED` timer, the captured **domain**, and **step / workflow counts** (steps = `event:` key
count in the current workflow; workflows = markers + 1), polled every 2 s. The mic meter, Pause/Resume,
and determinate upload-% are all **real** now (formerly placeholders): the meter is a WebAudio
`AnalyserNode` off the popup's own `getUserMedia`, and upload-% comes from a streamed HTTP/2 body
(indeterminate fallback on HTTP/1.1). The toolbar **badge** is a parallel state machine: `REC` (red) →
`↑` (uploading) → `✓` / `!`, with a **blinking red-dot action icon** while recording.

**Honest mid-pipeline states (v0.3.0):** the popup routes on the persisted `phase` at open, so a
popup reopened mid-upload lands back on the **uploading** view (never a false idle) with stage-true
labels — *Saving narration…* (stop → audio flush), *Uploading securely… N%*, *Finishing…*, and after
~8 s with no bytes moving, *Waking the Sync server — this can take a minute…* (the free-tier
cold-start, named instead of a mute spinner). The idle view's **Recent** row is persistent and live:
it polls `GET /v1/sessions/:id` (4 s, only while the popup is open) to show
`uploaded · queued → processing… → ready / processing failed`, with a **View in Studio ↗** deep link
to the recording's detail page; a 404 (wiped dev DB) drops the row.

**R7 — the on-page control bar** ([`controlbar.ts`](../../packages/extension/src/controlbar.ts)) is a
parallel control surface mounted in the recorded page's **top frame** so Stop/Pause/Mark and live
status (timer, step count, mic meter) are reachable without opening the popup. It reads the same
`getState` and sends the same background commands; it **survives Pause** and **re-appears after a
full-page nav** (its state is polled, not tied to the per-frame capture), and is draggable. It does
not replace the popup. **On Stop it doesn't vanish** (v0.3.0): it collapses into a **status pill**
that mirrors the persisted `phase` (*Saving narration… → Uploading… N% → ✓ Uploaded — Sync is
processing it*, or the failure variant pointing at the extension), then removes itself — the pill
also appears when Stop came from the popup, since the user's attention is on the page either way.

### 4.10 Getting connected (the token handshake)

The recorder needs a workspace token + the API URL, and it gets them without copy-paste. The operator
opens Studio's `/connect` page; the bridge content script
([`connect-bridge.ts`](../../packages/extension/src/connect-bridge.ts)), which runs **only on the
Studio origin**, relays a same-origin `postMessage` from the page into the extension background, which
stores `apiToken` + `backendUrl` in `chrome.storage.local`. Full sequence in
[connections.md](connections.md) §3 and the producing side in [studio.md](studio.md).

---

## 5. Data it reads / writes

- **Writes (transiently):** IndexedDB (`sync-spike` DB, `kv` store) keyed by prefix —
  `meta`, `audio`, `event:*`, `shot:*`, `dom:*`. Cleared on successful upload (R2).
- **Writes (durably):** nothing in Postgres directly — it hands the bundle to the API, which persists
  the `KnowledgeSource`.
- **Reads:** `chrome.storage.local` (`apiToken`, `backendUrl`, `connectedEmail`, `lastUpload`, plus
  the v0.3.0 `phase` — the persisted stop→upload pipeline state — and `lastSession` — the Recent
  row's id/status) and `chrome.storage.session` (the live `rec` state).
- **Object storage:** indirectly — the API writes the uploaded artifacts to
  `workspaces/<ws>/sessions/<id>/...`.

---

## 6. Failure modes & edge cases

- **No mic permission** → recording proceeds without narration (silent capture); the KB just has no
  transcript to align.
- **`captureVisibleTab` fails** (e.g. tab not focused) → that event's screenshot is dropped
  (`ev.screenshot = undefined`) but the event itself is kept; distillation tolerates missing frames.
- **Recording an internal/extension page** → blocked at start (`chrome://`, `about:`, etc.).
- **iframes** → **captured** (R8, `all_frames:true`). Same-origin frames get a correct top-document
  `bbox`; **cross-origin** frames capture the event + screenshot but **omit `bbox`** (the offset is
  unknowable across the boundary — no wrong highlight). `framePath` records the sub-frame.
- **Worker killed mid-recording** → no data loss (R4): the 20 s keepalive normally keeps the worker
  warm, and if it's evicted anyway the content script **buffers events and reconnects the port** on the
  next send (waking a fresh worker that re-reads `rec` from `chrome.storage.session`); the IndexedDB
  buffer survives regardless.

---

## 7. Connections

- **Hands off to →** [Ingestion API](ingestion-api.md) over `POST /v1/sessions` (Seam A in
  [connections.md](connections.md)).
- **Emits the contract →** [`SessionManifest`](../../packages/shared/src/capture.ts), consumed
  downstream by the [Knowledge Base build](knowledge-base.md).
- **Gets its token from →** [Studio](studio.md)'s `/connect` page (the handshake).
- **PII masking pairs with →** the server `redactText` backstop documented in
  [knowledge-base.md](knowledge-base.md) §"PII redaction".
