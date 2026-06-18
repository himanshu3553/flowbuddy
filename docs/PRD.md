# Sync — Product Requirements Document

> **One-liner:** Record yourself using your own product once; Sync turns it into a clean, structured knowledge base that powers a help portal and an in-app copilot — and keeps it from going stale by re-checking itself.

> **Core loop:** Record once → knowledge base → help portal + context-aware copilot → kept fresh automatically.

- **Status:** Draft v0.1
- **Last updated:** 2026-06-17
- **Target buyer (initial):** Small SaaS / founders (see [Target User](#2-target-user))

---

## Table of contents

1. [Problem](#1-problem)
2. [Target user](#2-target-user)
3. [Solution overview](#3-solution-overview)
4. [Product principles — what's commodity vs. moat](#4-product-principles--whats-commodity-vs-moat)
5. [User-facing apps (surfaces)](#5-user-facing-apps-surfaces)
6. [Core architecture & data model](#6-core-architecture--data-model)
7. [Phased roadmap](#7-phased-roadmap)
   - [Phase 1 — Wedge: capture → synthesis → editor → portal](#phase-1--wedge-capture--synthesis--editor--portal)
   - [Phase 2 — Differentiator: context-aware in-app copilot](#phase-2--differentiator-context-aware-in-app-copilot)
   - [Phase 3 — Moat: self-validation & drift detection](#phase-3--moat-self-validation--drift-detection)
   - [Cross-cutting (all phases)](#cross-cutting-all-phases)
8. [Hard problems & risks](#8-hard-problems--risks)
9. [Success metrics](#9-success-metrics)
10. [Open questions](#10-open-questions)

---

## 1. Problem

Every SaaS product needs a help section — articles like "How to reset your password" or "How to upgrade your plan." Creating and maintaining that content is painful:

- **Writing documentation is slow and manual.** A technical writer is expensive, and most small-to-mid SaaS teams don't have one. Documentation falls to founders or engineers who hate doing it, so it rarely gets done well.
- **Products change faster than docs.** The moment a product ships a new feature or redesigns a screen, the help articles become wrong. Stale docs are *worse* than none — they mislead customers and create more tickets.
- **AI support chatbots need good content to work.** Everyone wants an assistant that deflects tickets, but those bots are only as good as the knowledge base behind them. Most teams can't produce one good enough.
- **Generic in-app assistants don't know where the user is.** A bot that answers "how do I do X" in the abstract is far less useful than one that knows you're stuck on step 3 of the billing flow *right now*.

**Net result:** support teams drown in repetitive tickets, customers can't self-serve, and the knowledge to fix it lives only in the founders' heads.

---

## 2. Target user

**Initial segment: Small SaaS / founders.** Founder-led or small eng team, no dedicated technical writer, support handled by whoever has time.

### Primary persona — "Founder Fiona"
- Solo or small team (2–15 people), early-stage B2B SaaS.
- Knows the product cold but has zero time and hates writing docs.
- Feels the pain as repetitive support tickets eating into build time.
- Will not adopt anything that takes more than an afternoon to set up or requires ongoing manual upkeep.

### What this segment demands (design constraints)
- **Self-serve, near-zero-effort onboarding.** No sales call, no implementation project. Sign up → install extension → record → live portal in under an hour.
- **Fast, visible time-to-value.** A published portal + working copilot from a single recording session.
- **Low entry price**, expansion via usage (articles, copilot resolutions, validation runs).
- **"AI drafts, founder approves in 5 minutes"** — not "fully magic but subtly wrong," and not "a blank editor."
- **Trust on privacy out of the box** — recording your own product can capture customer data.

### Explicitly *not* the initial focus
Large enterprise docs teams, dedicated CX orgs with existing tooling, non-SaaS products. Revisit mid-market once the wedge is proven.

---

## 3. Solution overview

A SaaS builder installs a **Chrome extension** and records themselves using their own product — clicking through real workflows while narrating *what* they're doing and *why*. One session can cover many workflows ("here's how to reset a password… now here's how to upgrade a plan…").

Sync captures that session in **multiple synchronized layers** (screen, voice, DOM, interaction events, routes) and **synthesizes them into a structured knowledge base** — clean, step-by-step articles, each with screenshots, generated automatically.

That knowledge base then powers everything downstream:

1. **A published help portal** — human-readable, searchable articles for customers.
2. **An embedded in-app copilot** — a chat/assistant inside the SaaS product that knows which screen the customer is on and answers from the KB *in context*.
3. **Self-validation** — Sync periodically re-checks that documented steps still work and flags anything that has drifted out of date.

---

## 4. Product principles — what's commodity vs. moat

Be clear-eyed about where the defensibility is; it drives where we invest.

- **Commodity (table stakes we must nail, but won't win on alone):** "record a screen flow → auto-generate a step-by-step doc." Scribe, Tango, Guidde, Supademo, Arcade already do versions of this, and generic LLMs are closing the gap.
- **Moats (the actual product):**
  1. **Narration-driven synthesis** — we capture the *why* (intent/rationale), not just the clicks. This makes both articles and copilot materially better.
  2. **Self-validation / freshness** — docs that re-check themselves and flag drift. Hardest to copy; directly answers "products change faster than docs." (Also the namesake: keeping docs *in sync* with the product.)
  3. **The compounding feedback loop** — copilot questions and "this didn't help" signals tell the founder exactly what to record next. The product improves with use.

**Grounded authorship (core principle).** Every AI-written article is synthesized *only* from the customer's own recorded sessions — never the model's general knowledge. A text prompt selects the *topic*; the recordings supply the *content*. If nothing was recorded on the topic, the AI declines and flags a coverage gap instead of inventing steps. This is what keeps the KB accurate and self-validatable, and it's a trust differentiator vs. generic AI doc generators.

**Operating principle:** treat capture + synthesis as quality we must achieve; treat **freshness + context copilot + feedback loop** as the things we differentiate and charge for.

---

## 5. User-facing apps (surfaces)

Sync ships as **four distinct surfaces** over one shared structured knowledge base.

### 5.1 Chrome Extension — "the Recorder"
**Who:** the builder (Founder Fiona). **Purpose:** effortless multi-layer capture.

- Start/stop/pause recording of the active tab; mic capture for narration.
- **Capture model (locked 2026-06-18): event/DOM-primary.** The semantic backbone is per-interaction capture — event + DOM snapshot + hi-res screenshot — plus a **post-action snapshot** (after DOM settles / network idle) for the step's `expected_outcome`, **continuous audio** for narration, and an **optional low-fps/low-res context video** as a visual safety net for non-event moments. Events are ground truth; video is a secondary aid, never the source of truth. (See [data model](#6-core-architecture--data-model).)
- Visual recording indicator + a "marker/chapter" hotkey so the user can signal "new workflow starts here."
- Local redaction controls — mask a field before recording; pause for sensitive screens.
- Uploads the session bundle to the platform and links the user to the synthesis result.
- **Phase 2+:** the same extension (or a lightweight companion) can host the embedded copilot widget for the builder's own product during development/testing.

### 5.2 Web App / Dashboard — "the Studio"
**Who:** the builder. **Purpose:** review, edit, organize, publish, and monitor.

- **Synthesis review:** see auto-generated articles from a session; confirm/adjust workflow segmentation (split/merge).
- **Article editor:** edit text, reorder/merge/split steps, retake/re-crop screenshots, one-click redaction, add callouts/warnings, link related articles, set brand voice/tone.
- **Prompt-to-article:** type a topic; the AI assembles a `workflow-backed` article from the **recorded-session corpus** (or flags a coverage gap if nothing was recorded on it). Grounded in recordings only — never general knowledge.
- **Manual static authoring:** hand-write `static` articles for no-workflow content (pricing, policy, FAQs); human-only, marked not self-validatable.
- **Sandbox config:** set the validation sandbox URL + test credentials. *(Phase 3)*
- **KB management:** collections, tags, versioning, draft/published states, search.
- **Portal settings:** theming, custom domain, visibility (public/private), SEO.
- **Copilot settings:** widget appearance, install snippet, scope, escalation/handoff rules. *(Phase 2)*
- **Freshness dashboard:** validation status per article, drift alerts, suggested fixes. *(Phase 3)*
- **Analytics:** article views, copilot questions, deflection, "didn't help," coverage gaps ("record this next").
- **Account:** team members/roles, billing, integrations.

### 5.3 Help Portal — "the public docs site"
**Who:** the builder's *customers*. **Purpose:** browse + search self-serve help.

- Rendered from structured articles: readable steps + screenshots.
- Fast hybrid search (semantic + keyword), collections/categories, deep links to articles/steps.
- Theming + custom domain, SEO/structured data, versioning.
- Public or gated access. Localized variants. *(i18n is cross-cutting.)*
- "Was this helpful?" feedback feeding the loop.

### 5.4 Embedded In-App Copilot — "the widget" *(Phase 2)*
**Who:** the builder's *customers*, inside the builder's product. **Purpose:** context-aware help where the work happens.

- Drop-in JS snippet; chat assistant grounded in the KB.
- **Context-aware:** knows current route/screen + recent actions; retrieval boosted by context.
- **"Show me" mode:** highlight the actual element on the live page / run an interactive walkthrough — not just describe it.
- Graceful **human handoff** carrying full context (page, question, what was tried).
- Emits deflection + gap signals into analytics.

---

## 6. Core architecture & data model

### 6.1 Pipeline (conceptual)

```
Chrome Extension (multi-layer capture)
        │  session bundle: frames + audio + DOM + events + routes (one timeline)
        ▼
Ingestion & processing
        │  transcription, segmentation, screenshot extraction, redaction
        ▼
Multimodal synthesis (transcript = why  +  events = what  +  screenshots = visual)
        ▼
Structured Knowledge Base  ◄── human review/edit in Studio
        │
        ├──► Help Portal (render)
        ├──► In-App Copilot (RAG, context-boosted)      [Phase 2]
        └──► Self-Validation engine (replay + diff)      [Phase 3]
                     │
                     └──► drift alerts + suggested fixes ──► Studio
Analytics / feedback loop spans portal + copilot ──► "record this next"
```

### 6.2 The structured content model (most important early decision)

> ⚠️ **Do NOT store articles as plain markdown blobs.** Store them as structured data. This structure is what makes the portal, copilot, and self-validation all possible. Shipping markdown-only in Phase 1 throws away the structure needed for Phases 2–3.

```
Article {
  id, title, intent, tags[],
  source,              // recording_auto | prompt_grounded | manual | import
  type,                // workflow-backed (self-validatable) | static (not validated)
  routes[],            // URL patterns where this workflow lives
  preconditions[],     // e.g. "must be logged in as admin"
  status,              // draft | published
  steps: Step[]        // populated for workflow-backed; optional for static
}

Step {
  order,
  instruction,         // human-readable action
  rationale,           // the "why" from narration
  screenshot { ref, element_bbox },   // element_bbox -> highlight rectangle on the screenshot
  selector {           // robust, multi-signal — for "show me" + validation
    role, accessible_name, text, css_path
  },
  route,
  expected_outcome     // what should be true after this step
}
```

> **Element highlight (built in Phase 1a):** the captured `element_bbox` (as a fraction of the viewport) is rendered as a rectangle over the step's screenshot in both Studio and the help portal, so each step visibly marks the element that was clicked/typed. A pointer arrow is a possible future enhancement.

The captured **selectors + routes + expected_outcome** are exactly what the [self-validation engine](#phase-3--moat-self-validation--drift-detection) replays later. Design this in Phase 1.

**Authoring model (record-first; all AI content grounded in recordings).** Two AI entry points, both drawing *only* from the recorded-session corpus, plus a human-only lane:

1. **Auto-synthesis (push).** After a recording, Sync auto-segments the session into draft articles.
2. **Prompt-to-article (pull).** The user types a topic ("write an article on how password reset works"); the AI retrieves the relevant span(s) across all recordings and synthesizes an article from that captured data — it can stitch fragments from multiple sessions. If no recording covers the topic, it **declines and raises a coverage gap** ("record this") — it never invents steps.

Both produce **`workflow-backed`** articles (steps + selectors + screenshots → self-validatable).

3. **Manual static (human-only).** For content with genuinely no workflow (pricing, refund policy, conceptual FAQs), a human can hand-write a **`static`** article. The AI does *not* generate these (that would break grounded authorship). Static articles render in the portal and feed the copilot but are **not** self-validated.

The `source` and `type` fields make this explicit so the freshness dashboard only ever claims "current" for content it can actually verify.

---

## 7. Phased roadmap

**Sequencing logic:** **de-risk the core (Phase 0)** → nail the wedge (capture quality + 5-minute edit UX) → add the copilot differentiator → add the freshness moat. Build the structured model, redaction, and feedback loop from day one because later phases depend on them.

### Phase 0 — Discovery / Spike — ✅ DONE (verdict: GO, 2026-06-18)

> 🧪 **Spike spec + outcome:** [`SPIKE.md`](SPIKE.md) — a throwaway test (no login/Studio/multi-tenancy/portal) that **validated the core hypothesis on a real app: capture → KB generation works.** Code is disposable; the capture engine + synthesis prompts carry into Phase 1.

### Phase 1 — Wedge: capture → synthesis → editor → portal

> 📄 **Build spec:** [`phase-1-spec.md`](phase-1-spec.md) — user stories, the capture contract, acceptance criteria, and milestones.
> 🏗️ **Build plan (in progress):** [`phase-1a-plan.md`](phase-1a-plan.md) — the **thin slice** we build first. **Approach:** port the spike's capture engine + synthesis into a fresh **monorepo** (pnpm + Turborepo). **Stack:** Node/TS · Next.js · Postgres · Redis/BullMQ · Auth.js (self-hosted). **Deploy:** Render (Dockerized: api + worker + web + portal + Postgres + Redis) + Cloudflare R2 for blobs — host-agnostic, with `render.yaml` the only Render-specific file.

**Goal:** a founder records one session and gets a live, edited, published help portal in under an hour.

**Surfaces:** Chrome Extension, Studio (review + editor + KB + portal settings), Help Portal.

| Area | Features |
|---|---|
| **Capture (extension)** | **Event/DOM-primary** capture: per-interaction event + DOM snapshot + hi-res screenshot + post-action snapshot (`expected_outcome`); continuous audio; optional low-fps context video; pause/marker hotkey; recording indicator; pre-record redaction; session upload |
| **Processing** | Transcription; **workflow segmentation** (split one session into multiple articles via narration cues + nav boundaries + topic detection); screenshot extraction & cropping to the relevant element; auto PII redaction |
| **Synthesis** | Multimodal generation into the structured model (instruction + rationale + screenshot + selector + expected_outcome per step) |
| **Prompt-to-article** | Searchable index of the recorded-session corpus; topic prompt → retrieve relevant span(s) across recordings → assemble a `workflow-backed` article; **decline + raise coverage gap** when uncovered (no hallucination) |
| **Editor (Studio)** | Confirm/adjust segmentation; edit text; reorder/merge/split steps; retake/re-crop screenshots; one-click redaction; callouts; brand voice; related links; hand-write `static` articles |
| **KB** | Collections, tags, versioning, draft/published, search |
| **Portal** | Render structured articles; hybrid search; theming; custom domain; public/private; SEO; "was this helpful?" |

**Phase 1 success:** time-to-first-published-portal < 1 hour; ≥ 80% of generated steps accepted with only minor edits.

---

### Phase 2 — Differentiator: context-aware in-app copilot

**Goal:** customers get accurate, in-context answers inside the product, deflecting tickets.

**Surfaces:** Embedded Copilot widget + Studio copilot settings/analytics.

| Area | Features |
|---|---|
| **Widget** | Drop-in snippet; chat grounded in KB (RAG over structured content) |
| **Context awareness** | Detect current route/screen + recent actions; boost retrieval by context |
| **"Show me" mode** | Highlight the real element on the live page / run interactive walkthrough |
| **Handoff** | Escalate to human/support with full context; capture transcript |
| **Signals** | Deflection rate, unanswered/low-confidence questions, "didn't help" → analytics |

**Phase 2 success:** measurable ticket deflection; copilot answers grounded with citations to KB articles.

---

### Phase 3 — Moat: self-validation & drift detection

**Goal:** docs re-check themselves and flag/fix drift automatically.

**Surfaces:** Freshness dashboard in Studio (+ alerts).

**Validation environment (decided 2026-06-18):** the **customer provisions and configures a dedicated sandbox** (sandbox base URL + test credentials, configured in Studio). Validation runs **only** against that sandbox — never against production. This removes the destructive-action risk and lets us do full replay safely.

| Area | Features |
|---|---|
| **Sandbox config** | Customer sets sandbox base URL + test credentials in Studio; per-app/per-environment settings; connection health check |
| **Replay engine** | Headless agent replays each workflow in the sandbox using captured selectors + routes + expected_outcome |
| **Validation modes** | **Structural dry-run** (verify route/element/text existence) and **full replay** (execute steps end-to-end) — full replay incl. destructive steps is safe because it runs only in the customer sandbox |
| **Auth** | Log into the sandbox via stored test credentials; handle MFA / session setup |
| **Drift handling** | Flag article stale; localize which step broke; propose a fix; notify owner |
| **Robustness** | Multi-signal selectors + visual matching fallback for React/obfuscated-class apps |
| **Scheduling** | Periodic + on-demand validation; per-article cadence; trigger on demand after a release |

**Phase 3 success:** broken workflows detected before customers report them; founders trust "green = current."

> **De-risk early:** prototype the sandbox replay + auth/MFA + selector-robustness problem during Phase 1–2, even though it ships in Phase 3 — it's the riskiest engineering bet.

> **Adoption caveat (founder segment):** requiring a configured sandbox adds onboarding friction; some small teams may not run one. Mitigate by allowing validation to be enabled per-article later, and by falling back to **structural dry-run against any reachable environment** when no full sandbox is configured.

---

### Cross-cutting (all phases)

| Area | Detail | Build by |
|---|---|---|
| **Structured content model** | Foundation for portal + copilot + validation | Phase 1 |
| **Privacy / PII redaction** | Auto-blur screenshots, scrub transcripts/DOM, dummy-account nudge — a B2B sales gate | Phase 1 |
| **Feedback / analytics loop** | Views, copilot questions, "didn't help," no-result searches, **prompt-to-article misses** → **coverage gaps** ("record this next"), deflection $ ROI | Start Phase 1, deepen Phase 2 |
| **Integrations** | Push to Zendesk/Intercom/Notion; embeddable widget; public API | Phase 2+ |
| **i18n** | Auto-translate structured KB → localized portal + copilot (cheap given structure) | Phase 2+ |
| **Auth / multi-tenancy / billing** | Team roles, usage-based plans (articles, copilot resolutions, validation runs) | Phase 1 baseline |

---

## 8. Hard problems & risks

- **Capture quality is the foundation** — if multi-layer capture/segmentation is weak, everything downstream is garbage. Highest-priority engineering.
- **Messy narration** (rambling, "um") — synthesis must clean aggressively.
- **Hard-to-capture apps** — canvas-heavy (Figma-like) and infinite-scroll SPAs resist DOM capture.
- **Selector robustness** — React/obfuscated class names break brittle selectors; mitigate with multi-signal + visual matching.
- **Self-validation reliability** — replaying workflows in the customer sandbox (auth/MFA, selector robustness) is the riskiest engineering bet; prototype early. The user-provided sandbox removes prod-destructive-action risk but **adds a setup/config step founders must complete** — an adoption-friction risk for this segment.
- **Cold start / coverage gaps** — one recording leaves holes; the analytics loop is what fills them, so build it sooner than feels necessary.

---

## 9. Success metrics

- **Activation:** % of new signups who publish a portal from their first session; time-to-first-published-portal.
- **Synthesis quality:** % of generated steps accepted with only minor edits; edits per article.
- **Engagement:** portal searches/views; copilot questions per active customer.
- **Deflection (the ROI story):** % of copilot conversations resolved without human handoff; estimated tickets/$ deflected.
- **Freshness:** % of articles validated "current"; mean time from product change → drift flagged.
- **Loop health:** coverage gaps surfaced → new recordings created.

---

## 10. Open questions

1. **Browser scope:** Chrome-only at launch, or Chromium-family (Edge/Brave) early?
2. ~~**Validation environment.**~~ **Resolved (2026-06-18):** customer provisions & configures a dedicated **sandbox** (URL + test creds in Studio); validation runs only there, never prod. Full replay is therefore safe. See [Phase 3](#phase-3--moat-self-validation--drift-detection).
3. **Pricing axes:** *(deferred — decide later)* which usage meter is primary — published articles, copilot resolutions, or validation runs?
4. **Copilot hosting:** pure JS snippet vs. also offering an SDK/headless API for custom UIs?
5. ~~**Authoring beyond recording.**~~ **Resolved (2026-06-18): record-first; all AI authorship grounded in recordings.** Two AI entry points — **auto-synthesis** and **prompt-to-article** (text topic → article assembled from the recorded corpus; declines + flags a coverage gap if uncovered, never hallucinates) — both yield self-validatable `workflow-backed` articles. A human-only **manual `static`** lane covers no-workflow content (pricing/policy/FAQ); the AI never writes those — **confirmed kept (2026-06-18)**, clearly marked as not self-validated.
6. **Data residency / compliance** posture needed to sell to slightly-larger SaaS later (SOC 2 timing)?
