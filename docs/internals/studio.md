# Studio (operator console) — internals

> **Module:** the Next.js app in [`packages/web/`](../../packages/web). **Role:** the operator's
> control surface — connect the recorder, browse recordings & KB, **approve workflows for the
> copilot** (the trust gate), configure the embed, and read analytics. It's the only place a human
> drives the system.

---

## 1. Purpose

Everything the operator does between "I recorded my product" and "my customers can ask the copilot"
happens in Studio: mint the recorder token, watch a recording turn into clean workflows, **decide
which workflows the copilot may use**, grab the embed snippet, and watch answer-quality + coverage
gaps. Studio is **copilot-first** — there is no article editor or portal UI in it, so the
shipped IA is about capture → approve → embed → measure.

---

## 2. Where it lives

Paths are in `CLAUDE.md` and the source tree. This doc covers what those files *guarantee*, not where
they sit.

---

## 3. The IA (what the 6-item nav maps to)

**Home · Recordings · Knowledge Base · Copilot · Analytics · Settings.** Each screen has explicit
empty / loading / error states.

| Nav item | What it does | Backing logic |
|---|---|---|
| **Home** | Steady-state dashboard: approved-workflow count, recent answer metrics, open coverage gaps ("record this next"). | `getCopilotMetrics` + `listApprovedWorkflows` + coverage gaps |
| **Recordings** | List of `KnowledgeSource`s with status (`recording`/`uploaded`/`processing`/`ready`/`error`). `recording` = artifacts still arriving (the row exists from the first upload, before Stop) and renders as a pending **"Recording"** badge inside the in-flight filter bucket — it has its own branch in `recordingStatusBadge` precisely so a live capture is never shown as a red "Failed". | reads `KnowledgeSource` |
| **Knowledge Base** | The workflows of a recording (distilled steps grouped by `segmentIndex`) **with the approve toggle** (the trust gate) and, on a workflow's own page, the **AI Agent** card that decides whether the agent may RUN it. | `listCandidates` + `setCopilotApproval` + the acting enable/disable action |
| **Copilot** | The embed snippet (with the public key), allowed-origins config, and a live widget preview. | `getOrCreateCopilotKey` + settings actions |
| **Analytics** | Answered/declined trend, helpful %, coverage gaps, step friction, top workflows, **Agent runs** (outcomes and safe-stops) — plus **Questions**, the full searchable log at `analytics/questions`. | `getCopilotMetrics` + `analytics.ts` + the run-audit reads |
| **Settings** | Account / workspace / token management. | `auth`, `tokens` |

**Copilot → Settings** opens with **How your assistant works** — the operating-mode
selector (Copilot · AI Agent). **Selecting AI Agent opens an acceptance dialog**: acting is the
contractual line, so the founder's explicit accept of the current terms version is what turns it on,
and the accept writes an acceptance row and flips the mode in one transaction. Below it the five
ability switches (Sense · show-me · guided walkthrough · Reason · image tier) sit inside a folded
`<details>` **"What it may do on your page / Advanced"**. The split is deliberate: the mode says WHO
decides how users get helped, the switches say WHAT the assistant is permitted to touch. The
acceptance is enforced **server-side**, not just in the dialog: with no row for the current terms
version the action returns *needs acceptance* rather than switching, and the founder's accept writes
the row and flips the mode in one transaction (a workspace that already accepted moves both ways
freely) — so acting can never be acquired by a hand-crafted form post, and "who turned this on,
when, against which terms" is answered by a row rather than by a toggle's state.

A **new workspace arrives on Copilot** with show-me and guided walkthrough already permitted, so this
screen is a place to *change* the assistant rather than to switch it on. The picker badges the stored
value "Current" and has no notion of a default, which is why the flip needed no UI change. Both
built modes stay selectable in both directions.

---

## 4. Internal mechanics

### 4.1 Auth & tenancy

NextAuth with a **credentials** provider (email + bcrypt-style password hash). On signup,
[`createUserWithWorkspace`](../../packages/web/lib/workspace.ts) creates the user **and** auto-creates
one `Workspace` (slugged from the email) — Phase 1 is **single-user = single-workspace**.
`getCurrentWorkspace()` resolves the signed-in user → their workspace for every server action; a
`null` means "not authenticated" and the action throws. **Every query is scoped to that workspaceId.**

Hardening (review §3.6 Cuts 2+3):

- **Brute-force limits** ([`lib/auth-limits.ts`](../../packages/web/lib/auth-limits.ts)) — failed
  sign-ins counted per-email (5/15 min) and per-IP (20/15 min, `x-forwarded-for`); over the cap the
  attempt is refused before any password check; success clears the email's counter. In-memory MVP
  (mirrors the api's copilot limiter); the same mechanism caps email-sending requests (3/15 min per
  email) so reset/verification mails can't be bombed.
- **Email verification** — new signups get a 24 h single-use link and can't sign in until clicked;
  enforced as a friendly pre-check in `signInAction` AND a backstop in `authorize()`. Enforcement is
  conditional on `emailEnabled` (`RESEND_API_KEY` set) — keyless local dev auto-verifies at signup.
- **Password reset** — `/forgot-password` → emailed 1 h single-use link → `/reset-password`;
  enumeration-safe (identical response either way); completing a reset also verifies the email.
- **Tokens** ([`lib/auth-tokens.ts`](../../packages/web/lib/auth-tokens.ts)) — stored SHA-256-hashed
  in the previously-unused Auth.js `VerificationToken` table (`identifier = "<purpose>:<email>"`),
  single-use, purpose-checked; no schema change was needed.
- **Email** ([`lib/email.ts`](../../packages/web/lib/email.ts)) — Resend REST API via fetch (no SDK);
  keyless = sends are console-logged so dev flows stay walkable. The sender defaults to
  `noreply@flowbuddyai.com` (the domain must stay verified in Resend); override with `EMAIL_FROM`.

**Deliberately open:** signup itself has no invite gate (user decision 2026-07-06) — revisit at
private beta.

### 4.2 Connecting the recorder (token minting → handshake)

The `/connect` page calls the [`connectExtension`](../../packages/web/lib/connect-actions.ts) server
action, which:

1. checks the session, finds the user's workspace,
2. mints a fresh token via [`createApiToken`](../../packages/web/lib/tokens.ts) —
   `sync_<48 hex>`, of which **only the SHA-256 hash is stored** (`ApiToken.hashedToken`); the
   plaintext is returned once,
3. returns `{ token, apiBaseUrl, email }`.

The page then `window.postMessage`s that payload to the extension's
[connect-bridge](../../packages/extension/src/connect-bridge.ts), which relays it to the extension
background. The operator never sees or copies a token. Full handshake: [connections.md](connections.md)
§3, consuming side: [recorder-capture.md](recorder-capture.md) §4.10.

### 4.3 Browsing the KB — candidates ([`candidates.ts`](../../packages/web/lib/candidates.ts))

`listCandidates(workspaceId, sourceId?)` reconstructs the **workflow view** from the flat
`KnowledgeItem` rows: it groups items by `(sourceId, segmentIndex)`, counts steps per group, takes the
`segmentTitle`, joins the source's `appBaseUrl`, and marks each with `copilotApproved` (by checking the
approved-key set). A "candidate" = one workflow = the unit the operator approves. *(V2-portal note in the
file: this same unit becomes a portal help article under workflows-as-articles — Version 2.)*

### 4.4 The approval gate ([`copilot-actions.ts`](../../packages/web/lib/copilot-actions.ts)) ⭐

`setCopilotApproval({ workflowId, segmentTitle?, approved })`:

1. resolves the workspace (auth),
2. **ownership and identity resolve in ONE read** — the `Workflow` row *is* the thing being approved
   and it carries the workspace, so there is nothing left to resolve from a position (a foreign or
   unknown workflow throws),
3. **approve** → `upsert` by that identity, recording who approved, the title snapshot, and
   **clearing any retirement** — re-approving IS the founder saying it should answer again;
   **un-approve** → `deleteMany` that row,
4. `revalidatePath` the KB + dashboard pages.

This is the **producer** of the trust-gate contract the [copilot retrieval](copilot.md) enforces.
It names a **durable workflow — not item ids, and not a position**, precisely so it survives the
worker's delete-and-recreate of items and cannot be walked onto content nobody reviewed; the
rationale is in [knowledge-base.md](knowledge-base.md) §6 and [connections.md](connections.md) §5.

The read side, [`copilot-approvals.ts`](../../packages/web/lib/copilot-approvals.ts), provides
`approvedSegmentKeys` / `listApprovedWorkflows` — Studio-UI bookkeeping only (candidate lists,
counts). The retrieval-side enforcement moved to the shared
[`synthesis/retrieval.ts`](../../packages/synthesis/src/retrieval.ts); the old
`listApprovedItems` mirror was retired, and the Studio copilot tester now IS the real widget (Approach B) — it exercises the exact public `/answer` route end-users hit.

### 4.5 Letting the agent run a workflow

A workflow's page carries an **AI Agent** card, and its switch is the second, narrower gate: approval
lets the copilot ANSWER from this workflow, this lets the agent RUN it. Flipping it on **compiles the
execution plan and judges eligibility on the spot**.

**A refusal is a RESULT, not an error** — the issues are the content of the card, in plain words: a
step with no recoverable anchor, a cross-origin frame, a foreign-origin navigation, an unsupported
verb, or navigation into a specific record. **File-upload steps do not disqualify a workflow**: a
browser opens a picker only on a trusted gesture, so they compile as the user's own step and the
enable summary simply counts them.

Enabling writes the flag **and** the plan in one transaction, so *"enabled ⇒ a plan exists"* holds by
construction; disabling deletes the plan. The card also carries that workflow's run summary.

### 4.5b Editing a workflow's words ([`edit-actions.ts`](../../packages/web/lib/edit-actions.ts))

The workflow page lets the founder rewrite the **title**, the **description**, any step's
**instruction/detail**, and swap a step's **image** for another frame the same recording captured
(no uploads — the pick is re-validated against the manifest server-side, and the highlight box
follows the picture: the picked frame's own target rect, or cleared for an "after" frame). It also
lets them **delete a step** (hard-deleted now, re-dropped on every rebuild — no removed-flag for
every reader to remember) and **restore a pruned captured action as a step** ("Add a step from the
recording": the anchor, screenshot and evidence come from the real event, the founder types only
the words — a step with no captured event cannot be created, here or anywhere). The event citation
that makes a step cite a real captured event is never editable. Every owned field offers **Forget my edit** (clears the ownership stamp; the next re-process regenerates it — the model's original text is gone), and when a duplicate is resolved with **Replace the old one**, the old workflow's text edits that match a step on the new one by moment signature (`synthesis/edit-carryover.ts`, label + screen, unambiguous pairs only) are offered as a reviewable, untickable list and applied through the same save machinery — never silently, and never images. Every edit stamps its field human-owned so a reprocess keeps it (the rebuild side is
[knowledge-base.md](knowledge-base.md) §Identity); a title edit moves the row, the items' per-item
copy and the approval snapshot together so no surface keeps the old name. A step edit **re-embeds
before it writes** — text and vector move together or the save fails whole — and on an
acting-enabled workflow recompiles and re-pins the plan through the same compile the enable action
uses ([`plan-compile.ts`](../../packages/web/lib/plan-compile.ts) computes; each caller writes, so
the one-transaction invariant above stays with the enable action). A recompile that turns ineligible
parks acting `needs_review`, mirroring the worker. This is also Studio's **one OpenAI call** — the
embed at save time; answers still all go through the api.

### 4.5c Reorganizing a recording's workflows ([`reorganize-workflows.tsx`](../../packages/web/components/dashboard/reorganize-workflows.tsx))

The workflow page links to **Reorganize**: every step of the recording in timeline order, sectioned
by workflow, with exactly two moves — *Split here* between two steps, *Merge with previous* on a
boundary. Boundaries land only **between steps** on purpose: a step is one control interaction, so
a cut inside one is meaningless. *Rebuild* saves the **complete** boundary list onto the recording
(the save re-validates every id against a server-side re-run of the same deterministic event
cleaning the pipeline uses — never the client's word) and re-runs synthesis, which treats the list
as exhaustive ([knowledge-base.md](knowledge-base.md) §Stage 4). Never row surgery: identity
re-matching decides which approvals survive, exactly as on any rebuild — the confirm dialog says so
in the founder's words. *Reset to automatic* clears the boundaries and rebuilds with markers + the
model. Every save also **teaches**: it derives boundary signatures that future recordings of the
workspace are cut by automatically ([knowledge-base.md](knowledge-base.md) §Stage 4 — item 5,
boundary learning); Reset withdraws this recording's lessons along with its boundaries.

### 4.6 Embed configuration ([`copilot-settings.ts`](../../packages/web/lib/copilot-settings.ts))

`getOrCreateCopilotKey(workspaceId)` returns the workspace's **public** embed key, minting one
(`pk_<48 hex>`) on first use, plus the `allowedOrigins` list. The Copilot page renders the
`<script>` snippet with this key and the **real-widget tester**:
[`widget-preview.tsx`](../../packages/web/components/dashboard/widget-preview.tsx) frames the
session-authed host page [`copilot/preview-frame/route.ts`](../../packages/web/app/dashboard/copilot/preview-frame/route.ts),
which embeds the actual bundle (`FLOWBUDDY_WIDGET_URL`, or the local fallback route
[`app/widget/flowbuddy-copilot.js`](../../packages/web/app/widget/flowbuddy-copilot.js/route.ts) that serves the
monorepo build) in `data-flowbuddy-preview` mode — appearance edits ride in as debounced query params. The host page is a **flat backdrop in the Studio container's tint** (and the iframe is chromeless), so the widget floats on one clean surface instead of a page-behind-a-page.
**Studio dogfoods the widget on itself.** The root layout renders the same three-attribute snippet a
customer pastes — nothing bespoke — and only when `FLOWBUDDY_DOGFOOD_WIDGET_KEY` and a real
`FLOWBUDDY_WIDGET_URL` are both set, so a placeholder src never becomes a script tag. The key is a
public embeddable key, and the workspace behind it is the one whose KB is about Studio.

The settings actions let the operator edit the origin allowlist (enforced server-side by
[`copilot-auth.ts`](../../packages/api/src/copilot-auth.ts); the Studio origin itself is exempt via
`FLOWBUDDY_STUDIO_URL` so the tester survives a locked-down allowlist).

### 4.7 Analytics ([`copilot-metrics.ts`](../../packages/web/lib/copilot-metrics.ts))

`getCopilotMetrics(workspaceId)` reads `CopilotQuery` and computes, over the **last 7 days** (+ an
all-time total to pick first-run vs. populated states): answered/declined counts and %, thumbs
up/down, a `helpfulPct`, and a **per-day answered/declined series** for the chart. Home and Analytics
share this one function so both read identically.

The per-workflow and feedback-loop breakdowns live beside it in
[`analytics.ts`](../../packages/web/lib/analytics.ts): top workflows by citations, step friction
("where users get stuck"), ranked coverage gaps, recent declines, **how answers were produced** —
and the **question log**.

**How answers were produced (`getAnswerPathStats`).** The `CopilotQuery.engine` / `rounds` /
`toolCalls` columns, finally read — plus, since 2026-08-03, the token columns as an average
per question, with the cached and reasoning shares called out. Tokens rather than money: two models
answer on this path and their rates change, so a baked-in price would drift into confidently wrong,
and a founder converting against a rate card they can see is better served than one trusting a
number that silently aged. Three things it does deliberately: it renders `engine: 'floor'`
as an ALARM rather than a row, because since the mode retirement that value appears only when the
agent loop or the diagnostic path FAILED and nothing else surfaces it; it counts `rounds > 1` as
escalation (round one is the fast path every question rides, so `>= 1` would report 100% and mean
nothing); and it computes every percentage over rows that RECORDED an engine, returning the
uninstrumented remainder separately — a partially-instrumented history folded into the denominator
would understate every engine on the one surface whose job is to be believed. Rows written before
2026-08-02 carry `chatbot` for what is now `floor`; they are folded together at read time rather
than back-filled, because they are the old name for the same engine, not wrong data.

**Agent runs.** Recent consented runs with their outcomes, and **safe-stops rendered as the alarm
they are** rather than as a row in a distribution — the same discipline as a run of floor-engine
answers: a safe-stop means the agent refused to guess in front of a customer, and nothing else in the
product surfaces that.

**The question log (`/dashboard/analytics/questions`).** Every aggregate above answers
*"how is the copilot doing?"*; this answers *"what did people actually ask?"* — the raw
`CopilotQuery` list, newest first, 25 a page. Search matches the question text **or** the page path
(so `billing` finds both questions about billing and questions asked while standing on `/billing`);
filters are all/answered/declined/👍/👎; the range adds **all time** (a log capped at 90 days isn't
a log — the summary page keeps 7/30/90). All state lives in the URL, so a filtered view is linkable
and the back button works, and the page clamps an out-of-range `?page=` to the last real page rather
than showing an empty screen. Entry points are contextual: *View all →* on the chart, *View all
declines →* on Recent declines (deep-linking to `?filter=declined`). **Reads only — no schema
change.** No export yet; the in-UI search was the actual need.

> **Counting rule for anything reading `QueryCitation`: count distinct `queryId`, never rows.**
> See [data.md §15](data.md).

### 4.8 Coverage gaps ("record this next")

When the copilot declines, the API logs a `CoverageGap(source: 'copilot')`. Studio surfaces open gaps
on Home/Analytics; [`resolveCoverageGap`](../../packages/web/lib/copilot-actions.ts) marks one
`resolved` once the operator records/handles it. This closes the loop:
**decline → gap → record → approve → answered.**

---

## 5. Data it reads / writes

| Store | Reads | Writes |
|---|---|---|
| **Postgres** | `User`/`Session` (auth), `Workspace`, `KnowledgeSource`, `KnowledgeItem`, `Workflow`, `CopilotApproval`, `ExecutionPlan`, `ExecutionRun`, `CopilotQuery`, `QueryCitation`, `CoverageGap` | `User`+`Workspace` (signup), `ApiToken` (mint), `CopilotApproval` (approve/un-approve), the approval's **acting flag + the compiled `ExecutionPlan`** (enable/disable acting, one transaction), **`AgentAcceptance`** (turning on AI Agent mode), `Workspace.copilotPublicKey`/`copilotAllowedOrigins`, `CoverageGap.status`, **`KnowledgeSource`** (recording **rename `title` / delete / re-process** → status) |
| **Object storage (R2/MinIO)** | **reads** a recording's before/after DOM snapshots when compiling an execution plan (appearance markers) | **deletes** a recording's artifact prefix on delete (`lib/storage` `deleteSessionPrefix`) |
| **Redis / BullMQ** | — | **enqueues re-process jobs** onto the same synthesis queue the worker consumes (`lib/queue.ts` — lazy, best-effort, no API hop) |
| **API service** | — | — (Studio is a privileged server — it talks to Postgres/Redis/storage **directly**, never through the API) |

---

## 6. Failure modes & edge cases

- **Not authenticated** → server actions throw `Not authenticated`; pages redirect to sign-in.
- **Approving a workflow you don't own** → blocked by the ownership check.
- **Recording stuck `processing`/`error`** → shown as status; the KB page has nothing to approve until
  the worker writes `ready`.
- **No approved workflows yet** → the embed works but the copilot returns "no approved content"
  (see [copilot.md](copilot.md)); Home nudges the operator to approve.
- **Article UI/engine** → removed 2026-07-07 (workflows-as-articles): an article is an approved
  workflow, rendered — built in the V2 portal track ([`portal.md`](../build/portal.md)); nothing
  article-shaped remains in `packages/web`.

---

## 7. Connections

Seams, contracts and who-calls-what: [`connections.md`](connections.md).
