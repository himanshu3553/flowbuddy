# Widget (embeddable copilot) — internals

> **Module:** the embeddable script in [`packages/widget/`](../../packages/widget/), built to
> `flowbuddy-copilot.js` **plus the lazy P2-M5 sibling `flowbuddy-copilot-render.js`** (loaded on
> demand for Reason's image tier; deployed side by side). **Role:** the customer-facing surface of the copilot — the one `<script>` a SaaS
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
| [`src/index.ts`](../../packages/widget/src/index.ts) | The widget shell: config (attrs + live-served `/config`), shadow DOM, render loop, `ask`/`feedback`, drag+expand, boot/resume wiring. |
| [`src/sense.ts`](../../packages/widget/src/sense.ts) | P2 Sense: sense-plan fetch/cache, the ask-time read-only locator probe + scorer, the show-me spotlight (sticky variant for the walkthrough), `findAlertSurfaces` (alert/error-surface detection incl. red-family text). |
| [`src/reason.ts`](../../packages/widget/src/reason.ts) | P2-M5 Reason: the selective diagnostic trigger + structured page-state capture (controls as explicit state, `[alert]`-tagged texts, masked) + the lazy image-tier loader; exports `readElementState` (the shared element-state vocabulary). |
| [`src/walkthrough.ts`](../../packages/widget/src/walkthrough.ts) | P4-M0 guided walkthrough: step card, detection-as-acknowledgment (only Next advances), self-correcting backward pointer, cross-nav resume, run analytics. |
| [`src/session.ts`](../../packages/widget/src/session.ts) | **The cross-page state store** (P5-M0 cut 1) — one slot per independent piece of state (`walkthrough` · `chat`, later the agent run), owning versioning, workspace-key scoping, created/updated stamps, TTL and silent discard of anything foreign/expired/corrupt. Every consumer brings only its own domain shape. |
| [`src/render-image.ts`](../../packages/widget/src/render-image.ts) | The SECOND bundle (`flowbuddy-copilot-render.js`, html2canvas) — lazy-loaded sibling, never in the base bundle. |
| [`src/log.ts`](../../packages/widget/src/log.ts) | Silent-by-default console diagnostics (`data-flowbuddy-debug`). |
| [`src/styles.ts`](../../packages/widget/src/styles.ts) | The `CSS` string injected into the shadow root (indigo brand + accent var + walkthrough card + spotlight). |
| [`build.mjs`](../../packages/widget/build.mjs) | esbuild → `dist/flowbuddy-copilot.js` **+ `dist/flowbuddy-copilot-render.js`** (two IIFE bundles — deploy side by side). |
| [`demo/index.html`](../../packages/widget/demo/index.html) | Local test page (serve over **HTTP**, not `file://`). |

Built with `pnpm --filter @flowbuddy/widget build`. *(The Sense/Reason/walkthrough mechanics are documented at design altitude in [`phase-2-sense.md`](../phase-2-sense.md) and [`phase-4-autopilot.md`](../phase-4-autopilot.md) §8 — this doc covers the widget shell; source wins on conflict.)*

---

## 3. Inputs / Outputs

- **Input (configuration):** the snippet carries only `data-flowbuddy-api` + `data-flowbuddy-key`; the LOOK
  comes from the server (2026-07-07):
  - **Server config** — at mount the widget fetches `GET /v1/copilot/config` (authed by the key,
    1.5s timeout, best-effort): accent, title, greeting, position, launcher style/text — whatever
    the founder saved in Studio → Copilot → Appearance. So appearance changes reach every embed
    live, without re-copying the snippet.
  - **Per-page overrides** — explicit `data-*` attrs (or a `window.FlowBuddy` object) still win
    over the server value, field by field: `data-flowbuddy-title`, `data-flowbuddy-greeting`,
    `data-flowbuddy-accent`, `data-flowbuddy-position` (`left`|`right`), `data-flowbuddy-launcher`
    (`icon`|`text`|`text-outline`), `data-flowbuddy-launcher-text`.
  - `data-flowbuddy-key` is the **public** embed key (`pk_…`). *Safe in client HTML — distinct from the
    secret recorder token.*
  - `data-flowbuddy-preview` — `"1"` marks a **Studio tester** embed (2026-07-08): the panel starts open
    **with the launcher kept visible below it** (panel lifted via `--fb-panel-bottom: 86px`, so
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

The widget mounts a single host `<div id="flowbuddy-copilot-root">` and attaches an **open shadow root**.
All markup (launcher, panel, header, message list, input form) and the entire stylesheet live **inside**
that shadow tree. Consequences:

- The host page's CSS can't bleed in and the widget's CSS can't bleed out — no class collisions, no
  layout fights.
- Theming is done with **CSS custom properties** set as inline styles on the host element, which
  *inherit* into the shadow tree: `--fb-accent` (from `data-flowbuddy-accent`), and `--fb-right`/`--fb-left`
  for positioning. Default theme is **FlowBuddy indigo** (`#3b50e0` family); a host can rebrand to its own
  color (text on it is white).

### 4.2 Configuration resolution

`cfg` is resolved in two steps. At load: each value is `script.dataset.X` → `window.FlowBuddy.X` →
a default (`apiBase` is trailing-slash-trimmed; the script tag is grabbed via
`document.currentScript`). At mount: `boot()` awaits `GET /v1/copilot/config` (1.5s abort budget)
and folds each **valid** server field into `cfg` — but only where no explicit attr/global was set
(the `explicit` capture) — then patches the already-built DOM (`applyServerConfig`) BEFORE
`document.body.appendChild`, so the first paint is already branded (no default-theme flash). Any
fetch failure/timeout mounts with attrs/defaults — the widget always appears.

### 4.3 State & the render loop

The widget keeps three pieces of conversation state: `messages[]` (the conversation), `open` (panel
visibility), and `loading` — plus the panel-geometry pair `dragPos`/`expanded` (2026-07-13, below).
`messages[]` and `open` **survive full-page navigations** since P5-M0 cut 1 (2026-07-26); `loading`
and the geometry pair are deliberately per-page-view. There's no framework — a single `render()`
function **rebuilds the message list** from `messages[]` on every change
(`list.replaceChildren(...)`). It's a tiny immediate-mode UI:

- empty conversation → a centered greeting;
- each message → a bubble with role/decline/error classes; assistant messages with citations get a
  **"Source: &lt;workflow titles&gt;" pill** (accent dot + mono label, deduped `segmentTitle`s);
  declines additionally get an **"Honest decline" pill**; answered assistant messages get
  **👍/👎** buttons;
- `loading` → a typing indicator; input/send disabled.

The chrome follows the design system (2026-07-08): header = accent bar with a **bot-icon badge**,
bold title and the mono *"grounded in your approved workflows"* tagline; input row = borderless
field + a square accent **↑ send** button. **Typography** = Plus Jakarta Sans / JetBrains Mono at
the token sizes — `index.ts` injects ONE Google-Fonts `<link>` into the host document
(`ensureBrandFonts`, guarded; @font-face is document-level so the shadow tree can use it), with
system-font fallback stacks so a blocked font never breaks the widget.

**Drag + expand (2026-07-13).** The open panel is a movable floating window:

- **Drag** — the header is the drag handle (pointer events + `setPointerCapture`, so it works with
  touch too; `touch-action: none` keeps the host page from scrolling underneath). Dragging writes
  inline `left/top` (overriding the corner anchor) into `dragPos`, **clamped to the viewport** —
  re-clamped on window resize, on reopen, and on expand, so the panel can never be lost off-screen.
  The spot lasts for the page view; a reload starts back at the configured corner. Clicks on the
  header buttons never start a drag.
- **Expand** — a header toggle (chevrons icon, before ✕) grows the panel vertically to the base
  max-height cap (`calc(100vh - 40px)`; width stays 370px) and back to 540px. `sc-expanded` is just
  a taller **floating** window: still draggable, and the host page's layout is never touched (a
  deliberate constraint — a guest script that displaces the host page, e.g. via an `<html>` margin,
  can't reflow the host's own `position: fixed` chrome, so the widget stays overlay-only).

### 4.4 Asking a question (`ask`)

```mermaid
sequenceDiagram
    participant U as End-user
    participant W as Widget
    participant A as Copilot API
    U->>W: submit question
    W->>W: push {role:user}; loading=true; render()
    W->>A: POST /v1/copilot/answer<br/>X-FlowBuddy-Key + {question, history, context:{path,title}}
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

**Boot order matters (P5-M0 cut 1).** `boot()` runs: fetch `/config` → apply it → **`restoreChat()`**
→ `mount()` → `resumeWalkthrough()`. The restore sits *before* `mount()` so a restored thread never
flashes the empty greeting, and *after* the config so it can see `preview` and the walkthrough flag.

### 4.7 Message kinds & chat persistence

Every message carries a `kind` — `user.question` · `assistant.answer` · `assistant.decline` ·
`assistant.error` — which replaced the older `decline`/`error` booleans (one fact, one field). It is
an **open vocabulary**: later modes append rather than reshape (`assistant.narration`,
`agent.tool_call`, and D3's `user.value` for a value typed into the chat).

**The `PERSISTED_KINDS` allowlist — not the message shape — decides what is stored**, and it filters
on the way *in* and on the way *out*, so an older bundle or the host page cannot reintroduce a kind
that has since been excluded. `assistant.error` is deliberately absent: a transport failure is about
a moment, not the conversation. This is the mechanism that lets D3's chat-supplied sensitive values
be excluded later by *declining to add a string* rather than migrating storage
([`unified-agent.md`](../unified-agent.md) §6).

Writes map fields one by one, so `walkOffer` (a full founder-derived plan copy) structurally cannot
reach storage; stale plans re-derive on re-ask. Reads cap message count (20), content length, and
citation count/title length, because the host page shares this origin and can write these keys.

The panel **re-opens itself** only when the stored thread was touched within the last 2 minutes and
no walkthrough is about to resume (a synchronous `walkthroughPending()` peek, since
`resumeWalkthrough` is async and would otherwise flash the panel before the step card takes over).
Restoring only ever repopulates the transcript — never a spotlight, never a position; Sense
re-measures those on every message. Persistence is skipped entirely in Studio preview mode, along
with the heartbeat and analytics.

**Consequence to remember:** the `history` sent with `/answer` is derived from `messages[]`, so it
now **spans navigations**.

**Topic memory (P5-M0 cut 2).** `Citation` carries `sourceId`/`segmentIndex` alongside the title
(the server always sent them; the widget just ignored them). `lastCitedKeys()` walks back to the
most recent `assistant.answer` and ships its distinct workflow keys as `context.lastCited` — so a
term-less follow-up biases retrieval toward the workflow under discussion. An intervening **decline
is transparent** (it contributed no topic), the list is capped at 4, and the field is omitted
entirely when empty so a first question is byte-identical to before. The restore path preserves
these keys deliberately: continuity matters most right after a navigation, which is exactly when
citations come from storage rather than a live response.

---

## 5. Data it reads / writes

- **Reads:** its own `data-*` config; `location.pathname` + `document.title` per question; at ask
  time, a READ-ONLY glance at the host DOM (Sense locator probe; Reason's structured capture on
  diagnostic questions — values masked, `[alert]` surfaces tagged).
- **Writes locally:** two `sessionStorage` slots, both tab-scoped, workspace-key-scoped, 30-min TTL
  and both managed by [`src/session.ts`](../../packages/widget/src/session.ts) — no cookies, no
  `localStorage`, nothing that outlives the tab:
  - `flowbuddy.walkthrough.v2` — an active guided-walkthrough session (founder-derived plan data),
    so the walkthrough survives full-page navigations.
  - `flowbuddy.chat.v1` — the conversation thread (P5-M0 cut 1): up to 20 messages plus the
    panel's open state, so the chat survives them too. Only kinds on the `PERSISTED_KINDS`
    allowlist are stored — transport errors and (in future) chat-supplied input values are not —
    and `walkOffer` plan copies are dropped on the way in.
- **Server-side** it causes `CopilotQuery` / `CoverageGap` / `CopilotWalkthrough` rows via the API.
- **Third-party deps:** none in the base bundle; `html2canvas` lives ONLY in the lazy sibling
  bundle `flowbuddy-copilot-render.js` (loaded on the first diagnostic question with the image tier on).

---

## 6. Failure modes & edge cases

- **API unreachable** → "Could not reach the assistant" error bubble; the conversation continues.
- **Wrong/blocked origin or bad key** → the API returns `401/403/429`; the widget shows the error
  message in a bubble.
- **Missing `data-flowbuddy-key`** → requests go out without `X-FlowBuddy-Key` and the API rejects them; nothing
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
