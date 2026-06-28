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
| [`content.ts`](../../packages/extension/src/content.ts) | Content script (injected into the recorded page) | Listens for DOM events, builds the element fingerprint, serializes DOM, runs the post-action settle watcher. |
| [`offscreen.ts`](../../packages/extension/src/offscreen.ts) | Offscreen document | Records the microphone (service workers can't call `getUserMedia`). |
| [`idb.ts`](../../packages/extension/src/idb.ts) | (shared by background) | A tiny IndexedDB key/value store — the crash-safe buffer. |
| [`popup.ts`](../../packages/extension/src/popup.ts) | Popup | The 4-state UI (idle · recording · uploading · retry). |
| [`connect-bridge.ts`](../../packages/extension/src/connect-bridge.ts) | Content script on the **Studio** origin only | Relays the token handshake from Studio to the extension. |
| [`indicator.ts`](../../packages/extension/src/indicator.ts) | (injected helper) | The on-page toast ("● Recording started", "✓ Uploaded"). |
| [`permission.ts`](../../packages/extension/src/permission.ts) | A dedicated tab | One-time microphone permission grant. |

These talk over three Chrome messaging channels: **`chrome.runtime` messages** (popup ↔ background,
offscreen ↔ background), a **long-lived `chrome.runtime.connect` port** named `capture` (content →
background, the high-volume event stream), and **`chrome.tabs.sendMessage`** (background → content,
for start/stop/status).

---

## 3. Inputs / Outputs

- **Input:** the operator's clicks/typing/navigation in the active tab, their microphone, and an
  optional "new workflow" marker hotkey. Plus a stored **recorder token + API URL** (from the connect
  handshake).
- **Output:** an HTTP `POST /v1/sessions` carrying:
  - the `manifest` (a `SessionManifest` JSON),
  - `audio.webm` (if narration was captured),
  - `shots/<eventId>.png` and `shots/<eventId>-post.png` (screenshots),
  - `dom/<eventId>.html` and `dom/<eventId>-post.html` (DOM snapshots).

---

## 4. Internal mechanics

### 4.1 The session clock

On start, the background records `startTime = Date.now()` and stores it in `chrome.storage.session`.
**Every event's `t` is `Date.now() - startTime`** — a millisecond offset from session start. This
single clock is what later lets the KB align narration to events by timestamp window. The clock is
preserved across page navigations (see §4.6 R1) so the timeline never resets mid-recording.

### 4.2 What the content script captures (the DOM fingerprint)

The content script ([`content.ts`](../../packages/extension/src/content.ts)) attaches **capture-phase**
listeners for `click`, `change` (→ `input`), `submit`, `keydown` (Enter only), and `popstate`, and it
**monkey-patches `history.pushState`/`replaceState`** so SPA route changes also emit a `nav` event.

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

1. Calls `captureShot()` → `chrome.tabs.captureVisibleTab` (a **PNG of the visible tab**). This API is
   rate-limited (~2/s), so calls are **serialized through a promise chain and spaced ≥700 ms apart**,
   with one retry against the current window on failure.
2. Stores the screenshot under `shot:<file>`, the DOM under `dom:<file>`, and the event record under
   `event:<paddedTimestamp>:<id>` — all in **IndexedDB** ([`idb.ts`](../../packages/extension/src/idb.ts)).

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

The background then takes a **post screenshot** (`shots/<id>-post.png`) and attaches `postAction`
(screenshot + DOM + route + reason) to the original event. This before/after pair is what lets the KB
later show "you clicked here → you landed there", and lets distillation pick the *result* frame for a
workflow's final step.

### 4.6 Reliability hardening (the "no silent loss" rules)

| Rule | Problem | Mechanism |
|---|---|---|
| **R1 — survive full-page navs** | A hard navigation destroys the content script, silently stopping capture. | `chrome.tabs.onUpdated` (status `complete`) → `rearmIfRecording` re-sends `startCapture` with the **original `startTime`** (re-injecting `content.js` if needed). Timeline stays continuous. |
| **R2 — never lose a recording to a network blip** | A failed upload could discard the buffer. | The IndexedDB buffer is **only cleared on upload success**. On failure, `lastUpload` is marked `retryable` and the popup shows a **Retry** that re-runs `assembleAndUpload` from the still-intact buffer. |
| **R3 — don't drop narration by finalizing early** | The offscreen audio may take time to stop/encode/flush on long recordings. | On stop, a **generous 30 s fallback** finalizes without audio only if the offscreen doc never reports back; normally finalize is triggered by the `audioData` message. |
| **Zero-event guard** | A session with no captured events is useless and would confuse the KB. | `assembleAndUpload` rejects an empty event list with a helpful message ("Click elements directly… avoid full-page reloads…"). Version 1 is workflow-only; a zero-event session stays rejected. |

### 4.7 Audio (offscreen document)

Service workers can't use `getUserMedia`, so the background spins up an **offscreen document**
([`offscreen.ts`](../../packages/extension/src/offscreen.ts)) on start. It opens the mic, records via
`MediaRecorder` (`audio/webm;codecs=opus` preferred), and on stop converts the blob to a **data URL**
sent back as an `audioData` message. The background stores it under `audio` in IndexedDB and — if the
session is `stopping` — that message is what triggers `finalize()`. If the mic fails at start, the
offscreen doc immediately reports `null` audio so recording proceeds silently.

### 4.8 Assemble & upload

`finalize()` → `assembleAndUpload()`:

1. Read `meta`, all `event:*` (sorted by key = chronological), and `audio` from IndexedDB.
2. Build the `manifest` object: `app` meta, `audio` ref, `markers`, `events[]`.
3. Build a `FormData`: the `manifest` JSON field, `audio.webm`, and every `shot:*`/`dom:*` entry.
   **The relative path is the field name** (`fd.append('shots/<id>.png', blob, ...)`) — because
   multipart strips directories from filenames, the path must ride on the field name so the server can
   reconstruct the object key.
4. `POST /v1/sessions` with `Authorization: Bearer <recorder token>`.
5. Map the response to a single result object; drive the badge/popup/on-page toast off it.

### 4.9 The popup state machine

[`popup.ts`](../../packages/extension/src/popup.ts) is a 4-state view driven by `body.dataset.state`:

```
disconnected ──connect handshake──▶ idle ──Start──▶ recording ──Stop──▶ uploading ──▶ idle
                                      ▲                                                  │
                                      └───────────────── Retry ◀── retry ◀── upload fails┘
```

During **recording** it shows *real* data read from the background's `getState`: a live `REC` timer
(off `startTime`), the captured **domain**, and **step / workflow counts** (steps =
`event:` key count; workflows = markers + 1), polled every 2 s. The toolbar **badge** is a parallel
state machine: `REC` (red) → `↑` (uploading) → `✓` / `!`. *(Mic level, Pause, and upload-% are
visual placeholders with no backing capability yet.)*

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
- **Reads:** `chrome.storage.local` (`apiToken`, `backendUrl`, `connectedEmail`, `lastUpload`) and
  `chrome.storage.session` (the live `rec` state).
- **Object storage:** indirectly — the API writes the uploaded artifacts to
  `workspaces/<ws>/sessions/<id>/...`.

---

## 6. Failure modes & edge cases

- **No mic permission** → recording proceeds without narration (silent capture); the KB just has no
  transcript to align.
- **`captureVisibleTab` fails** (e.g. tab not focused) → that event's screenshot is dropped
  (`ev.screenshot = undefined`) but the event itself is kept; distillation tolerates missing frames.
- **Recording an internal/extension page** → blocked at start (`chrome://`, `about:`, etc.).
- **iframes** → cross-origin iframes are **not** captured (the content script lives in the top
  document). This is a known capture gap; some steps then get reconstructed from narration with missing
  screenshots. Tracked under P1-M11 backlog.
- **Worker killed mid-recording** → the IndexedDB buffer survives; the next event re-reads `rec` state
  from `chrome.storage.session` and continues.

---

## 7. Connections

- **Hands off to →** [Ingestion API](ingestion-api.md) over `POST /v1/sessions` (Seam A in
  [connections.md](connections.md)).
- **Emits the contract →** [`SessionManifest`](../../packages/shared/src/capture.ts), consumed
  downstream by the [Knowledge Base build](knowledge-base.md).
- **Gets its token from →** [Studio](studio.md)'s `/connect` page (the handshake).
- **PII masking pairs with →** the server `redactText` backstop documented in
  [knowledge-base.md](knowledge-base.md) §"PII redaction".
