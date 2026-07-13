# Sync — Phase 2 · P2-M5: Reason (diagnostic reasoning)

> **Sense tells the copilot *where* the user is — Reason lets it figure out *why they're stuck*.** When an end-user asks a diagnostic question ("why can't I proceed?", "why is this button disabled?", "what's wrong here?"), Reason captures a **structured reading of the live page state**, pairs it with the founder's own recording of what that step looked like *when it worked*, and lets a stronger model **reason over expected-vs-actual** to diagnose the blocker — generically, on any standards-built SaaS. Roadmap: [`roadmap.md`](roadmap.md) §3.

- **Status:** ✅ **BUILT + USER-VERIFIED E2E 2026-07-13** (verified on a real external test app: intent/blocked triggers, expected-vs-actual diagnosis, multi-blocker completeness, formatted answers). All §5 decisions implemented as locked; as-built map + hardening + deploy checklist in §8. (Design locked 2026-07-09.)
- **Companion docs:** Sense (the substrate Reason escalates from) → [`phase-2-sense.md`](phase-2-sense.md) · roadmap → [`roadmap.md`](roadmap.md) · Autopilot (inherits Reason's agent loop) → [`phase-4-autopilot.md`](phase-4-autopilot.md)
- **The trust story in one line — evidence-grounded diagnosis.** Product facts still come **only** from the approved KB; Reason adds a second legitimate grounding substrate — **measured page state** — for explaining the user's *current situation*. It reasons about what it can measure; it still never invents product facts, and it still declines when neither substrate covers the question.

---

## 1. The gap it closes

Sense's probe ships **yes/no facts** (found / visible / filled / disabled + one masked error snippet). That answers *"where am I and what's next"* — but not *"why is Create Account disabled?"*: the probe saw `email: filled` and had no way to see *filled with something that isn't a valid email*, nor to read the password-requirements checklist sitting on the page. A general assistant handed a screenshot answers this easily; a copilot fed booleans cannot. **Reason widens the evidence channel and adds the reasoning loop** — the enumeration of hand-built evidence extractors stops; general reasoning over general page state takes over.

**Why Sync wins this game:** every generic bot can at best see the user's page. Only Sync also has **the founder's recording of the same step succeeding** — screenshot + captured state. Expected-vs-actual comparison is the moat move: *"When this step works, the button is enabled after a valid form; on your screen the email fails format validation and 3 of 4 password rules are unmet."*

---

## 2. Decided so far (locked 2026-07-09)

| # | Decision |
|---|---|
| Name & slot | **P2-M5 · "Reason"**, dedicated doc (this file). Sense locates → Reason diagnoses → (Phase 4) Autopilot acts. |
| Genericity | **Web standards only** — every signal must be derivable on any standards-built SaaS (validity API, ARIA roles/states, DOM properties). Nothing app-specific, ever. |
| Capture posture | **End-user-silent** (user decision) — no per-incident consent friction. Recommended guardrails ride along: **founder-level Studio toggle**, **input-value masking by default**, and a ready-made **disclosure snippet** for the founder's privacy policy (the session-replay precedent: FullStory/LogRocket operate exactly this way — site owner opts in and carries disclosure). |
| Capture scope | **Ask-time-scoped, always** — a snapshot when the user asks, never a running tape. No continuous recording of end-users, in any mode. |
| Technical reality | A true pixel screenshot **cannot** be captured silently (browsers force a picker for screen capture) → silent capture = **DOM-derived** (structured snapshot; optionally an html2canvas-class render). For form/state questions, structured DOM state is *more* informative than pixels — `disabled`/`invalid`/`checked` are explicit rather than inferred from colors. |
| Supersedes | The old "opt-in fuzzy-fingerprint fallback" question (phase-2-sense.md §2.1) is **retired** — Reason subsumes it. |
| Capture form | **LOCKED 2026-07-09: structure + rendered image from day one** (user decision, over the structure-only recommendation). The DOM-to-canvas renderer is **lazy-loaded** on the first diagnostic question (never in the base bundle); masking happens on a **cloned DOM before render**; cross-origin taint failures degrade to structure-only; v1 ships both together on trigger (an agent-requested on-demand image is a later optimization). |

---

## 3. The reasoning input package (locked)

Ordered by value per token. ✅ = already available from Phase 1/Sense.

| # | Data point | What it gives the reasoner | Status |
|---|---|---|---|
| 1 | Question + conversation history | Intent, follow-up chain | ✅ |
| 2 | Sense localization (workflow, current step, done-evidence, confidence) | Anchors everything | ✅ |
| 3 | **The full localized workflow** — all steps, in order, with instructions | The complete recipe (today only the retrieval shortlist ships) | extend |
| 4 | **Structured page-state snapshot** — every interactive element with role / accessible name / `disabled` / `checked` / `expanded`; every field with `filled` / `valid` + **failed-constraint name** (`typeMismatch`, `tooShort`, `patternMismatch`, `valueMissing`); visible labels, hints, requirement/error text; reading order | The core new channel — what a screenshot shows, as explicit machine state, on any standards-built app | new (reuses the recorder's DOM sanitizer) |
| 5 | Field values — **masked by default, everywhere (locked §5.4)**; founder-controlled unmasking; password/card/SSN hard-floored | Rarely needed ("filled but invalid" usually suffices) | new |
| 6 | **The founder's expected state from the KB — BOTH artifacts** (refined 2026-07-13): the step **screenshot** (a true pixel photo) *and* the step's captured **DOM snapshot** (data) | **The differentiator:** expected-vs-actual diagnosis no generic bot can do. The DOM half enables a **data-vs-data diff** (founder's DOM then vs. user's structured snapshot now) so the structure-only default gets true expected-vs-actual too — pixels aren't required for it; the photo half pairs with #7 for the visual diff where the image tier is enabled | ✅ both stored — feed both |
| 7 | DOM-rendered image (html2canvas-class) | Pixels for what structure can't express (canvas-heavy apps, visual confusion, low-semantics UIs) | new · **day-one (locked §2)** — lazy-loaded, clone-masked, taint-tolerant |
| 8 | Environment — route, title, viewport | Disambiguation | ✅ |

**Stays out, deliberately:** continuous event recording (see §2 — ask-time snapshots only), cookies/storage/network, anything cross-origin the browser hides from page scripts anyway.

### 3.1 The rendered image — honest value analysis (noted 2026-07-13)

Kept on record so the day-one decision (§5.1) carries its reasoning:

- **Where the image earns its place:** (a) **low-semantics apps** — bare-`<div>` UIs with no roles/labels produce muddy structure, but still *render* correctly; vision reads what the DOM never said (the image's strongest case — the fallback when the structure channel is weak); (b) **layout/occlusion bugs** — structure says "button enabled", pixels reveal "covered by a cookie banner / off-screen / white-on-white"; (c) **color-only state** — green-✓/grey-✗ checklists and red borders with nothing mirrored in text/ARIA; (d) **spatial "where is X?" questions** — the image lets the model answer "top-right, next to Share"; (e) **the picture-vs-picture synergy** — the founder's expected-state step screenshot (#6) is an image regardless, so adding the user's image turns expected-vs-actual from an awkward picture-vs-text comparison into a natural visual diff. *(e) is the one benefit that applies to every app, not just the odd ones — the primary reason day-one build was kept.*
- **Where it adds ~nothing:** standards-built forms — the dominant case in the target segment. `filled/INVALID (typeMismatch)` + hint text + `DISABLED` in the structure already carry the full diagnosis; the clone-masked image just repeats it (with dots where values were) at vision-token prices.
- **The canvas caveat:** DOM-to-canvas renderers frequently **cannot** reproduce `<canvas>`/WebGL content (taint rules, blank read-backs) — a canvas-heavy app often renders as a blank rectangle. Canvas apps are **not** the image tier's win; a true screenshot would capture them but cannot be taken silently (§2). Do not oversell this case.
- **The numbers (estimate, to revisit against real failure logs):** ~80–90% of diagnostic questions on form/CRUD SaaS are fully answered by structure alone; the image is decisive in ~5–15% (cases a–d) and upgrades the expected-vs-actual comparison everywhere (e).
- **Why the locked combination stands:** *built day one, per-workspace default OFF* (§5.3) — the capability exists for the workspaces that need it, the picture-vs-picture diff is available wherever founders enable it, and nobody pays vision cost silently.
- **Why paint at all (2026-07-13, user asked):** the image is derived from the DOM, but *deriving it means executing the browser's layout/stacking math* — which is exactly what data can't cheaply express. Answering "is anything covering this button?" from raw data requires z-index/stacking-context resolution (the renderer's job; unreliable for an LLM over style tables), while the painted image resolves occlusion for free; and shipping the full recipe instead (entire DOM + computed styles) costs 10–100× the tokens of the ~1–2k-token image. **Pixels are the cheapest correct encoding of "what the user actually sees"** — data-vs-data remains the primary channel for state facts (the default-ON path), painting exists only for the visual class (occlusion, appearance-borne semantics, the photo diff).
- **Fidelity note (2026-07-13) — the image is a RECONSTRUCTION, not a photograph.** The widget re-paints the DOM onto a canvas (a drawing of the page), so vs. a true screenshot it loses: canvas/WebGL content (blank), cross-origin images/video (blank/skipped), fancy CSS (approximated), native control chrome (re-drawn); **plain DOM UI — forms, buttons, text, layout, overlays — reconstructs well**, which is exactly what diagnosis needs, and the structured snapshot carries the hard facts regardless. **Asymmetry:** the founder's expected-state screenshot is a TRUE pixel screenshot (extension privilege, `captureVisibleTab`); the user's actual-state image is a reconstruction → **build rule: the expected-vs-actual prompt must diff CONTENT/STATE, never pixel styling** (colors/fonts legitimately differ). True end-user pixels have exactly one route — the `getDisplayMedia` consent picker — available later as an opt-in "share your screen" escalation tier without touching the silent design.

### 3.2 What capture looks like to the end-user (confirmed 2026-07-13)

- **Zero explicit action.** The user's only act is asking their question. If it trips the selective trigger (§5.2) *and* the founder has the relevant toggles on, the widget's JavaScript — already running in the page — walks the DOM and (image tier) renders the masked clone to a canvas. **No browser permission prompt appears** — that's inherent to DOM-derived capture; the prompting API (`getDisplayMedia`) is exactly what this design avoids (§2).
- **No visible indication.** Nothing flashes, no icon, no widget notice — per the locked end-user-silent posture (§2). The end-user learns of it only through the **founder's privacy policy** (the disclosure snippet we ship).
- **Honest edges:** the capture is *silent, not hidden* — a technical user can see the payload leave in DevTools' network tab, like any web traffic; and on very heavy pages the DOM-render can cost a brief CPU spike (the render budget in §6 exists to keep it imperceptible).

---

## 4. The loop (locked shape)

- **Fast path (unchanged — Sense):** probe → hypotheses → positional answer. Pennies, ~2s, handles "how do I X / what's next / I'm stuck on an error".
- **Reasoning path (new):** fires **selectively (locked §5.2)** — on diagnostic intent, on fast-path failure, or on a blocked page state; clearly-diagnostic questions go straight here. The widget captures the §3 package at ask time; the server assembles it and runs a **stronger model** in a small **agentic loop with read-tools** — *inspect this element's subtree · fetch the founder's step screenshot · request the rendered image* — pulling detail on demand instead of front-loading everything. Then: evidence-grounded diagnosis + the fix path.
- **Grounding doctrine:** product facts from the KB only; state explanations from measured/captured evidence only; decline when neither covers. Page-derived text is fenced as untrusted data (the Sense `<page-error>` pattern, generalized).
- **The arc:** this read-tool agent loop is the skeleton **Phase 4 inherits** — same loop, act-verbs added later, after Phase 3's validation gate.

---

## 5. Build decisions (ALL LOCKED 2026-07-09)

| # | Decision | Outcome | Status |
|---|---|---|---|
| 1 | **Capture form** | ✅ **LOCKED 2026-07-09: structure + rendered image from day one** (lazy-loaded renderer · clone-masking · taint fallback to structure-only) | ✅ |
| 2 | **Trigger** | ✅ **LOCKED 2026-07-09: SELECTIVE** — fires on diagnostic intent ("why / can't / stuck / not working") OR fast-path failure (decline / low confidence) OR a blocked page state (current step's target disabled); clearly-diagnostic questions skip the fast path (no double latency). Simple questions stay on the fast path. ("Always reason" can become a founder setting later — same plumbing, different gate.) | ✅ |
| 3 | **Founder toggle default** | ✅ **LOCKED 2026-07-09: structure ON (masked) · image OFF.** Two Studio switches ("Reason — diagnostic answers", "Include page image"); flipping the image switch surfaces the disclosure snippet — the founder knowingly owns the most sensitive capture. Mirrors the Sense-on/show-me-off ladder. | ✅ |
| 4 | **Field values** | ✅ **LOCKED 2026-07-09: masked by default, everywhere** — structure AND the rendered image (clone-masking), consistently. Founder-controlled unmasking via a Studio control (surfaces disclosure implications). **Hard floors regardless of setting:** password fields never captured in any form; card/SSN patterns (P1-M12) always masked. | ✅ |
| 5 | **Name & doc** | ✅ **LOCKED 2026-07-09:** P2-M5 · "Reason", dedicated doc (this file) | ✅ |

---

## 6. Risks to design for

- **Prompt injection, enlarged** — the structured snapshot puts the page's *visible text* (including user-generated content rendered on it) into model input on every reasoning call. Fence all page-derived strings as data (delimiters + treat-as-data rules), cap sizes, never let them override grounding.
- **Cost on a public endpoint** — the reasoning path is the most expensive thing the product will do per interaction; the trigger policy (§5.2) + per-workspace ceilings bound it. Vision (#7) multiplies it — hence the tiering.
- **Snapshot size/perf** — the capture must be budgeted (element caps, text caps, sanitizer reuse) so a complex page can't jank the host or blow the prompt.
- **Founder-side compliance** — silent capture makes the disclosure snippet + toggle (§2) load-bearing for the founders' own legal posture; ship them together, not as a follow-up.
- **Custom-validation apps** — no HTML5 constraints/ARIA = weaker evidence (disabled flag + hint text only). Honest ceiling; the rendered-image tier is the recourse.

---

## 7. The end-to-end flow — Sense → Reason (plain-language walkthrough, for future reference)

Running example: the founder recorded **"Create an account"** (Start Free → name → email → password → terms → Create Account), approved it; the sense plan is live. A user types "Hey" as their name, "done" as their email, a 5-char password, ticks terms — **Create Account stays disabled**. They open the copilot.

1. **The glance (Sense — built).** On send, the widget checks the page against the sense plan in milliseconds: which workflow, which step, what's filled. Yes/no facts only.
2. **The fork (the trigger, §5.2).** The system routes by the *kind* of question:
   - *"what do I do here?"* → **fast path**: the probe's hypotheses + the question go to the server, where **the answer LLM** (the same engine since Phase 1, now position-aware) writes the positional answer — ~2s, one cheap text-only model call. Most questions end here.
   - *"why is Create Account disabled?"* → diagnostic intent — and the glance itself sees a blocked state (the disabled target). **Reason wakes.**
   - ⚠️ **Both paths are LLM-generated on the server.** The widget/frontend NEVER composes answer text — it only renders UI, probes the page, and ships evidence. "Fast vs Reason" is *cheap single LLM call* vs *stronger model + agentic loop + more evidence*, not "no-AI vs AI". (The only frontend-authored strings: the greeting, error fallbacks, and the show-me highlight rendering.)
3. **The deep read (Reason — silent, ask-time only).** The widget captures the structured page state (`Email — filled, INVALID (typeMismatch)`, the password hint text, `Create Account — DISABLED`; values masked) and, where the founder enabled it, paints the page image. The user does nothing and sees nothing (§3.2).
4. **The comparison.** The server assembles: question + Sense localization + the full workflow recipe + the page reading + **the founder's expected state for that step (true screenshot + DOM snapshot, §3 #6)**. The stronger model diffs expected-vs-actual like a support engineer.
5. **The answer.** *"Create Account activates once the form is valid. Two things are blocking it: your email isn't a valid format, and your password doesn't yet meet the listed requirements — fix those and the button enables."* Show-me highlights the email field if enabled. If the evidence doesn't support a diagnosis → honest decline, never a guess.
6. **The founder's payoff.** The blocked-state moment is logged → Analytics friction signals ("users keep getting stuck at signup") → re-record with a better explanation, or fix the product's own UX.

**One-sentence version:** Sense figures out where you're standing; Reason takes one silent look at your screen the moment you ask "why", compares it with the founder's recording of that step working, and tells you exactly what's blocking you — while simple questions stay on the fast, cheap path.

---

## 8. As-built (2026-07-13 — user-verified E2E same day)

**E2E hardening — six fixes from the first verification rounds (2026-07-13):**
1. **Stale embedded bundle** — the first live test produced generic hedging because the test app serves a **copied** widget file from its own `public/` dir; it was the pre-Reason build, so no capture ever ran (`CopilotQuery.reasonTrigger` all-NULL was the tell). After any widget rebuild, re-copy **both** `sync-copilot.js` **and** `sync-copilot-render.js` into the embedding app.
2. **Misleading `valid: true` on JS-validated fields** — a password field with only `required` passes `checkValidity()` while failing every on-screen rule (React-state validation is invisible to the validity API). The capture now ships `valid` only when it's *false* or the control has real HTML5 constraints (email/url/number/date types, pattern/min/max/step/…); absent = "nothing machine-checkable", and the prompt says never to assume such a field passes the app's rules.
3. **Tag-selector text collection missed `<div>` rows** — requirement checklists are routinely plain divs, which the `h1…/p/li/label` selector never matched. Visible text is now collected by a **text-node TreeWalker** over the scope (markup-agnostic, reading order, control captions skipped, same caps/masking). The met/unmet state of such checklists is still color-only (§3.1 case c) — the prompt now explicitly tells the model to request the page image before concluding when the structured state can't explain a DISABLED action.
4. **Evidence vocabulary leaked into answers** (user-found on the second round: *"marked as INVALID due to a 'valueMissing' error"*) — the engine prompt gained an **answer-style section**: talk like a support agent, translate constraint names to plain words (valueMissing → "is still empty"), never narrate evidence sources, no boilerplate re-instructions or closing summaries.
5. **Multi-blocker under-reporting** — with two blockers (empty field + unticked required box) the model named the first and claimed "everything else looks good". Prompt nudges oscillated at temp 0.2, so completeness is now **structural**: `pageStateBlock` appends a deterministic **"machine-checked blockers" list** (invalid fields · empty required fields · unticked required boxes — computed in code from the snapshot) that the answer MUST cover entry by entry. Verified: both-blocker and password-rules scenarios now answer completely, in plain language.
6. **Inconsistent answer formatting across paths** (user-found) — Reason answers happened to emit numbered bold lists while fast-path answers stayed flat paragraphs. One shared **`ANSWER_FORMAT_RULES`** const (`copilot.ts`, exported) is now appended to BOTH system prompts: numbered lines for multi-action answers, every UI target **bolded**, short paragraphs. The widget renderer was upgraded to match (user-approved 2026-07-13): `mdToHtml` went **block-level** — "1. …" lines render as step rows with an accent-tinted numbered chip (`.sc-step-n`, mono, follows the host accent), "- …" lines as bullet rows, other lines as spaced paragraphs; assistant bubbles switch to `white-space: normal` (user bubbles keep pre-wrap); escape-first safety unchanged, and only this subset renders — headings/tables/links stay banned in the prompts. Verified on both paths.

**Live verification (2026-07-13):** a synthetic widget payload replaying the Chatful-AI signup blocked state (password failing 3 of 4 visual rules, terms checked, button disabled) through the real `/answer` → confident correct diagnosis in ~6s, expected-vs-actual explicitly compared ("in the expected state all criteria are green"), citation + position echo intact — proving trigger routing, payload validation, `buildReasonEvidence`'s R2 artifact reads, and the tool loop end to end.

**The shipped flow:** widget trigger (diagnostic wording OR the localized current step's target disabled; a fast-path decline escalates via a server `escalate: true` handshake + ONE retry with evidence) → ask-time structured snapshot (interactive controls as explicit state + visible labels/hints/errors, reading order, masked, budgeted) ± the lazy clone-masked viewport render → `/answer` routes to `diagnoseFromKB` (stronger model, agentic read-tools) → the SAME answer shape as the fast path, so citations, thumbs, position echo, and show-me all keep working unchanged.

**Where everything lives:**

| Piece | File(s) |
|:---|:---|
| Schema (`Workspace.reasonEnabled` default **ON** · `reasonImageEnabled` default **OFF** · `reasonIncludeValues` default **OFF** · `CopilotQuery.reasonTrigger/reasonImage`) | `db/prisma/schema.prisma`, migration `20260713090000_reason_diagnostic` (**not yet applied anywhere** — run `pnpm db:migrate` locally; Render migrates on next deploy) |
| Trigger + structured snapshot + renderer loader | `widget/src/reason.ts` (`reasonTrigger`: intent regex + blocked-state check off the Sense probe's current-step element; `captureSnapshot`: ≤60 controls / ≤40 texts / capped strings, validity-API failed-constraint names, accessible-name walk, `maskText` reuse, password/card/SSN hard floors; `renderPageImage`: sibling-URL script inject + 4s budget) |
| Image renderer bundle (lazy, never in the base widget) | `widget/src/render-image.ts` → `dist/sync-copilot-render.js` (html2canvas; **viewport-only**, ≤1280px scale, JPEG 0.7; clone-masking incl. text-node PII; ≥8000-element / oversize / taint / timeout → null); `build.mjs` builds both bundles; `web/app/widget/sync-copilot-render.js/route.ts` dev-serves it |
| Widget wiring | `widget/src/index.ts` (`reason`/`reasonImage`/`reasonValues` from `/v1/copilot/config`; capability flag `context.reason.available` on every ask so the server can offer escalation; one escalation retry, never chained; preview skips Reason like Sense) |
| **The engine** | `synthesis/src/reason.ts` `diagnoseFromKB` (grounding doctrine in `REASON_SYSTEM`; ≤4 rounds / ≤4 tool calls; tools `get_expected_screenshot` · `get_expected_dom` · `get_page_image`, offered only when their evidence exists; images attached via a post-tool user message — tool messages are text-only; content/state-not-pixel-styling diff rule per §3.1; strict JSON answer schema shared with the fast path; `senseBlock` reused from `copilot.ts`) |
| API | `api/src/server.ts` — `resolveReasonContext` (type-clamp + de-angle + `redactText` backstop on every page string; the **image is accepted only when the founder's tier is ON, values only when unmasking is ON** — a spoofed widget can't force a posture); `buildReasonEvidence` (full workflow recipe from the approval-checked top hypothesis + `keyEventId`/`screenshotFile` → manifest event → lazy R2 readers for the TRUE step screenshot + captured DOM); reason rate bucket **6/min** on top of the answer bucket (over → silent fast-path degrade); route `bodyLimit` 4 MB for the size-capped image; the `escalate` handshake (decline NOT logged when escalation is offered — the retry logs the real outcome); `reasonTrigger`/`reasonImage` on `CopilotQuery`; `/v1/copilot/config` serves the 3 flags; `copilot-auth.ts` resolves them with the key |
| Studio | Copilot → Settings → **"Reason — diagnostic answers"** (`copilot-workspace.tsx`): Enable Reason (ON) · Include page image (OFF) · Include typed values (OFF), image/values disabled while Reason is off; the copyable **privacy-policy disclosure snippet** renders inside the section (§6 — ships with the toggles, not as a follow-up); success/error toasts; actions in `web/lib/copilot-settings-actions.ts` |

**Build-time decisions (within the locked design):** the fast-path-failure trigger is a two-round-trip handshake (server replies `escalate: true` instead of logging the decline; the widget captures and retries once) — it only fires when the founder's toggle is on AND the widget declared capability, so old widgets keep the plain decline; without Sense localization Reason still runs (snapshot + KB only — the expected-state tools just aren't offered); the renderer URL derives from the widget script's own `src`, so **deploy `sync-copilot-render.js` next to `sync-copilot.js`**; `REASON_MODEL` env picks the stronger model (default = `SYNTH_MODEL` = gpt-4o, vision-capable); coverage-gap logging on a Reason decline matches the fast path.

**Deploy checklist:** apply migration `20260713090000_reason_diagnostic` (local `pnpm db:migrate`; Render on next deploy) · ship `sync-copilot-render.js` beside the widget bundle · optionally set `REASON_MODEL` on sync-api.

---

> **Not in Reason:** acting on the page (Phase 4), continuous session recording (never), sandbox replay/drift (Phase 3), per-incident end-user consent flows (posture is founder-level, §2), and anything app-specific.
