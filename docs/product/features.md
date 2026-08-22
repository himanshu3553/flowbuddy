# FlowBuddy — Features (every feature, by category)

> **What this is.** Every feature of the product in one place, grouped by what it does for the builder and for their customers — the knowledge base, the copilot and its two modes, going live, Studio, analytics, and the guarantees underneath. It says what each feature **is**; it never says whether it is built.

- **Status:** [`roadmap.md`](../roadmap.md) — the only status surface. Which of these is live, on its way, or still a direction is answered there and nowhere else, and the follow-on polish behind each area is its backlog.
- **Companions:** why the product is shaped this way → [`product.md`](product.md) · the technical model → [`architecture.md`](architecture.md) · how each piece runs → [`internals/`](../internals/README.md) · the whole thing in ordinary words → [`plain-english/`](../plain-english/README.md) · the marketing site → [`landing-page.md`](landing-page.md) · how to test any of it → [`e2e-testing.md`](../ops/e2e-testing.md)

---

## The shape

Record your product once, approve what FlowBuddy learned, paste one script — and your customers get an in-app assistant that answers, points, guides and, in AI Agent mode, acts, grounded only in what you approved.

1. [Build the knowledge base](#1-build-the-knowledge-base) — record → automatic workflows and product knowledge → approve
2. [The copilot, in Copilot mode](#2-the-copilot-in-copilot-mode) — what every workspace gets
3. [AI Agent mode](#3-ai-agent-mode) — the copilot acts
4. [Going live](#4-going-live) — embedding and configuration
5. [Studio](#5-studio) — the builder console
6. [Analytics and the feedback loop](#6-analytics-and-the-feedback-loop)
7. [Security, privacy and trust](#7-security-privacy-and-trust)
8. [The road ahead](#8-the-road-ahead) — directions, each with its own doc

---

## 1. Build the knowledge base

Part 1 of the product. Record your product once with the Chrome extension; FlowBuddy turns the session into workflows and product knowledge; you approve what the assistant may use. Everything downstream reads only what this produces.

### Recording — the FlowBuddy Recorder (Chrome extension)

- **Connect in one click.** Open Studio's Connect page and the extension pairs itself; you never see or paste a token.
- **Record by using your product.** Press Start, click through real tasks and talk about what you are doing and why. One session can hold many workflows.
- **Every layer on one timeline.** Clicks, typed values, form submits, scrolls, menu hovers and keyboard shortcuts; each element's role, name and ranked locators; a screenshot at the action and a second one after it; a page snapshot before and after; the URL; your voice.
- **"New workflow" marker.** Drop a marker from the popup or the on-page bar when you start the next task. A workflow can never cross a marker you pressed.
- **On-page control bar.** Stop · Pause · Mark, the timer, step and workflow counts and a mic meter on the page itself — draggable, survives navigations, collapses into an upload status pill on Stop.
- **Pause and resume.** For a sensitive screen or a break; audio and events stay aligned when you resume.
- **Never record blind.** Mic permission is handled before Record, and live level meters sit in the popup and on the bar, so a dead mic is visible while you can still fix it.
- **Sensitive data masked before upload.** Passwords are never captured; email, phone, card, ID and secret/token fields are masked by field type; and the host app can opt any other field into masking with an attribute.
- **Survives real conditions.** Full-page and cross-origin navigations, multiple tabs and OAuth popups, iframes (Stripe-style embeds), and Chrome evicting the extension mid-session — without losing events.
- **Uploads while you record.** Screenshots and snapshots go straight to storage as they are captured; Stop sends only the index. Long recordings end in seconds, and the recording appears in Studio while it is still being made.
- **Retry-safe, duplicate-proof.** A failed upload keeps everything; Retry lands on the same recording (one recording, one identity). Honest "finishing up" states with an elapsed timer, never a fake percentage.
- **Abandoned recordings clean themselves up.** "Start fresh" or starting over discards the half-made one; anything missed is swept by the service after a long silence — generous on purpose, since a paused recording also looks silent. A finished recording is never touched.
- **Recent recording status.** The popup shows the last recording's state (uploaded → processing → ready) with a link into Studio.
- **Distributed through the Chrome Web Store.** Installed copies update themselves.
- **Typed values survive a full page reload.** Fields still uncaptured are flushed on submit and before navigation — the capture gap that mattered most once the assistant could act.
- **Checkbox state and after-typing capture.** A box's real checked state, and a field's state after typing (inline validation), as richer evidence for verification.

### Automatic knowledge creation

- **Narration transcribed with timestamps**, aligned to each action. A build without narration still lands, with a notice naming what was lost.
- **One recording → separate workflows.** Splits at terminal states — a success toast, a redirect, landing back on a dashboard, signing out, a long pause — with your narration as support. No captured event is ever dropped.
- **Clicks → clean, readable steps.** Mechanical cleanup first (focus-click + type, click + submit, repeated clicks), then an AI pass writes imperative instructions with per-step detail. Every step must cite real captured events or it is discarded.
- **A step is title, description and image.** Anything useful you said lands in the step's own detail; raw narration is not stored inside knowledge, because it smeared across neighbouring steps.
- **A workflow title and description — the plan.** What the task achieves, what is optional, what is a choice, what must be true first — from what you said. It never restates a click target.
- **One curated screenshot per step**, the clicked element outlined; the last step shows the result frame ("you land here").
- **Your sample data never becomes an instruction.** Typed values are reduced to their shape, so the assistant never tells a customer to type the recorder's test value.
- **Product knowledge pages.** An overview, a page per concept, a page per product area and a description per recording — derived from the same narration, every sentence anchored to what you said, linked to the workflows they explain.
- **Searchable two ways.** Keyword matching plus meaning, fused.
- **Server-side privacy scrub.** Emails, phones, card numbers and IDs become typed placeholders in everything the assistant reads; it never echoes them back.
- **An evidence layer for every recording.** Entry conditions, per-step expectations and outcome markers compiled from the capture. Answers state it, diagnosis uses it, acting runs verify against it.
- **Boundary learning.** Every boundary you fix in Reorganize — and every marker you press — teaches a signature; later recordings of the same product are cut at the same moment automatically, and a contradicting correction retires the lesson.
- **Background processing with retries**, and a status visible in Studio from the first upload through Ready, with a warning whenever a build degraded.
- **Reprocess any time.** Rebuilds the knowledge from the stored capture; identities are re-matched by content so approvals survive where the content still agrees, and your edits ride along.

### Editing and curating workflows

- **Rename, delete or reprocess a recording.** Delete removes its files too.
- **Replay player.** Step through the screenshots in sync with your audio.
- **Edit the title and description.** Your words are stamped as yours and kept through every reprocess.
- **Edit any step's instruction and detail.** Saved together with its search vector, or not at all — retrieval never drifts from what you wrote.
- **Swap a step's image.** Pick any other frame the same recording captured, in a carousel; the highlight follows the picture. No uploads — a step always shows a real captured moment.
- **Delete a step.** Gone now and on every rebuild.
- **Add a step from the recording.** Restore a captured moment the AI pruned; you type only the words, and the screenshot, anchor and evidence come from the real event.
- **Reorganize workflow boundaries.** Every step of the recording in order, sectioned by workflow: Split here · Merge with previous · Rebuild · Reset to automatic. Approvals follow verifiable content.
- **Edits survive a reprocess.** Stamped fields stay yours; step edits re-attach by their captured event; an edit whose anchor disappeared is reported, never guessed.
- **What you can never edit:** the event citation that makes a step evidence.

### Duplicates and re-recordings

- **Duplicate detection.** Two signals — overall similarity and where each workflow ends — over vectors the knowledge base already holds, so it costs no model call. Flagged on both workflows' tiles and pages.
- **Compare and decide.** Step lists side by side, each selectable, then one Save: keep the approved one (the newer recording is retired, never approved) · keep the newer one (supersedes the older telling, optionally carrying the founder's edits) · Two routes, same goal (group them; one is picked per question) · Not duplicates. Every outcome is reversible via Restore on the workflow's page.
- **Durable workflow identity.** A workflow is a row, not a position. A reprocess re-matches by content: new content is born unapproved, lost content is parked for review.

### Approval — the trust gate

- **One click per workflow.** Nothing reaches customers until you approve it. The description is shown wherever you approve, because the assistant answers from it too.
- **Retire and re-approve.** Retiring stops a workflow answering everywhere at once; nothing is deleted, so every decision is reversible.
- **Needs review**, after a reprocess that cannot confirm the content is still what you approved.
- **Product knowledge approved page by page.** Full text and provenance quotes shown; a re-recording that changes an approved page parks a pending update to accept or dismiss.
- **Answering and running are separate switches.** Approving lets the assistant answer from a workflow; a second switch lets the agent run it. The same model is where a help portal's and outside agents' approvals would live ([§8](#8-the-road-ahead)).
- **"Replaced" view.** Every approval ever granted that is not live — retired and parked ones — kept out of the main list.

### Derived assets

- **Demo videos.** A narrated, branded MP4 derived from a workflow's frames and your narration — a grounded script and voice, a synthetic cursor with click ripples, zooms onto each target, captions, intro and outro. Generate, watch, download and regenerate from the workflow page. Behind a per-workspace switch; never served to end users.

---

## 2. The copilot, in Copilot mode

What every workspace gets. A small launcher in the corner of your app; customers ask in their own words and get answers grounded only in what you approved. It knows where they are, can point at things, guide them and work out why they are stuck — and it never touches the page.

### Grounded answers

- **Answers only from approved knowledge** — approved workflows and approved product pages, nothing from the model's general knowledge. Enforced where knowledge is retrieved, not by a prompt rule.
- **Shows its source.** A "Source: <workflow>" pill on every grounded answer (switchable).
- **Honest declines.** When nothing approved covers the question it says so, and logs the gap for you.
- **Hybrid retrieval, context as a bias.** Keyword plus meaning search; the user's page, their position in a workflow and the last topic nudge the ranking but can never evict the best matches.
- **An agent that works the question.** Searches again in its own words, opens a whole workflow to read the steps, and asks one short clarifying question when two readings genuinely fit.
- **Understands the product, not just the recipes.** Orienting questions ("what is a workspace?", "do I need a new project?") are answered from product knowledge pages. Pages may orient and redirect; only workflows instruct.
- **Invisible safety net.** If the loop fails, the question gets one simple grounded answer instead of an error, and Analytics flags it.
- **Locked on.** Approved-only answering and honest declines cannot be switched off.

### Knows where the user is — Sense

- **Places the user on every message.** Checks the live page against your approved workflows — are step 3's elements here, visible, filled, showing an error? Ranked guesses travel with the question, and the answer decides with the question in hand.
- **Recognises screens by what is on them.** Not only the URL: recorded screen fingerprints (the title plus the labels you touched) place users in one-path apps, tabs and modals.
- **Positional answers.** "You're on step 3 of Create an invoice — here's what's blocking you, then the rest." A tie means it asks which task you are doing; it re-checks on every follow-up.
- **Sensing, not surveillance.** Only at send time, only against approved workflows; only yes/no findings and one masked error line leave the page.
- **Routes matched as patterns.** Record ids never reach the server and are never shown to a user.
- **Step friction signal.** Where users get stuck flows into Analytics.

### Show me — pointing at things

- **Highlights the actual element.** On every positional answer, when the switch is on, the button they need is outlined on the page instead of described in words.

### Guided walkthrough

- **"Walk me through it."** A small card in your brand colour travels beside each step's element — "2 of 5", back and forward — and docks to the corner when there is nothing to point at.
- **Advances on evidence.** A click it watched land moves on by itself, even across the page load it causes; typing steps show "Detected ✓" and wait; the arrow refuses to skip a click it has not seen and says what to finish.
- **Live, honest statuses.** A disabled button is explained ("check step 2 first"), an invalid field names the problem in plain words, and an acknowledgment rolls back if the page regresses.
- **Your data is never gated.** Typing and ticking steps can always be skipped; the product's own validation stays the enforcer.
- **Survives page reloads.** The card returns on the new page and self-corrects from page evidence; it ends quietly if you retire the workflow mid-way.
- **Stops safely.** An element it cannot find stalls the card with Retry · Back · Exit; it never guesses forward, and a step on another page is described, not navigated to.
- **"Explain what's blocking me."** Escalates into diagnosis straight from the card, through the same pipeline as a typed question.
- **Structurally unable to act.** The guided code never imports the one module that touches the page's controls.

### Why they are stuck — Reason

- **Diagnoses from page state.** A masked, structured description of the page — what is there, enabled, filled, invalid, erroring — compared against your recording of the step succeeding; it reasons about the difference.
- **Optional page image.** For purely visual blockers such as a half-ticked checklist or a banner. The most sensitive capture, behind its own switch, with a privacy-disclosure snippet for your policy.
- **Runs only when needed.** A diagnostic-sounding question, a blocked state, or a normal answer having failed — not on every message.
- **Facts from approved knowledge only.** The live page adds the user's situation; product behaviour is never invented.

### Conversation memory

- **Survives navigation.** The thread persists across full page loads — tab-scoped, short-lived, no cookies.
- **Stays on topic.** "And then what?" continues the workflow just discussed; a real keyword match still wins if the subject changes.
- **Answers the question just asked.** The new message is labelled as the one to answer, so a multi-topic thread never gets the earlier question's answer.
- **Re-opens itself only when recent** — a thread touched moments ago, never one from a page opened much later.

### The widget itself

- **One script tag.** Renders a floating launcher and chat panel; dependency-free; isolated in a shadow DOM so host styles never collide.
- **Overlay-only.** Never moves, resizes or reflows the host page. The panel drags by its header and can expand taller.
- **Branded.** Accent, header title, greeting, corner, launcher style (icon · text · outlined) and text — served live from Studio, with per-page overrides.
- **Feedback and states.** 👍 / 👎 on answers, an "Honest decline" pill, a typing indicator, clear error bubbles, a bounded answer budget.
- **Lazy image tier.** The screenshot helper loads only on the first diagnostic question with images on.
- **Silent by default.** No console noise in the host product; a debug attribute turns logging on.

---

## 3. AI Agent mode

Everything Copilot does, plus it can carry out one of your recorded workflows in the customer's own session — only workflows you recorded, approved and separately switched on, and only after that user agrees to that run. Never a default: you accept terms to turn it on.

### Turning it on

- **Workspace mode switch.** Copilot ↔ AI Agent under "How your assistant works"; switchable both ways, instantly.
- **Versioned terms acceptance.** Choosing AI Agent opens the terms; your accept is recorded — who, when, which version — and enforced on the server on every later attempt.
- **Per-workflow "may run" switch**, on top of approval. Flipping it on compiles the execution plan and judges eligibility on the spot.
- **Eligibility verdict in plain words.** A step with no recoverable element, an embedded frame, a navigation off your site, an unsupported action or a navigation into a specific record — it tells you why it will not run this one. File-upload steps become the user's own step.
- **Fails closed on reprocess.** A re-recording that no longer compiles clean parks the switch for review; it is never silently re-enabled.

### A run

- **The offer.** "Run it for me" on positional answers about a runnable workflow, or conversationally ("just do it for me"). Workflows that cannot run are simply never offered — absence, not refusal — so your configuration never leaks.
- **The consent sheet.** What will run, where it starts, your own description, values already picked up from the conversation, what it will still ask, and which steps stop for confirmation or are the user's own. Consent is a button, never free text.
- **Deterministic hands.** No model call per step: resolve the recorded element → act → verify → next. The model deliberates only at the boundaries — offer, input, deviation, done.
- **Narrated as it goes.** Every action is reported in the chat; a compact run card shows progress; "Stop Auto Run" is on screen the whole time — one button, one meaning.
- **Inputs asked one at a time.** A missing value is asked in the chat and the reply is the value. It is never stored, never sent with the next question, never logged.
- **Sensitive fields: point-and-type.** Passwords, card numbers and anything inside an embedded frame are typed by the user into your app's own field. The value never enters FlowBuddy.
- **Confirms before anything commits.** Submit, delete and payment steps pause for a typed confirm, every time.
- **Verifies every outcome** against your recorded evidence: the expected route, the next step appearing, element state, and what appeared on your screen when the step succeeded. A rejection that appeared since the act beats any completion evidence.
- **Hands back, never guesses.** An act the page ignored hands that one step to the user in guided posture, then the run resumes. An element it cannot find safe-stops in place with Retry · Stop.
- **Navigation is an action.** Clicks the recorded link first, or navigates directly to routes that are safe to start cold. Tried once, then it waits — a login wall resumes the run by itself when the user arrives.
- **Survives the navigations it causes.** Run state lives in the tab; on the new page the plan is re-fetched, and a retired or changed workflow ends the run quietly.
- **One workflow per run.** Chaining a goal across several workflows is the goal layer's remaining scope ([§8](#8-the-road-ahead)).

### Audit and control

- **Consent pinned to the exact plan.** Content-hashed: if the plan changed since consent, start refuses rather than running different steps.
- **Every run recorded.** The consent moment, the plan version, per-step outcomes, which inputs were filled from which source (never the values), and the outcome — completed, aborted or safe stop.
- **Agent runs in Analytics.** Recent runs and outcomes, with safe-stops surfaced as an alarm rather than a statistic.
- **Kill switches without a deploy.** Put the workspace back to Copilot; turn off running for one workflow; un-approve it entirely.

---

## 4. Going live

One paste and it is live for every user. Everything about how the assistant looks and what it may do is changed in Studio, never in the snippet.

### The embed

- **One snippet.** A script tag carrying the API address and your public key, a copy button, and a paste checklist: open your base template → paste before the closing body tag → allow your origin → deploy and reload → Recheck.
- **A public key you can rotate.** Safe in page source; regenerate any time.
- **Origin allowlist.** Only the sites you list may run your assistant — enforced on the server per request; Studio is always allowed.
- **Rate limiting** per key, with separate buckets per route; question length capped.
- **Embed detection.** Studio shows whether the snippet has been seen live, and from which origin.
- **A real preview.** The tester in Studio is the real widget, in a preview mode that never pollutes analytics.

### Appearance

- **Live-served branding.** Brand colour, header title, greeting, launcher position, launcher style (icon · text · outlined) and launcher text — saved in Studio and served to every embed on its next page load. No re-paste.

### Grounding and trust

- **Answer only from approved workflows** — locked on.
- **Cite the workflow used** — on or off. Presentation only: your analytics keep the citation either way.

### How your assistant works

- **Operating mode.** Copilot, or AI Agent behind the terms acceptance.
- **Advanced switches.** Enable Sense (in-context help) · Show me (highlight) · Guided walkthrough · Enable Reason (diagnostic answers) · Include page image, with the disclosure snippet · Include typed values · Enable demo videos. The switch is the whole rule: on fires on every positional answer, off never does.

---

## 5. Studio

The builder console — the only place a human drives the system: connect the recorder, watch a recording become workflows, approve, embed, and read what your users asked.

### Pages

- **Home.** An onboarding checklist — install the recorder → record your product → approve workflows → embed the copilot — with "How FlowBuddy works" and "How to record" guides. Once live: copilot health, pending approvals, and "record this next".
- **Recordings.** Every capture with its status, thumbnails and the derived description; a detail page with replay, transcript, notices (a degraded build, a lost edit), rename, delete, reprocess and Reorganize.
- **Knowledge Base.** Workflows as the assistant sees them — title, description, steps with screenshots and a highlight lightbox — with the approve toggle, the AI Agent card (run switch, eligibility, run summary), duplicate warnings folded into one box, the Product knowledge section with its pending updates and its own Approve All, the "Replaced" view, and Video/SOP and Analytics tabs on each workflow.
- **Copilot.** Everything in [§4](#4-going-live), with the live preview.
- **Analytics.** [§6](#6-analytics-and-the-feedback-loop).
- **Settings.** Account and workspace details, recorder connection.
- **Connect.** The page that pairs the extension.

### Accounts and access

- **Self-serve signup.** Email and password; one workspace per user, created automatically.
- **Email verification and password reset.** Single-use, time-limited links; enumeration-safe.
- **Sign-in protection.** Failed-attempt limits per account and per address; caps on email sending.
- **Privacy policy page.**

### Conventions

- **Every action toasts.** Success and error feedback on every server-mutating action.
- **Every screen has its states.** Explicit empty, loading and error states; responsive with a mobile nav; the indigo design system throughout.

---

## 6. Analytics and the feedback loop

Every question, thumbs-down and honest decline tells you what to record next. The product improves by being used.

- **Answered vs declined.** A daily series over recent periods, plus all-time totals.
- **Helpful %**, from 👍 / 👎.
- **Coverage gaps — "Record this next".** Every decline becomes an open gap (one per distinct question); resolve it once you have recorded.
- **Top workflows by citations.** Which workflows answer most, counted per question rather than per step.
- **Step friction.** Where users get stuck, from Sense outcomes.
- **Question log.** Every question, newest first; search by text or by page path; filter all / answered / declined / 👍 / 👎; an all-time range; every view linkable.
- **How answers were produced.** Engine share, how often the loop needed more than one look, how often it searched or opened a workflow, tokens per question with the cached and reasoning shares — and the fallback engine shown as an alarm.
- **Agent runs.** Recent consented runs with outcomes; safe-stops as an alarm.
- **Walkthrough runs.** Auto versus manual advancement and completed / aborted / stalled, recorded per run.

---

## 7. Security, privacy and trust

Most of these are structural — enforced by where code can reach, not by a prompt asking nicely.

- **Grounded-only, structurally.** Retrieval only ever returns approved, live rows, and every surface reaches it through the same single answer path.
- **One liveness column.** Retired means gone from every reader at once: answers, the sense plan, walkthroughs, the agent's own tools, run offers.
- **Masked at capture, scrubbed on the server.** Sensitive fields masked in your browser; structured PII scrubbed from everything the assistant reads; placeholders never echoed. Screenshot pixels are not redacted — the known gap that blocks any public portal.
- **Sensing, not surveillance.** Page checks only at send time, only against approved workflows; only booleans and one masked error line leave the page. Walkthrough observation is session-scoped and ships only run analytics.
- **Run inputs never stored.** Chat-supplied values are excluded from storage, the wire and logs by allowlist; sensitive values never enter FlowBuddy at all.
- **A public key by design.** Works only on allowlisted origins, rate-limited, rotatable. The operating mode is re-checked on the server for every call and fails closed; a non-acting workspace cannot even see the acting routes.
- **Workspace isolation.** Every query scoped to the workspace; feedback writes scoped too.
- **Consent you can audit.** Acceptance rows for the mode; consent pinned to a plan hash; a run row per consented run.
- **Founder kill switches.** Un-approve a workflow; stop it running; switch the workspace back to Copilot; turn off diagnostics or on-page abilities — all instant, no deploy.
- **What is stored about end users.** Questions are PII-scrubbed on write; answer text is deliberately not stored.
- **Cost guards.** Per-call timeouts, output caps, question length, rate limits.

---

## 8. The road ahead

Directions, not status — each has its own doc, and the roadmap says where each one stands.

- **A public help portal and articles.** A help article is an approved workflow, displayed: per-audience approval, a presentation overlay, type-a-topic articles, a public site with search. Blocked on screenshot redaction. → [`portal.md`](../build/portal.md)
- **Third-party agent access.** The approved knowledge base exported for outside agents — an agents audience on the approval model, a remote MCP server, a workflow manual, tools registered by the widget. → [`interop.md`](../build/interop.md)
- **The company agent.** Record the tools you *use*; FlowBuddy's own browser agent runs only recorded, approved workflows. → [`company-agent.md`](../build/company-agent.md)
- **Self-validation.** Replaying the evidence layer against a customer sandbox to catch drift before users do; production safe-stops already provide the first half of that signal. → [`execution-contracts.md`](../build/execution-contracts.md) and the roadmap's Phase 3
- **The goal layer.** A remembered goal per conversation, parameter capture from what the user said, chaining one goal across several workflows, and the parked idea of proactive help. → [`agent.md`](../build/agent.md)
- **More ways to record.** Narration-only capture and video upload, slotting into the same knowledge base. → [`architecture.md`](architecture.md)
- **Documents and SOPs.** Workflows exported as clean step-by-step documents for training and operations. → [`landing-page.md`](landing-page.md)
- **The business machinery a paid launch needs.** Usage metering, a founder-set spending cap, billing, team seats.
