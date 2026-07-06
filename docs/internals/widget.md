# Widget (embeddable copilot) — internals

> **Module:** the embeddable script in [`packages/widget/`](../../packages/widget/), built to a single
> `sync-copilot.js`. **Role:** the customer-facing surface of the copilot — the one `<script>` a SaaS
> drops into its app to give end-users an in-app help chat.

---

## 1. Purpose

Be the smallest possible, dependency-free, **drop-in** chat panel. One `<script>` tag renders a
floating launcher and a chat panel, talks to the [copilot endpoint](copilot.md) with the workspace's
**public** key, and shows grounded answers with citations or an honest decline — without interfering
with the host page's styles or globals.

---

## 2. Where it lives

| File | Role |
|---|---|
| [`src/index.ts`](../../packages/widget/src/index.ts) | The whole widget: config, shadow DOM, render loop, `ask`/`feedback` calls. |
| [`src/styles.ts`](../../packages/widget/src/styles.ts) | The `CSS` string injected into the shadow root (indigo brand + accent var). |
| [`build.mjs`](../../packages/widget/build.mjs) | esbuild → `dist/sync-copilot.js` (one IIFE bundle). |
| [`demo/index.html`](../../packages/widget/demo/index.html) | Local test page (serve over **HTTP**, not `file://`). |

Built with `pnpm --filter @sync/widget build`.

---

## 3. Inputs / Outputs

- **Input (configuration):** the snippet carries only `data-sync-api` + `data-sync-key`; the LOOK
  comes from the server (2026-07-07):
  - **Server config** — at mount the widget fetches `GET /v1/copilot/config` (authed by the key,
    1.5s timeout, best-effort): accent, title, greeting, position, launcher style/text — whatever
    the founder saved in Studio → Copilot → Appearance. So appearance changes reach every embed
    live, without re-copying the snippet.
  - **Per-page overrides** — explicit `data-*` attrs (or a `window.SyncCopilot` object) still win
    over the server value, field by field: `data-sync-title`, `data-sync-greeting`,
    `data-sync-accent`, `data-sync-position` (`left`|`right`), `data-sync-launcher`
    (`icon`|`text`|`text-outline`), `data-sync-launcher-text`.
  - `data-sync-key` is the **public** embed key (`pk_…`). *Safe in client HTML — distinct from the
    secret recorder token.*
  - `data-sync-preview` — `"1"` marks a **Studio tester** embed (2026-07-06): the panel starts open
    **with the launcher kept visible below it** (panel lifted via `--sc-panel-bottom: 86px`, so
    launcher style/text/position edits show immediately), the mount heartbeat is suppressed,
    `/answer` calls carry `preview: true` so the API skips embed detection + analytics and returns
    no `queryId` (→ no thumbs), **and the `/v1/copilot/config` fetch is skipped** (the preview frame
    passes every appearance field as an explicit attr — live, possibly-unsaved editing state — so
    the saved server config could never apply, and reload-per-edit must not burst /config calls).
    Never used in customer embeds.
- **Input (runtime):** the end-user's typed questions; `location.pathname` + `document.title` as
  context.
- **Output:** `GET /v1/copilot/config` at mount; `POST`s to `/v1/copilot/answer` and
  `/v1/copilot/feedback`; renders answers in the panel.

---

## 4. Internal mechanics

### 4.1 Isolation — shadow DOM

The widget mounts a single host `<div id="sync-copilot-root">` and attaches an **open shadow root**.
All markup (launcher, panel, header, message list, input form) and the entire stylesheet live **inside**
that shadow tree. Consequences:

- The host page's CSS can't bleed in and the widget's CSS can't bleed out — no class collisions, no
  layout fights.
- Theming is done with **CSS custom properties** set as inline styles on the host element, which
  *inherit* into the shadow tree: `--sc-accent` (from `data-sync-accent`), and `--sc-right`/`--sc-left`
  for positioning. Default theme is **Sync indigo** (`#3b50e0` family); a host can rebrand to its own
  color (text on it is white).

### 4.2 Configuration resolution

`cfg` is resolved in two steps. At load: each value is `script.dataset.X` → `window.SyncCopilot.X` →
a default (`apiBase` is trailing-slash-trimmed; the script tag is grabbed via
`document.currentScript`). At mount: `boot()` awaits `GET /v1/copilot/config` (1.5s abort budget)
and folds each **valid** server field into `cfg` — but only where no explicit attr/global was set
(the `explicit` capture) — then patches the already-built DOM (`applyServerConfig`) BEFORE
`document.body.appendChild`, so the first paint is already branded (no default-theme flash). Any
fetch failure/timeout mounts with attrs/defaults — the widget always appears.

### 4.3 State & the render loop

The widget keeps three pieces of state: `messages[]` (the conversation), `open` (panel visibility), and
`loading`. There's no framework — a single `render()` function **rebuilds the message list** from
`messages[]` on every change (`list.replaceChildren(...)`). It's a tiny immediate-mode UI:

- empty conversation → a greeting bubble;
- each message → a bubble with role/decline/error classes; assistant messages with citations get a
  **"From: &lt;workflow titles&gt;"** line (deduped `segmentTitle`s); answered assistant messages get
  **👍/👎** buttons;
- `loading` → a typing indicator; input/send disabled.

### 4.4 Asking a question (`ask`)

```mermaid
sequenceDiagram
    participant U as End-user
    participant W as Widget
    participant A as Copilot API
    U->>W: submit question
    W->>W: push {role:user}; loading=true; render()
    W->>A: POST /v1/copilot/answer<br/>X-Sync-Key + {question, history, context:{path,title}}
    A-->>W: {covered, answer, citations, queryId}  |  {covered:false, reason}  |  error
    W->>W: push assistant message (answer / decline / error)
    W->>U: render() — bubble + citations + 👍/👎
```

- **History** sent = all prior **non-error** messages (excluding the just-typed question), mapped to
  `{ role, content }`. This is what gives the copilot conversational follow-up.
- **Context** sent = `{ path: location.pathname, title: document.title }` — the [copilot](copilot.md)
  uses `path` to boost steps captured on the screen the user is currently on.
- Three response branches: HTTP error → red error bubble; `covered` → answer + citations + the
  `queryId`; not covered → a **decline** bubble styled distinctly (it's expected, not a failure).

### 4.5 Feedback (`sendFeedback`)

Clicking 👍/👎 sets the message's `feedback` locally (disabling further clicks), re-renders, and fires a
best-effort `POST /v1/copilot/feedback` with the stored `queryId`. Failures are swallowed — feedback is
non-critical telemetry. The endpoint updates the `CopilotQuery` row ([copilot.md](copilot.md) §4.4).

### 4.6 Mounting

`mount()` appends the host element to `<body>` and renders. It waits for `DOMContentLoaded` if the
document is still loading, else mounts immediately. The launcher toggles `open`; submitting the form
trims the input, guards against empty/loading, and calls `ask`.

---

## 5. Data it reads / writes

- **Reads:** its own `data-*` config; `location.pathname` + `document.title` per question.
- **Writes:** nothing locally — all state is in-memory for the page session. Server-side it causes
  `CopilotQuery` / `CoverageGap` rows via the API.
- **No storage, no cookies, no third-party deps** — it's a self-contained bundle.

---

## 6. Failure modes & edge cases

- **API unreachable** → "Could not reach the assistant" error bubble; the conversation continues.
- **Wrong/blocked origin or bad key** → the API returns `401/403/429`; the widget shows the error
  message in a bubble.
- **Missing `data-sync-key`** → requests go out without `X-Sync-Key` and the API rejects them; nothing
  breaks client-side.
- **Host page has aggressive CSS** → shadow DOM isolates the widget, so it's unaffected.
- **Local testing over `file://`** → won't behave (no proper origin); serve the demo over HTTP.

---

## 7. Connections

- **Calls →** the [Copilot API](copilot.md) (Seam F) with the **public embed key** minted in
  [Studio](studio.md).
- **Renders →** citations whose `segmentTitle` traces back to the workflows built by the
  [Knowledge Base](knowledge-base.md) and approved in [Studio](studio.md).
- **Auth model →** [connections.md](connections.md) §3 (the public key vs. the secret token).
