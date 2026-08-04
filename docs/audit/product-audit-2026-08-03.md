# FlowBuddy — End-to-End Product Audit & Recommendations

> **What this is.** A from-scratch audit of the whole product — 9 packages, ~28k lines, the data model,
> the deploy topology and the marketing surface — done at the "V1 live, Phase 2 done, Phase 3 unplanned"
> checkpoint. **Recommendations only.** Nothing here is a decision; it is evidence and an argument.
>
> - **Audited:** 2026-08-03 · branch `dev` · commit `1b6b765`
> - **Method:** 14 parallel module audits reading the real source, then **18 adversarial verification
>   passes** prompted to *disprove* the highest-stakes claims. 180 raw findings; the verification pass
>   killed or downgraded most of what it examined. §2 says exactly how much to trust each finding.
> - **Plain-English version:** [`product-audit-2026-08-03-plain-english.md`](product-audit-2026-08-03-plain-english.md)
>   — the same findings in ordinary words, for reading rather than for fixing.
> - **Full detail:** [`product-audit-2026-08-03-findings.md`](product-audit-2026-08-03-findings.md) — all
>   180 findings with their complete evidence and recommendations, plus the 18 verification verdicts in
>   full. Use it when §4 names something you want to actually fix; **heed its confidence warning.**
> - **Companion:** the still-open items from the 2026-07-03 review live in [`roadmap.md`](../roadmap.md) §9.
>   This audit is deliberately scoped to what that one did *not* cover: the modules built since (Sense,
>   Reason, the agent loop, workflow identity, Application Intelligence), plus the product/business layer.

---

## 1. Verdict

**The engineering is better than the product.** That is the finding under every other finding.

The parts that are hard to build are genuinely well built. The no-leak trust boundary holds — every
retrieval path gates on live+approved content *inside the query*, the vector scan is constrained to
live ids, citations resolve only against items the server supplied, and `get_workflow` re-checks
approval server-side. Multi-tenancy is correct on every query examined; no cross-workspace read or
mutation was found in the api, the worker, or the seven server-action files. The answer engine — one
loop in three configurations, with a real safety floor, argument-keyed tool de-dup, and per-question
token accounting — is the strongest code in the repo. The recorder's loss-prevention story (persisted
phase, alarm twin, boot recovery, stable `uploadId`, IndexedDB buffer, streaming artifacts) is
something most teams never build. The reasoning is written down, and it is usually right.

The weaknesses are almost all in the **seams around** that core, and they cluster in three places:

1. **The founder's first hour.** Install → record → approve → embed has a broken link in step 1, no
   coaching where narration actually happens, no progress during a multi-minute build, and no way to
   fix a single wrong word afterwards except re-recording. Every one of these is a churn point for a
   customer defined as *"won't adopt anything that takes more than an afternoon."*
2. **Everything scales with recording length or KB depth, and several things break at ~7 minutes or
   ~20 workflows.** Not in a year — in the first customer who actually adopts. The sharpest example
   is silent: past ~6000 characters of narration, *every workflow but the first gets its plan written
   from the wrong part of the tape.*
3. **The business layer is missing, not deferred.** No price, no billing, no spend cap, no terms, no
   self-serve deletion or export, no second seat, and no human handoff on a decline. Individually
   each is fine for a pre-revenue product. Together they are the reason the first serious prospect
   stalls.

And one thing that is neither a bug nor a gap but shapes everything above: **the KB is two workflows
deep, so almost every quality judgment in this product — including several in this document — is
provisional.** CLAUDE.md already says this. The audit's strongest strategic recommendation (§6) is
that fixing that is worth more than any new phase.

**Nothing found is a security breach.** The one finding filed as a critical security hole was
adversarially overturned (§7). Treat that as good news about the codebase and a caution about audits.

---

## 2. How much to trust each finding

Findings carry one of three confidence levels. This matters more than the severity label.

| Level | What it means | Count |
|---|---|---|
| **✅ Verified** | Adversarially challenged by an independent pass told to disprove it, and it survived — or I read the code myself and confirmed it. | 24 |
| **◐ Single-source** | One auditor read the code and cited lines, but nothing challenged it. **Read the cited lines before acting.** | ~150 |
| **✗ Overturned** | Filed as a finding, then refuted. Recorded in §7 so it is not re-raised. | 6 |

The verification pass was deliberately hostile ("default to refuted when uncertain"). It downgraded
**17 of the 18** claims it examined, and in three cases it produced a *better fix than the finding
did*. That asymmetry is the reason §7 exists: the most expensive thing an audit can do is send someone
to fix the wrong thing.

---

## 3. The twelve that matter most

Ranked by **(product impact × confidence) ÷ effort**, not by severity. Each is small enough to schedule.

---

### 3.1 ✅ Show the workflow description on the screen where approval happens

**The one finding that survived verification unchanged, at HIGH.**

`packages/web/lib/candidates.ts` does not select `Workflow.description`, so
[`kb-workflow-list.tsx`](../../packages/web/components/dashboard/kb-workflow-list.tsx) — the row that
carries the approve `Switch` — cannot show it. The one page that *does* render it,
[`kb/[id]/page.tsx`](../../packages/web/app/dashboard/kb/[id]/page.tsx), has no approve control and
its sidebar tells the founder to go approve elsewhere. And "Approve all" bulk-approves every pending
workflow with no description on screen at all.

**Why it matters.** CLAUDE.md's own Traps list says it: *"A workflow's DESCRIPTION is model output
inside the trust boundary… Any surface where a founder approves a workflow must therefore SHOW it."*
Steps are anchored to real captured events; the description is prose a model wrote, it is the only
place that can say *"you need one of these, not all"*, and retrieval attaches it to every returned
item in both answer configurations. Today a founder can put their entire KB in front of customers
having never read a single one. `roadmap.md:94` claims *"Studio shows it wherever a workflow is
approved"* — that is drift, so the docs currently make this harder to notice.

**Fix.** Add `description` to `listCandidates`, render it collapsed on each pending row, and gate
"Approve all" behind a confirm sheet listing each title + description. No schema, worker, or API
change — the column exists and retrieval already reads it. **Effort: S.**

---

### 3.2 ✅ Slice the transcript by each workflow's own time window

`describe.ts:99` takes `transcriptText.trim().slice(0, 6000)` — the **head** of the recording — and
`index.ts:203` passes the **whole recording's** transcript to `describeWorkflow` for *every* workflow
in the loop. `describeWorkflow` also drops `step.narration`, so it has no other workflow-scoped source.

**Why it matters.** 6000 chars ≈ 1000 words ≈ 7 minutes of speech. A 15-minute product tour yielding
four workflows produces: workflow 1's plan written from workflow 1's narration (correct), and
workflows 2–4's plans written from workflow 1's narration (wrong material entirely). Because the
prompt forbids inventing, the model's best available behaviour is to fall back to a bland one-line
summary — **so the failure looks like blandness, not like a bug.** And the plan is precisely where
"this is optional" and "this is a choice" live; without it a workflow with alternatives is answered
as a mandatory sequence, which is the exact live failure `describe.ts` was built to fix. It gets
worse the more a founder invests in one recording.

**Fix.** At the `describeWorkflow` call site only, compute the window from `segEvents` (already in
scope) and the timestamped transcript segments, with `|| transcript.text` preserving today's
behaviour when transcription degraded. ~6 lines. **Effort: S.**

*Verification note: the finding also cited `distill.ts` and `segment.ts`. Both were refuted — the
distiller already carries per-event workflow-scoped narration, and segmentation legitimately reads the
whole recording. Fix only `describe.ts` + its call site.*

---

### 3.3 ✅ Bound the answer path's model calls

`agent.ts:167` and `reason.ts:288` both construct `new OpenAI({ apiKey })` with no `timeout` and no
`maxRetries`, inheriting the SDK's **600 s / 2 retries**, across up to 4 loop rounds. Meanwhile
`embeddings.ts` threads a budget through and `retrieval.ts` passes 2 s with the comment *"a hanging
embeddings API must never stall the user-facing answer."* The pattern exists; the answer path just
never adopted it. The widget's `/answer` fetch has no `AbortController` either, while `/config` and
sense-plan both do.

**Why it matters.** A slow — not down, slow — provider leaves the end-user watching three dots on the
customer's production page, with the input disabled and no cancel, for minutes. The safety floor
exists exactly for this and never gets a chance to fire, because it only runs after the promise
settles.

**Fix.** `new OpenAI({ apiKey, timeout: 60_000, maxRetries: 1 })` in both files. No new error
handling — the timeout throws into the existing catches that already degrade to the floor. Two lines.
**Effort: S.**

*Verification note: **do not** add Fastify `requestTimeout` — that bounds request *receipt*, not
handler duration, so it would do nothing here. An AbortController in the widget is worthwhile as
defence in depth but is not what closes the hang.*

---

### 3.4 ✅ Stop filing our own truncations as coverage gaps

`engine.ts` surfaces `incomplete: 'max_output_tokens'` precisely because a truncated response comes
back as empty text that `shapeAnswer` parses as an ordinary decline. `server.ts` logs it — and then
writes `CopilotQuery(answered:false)` and creates a `CoverageGap` with no check of it.

**Why it matters.** On a reasoning model the output budget is shared with thinking, so a long
deliberation returns empty text. The end-user is told the product lacks knowledge it holds, the
answer-rate metric is wrong, and a phantom entry lands in **the exact feed the founder uses to decide
what to record next** — so they may spend an afternoon re-recording a workflow that was never missing.

**Fix.** Guard the gap write on `loop.stats?.incomplete || loop.stats?.failed`. Two lines. Optionally
add a nullable `incomplete` column so truncations become countable. **Effort: S.**

*Verification note: the finding claimed provider `failed` responses were also unguarded. They are
**not** — both the agent and reason branches already detect body-level failures and re-answer from the
floor. Only `incomplete` is unhandled, plus a second-order case where the floor itself returns failed.*

---

### 3.5 ✅ Normalize email case at signup and sign-in

`schema.prisma` declares `email String? @unique` — a case-sensitive Postgres column.
`actions.ts:21` validates with `z.string().email()` and never lowercases; `auth.ts:22` looks the user
up on the raw string. Meanwhile `auth-limits.ts:46` *does* normalize (`email.trim().toLowerCase()`) —
so the rate limiter and the database disagree about who a user is.

**Why it matters.** A founder whose phone capitalizes the first letter creates `Fiona@acme.com`. Every
later lowercase sign-in returns "Invalid email or password". They click Forgot password — and the
flow *correctly* shows the same non-enumerating message whether or not an account exists, so no email
ever arrives and they get **zero signal**. Nothing in the system can tell them what happened. This is
the cheapest possible fix for a silent, unrecoverable activation loss.

**Fix.** `.transform(s => s.trim().toLowerCase())` on the zod schemas in `actions.ts` and `auth.ts`,
plus a `LOWER(email)` backfill migration with a uniqueness check. **Effort: S.**

---

### 3.6 ◐ Repair the first click of activation

Three CTAs labelled "Install the recorder" route to
[`settings/page.tsx`](../../packages/web/app/dashboard/settings/page.tsx) — a 46-line page rendering
exactly two rows (workspace name, account email) under the subtitle *"Your workspace and recorder
connection."* The comment justifying the fallback describes a token card that commit `092c5b9`
deleted. Nothing in Studio links to `/connect`, and the primary "Record" CTA opens a prose dialog
whose step 1 says "Add the FlowBuddy Recorder to Chrome" with nothing to click.

**Why it matters.** This is the first click every single signup makes. It fails closed, with no error,
and looks like the founder's fault.

**Fix.** Point both CTAs at `extensionStoreUrl || '/connect'` (`/connect` already handles the
not-installed case with a real message), add a footer action row to the How-to-Record dialog showing
connection state, and either fill Settings with a Recorder section or drop "and recorder connection"
from its subtitle. Set `FLOWBUDDY_EXTENSION_URL` in prod. **Effort: S–M.**

*Verification note: severity is medium, not critical — the Home CTA only misroutes while the env var
is unset, and both screens render a help dialog beside the bad link. The Recordings CTA is wrong
unconditionally.*

---

### 3.7 ◐ Close the coverage-gap loop

The only writer of `CoverageGap.status` in the entire repo is a manual **Dismiss** button. The worker
never touches gaps; approving a workflow never touches gaps; nothing ever checks whether a new
recording actually answers the declined question.

**Why it matters.** *"Coverage gaps → record this next → the copilot gets better"* is named as moat #3
in `product.md`. **In code the loop stops at the first arrow.** The founder records, approves, and the
gap still sits in a red card with a danger badge in three places until she remembers to dismiss it
manually — and she gets no confirmation her work paid off. That moment ("did that afternoon help?") is
the single strongest retention signal a solo founder has, and it currently produces nothing.

**Fix.** After a synthesis job completes, re-run each open gap's `prompt` through
`retrieveApprovedKBItems`. Hits → flip to a new `status: 'covered'` and render it green with a
one-click link into the Studio preview pre-filled with the question. Retrieval is already a shared
seam. **Effort: M.**

**Related, same surface:** gap dedupe and the "asked N×" ranking key on *verbatim* question text, so
four phrasings of one question are four rows each "asked 1×" and the ranking that makes the card
useful effectively never fires. Normalising before the dedupe lookup is the cheap interim; clustering
on the embedding you already compute is the real fix.

---

### 3.8 ◐ Let the founder fix a wrong step, title, or description

There is no mutation anywhere in Studio that writes workflow or step *content*. The recourse for one
wrong word is: leave it live, or re-record.

**Why it matters.** Segmentation is non-deterministic by design, distilled instructions are model
labels over captured events, and the pipeline has documented failure modes (a stray click kept as a
step, a sub-task pruned, a workflow distilled to zero steps and dropped). So the unit of trust is
all-or-nothing at workflow granularity. Fiona sees step 4 say "Click Save" when the button says
"Publish", and her options are to ship the wrong instruction or re-record a 15-minute session — the
exact "more than an afternoon" threshold her segment refuses. **Every table-stakes competitor here
(Scribe, Tango, Guidde, Supademo) treats step editing as the primary post-capture action**; it is
where a user's sense of authorship comes from. Its absence is plausibly a top-3 reason a trial founder
never reaches an embedded copilot.

**Fix.** Ship the narrow version: inline edit of step `instruction`/`detail`, workflow `title` and
`description`, plus delete/reorder. Keep route/bbox/screenshot immutable so grounding stays anchored.
Mark edited rows so a reprocess never silently discards a founder's correction. **Effort: L** — and
worth it.

---

### 3.9 ◐ Coach the narration where the narration happens

The only narration guidance in the product is a Studio help dialog the founder must open, in another
tab, before starting. The recording surfaces — the popup and the on-page control bar — show a dot, a
timer, a step count and a mic meter. **They show a stopwatch.**

**Why it matters.** Slice 0 of Application Intelligence measured it: pre-coaching narration was ~90%
click-commentary ("now I click here"), which produces exactly the descriptions `describe.ts` is trying
to avoid and no groundable quotes for `pages.ts`. Narration is the substrate for workflow plans,
recording descriptions, and the entire product-knowledge layer. **It is the highest-variance input in
the system and the one the founder gets zero feedback on** — and improving it improves titles,
descriptions, segmentation boundaries and pages simultaneously, with no model or pipeline change.

**Fix.** One rotating coach line in the control bar keyed to state ("Say what you're about to do and
why someone would do it"; after 30 s of clicks with a flat meter: "Still recording — say what this
screen is for"); prompt for a spoken task name on Mark (`Marker.label` already exists in the type);
a one-time pre-flight card before the first ever recording. **Effort: S.**

**Ride along (verified, 2 lines):** when `manifest.audio` is absent, `transcribe.ts` returns an empty
transcript with **no warning**, so the recording lands `ready` looking fine. Setting a `warning` there
makes Studio's existing "Processed with a warning" banner fire — and it should say what is actually
missing: *"no narration captured — steps were built from actions only, and no product knowledge was
extracted."*

---

### 3.10 ◐ Store the answer text

`CopilotQuery` has no `answer` column. Filtering the question log to 👎 gives the founder a list of
questions the copilot got wrong **with no way to see what it said.**

**Why it matters.** She cannot tell whether it cited the right workflow and phrased it badly,
hallucinated a step, or answered the previous question (a bug this repo has already had). She cannot
reproduce it either. Answer quality is one of four headline success metrics and the only one that is
completely unobservable. **Every day of production traffic between now and shipping this is
permanently undiagnosable.**

**Fix.** `answer String?` + write it in the existing create, wrapped in `redactText`. The wrap is
load-bearing, not decoration: the model sees the *raw* question, so an answer can echo a card number
back into the founder's DB unless it is scrubbed on the same write. **Effort: S.**

*Verification note: this was a deliberate invariant (`copilot.md:161`) with a real PII rationale, and
declines already persist the assistant's own words in `CoverageGap.reason`. So the gap is narrower
than filed — answered-then-thumbed-down questions only — and the doc needs updating with the column.*

---

### 3.11 ◐ Give the copilot a human handoff on a decline

The uncovered path is one line: push a decline bubble. Nothing follows — no button, no link, no
callback, and no workspace field for one.

**Why it matters.** Two victims. The **end-user** gets an honest decline and is then stuck with no
next move — strictly worse than the Intercom bubble they expected. The **buyer**: every AI-support
competitor (Fin, Zendesk AI, Sierra) treats handoff as the product's spine, because the
resolved-vs-escalated split *is* the ROI number. FlowBuddy cannot compute deflection today because it
has no denominator — an unanswered question and an escalated one look identical. Which is why the
Analytics page currently labels the raw answered-question count **"Tickets deflected · answered
without a human"** in a green ROI tile. That is the number a founder puts in an investor update, and
the day she notices her support inbox didn't shrink by 200 is the day she stops trusting the page.

**Fix.** One nullable workspace setting — URL, `mailto:`, or a `window.flowbuddy.onDecline` callback
the host wires to their own Intercom. Render it under every decline and every 👎. Log the click as
`escalated`. That column, over `covered`, is the real deflection metric. Until it ships, relabel the
tile "Questions answered". **Effort: M.**

---

### 3.12 ◐ Two silent mutations and one destructive one

CLAUDE.md's convention: *every server-mutating action shows a success/error toast.* Three violations,
all on the highest-stakes controls in Studio:

- **`approveAll`** — the action that puts an entire knowledge base in front of paying customers — has
  no toast; failures land in an inline `<p>` far below the button.
- **`saveOrigins`** — decides whether the copilot runs at all — has no try/catch and no toast; a
  thrown action becomes an unhandled rejection and the founder sees nothing.
- **`rotate()`** — the single most destructive control in the product, which takes the live
  customer-facing copilot offline everywhere with no undo and no grace window — is guarded by a
  native `confirm()` (the one pattern the rest of the app deliberately avoids), gives zero feedback,
  and leaves the founder on a screen that still looks fine while their widget is dead. The new
  snippet is on a different tab and nothing navigates there.

Every sibling handler in the same files does this correctly, which makes these look like drift.
**Fix: S.** For `rotate()`, also use the shadcn dialog, state the consequence, and switch to the
Install tab on success.

---

## 4. By module — the rest, condensed

Findings not in the top twelve, grouped by where they live. All ◐ single-source unless marked.

### Widget — what the paying customer's end-users touch

The widget is disciplined (16 KB gzipped, zero deps, shadow DOM, escaped markdown, best-effort
everything). The gaps are all things the founder never sees during a happy-path demo:

- **A screen-reader user asks a question and never hears the answer.** The message list is a plain
  `div` — no `role="log"`, no `aria-live` — and `render()` calls `replaceChildren()` on every state
  change, destroying any parked cursor. The close button has no label; there is no `role="dialog"`,
  no Escape, and focus never returns to the launcher. This is the a11y gap that decides whether the
  widget works *at all*, and it should ship ahead of the dialog-role work already in the backlog —
  an inaccessible embedded chat becomes the *customer's* VPAT problem.
- **✅ No dark theme.** `styles.ts` is light-only with no `prefers-color-scheme` block. A large share
  of modern B2B SaaS is dark; their users get a glaring white 370×540 panel. The CSS is already fully
  tokenised, so this is ~10 lines plus an optional `theme` config field.
- **✅ `--fb-accent-fg` is hardcoded `#ffffff`** while Studio ships an `<input type="color">`. Any
  light or mid-tone brand accent produces white-on-light across the header, send button, user bubbles
  and walkthrough buttons — and Studio's preview shows the same broken result, so it looks intentional.
  Compute luminance and pick white or dark ink. Every current preset happens to be dark enough, which
  is why nobody has hit it.
- **Mobile:** the input is `13.5px`, so iOS zooms the customer's whole page on focus; the panel is
  sized in `vh`, which does not shrink for the soft keyboard, so the input row sits under it.
- **A double-embed** (layout template + tag manager — the most common third-party-script accident)
  produces two launchers, two conversations racing to overwrite one persisted thread, and a second
  widget painted into the Reason page image. One `getElementById` guard fixes it.
- **A strict `style-src` CSP renders the widget completely unstyled** (inline `<style>` in the shadow
  root); `adoptedStyleSheets` is not subject to `style-src`. Separately, `ensureBrandFonts()` injects
  a Google Fonts `<link>` into the host document — a third-party request from the customer's page,
  a CSP violation, and a named DPA item in the EU, for typography that already has a system fallback.
- **Reduced-motion is ignored** by an infinitely pulsing ring drawn on the host page during a
  walkthrough, plus forced smooth-scroll.
- **The walkthrough highlight drifts** on any reflow that isn't a scroll or resize — an accordion
  opening, an async list rendering, a validation error pushing the form down — while the card says
  "click the highlighted element". Calling `reposition()` from the existing 400 ms tick closes most
  of it.
- **Thumbs-down captures one bit** on the product's central quality signal. Three one-tap reason chips
  ("Wrong steps" / "Not what I asked" / "Too vague") turn a counter into an instruction.

### Recorder — the first thing a customer touches

- **Stop truncates the tail.** Events are only durable *after* their screenshot resolves, screenshots
  are serialized ≥700 ms apart, and `onStop` never awaits the capture chain. The last one to three
  interactions — the *outcome* steps of the workflow — can silently never reach IndexedDB.
- **Closing the recorded tab leaves the session recording forever with the microphone live.**
  `pruneTab` empties `tabIds`, `recordingTabs` then falls back to the closed tab's id, and nothing
  stops a session with no tabs. The offscreen recorder keeps running. For an extension that already
  asks for `<all_urls>`, this is the screenshot nobody wants posted.
- **The on-page control bar deletes itself when capture dies** instead of saying capture died — so a
  Chrome auto-update mid-recording leaves the founder narrating into nothing, with a small badge
  change as the only signal.
- **Stop pulls the whole artifact buffer into the service-worker heap** even when everything is
  already uploaded (value cursor instead of the key-only cursor `idb.ts` provides *for exactly this*,
  with a comment explaining why). A long recording can OOM at the most fragile moment, and boot
  recovery retries the same allocation.
- **A tab the founder opens themselves is never recorded** and nothing says so.
- **`getState` is O(entire recording) and is polled every 2 s**, deserializing every event just to
  count them, while `kvCountByPrefix` sits unused. Plus a session-storage read per `micLevel` message
  at 8/s.
- **Two pieces of popup copy state things the code does not do** — including "Retries automatically
  when you're back online" (there is no online listener) and the zero-event message blaming iframes
  (captured since R8). The second is the message a founder reads when their *first* recording produced
  nothing.
- **No way to discard a recording in the moment** — `onDiscard` exists, is correct, and is reachable
  only after a *failed* upload.
- **Form submits and Enter get the destination page's screenshot**, and nav-ending steps get no result
  frame at all. This is the concrete mechanism behind the known "full-page-nav capture gap", and it is
  two small localized fixes (let `onSubmit`/`onKeydown` peek `pendingShotId` like `onChange` does; use
  `tabs.onUpdated` complete as a nav-settle).

### KB pipeline

- **Multi-minute serial build with no progress and no auto-refresh**, then a 15-minute banner that
  asserts the job was lost and invites a full-price rebuild. The per-workflow distill+describe loop is
  strictly serial and is text-only, so the `concurrency: 1` rationale (vision calls holding screenshots)
  does not apply to it — a concurrency of 2–3 roughly halves wall clock.
- **The pipeline computes exactly the signals that explain a bad workflow, then throws them away.**
  The segmenter's schema *requires* `boundary_evidence` and `confidence` per workflow; both are parsed,
  logged, and dropped from the `Segment` interface. The distiller logs "workflow kept few events as
  steps — possible mis-scoped segment" and continues. The prompt even promises a review surface that
  does not exist. Carrying these to the workflow row as a `buildNotes` column costs no model call and
  turns approval from a coin flip into an informed review.
- **◐→medium Reprocessing a recording whose first build lost its embeddings retires every one of its
  approvals** — and the degraded-state notice actively tells the founder to reprocess. The fix is to
  rebuild the missing fingerprints from the stored `KnowledgeItem.text` (still present at that point
  in the job) rather than treating "no vectors" as "no match".
- **Narration alignment tests only a segment's `start`** against a 5.5 s window; `end` is parsed and
  never used. A founder speaking one long sentence while clicking three things produces a segment that
  attaches to none of them — narration *dropped*, not misattributed, which looks exactly like a founder
  who said nothing. One-line overlap test.
- **A long tour silently loses its entire narration layer**: single-shot Whisper against a 25 MB cap,
  no bitrate cap in the recorder, no size pre-check. Setting `audioBitsPerSecond: 32000` pushes the
  ceiling to ~90 minutes.
- **Deleting a recording leaves the product pages derived from it live and answering.** `ProductPage`
  has no `sourceId` — the recording appears only inside `provenance` JSON, which nothing scans on
  delete. The reasons a founder deletes a recording are exactly the reasons the derived prose should
  stop answering.
- **Workflow titles are never PII-redacted** — every other authored string that can reach an end-user
  is, and the title is the most visible of all: it labels the citation.

### Retrieval, Sense & Reason

- **✅ Retrieval loads the entire workspace `KnowledgeItem` table on every question** — no approval
  filter in the WHERE, full `data` JSON selected, filtered in JS afterwards — and again on every agent
  `search_knowledge` (up to 4 more times per answer). Pushing `workflowId: { in: liveWorkflowIds }`
  into the query mirrors what the vector half already does, makes the no-leak property structural for
  both halves, and stops cost scaling with everything the founder ever recorded. **This is the
  dominant cost on the answer path** — bigger than the vector scan two lines below it.
- **◐→medium Routes are matched as literal strings everywhere.** A step recorded at
  `/invoices/8821/edit` scores 0 against `/invoices/443/edit`. The impact is narrower than first filed
  (the bidirectional prefix rule plus a workflow-atomic shard means one ancestor-route step carries
  the whole workflow in) but three real bites survive: sibling-id steps can never be the probe's
  candidate, so a user inside the edit form gets localized to step 1 and told to "click Edit"; a
  workflow recorded end-to-end inside one record is absent from a sibling's shard; and
  `walkthrough.ts` hard-stops with *"This step happens on /invoices/8821/edit"* — **printing another
  customer's record id to the end-user.** Fix with a match-only templating helper applied identically
  on server and widget; never let the templated form replace the stored or displayed route.
- **Progression is inferred only from filled inputs**, so click-only workflows — the majority in a B2B
  SaaS — always localize to the earliest visible step and re-instruct work the user already did.
  `postRoute` is already compiled into the plan and read only by the walkthrough; using it in the
  scorer is ~15 lines.
- **A workflow with no resolved element still ships a positional hypothesis** that the prompt states
  as fact ("visible on their screen and NOT yet completed"). Locator drift is the normal state of a
  shipping SaaS, and Phase 3 — which would detect it — is unplanned. Send a `resolved` flag and phrase
  unresolved hypotheses as route-evidence-only.
- **The red-text banner detector caps at the first 400 elements in *document order*** — header, nav
  and sidebar wrappers — so it misses the rejection banner it was built to catch. Cap the expensive
  work (`getComputedStyle`), not the candidate list.
- **The Reason snapshot spends its 60-control budget in document order** while the text pass right
  below it correctly scopes to the current step's form — and `blockerList` is computed over the
  already-truncated list and labelled *exhaustive* to the model.
- **The page image is rendered and uploaded on every diagnostic question** (up to 4 s of main-thread
  html2canvas and ~1 MB) while the measured baseline shows the model has never once called
  `get_page_image`. Make it lazy via the handshake the codebase already has for `escalate`.
- **Keyword matching is bare substring containment** — `set` matches `reset`, `asset`, `settings` —
  with no word boundaries, no IDF, and no length normalization, on the half that is the *only* one
  running when embeddings fail.
- **Equal keyword scores get different ranks**, ordered by cuid. Invisible at 15 matching items; a 6×
  RRF spread decided by a random id at 300.

### Studio & analytics

- Mobile: the page header covers the hamburger and account menu on every dashboard screen after any
  scroll (both `sticky top-0 z-30`, PageHeader later in the DOM and opaque). One class change.
- The KB lists **oldest-first with no date and no sort**, so the workflows awaiting approval — the
  founder's recurring job — sit at the bottom.
- Onboarding CTAs: "Review & approve" points at Recordings (approval lives in KB); "Get snippet" lands
  on the Activity tab because the tab is client state, not a URL param.
- Deleting a recording **silently takes live copilot answers offline** — the dialog mentions
  screenshots and audio, never approvals, and the count is already in scope on the calling row.
- The sidebar workspace button has a chevron, a hover state and no `onClick`.
- **"Where users get stuck" counts every positional answer as friction** — `senseUsed: 'used'` means
  "the answer was positional", not "the user was blocked" — so the chart will reliably report step 1
  of the most-asked-about workflow and advise re-recording something that is fine.
- **An empty window reports 0%**, not "—": a founder returning after a quiet week is told her copilot
  resolved 0% without a human. And one lone thumbs-up renders "100% Helpful".
- **No period-over-period comparison anywhere.** On day 30 the question is "is this getting better?",
  and the page cannot answer it. `getCopilotMetrics` already parameterizes on days; calling it twice
  is ~15 lines and is what makes the page worth reopening.
- **Chart buckets use server-local midnight and the final bucket is always short**, so the 90-day view
  dips at the right edge with perfectly flat traffic — the eye reads that as decline.
- **Approved workflows that are never cited are invisible.** Analytics only says "record more"; the
  actionable half is "these 3 aren't earning their approval, and this one produces bad answers."
- **Recorder tokens are minted on every `/connect` visit and can never be listed, revoked, or
  expired.** The schema half (`revokedAt`, `lastUsedAt`, revoke-previous-on-reconnect) needs no UI and
  is filed in the backlog as *Studio polish*, which is why it hasn't moved.
- `resolveCoverageGap` throws on a double-click, and the uncaught server action replaces the whole
  Analytics page with an error card.

### Platform, data model, ops

- **✅ No CI.** 125 vitest tests run in **187 ms** and they pin exactly the traps CLAUDE.md warns
  about — the mode vocabulary's fail-closed floor, the floor prompt never naming a tool, the no-leak
  retrieval seam. A push to `main` is a production deploy with nothing between the commit and
  customers. The reason for deferring (coverage is incomplete) argues for writing more tests, not for
  skipping the ones that exist. One workflow file, under two minutes.
- **Five of the six liveness readers have no test**, including `loadApprovedWorkflow` — the by-key
  fetch that bypasses ranking entirely, so dropping its filter leaks a whole retired workflow verbatim.
  All five are ordinary Prisma `where` clauses that look like boilerplate to anyone refactoring. The
  `spyDb` pattern already proven in `overlap.test.ts` covers them in five small tests.
- **`/healthz` returns a constant** while the BullMQ worker lives in the same process. A worker whose
  Redis connection dies unrecoverably keeps the probe green, Render never restarts it, and every
  recording across all workspaces parks at `uploaded` indefinitely with no alert.
- **The enqueue timeout resolves instead of rejecting**, so the runbook's documented log line for a
  slow Redis can never be emitted. `web/lib/queue.ts` does it correctly — one line.
- **Composite indexes are missing for every query shape that isn't a bare `workspaceId`** —
  `CopilotQuery(workspaceId, createdAt)`, `QueryCitation(workspaceId, createdAt)`,
  `CoverageGap(workspaceId, status)`, `KnowledgeSource(workspaceId, createdAt)`. These are the two
  tables that grow with *end-user traffic*, and the question log pages with `skip`/`take` over an
  unindexed sort. Every table is tiny today — this is the cheapest moment in the product's life to add
  them.
- **The raw `manifest` blob is loaded whole on hot paths**: the sense plan reads every approved
  recording's full manifest on every 60 s cache miss, `buildReasonEvidence` reads one on every
  diagnostic question to find a single filename, and the Studio Recordings page selects it for every
  row to compute a duration and a thumbnail. Persist what the readers need at KB build.
- **Three in-process Maps grow per workspace and never evict** — the rate buckets, the seen-throttle,
  and the sense `planCache`, whose entries hold a whole compiled plan. On a 512 MB instance also
  streaming multipart uploads, that is a latent OOM that will present as unexplained copilot 502s.
- **`pnpm lint` examines zero files** — no package defines a lint script — while CLAUDE.md instructs
  every contributor to run it as the pre-ship gate. A green checklist that verifies nothing is worse
  than no checklist. (The `@flowbuddy/shared` subpath trap is a `no-restricted-imports` rule waiting
  to be written.)
- **The API's 10 s shutdown failsafe overrides the worker's 25 s grace** in the combined process. Real
  but small — one number, with a comment tying it to the worker's.
- **No R2 versioning and no restore drill.** Screenshots and DOM snapshots are irreplaceable in a way
  Postgres rows are not: a founder cannot re-record a session from three months ago in a product that
  has shipped four releases since. Bucket versioning + a 30-day noncurrent lifecycle is a dashboard
  toggle.
- **Build-path cost is unmeasured** while answer-path cost is measured precisely. `responses.ts`
  discards `res.usage` for all five pipeline call sites, and distill runs *per workflow* with no output
  cap. So the larger, uncapped number is the invisible one — which blocks both pricing and the
  deliberately-deferred spend guard.

### The business layer

- **No price anywhere.** No `/pricing` route, no link, and the only monetary statements are "No credit
  card required" and a JSON-LD `Offer` of "Free during early access". The two reasons to defer have
  both cleared: the product launched, and per-question token spend has been recorded since 2026-08-03.
  The missing artifact is a **meter and a number**, not Stripe — collect cards manually for the first
  ten customers.
- **No spend cap.** 30 req/min per key against a reasoning model with no daily ceiling is ~43k
  answers/day, on an in-memory limiter that resets every deploy and multiplies with instance count.
  A daily `CopilotQuery` count checked in `copilotGate`, defaulting to something a real customer never
  hits, is small — and doubles as the usage meter every pricing model will need.
- **No terms, no DPA, no sub-processor list, and a personal Gmail as the privacy contact.** The day
  the widget goes live in a customer's product, FlowBuddy becomes a sub-processor of *their* end-user
  data, which their own DPA obliges them to name. A `/security` page listing OpenAI, Render, Cloudflare
  R2 and Resend with purposes and retention costs an afternoon and is the page that unsticks deals.
- **No self-serve deletion or export.** The privacy page promises deletion by email. The schema is
  actually fine — `RESTRICT` on `ownerId` is *correct*, because it makes a wrong-order deletion fail
  loudly instead of orphaning a workspace — but there is no script, no runbook and no UI, so an
  erasure request today is an ad-hoc production Prisma session. A `deleteWorkspace` action reusing the
  existing paginated prefix-delete, plus a JSON export, closes both.
- **One user per workspace, no invite, no ownership transfer.** `getCurrentWorkspace` resolves through
  `ownerId` alone and there is no membership table. The first time Fiona hires a support person the
  only option is sharing her password — which also shares minting recorder tokens and approving
  workflows. Either commit to single-user as an explicit V1 decision with the trigger that reopens it,
  or land `WorkspaceMember(workspaceId, userId, role)` now; the invite path is ~80% the same code as
  email verification.
- **✅ The landing page's own copilot is dark.** `render.yaml`'s landing service declares no `envVars`
  block at all, so `FLOWBUDDY_LANDING_WIDGET_KEY` is unset and the "See it in action" button silently
  falls back to scrolling. The page argues "our copilot answers grounded, in-context, with citations"
  and the one way to verify that in five seconds is off. Fiona's alternative (Chatbase, a Scribe doc)
  can be tried before signup; FlowBuddy asks her to install an extension and record herself first.
  **This is simultaneously the conversion asset, the production canary, and the second workspace three
  other workstreams are gated on.**
- **◐→medium The PII copy is broader than the mechanism.** Client-side redaction covers *input values
  only*; `serializeDom` uploads `outerHTML` with just script/style bodies stripped, and screenshots are
  raw full-tab JPEGs. Four public surfaces say "Sensitive information is masked directly in your
  browser before any data is sent". No data-exposure bug exists (the KB text the copilot answers from
  *is* scrubbed, and artifacts stay in the founder's own workspace), and the privacy policy is honest —
  so this is a copy-accuracy defect, not a breach. **The worst surface is the one the audit nearly
  missed:** the recorder popup's permanently-on switch labelled *"Mask PII before upload — always
  on"*, sitting in front of the founder at the moment they press record. Fix five strings; leave the
  Cut 2 deferral where it is.
- **Positioning buries the differentiator.** Capability 01 is "Conversational help, in your app" —
  indistinguishable from Chatbase — and the two things only a selector-bearing KB can do (on-page
  next-step highlighting, task walkthroughs) are third and fourth. The page never names an alternative
  and has no answer to "why not point a bot at our docs?", which is the question Fiona is actually
  asking. It also costs on the GEO axis the team deliberately invested in: `llms.txt` is the only
  long-form corpus and has nothing comparative for an engine to quote.
- **The Studio sign-in and sign-up pages still wear the pre-rename "S" monogram** — at the exact
  handoff from `flowbuddyai.com` to `app.flowbuddyai.com`, which is the one moment a stray letter
  reads as a phishing page.

---

## 5. A suggested sequence

Grouped by what each batch buys, not by module.

**Batch A — a week of small fixes with outsized effect.** All S, all independently shippable.
3.2 (transcript window) · 3.3 (model timeouts) · 3.4 (gap-write guard) · 3.5 (email case) ·
3.1 (description at approval) · 3.12 (three toasts) · the `warning` when audio is absent ·
push the approval gate into retrieval's WHERE · the composite indexes · CI · `/healthz` asserts the
worker · the enqueue timeout rejects. *Ship the recorder-side items behind the store-first rule.*

**Batch B — activation.** 3.6 (first click) · 3.9 (narration coaching) · the dogfood widget on the
landing page · build progress + a stage-aware stalled test · repair the two false popup messages.
**Measure it:** time from signup to first approved workflow, and the % of first recordings that carry
a transcript. Neither number exists today.

**Batch C — the loop that makes a founder stay.** 3.7 (close the gap loop) · 3.10 (store the answer) ·
3.11 (handoff + honest deflection label) · never-cited workflows · period deltas · thumbs-down reasons.
This is the batch that turns Analytics from a dashboard into a work queue.

**Batch D — before the first invoice.** Price page · daily spend cap · terms + `/security` +
sub-processors · self-serve delete and export · the five PII copy strings · decide multi-seat
explicitly (either direction).

**Batch E — the scale wall, cheap now.** Route templating · rate-limit per visitor not per workspace ·
manifest off the hot paths · bound the three in-process Maps · widget dark theme + accent contrast +
a11y live region · mobile fixes.

**Then** 3.8 (step editing) as its own piece of work. It is L, it is the biggest missing capability
versus every direct competitor, and it is the cheapest lever on answer quality while the KB is thin.

---

## 6. The strategic recommendation

**Spend the next quarter buying KB depth on real products, not opening a new phase.**

Every open design question in the docs is gated on the same missing input, and each doc states the gate
independently while nobody owns it:

- `application-intelligence.md`: *"this layer builds AFTER the KB has depth… on a two-workflow KB an improvement can't be attributed."*
- `agent.md` §9: *"Copilot mode was verified against what a single workflow can exercise. Recording two or three more is the cheapest way to test the half that is currently theoretical."*
- `roadmap.md` on duplicate detection: *"calibrated on two true duplicates and one false positive from a single product."*
- `roadmap.md` Next: *"calibrate extraction thresholds on a second product."*
- CLAUDE.md, plainly: *"The KB is only about two workflows deep… every judgment about it is provisional."*

Three of the agent's own abilities — searching with its own wording, choosing between workflows, and
asking "did you mean X or Y?" — **have never actually fired**, because there has been nothing to choose
between. Retrieval's ranking constants are unfalsifiable. The duplicate detector's thresholds rest on
an n of 1. Several findings in this document are marked provisional for exactly this reason.

Against that, the alternatives:

- **Phase 3 (self-validation)** requires the customer to provision a sandbox with test credentials —
  onboarding friction Fiona will not accept before she has seen value. And validating a two-workflow
  KB validates almost nothing. *"Is this still true?"* is a real buy signal, but no customer has asked
  it yet, because no customer has knowledge old enough to doubt.
- **Phase 4's acting modules** are gated on Phase 3's certification by the product's own safety story.
  Shipping acting on top of unvalidated knowledge is the one thing that story forbids.
- **The V2 portal** opens a second audience before the first is monetised.

There is a real pull toward compressing into Phase 3/4 — `competitive-claude-chrome.md` argues it, and
the reasoning (Claude for Chrome acts *today*) is sound. But the binding constraint is not capability,
it is **evidence**: no calibration threshold in this product has been measured on more than one
workspace, so every quality claim on the landing page rests on an n of 1.

So: **(a)** two or three design-partner workspaces recorded to real depth — the FlowBuddy dogfood KB is
the free first one and doubles as the landing demo and the production canary; **(b)** the Batch D
monetisation prerequisites; **(c)** re-calibrate Application Intelligence and duplicate detection on the
second product. Revisit the Claude-for-Chrome compression argument once one workspace has answered real
end-user traffic for a month.

The quarter should end with paying customers, not a moat guarding two workflows.

---

## 7. Overturned — do not re-raise these

Recorded because each was filed as a finding, looked convincing, and is wrong. The reasoning is worth
more than the conclusion.

**✗ "The origin allowlist is bypassed by omitting the `Origin` header" (filed CRITICAL/security).**
The line reads as described — `allow.length > 0 && origin && …` does skip the check when no Origin
arrives. But the impact does not follow: **Origin is entirely attacker-controlled outside a browser.**
An attacker already running `curl` with a scraped key defeats a stricter check with one extra flag
(`-H 'Origin: https://app.acme.com'`). An Origin allowlist is only ever a *browser*-enforced control —
the browser is what refuses to let evil.com forge it — which is precisely what the source comment says.
Deleting `&& origin` would break legitimate server-to-server callers and buy zero security: a strict
regression. What survives is one sentence of Studio copy ("The copilot only runs on origins you list
here") overstating what any Origin check can enforce, and the real containment being the rate limiter.
**Correct fix: honest copy + the per-workspace spend cap in Batch D.** Not the header check.

**✗ "Account deletion would throw a foreign-key violation" (filed CRITICAL/data-model).** The `RESTRICT`
constraints are real and correct. Deleting workspaces first, then the user, satisfies them cleanly —
every workspace-owned relation already cascades. And R2 is not stranded: a paginated prefix-delete
exists in both storage modules and generalises to a workspace prefix by construction of the key layout.
**Do not add `onDelete: Cascade` to `ownerId`** — RESTRICT is what makes a wrong-order deletion fail
loudly instead of silently destroying a workspace. The real gap is the *product* surface (§4) and a
runbook, not the schema.

**✗ "Add a pgvector HNSW index" (filed HIGH/performance).** Three problems. The dominant cost of that
function is the unfiltered `knowledgeItem.findMany` two lines above it, which no vector index touches
(§4, and it is in Batch A). The documented threshold — "~tens of thousands of items" — has not been
reached, and below it an exact scan is both faster and *more accurate*. And the query is a `UNION ALL`
with a highly selective no-leak filter, where ANN post-filtering can silently under-fill the `LIMIT 50`
and degrade recall on exactly the approved set. **What survives is the timeout half only**, and the
cheapest version fixes all four untimed queries at once: append `?options=-c statement_timeout=2000`
to `DATABASE_URL` — an error there already falls into the documented keyword-only degrade path.

**✗ "Ship the `ANSWER_SCHEMA` field reorder — a measured 0/8 → 8/8 sitting unshipped" (filed HIGH).**
The measurement is real but it is of an *alternative* fix to the same cell. The chosen fix — labelling
the question as the new one — shipped in the same commit and moved that cell 0/10 → 10/10 in both
modes. The reorder was held deliberately *so each lever stays independently measurable*, which is the
same discipline the repo applies to segmentation drift. It is a documented backlog lever to take at the
next re-baseline, not an open defect. (The claim's mechanism is also wrong on a reasoning model —
thinking tokens about the items precede the JSON.)

**✗ "The mic is not gated, so a founder silently records with no narration" (filed CRITICAL).** There
*is* a red "⚠ Microphone not granted" banner with a Grant button rendered directly above Start on every
idle popup open, a full-tab grant flow with macOS-specific remediation, and two live meters during
recording. `copilot.md` records this risk as shipped-with-mitigation. What survives is much smaller and
is in Batch A: the start-time null-audio signal the background already receives is discarded, and an
audio-absent build sets no `warning`, so Studio's existing banner never fires. **Do not block Start.**

**✗ "A reprocess silently rewrites an approved description" (filed HIGH/security).** Not security — no
trust boundary is crossed; the prose is derived by the same pipeline from the same founder's own
recording. And not singled out: the same matched branch deletes and recreates *every step row* too, a
documented delete-and-recreate rebuild that approval is designed to survive. The ProductPage asymmetry
is explained by the objects differing (pages are multi-source aggregates another recording can rewrite;
workflows are single-source). What survives is narrow: prose can drift while steps still clear both
identity gates, and nothing flags a diff. A `descriptionChangedAt` stamp and a "regenerated since you
approved" badge is the whole fix.

---

## 8. What this audit did not cover

Stated so the gaps are known rather than assumed:

- **No test was run and no code was changed.** Findings are from reading source, not from executing it.
- **~150 of the 180 findings are single-source.** The verification pass covered the top 18 and
  downgraded 17. Assume a similar correction rate applies to the rest, and read the cited lines first.
- **No load, latency, or cost measurement.** Every performance claim is structural ("this is O(corpus)"),
  not measured. Several would change rank under real numbers.
- **The design system** (`docs/design_system/`) was not audited against the shipped UI.
- **The V2 portal, the company agent, and Phase 6 interop** were read as direction only.
- **No adversarial security testing** — no attempt to exploit anything, only to trace paths.
