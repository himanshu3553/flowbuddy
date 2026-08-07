# Widget (embeddable copilot) — internals

> **Module:** the embeddable script in [`packages/widget/`](../../packages/widget), built to
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

Paths are in `CLAUDE.md` and the source tree. This doc covers what those files *guarantee*, not where
they sit. One split is itself a guarantee rather than a convention — which module may touch the host
page's controls: §4.9.

---

## 3. Inputs / Outputs

- **Input (configuration):** the snippet carries only `data-flowbuddy-api` + `data-flowbuddy-key`; the LOOK
  comes from the server:
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
  - `data-flowbuddy-preview` — `"1"` marks a **Studio tester** embed: the panel starts open
    **with the launcher kept visible below it** (panel lifted via `--fb-panel-bottom: 86px`, so
    launcher style/text/position edits show immediately), the mount heartbeat is suppressed,
    `/answer` calls carry `preview: true` so the API skips embed detection + analytics and returns
    no `queryId` (→ no thumbs), **and the `/v1/copilot/config` fetch is skipped** (the preview frame
    passes every appearance field as an explicit attr — live, possibly-unsaved editing state — so
    the saved server config could never apply, and reload-per-edit must not burst /config calls).
    Never used in customer embeds.
- **Input (runtime):** the end-user's typed questions; `location.pathname` + `document.title` as
  context.
- **Output:** the config fetch at mount; posts to the answer and feedback endpoints; the sense-plan
  fetch on panel open; walkthrough analytics for guided runs; and, in AI Agent mode, the
  execution-plan fetch and the run lifecycle ([copilot.md](copilot.md) §3). It renders answers in the
  panel — and, inside a consented run, **performs the founder's recorded steps on the host page**:
  the one output that is not a network call.

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
visibility), and `loading` — plus the panel-geometry pair `dragPos`/`expanded` (below).
`messages[]` and `open` **survive full-page navigations** since P5-M0 cut 1; `loading`
and the geometry pair are deliberately per-page-view. A fourth piece of state exists only during a
run: the run's own position and outcomes, held in the `agent-run` session slot rather than in memory,
because the run causes the navigations that would otherwise erase it. There's no framework — a single `render()`
function **rebuilds the message list** from `messages[]` on every change
(`list.replaceChildren(...)`). It's a tiny immediate-mode UI:

- empty conversation → a centered greeting;
- each message → a bubble with role/decline/error classes; assistant messages with citations get a
  **"Source: &lt;workflow titles&gt;" pill** (accent dot + mono label, deduped `segmentTitle`s);
  declines additionally get an **"Honest decline" pill**; answered assistant messages get
  **👍/👎** buttons;
- `loading` → a typing indicator; input/send disabled.

The chrome follows the design system: header = accent bar with a **bot-icon badge**,
bold title and the mono *"grounded in your approved workflows"* tagline; input row = borderless
field + a square accent **↑ send** button. **Typography** = Plus Jakarta Sans / JetBrains Mono at
the token sizes — `index.ts` injects ONE Google-Fonts `<link>` into the host document
(`ensureBrandFonts`, guarded; @font-face is document-level so the shadow tree can use it), with
system-font fallback stacks so a blocked font never breaks the widget.

**Drag + expand.** The open panel is a movable floating window:

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
→ `mount()` → **`resumeAgentRun()`** → `resumeWalkthrough()`. The restore sits *before* `mount()` so a
restored thread never flashes the empty greeting, and *after* the config so it can see `preview` and
the walkthrough flag. **The acting run resumes first and wins** — one overlay at a time — and both
resumes are storage-gated inside: the stored session is read **before** any fetch, so a page with
nothing in flight fetches nothing, and a page with something in flight then *reconciles* it against
freshly-served plan data rather than trusting what it stored (§4.9).

### 4.7 Message kinds & chat persistence

Every message carries a `kind` — `user.question` · `assistant.answer` · `assistant.decline` ·
`assistant.error` · `assistant.narration` (a run's own commentary) · `user.value` (a value supplied
in the chat for a run to type) — which replaced the older `decline`/`error` booleans (one fact, one
field). It stays an **open vocabulary**: later modes append rather than reshape.

**The `PERSISTED_KINDS` allowlist — not the message shape — decides what is stored**, and it filters
on the way *in* and on the way *out*, so an older bundle or the host page cannot reintroduce a kind
that has since been excluded. `assistant.error` is deliberately absent: a transport failure is about
a moment, not the conversation.

**The allowlist is the whole enforcement, and the two acting kinds land on opposite sides of it.**
Run narration IS persisted — the narrative has to survive the very page loads the run causes. A
chat-supplied input value rides a kind that was **never added to the allowlist**, so it is never
written to storage, never sent to the answer endpoint, and never logged: it exists for one fill and
is gone on navigation. Excluding it cost a decision not to add a string, not a storage migration
([`agent.md`](../build/agent.md) §6).

Writes map fields one by one, so `walkOffer` (a full founder-derived plan copy) structurally cannot
reach storage; stale plans re-derive on re-ask. Reads cap message count (20), content length, and
citation count/title length, because the host page shares this origin and can write these keys.

The panel **re-opens itself** only when the stored thread was touched within the last 2 minutes and
no walkthrough is about to resume (a synchronous `walkthroughPending()` peek, since
`resumeWalkthrough` is async and would otherwise flash the panel before the step card takes over) —
**and it re-opens unconditionally when an acting run is resuming**, the deliberate inverse of the
walkthrough rule: a walkthrough owns the screen with its card, whereas the conversation IS the run's
surface (narration streams into it and missing values are asked there), with the run card as a
compact progress HUD beside it.
Restoring only ever repopulates the transcript — never a spotlight, never a position; Sense
re-measures those on every message. Persistence is skipped entirely in Studio preview mode, along
with the heartbeat and analytics.

**Consequence to remember:** the `history` sent with `/answer` is derived from `messages[]`, so it
now **spans navigations**.

### 4.8 Operating mode & the on-page gate

`/v1/copilot/config` also serves the workspace's **mode** (`copilot` · `agent`), which the widget
stores in `cfg.mode`. **Nothing on the page branches on it, and that is the design.** The acting
affordance arrives as a typed run offer on the answer itself — the server resolves the runnable set,
the server decides the offer, and the server re-verifies the mode on every acting call. The widget's
copy is a convenience; a page holding the public key cannot talk itself into a higher mode by editing
it.

**The founder's switch is the whole rule (2026-08-02).** An on-page ability runs on EVERY positional
answer when its switch is on, and never when it is off. D8 made the assistant's own judgment the
decider for a while; D11 reversed that, because a switch that might or might not fire cannot be
demonstrated, discovered by end-users, or told apart from an OFF switch. **The `intents` fields the
answer used to carry are gone from the wire, the schema and the prompt** — a preference nobody obeys
is prompt real estate spent on nothing, and once the prompt section teaching the model when to set
them went, the fields could only have recorded noise. The noise this could
have caused is bounded by structure rather than by judgment: only POSITIONAL answers reach the code
at all, a clarifying question sets `usedPosition` false so nothing fires, the highlight needs an
element this question's probe resolved, and `walkthroughOffer` returns null on the last step.

Two properties this preserves: the founder's switches remain the only thing that grants a
capability — nothing the model returns can turn something on — and an ability the workspace has
switched off simply doesn't happen, so the end-user is never told that a feature exists but is
disabled.

**Topic memory (P5-M0 cut 2).** `Citation` carries `sourceId`/`segmentIndex` alongside the title
(the server always sent them; the widget just ignored them). `lastCitedKeys()` walks back to the
most recent `assistant.answer` and ships its distinct workflow keys as `context.lastCited` — so a
term-less follow-up biases retrieval toward the workflow under discussion. An intervening **decline
is transparent** (it contributed no topic), the list is capped at 4, and the field is omitted
entirely when empty so a first question is byte-identical to before. The restore path preserves
these keys deliberately: continuity matters most right after a navigation, which is exactly when
citations come from storage rather than a live response.

### 4.9 One step engine, two actors

The machinery for *"is this element ready, did that act take, what do I do when the locator misses"*
lives in a **step engine**, extracted from the walkthrough and actor-independent: settle,
element-state verdicts, the pointer's evidence scan, the resolve retry ladder, completion evidence,
and the observation harness. It is **read-only by contract** — which is what keeps guided mode
structurally incapable of clicking anything.

- **`walkthrough.ts` is now the guided actor** on that engine — behaviour-identical, with D4's
  manual-only advancement unchanged.
- **`act.ts` is the only code in the product that touches a host page's controls** (native-setter
  fills, full pointer sequences), and the acting actor is its only importer. **The guided path never
  imports it**, so "a walkthrough cannot act" is enforced by the module graph rather than by a
  convention someone has to remember.
- **`agent-run.ts` is the acting actor** — the run loop that drives the founder's compiled plan.

The payoff — and the reason there must never be two verification codepaths — is stated once, in
[`CLAUDE.md`](../../CLAUDE.md)'s traps.

**Every completion verdict reads the page through `readElementState`** — the same
`disabled`/`checked`/`filled`/`valid` reading, failed-constraint name included, that the diagnostic
model is sent ([copilot.md](copilot.md)). One vocabulary, two consumers: it is why a card never says
"click it" at a disabled button and never counts an invalid or unchecked field as done.

#### What counts as done (the guided actor)

| Step kind | Completion evidence | Without it |
|---|---|---|
| `input` | `input`/`change`/blur/Enter on a debounce, **plus genuinely done**: a checkbox/radio must be `checked`; a field must be `filled` AND not provably invalid (constraint API / `aria-invalid`) — re-verified LIVE at Next-click time. Filled-but-invalid names the failed constraint in plain words, never the flag. | Next = an explicit skip |
| `action` **with** a `postRoute` | an observed click (**a disabled target never counts**) → *awaiting-nav*, **persisted synchronously before unload** → confirmed by the route watcher (SPA) or by the resume handshake (hard nav). A matching route with **no** observed click also counts: **outcome over mechanism**. Persisting the evidence is what lets an acknowledgment survive the very page load the click causes. | Next = an override |
| `action`, no `postRoute` | click → mutation-quiet settle → either the next step resolves and is visible, or the clicked control left the DOM. | Next = an override |
| `locators: []` | none — an instruction-only card, honest about having no detection at all. | Next only |

Because guided detection only ever ACKNOWLEDGES, the run row's auto/manual split measures
**detection quality** rather than progress: a Next taken over verified evidence logs `auto`, a Next
taken over an unverified step logs `manual`.

**The plan guided mode verifies against is deliberately the poorer one.** The sense plan carries no
per-step outcome markers, so detection runs on filled-state / click / `postRoute` /
next-step-resolves. The richer appearance markers arrived with the compiled `ExecutionPlan` and are
**acting-side only** ([`agent.md`](../build/agent.md) §A2.2). Two actors on one engine verifying
differently is the design, not an inconsistency waiting to be unified.

#### Statuses stay live, and an acknowledgment can roll back

A **state tick** — active-session only, read-only, sharing the route poll's timer — re-reads the
current step continuously, so a card is never stale: a button that enables flips to "click it", a
field that turns valid flips to acknowledged, a programmatic fill is caught, and an acknowledgment
**rolls back if the state regresses**. The same tick **re-resolves the element when an SPA re-render
replaces it**, and clears an *awaiting-nav* whose timer died with a reload. A **disabled action
target** is explained rather than demanded — *"this button is disabled — check step k first"*,
naming the first EARLIER input step that is not genuinely done.

#### The pointer self-corrects BACKWARDS

Forward motion is only ever the user's Next. But every tick, every Next and every resume converges
the pointer **back** to the earliest on-this-route input step that is verifiably not done — **page
evidence beats stored position**, so a stale resumed session or a hydration race snaps back within a
tick.

**Only INPUT steps may pull the pointer back, and the asymmetry is the point.** An input's state is
readable; a completed click leaves nothing behind it, so letting action steps pull back would drag
users backwards forever over work they had already finished. Completion is never declared over a
pending step. **Next on a still-pending step is an explicit user override** — that step is
remembered as skipped and the pointer never drags them back to it, while pressing Back onto it
re-engages the gate. Every pointer decision (mode, from→to, corrections) logs under
`data-flowbuddy-debug`.

#### When it cannot resolve, it stops

An unresolvable step **on this route**, after the resolve retry ladder, is a **safe-stop**: the card
stalls with Retry/Back/Exit, a `stalled` analytics event fires, and it never guesses forward. A step
on **another** route gets text only — *"head there and I'll pick it up"* — because navigating for
the user would be ACTING. That sentence is the concrete edge of guided mode's zero-acting boundary,
and the one place a future "helpful" change would breach it.

#### Escalating to the diagnostic path

On blocked / invalid / stalled states, and only when the founder's Reason toggle is on, the card
offers **"Explain what's blocking me"**: it reopens the chat and asks *"Why can't I proceed with
this step?"* on the user's behalf, through the exact pipeline a typed question takes — **zero new
server surface** — while the walkthrough keeps observing underneath (the open panel simply covers
the card by z-order).

**The division of labour is deliberate.** Local state checks *gate*: instant, free, every tick. The
diagnostic loop *explains*: seconds and tokens, user-invoked. Nothing should ever make the tick call
a model. It is also the honest answer to DOM-only checking's ceiling — purely-visual custom
validation that never sets `aria-invalid` or a native constraint is invisible to the gate, yet well
within diagnosis's reach, because that compares the page against the founder's TRUE recorded
evidence for the step.

#### Resuming across a full-page navigation

A stored walkthrough session is read **before any fetch** (§4.6), then reconciled against the
route's shard: a fresh copy is swapped in when the shard is served, and a fetch failure proceeds on
the persisted copy bounded by its TTL. **A workflow ABSENT from a shard whose route it belongs to is
treated as REVOKED and the run ends silently** — absence means "not approved", applied to
resumption, and it is how a founder's retirement reaches a walkthrough already in flight. The stored
pointer is **never trusted blindly**: a resume runs the same backwards self-correction as every
tick, so a reload that reset the form resumes at the first unfinished step rather than the stale
one, while a true mid-workflow resume (earlier steps live on previous routes and don't resolve here)
picks up exactly where the user left off.

---

## 5. Data it reads / writes

- **Reads:** its own `data-*` config; `location.pathname` + `document.title` per question; at ask
  time, a READ-ONLY glance at the host DOM (Sense locator probe; Reason's structured capture on
  diagnostic questions — values masked, `[alert]` surfaces tagged).
  - **During a guided walkthrough that glance becomes a bounded session.** Observers attach on the
    user's own offer click and detach on done/exit/TTL: read-only re-resolution of the current
    step's element, a document capture-phase click listener used **solely** to test "was that the
    highlighted element?", and `location.pathname` via popstate/hashchange plus a poll. **No
    history monkey-patching** — deliberate, and the opposite of what the RECORDER does on the
    founder's own page ([recorder-capture.md](recorder-capture.md) §4.2), because the widget is a
    guest on someone else's product. Outside an active walkthrough nothing observes and nothing is
    fetched at page load.
  - **Nothing leaves the page during a walkthrough except the run analytics below** — workflow key,
    step numbers, auto/manual, outcome. Never page content, never values, never selectors. That
    negative guarantee is what justifies observing continuously at all: it extends the ask-time-only
    glance into a session the user explicitly asked for, without widening what travels.
- **Writes locally:** three `sessionStorage` slots, all tab-scoped, workspace-key-scoped, 30-min TTL
  and all managed by [`src/session.ts`](../../packages/widget/src/session.ts) — no cookies, no
  `localStorage`, nothing that outlives the tab:
  - `flowbuddy.walkthrough.v2` — an active guided-walkthrough session (founder-derived plan data),
    so the walkthrough survives full-page navigations.
  - `flowbuddy.chat.v1` — the conversation thread (P5-M0 cut 1): up to 20 messages plus the
    panel's open state, so the chat survives them too. Only kinds on the `PERSISTED_KINDS`
    allowlist are stored — transport errors and chat-supplied input values are not — and
    `walkOffer` plan copies are dropped on the way in.
  - `flowbuddy.agent-run.v1` — the acting run's resumable state. It is what makes the server
    stateless between boundary calls:
    a full-page navigation the run itself caused unloads the widget, and the run picks itself back up
    on remount, re-fetching the plan and ending quietly if the pinned hash moved or the workflow was
    retired. **The values a run types are never in it** — a value supplied in the chat rides a kind
    the allowlist omits, and it is gone the moment the page reloads.
- **Server-side** it causes `CopilotQuery` / `CoverageGap` / `CopilotWalkthrough` rows via the API —
  and, for a consented run, an `ExecutionRun`.
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
- **An act the page ignored** → not an error class to fight (a page script's events carry
  `isTrusted: false`). Every act is verified against recorded evidence; an unverified one hands that
  single step back to the user in guided posture and the run resumes acting afterward — never
  act-and-hope.
- **The app rejected the act** → a rejection surface that APPEARED since the act beats ANY completion
  evidence, using the same alert-surface detector the diagnostic path diagnoses with. The run repairs
  conversationally, in the app's own words.
- **A step that navigates** → tried ONCE, then it waits patiently. A login wall resumes by itself
  when the user arrives; a retry loop would hammer a page nobody is on.
- **An unresolvable step** → safe-stop in place: the run stops where it stands, says the element
  can't be found (it may have moved, or may not exist for this account), and offers Retry · Take
  over · Stop. Taking over converts the remaining steps into a guided walkthrough at that exact step;
  the terminal audit row records `safe_stop`. Never guess forward.
- **The plan changed, or the workflow was retired, mid-run** → the resume ends the run quietly rather
  than continuing onto steps nobody consented to.

---

## 7. Connections

Seams, contracts and who-calls-what: [`connections.md`](connections.md).
