# Studio (operator console) — internals

> **Module:** the Next.js app in [`packages/web/`](../../packages/web/). **Role:** the operator's
> control surface — connect the recorder, browse recordings & KB, **approve workflows for the
> copilot** (the trust gate), configure the embed, and read analytics. It's the only place a human
> drives the system.

---

## 1. Purpose

Everything the operator does between "I recorded my product" and "my customers can ask the copilot"
happens in Studio: mint the recorder token, watch a recording turn into clean workflows, **decide
which workflows the copilot may use**, grab the embed snippet, and watch answer-quality + coverage
gaps. Studio is **copilot-first** — the article editor/portal UI was removed (engine parked), so the
shipped IA is about capture → approve → embed → measure.

---

## 2. Where it lives

Next.js App Router. Server Components fetch data directly from Postgres; **mutations are Next.js server
actions** (`'use server'`) — Studio never calls the [API service](ingestion-api.md).

| Area | Files |
|---|---|
| **Auth** | [`auth.ts`](../../packages/web/auth.ts) (NextAuth, credentials), [`lib/session.ts`](../../packages/web/lib/session.ts) (`getCurrentWorkspace`), [`lib/workspace.ts`](../../packages/web/lib/workspace.ts) (signup → workspace), [`lib/password.ts`](../../packages/web/lib/password.ts) |
| **Connect the recorder** | [`app/connect/`](../../packages/web/app/connect/), [`lib/connect-actions.ts`](../../packages/web/lib/connect-actions.ts), [`lib/tokens.ts`](../../packages/web/lib/tokens.ts) |
| **Recordings / KB** | [`app/dashboard/recordings/`](../../packages/web/app/dashboard/recordings/), [`app/dashboard/kb/`](../../packages/web/app/dashboard/kb/), [`lib/candidates.ts`](../../packages/web/lib/candidates.ts) |
| **Approval gate** | [`app/dashboard/copilot-approval-panel.tsx`](../../packages/web/app/dashboard/copilot-approval-panel.tsx), [`components/dashboard/kb-workflow-list.tsx`](../../packages/web/components/dashboard/kb-workflow-list.tsx), [`lib/copilot-actions.ts`](../../packages/web/lib/copilot-actions.ts), [`lib/copilot-approvals.ts`](../../packages/web/lib/copilot-approvals.ts) |
| **Copilot config / embed** | [`app/dashboard/copilot/`](../../packages/web/app/dashboard/copilot/), [`lib/copilot-settings.ts`](../../packages/web/lib/copilot-settings.ts), `lib/copilot-settings-actions.ts`, [`components/dashboard/widget-preview.tsx`](../../packages/web/components/dashboard/widget-preview.tsx) |
| **Analytics** | [`app/dashboard/analytics/`](../../packages/web/app/dashboard/analytics/), [`lib/copilot-metrics.ts`](../../packages/web/lib/copilot-metrics.ts), [`components/dashboard/home-steady-state.tsx`](../../packages/web/components/dashboard/home-steady-state.tsx) |
| **Shell / nav** | [`app/dashboard/layout.tsx`](../../packages/web/app/dashboard/layout.tsx), [`components/dashboard/`](../../packages/web/components/dashboard/) (sidebar, page-header, …) |

Runs as `pnpm --filter @sync/web dev` on **`:3000`**. Built on Tailwind + shadcn/ui under the indigo
design system ([`../design_system/`](../design_system/README.md)).

---

## 3. The IA (what the 6-item nav maps to)

**Home · Recordings · Knowledge Base · Copilot · Analytics · Settings.** Each screen has explicit
empty / loading / error states.

| Nav item | What it does | Backing logic |
|---|---|---|
| **Home** | Steady-state dashboard: approved-workflow count, recent answer metrics, open coverage gaps ("record this next"). | `getCopilotMetrics` + `listApprovedWorkflows` + coverage gaps |
| **Recordings** | List of `KnowledgeSource`s with status (`uploaded`/`processing`/`ready`/`error`). | reads `KnowledgeSource` |
| **Knowledge Base** | The workflows of a recording (distilled steps grouped by `segmentIndex`) **with the approve toggle** — the trust gate. | `listCandidates` + `setCopilotApproval` |
| **Copilot** | The embed snippet (with the public key), allowed-origins config, and a live widget preview. | `getOrCreateCopilotKey` + settings actions |
| **Analytics** | Answered/declined trend, helpful %, coverage gaps. | `getCopilotMetrics` |
| **Settings** | Account / workspace / token management. | `auth`, `tokens` |

---

## 4. Internal mechanics

### 4.1 Auth & tenancy

NextAuth with a **credentials** provider (email + bcrypt-style password hash). On signup,
[`createUserWithWorkspace`](../../packages/web/lib/workspace.ts) creates the user **and** auto-creates
one `Workspace` (slugged from the email) — Phase 1 is **single-user = single-workspace**.
`getCurrentWorkspace()` resolves the signed-in user → their workspace for every server action; a
`null` means "not authenticated" and the action throws. **Every query is scoped to that workspaceId.**

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
approved-key set). A "candidate" = one workflow = the unit the operator approves. *(Phase-2 note in the
file: this is also the unit the parked article generator would consume.)*

### 4.4 The approval gate ([`copilot-actions.ts`](../../packages/web/lib/copilot-actions.ts)) ⭐

`setCopilotApproval({ sourceId, segmentIndex, segmentTitle?, approved })`:

1. resolves the workspace (auth),
2. **ownership check** — the workflow's recording must belong to this workspace (else throw),
3. **approve** → `upsert` a `CopilotApproval` row keyed by `(sourceId, segmentIndex)` (recording who
   approved + the title snapshot); **un-approve** → `deleteMany` that row,
4. `revalidatePath` the KB + dashboard pages.

This is the **producer** of the trust-gate contract the [copilot retrieval](copilot.md) enforces.
It's keyed by the **workflow coordinate, not item ids**, precisely so it survives the worker's
delete-and-recreate of items — the rationale is in [knowledge-base.md](knowledge-base.md) §6 and
[connections.md](connections.md) §5.

The read side, [`copilot-approvals.ts`](../../packages/web/lib/copilot-approvals.ts), provides
`approvedSegmentKeys` / `listApprovedWorkflows` / `listApprovedItems` — the last **mirrors** the API's
retrieval filter so both enforce the same predicate.

### 4.5 Embed configuration ([`copilot-settings.ts`](../../packages/web/lib/copilot-settings.ts))

`getOrCreateCopilotKey(workspaceId)` returns the workspace's **public** embed key, minting one
(`pk_<48 hex>`) on first use, plus the `allowedOrigins` list. The Copilot page renders the
`<script>` snippet with this key and a live [widget preview](../../packages/web/components/dashboard/widget-preview.tsx).
The settings actions let the operator edit the origin allowlist (enforced server-side by
[`copilot-auth.ts`](../../packages/api/src/copilot-auth.ts)).

### 4.6 Analytics ([`copilot-metrics.ts`](../../packages/web/lib/copilot-metrics.ts))

`getCopilotMetrics(workspaceId)` reads `CopilotQuery` and computes, over the **last 7 days** (+ an
all-time total to pick first-run vs. populated states): answered/declined counts and %, thumbs
up/down, a `helpfulPct`, and a **per-day answered/declined series** for the chart. Home and Analytics
share this one function so both read identically.

### 4.7 Coverage gaps ("record this next")

When the copilot declines, the API logs a `CoverageGap(source: 'copilot')`. Studio surfaces open gaps
on Home/Analytics; [`resolveCoverageGap`](../../packages/web/lib/copilot-actions.ts) marks one
`resolved` once the operator records/handles it. This closes the loop:
**decline → gap → record → approve → answered.**

---

## 5. Data it reads / writes

| Store | Reads | Writes |
|---|---|---|
| **Postgres** | `User`/`Session` (auth), `Workspace`, `KnowledgeSource`, `KnowledgeItem`, `CopilotApproval`, `CopilotQuery`, `CoverageGap` | `User`+`Workspace` (signup), `ApiToken` (mint), `CopilotApproval` (approve/un-approve), `Workspace.copilotPublicKey`/`copilotAllowedOrigins`, `CoverageGap.status` |
| **API service / object storage / Redis** | — (Studio talks only to Postgres) | — |

---

## 6. Failure modes & edge cases

- **Not authenticated** → server actions throw `Not authenticated`; pages redirect to sign-in.
- **Approving a workflow you don't own** → blocked by the ownership check.
- **Recording stuck `processing`/`error`** → shown as status; the KB page has nothing to approve until
  the worker writes `ready`.
- **No approved workflows yet** → the embed works but the copilot returns "no approved content"
  (see [copilot.md](copilot.md)); Home nudges the operator to approve.
- **Parked article UI** → the editor/generate panels exist in-tree but are removed from the nav; don't
  wire them up unless resuming Phase 2.

---

## 7. Connections

- **Produces →** recorder tokens (for [recorder-capture.md](recorder-capture.md)) and the embed key
  (for [widget.md](widget.md)).
- **Writes the gate →** `CopilotApproval`, enforced by [copilot.md](copilot.md) retrieval.
- **Reads the KB built by →** [knowledge-base.md](knowledge-base.md) (workflows, steps, status).
- **Closes the loop with →** `CopilotQuery`/`CoverageGap` written by [copilot.md](copilot.md).
- **Auth boundaries →** [connections.md](connections.md) §3; **schema →**
  [data-model-and-storage.md](data-model-and-storage.md).
