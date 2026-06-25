# Sync — Product (What it is, who it's for, why copilot-first)

> **One-liner:** Add a trustworthy AI help **copilot** to your SaaS in minutes — record your product once, approve the workflows it's allowed to use, drop in one `<script>`, and your customers get in-app answers grounded **only** in what you approved. (The same recordings also produce a help portal + articles, as decoupled by-products.)

> **Core loop:** Record once → Knowledge Base → **approve workflows for the copilot** → embedded copilot answers in-context (with citations + honest declines) → feedback loop tells you what to record next.

- **Status:** v0.2 — **copilot-first** (supersedes the original portal-first framing)
- **Last updated:** 2026-06-25 · **Branch:** `copilot`
- **Companion docs:** technical model → [`architecture.md`](architecture.md) · versions/phases/modules + status → [`roadmap.md`](roadmap.md) · Phase 1 build/spec/as-built → [`phase-1-copilot.md`](phase-1-copilot.md) · Phase 2 by-products → [`phase-2-portal.md`](phase-2-portal.md) · local dev → [`dev-setup.md`](dev-setup.md)

---

## 1. What Sync does (plain English)

Most help tools make you write articles, then hope customers find them. Sync flips that around:

1. You **show** Sync how your product works — once, by recording yourself using it and narrating.
2. Sync **learns** it and turns it into a structured Knowledge Base.
3. You **approve** which workflows the copilot may use.
4. Your customers get an **in-app assistant** that answers their questions instantly — grounded in what you actually showed it, **never made-up** — with sources, honest "I don't know yet" on gaps, and awareness of the screen they're on.

The result: your customers get help the moment they need it, without leaving your app — and without you writing a help center from scratch.

**What your customers experience:** a clean in-app chat that gives **instant, accurate answers** to "how do I…" questions based only on what you recorded and approved; **shows its sources**; is **honest when it doesn't know** (no confident-sounding wrong answers); **knows where they are** (tailors answers to the current screen); and **remembers the conversation** (natural follow-ups).

**What you stay in control of:** approve before anything goes live; choose which of your sites may run the copilot (origin allowlist); a one-click public key you can rotate; and **sensitive data is masked before it ever leaves your browser** while recording.

**Also included (bonus):** the same recordings can produce **help articles** (clean, step-by-step, with screenshots) and a **public help page** — but the in-app copilot is the star of the show.

---

## 2. The problem

Every SaaS product needs to help its users *in the moment they're stuck* — and the usual options all fall short:

- **Writing documentation is slow and manual.** Most small-to-mid SaaS teams have no technical writer; docs fall to founders/engineers who hate it, so they rarely get done well.
- **Products change faster than docs.** A new feature or redesign makes help articles wrong overnight. Stale docs are *worse* than none.
- **AI support chatbots are only as good as their knowledge base.** Generic bots either hallucinate or are bolted onto a knowledge base nobody had time to build — so they're untrustworthy, and one confidently-wrong answer destroys confidence in all of them.
- **Generic assistants don't know where the user is.** A bot that answers "how do I do X" in the abstract is far less useful than one that knows you're on step 3 of the billing flow *right now*.
- **A help center is the wrong first deliverable.** Customers in-app want the answer where they are, not a portal to go search.

**Net result:** support teams drown in repetitive tickets, customers can't self-serve in-context, and the knowledge to fix it lives only in the founders' heads. **The wedge:** an in-app copilot a SaaS can add in minutes — grounded only in what the team recorded and approved.

---

## 3. Who it's for

Sync has **two audiences** over one shared knowledge base: **the buyer/builder** (installs Sync, wants to deflect tickets without writing docs) and **the end-user** (their customer, inside their product, wants an accurate answer right now).

**Initial segment: Small SaaS / founders.** Founder-led or small eng team, no dedicated technical writer.

### Primary persona — "Founder Fiona"
- Solo or small team (2–15 people), early-stage B2B SaaS.
- Knows the product cold but has zero time and hates writing docs.
- Feels the pain as repetitive support tickets eating into build time.
- Won't adopt anything that takes more than an afternoon to set up or needs ongoing manual upkeep.

### What this segment demands (design constraints)
- **Self-serve, near-zero-effort onboarding** — sign up → install extension → record → **approve workflows → paste one snippet → live copilot** in under an hour.
- **Fast, visible time-to-value** — a working in-app copilot from a single recording session, *before* any article is written.
- **Trust by default** — answers only from human-approved knowledge, **cites its source**, and **declines honestly** when it doesn't know. PII is masked before anything leaves the browser.
- **"AI drafts, founder approves in one click"** — approving a workflow for the copilot is a single click, not authoring a full article.
- **Low entry price**, expansion via usage (copilot resolutions, articles, validation runs).

**Not the initial focus:** large enterprise docs teams, dedicated CX orgs with existing tooling, non-SaaS products. Revisit mid-market once the copilot wedge is proven.

---

## 4. How it works (solution overview)

A SaaS builder installs a **Chrome extension** and records themselves using their own product — clicking through real workflows while narrating *what* they're doing and *why*. One session can cover many workflows ("reset a password… now upgrade a plan…").

Sync captures that session in **multiple synchronized layers** (screen, voice, DOM, interaction events, routes) and builds an **explicit, structured Knowledge Base**. The builder **approves** which workflows the copilot may use — one click each — and drops a **single `<script>`** into their product. Their customers immediately get an **in-app copilot** that answers from the approved knowledge, in context, with citations.

That knowledge base powers, in priority order:

1. **An embedded in-app copilot (primary)** — answers from **approved-KB** in context, cites the workflow it used, declines honestly on gaps.
2. **A published help portal + articles (by-product)** — human-readable, searchable articles, curated from the same recordings. A *decoupled* publish target, revisited after the copilot ships.
3. **Self-validation (moat, later)** — periodically re-checks that documented steps still work and flags drift.

> The technical model (capture → KB → consumers, the data model, decisions) lives in [`architecture.md`](architecture.md). The phase/module plan and status live in [`roadmap.md`](roadmap.md).

---

## 5. Direction & locked decisions (copilot-first)

> **The 2026-06-22 pivot, in one paragraph.** Sync's primary product is the **embeddable in-app copilot**; the help portal and human-facing articles are **decoupled by-products** revisited after the copilot ships. This is a **re-prioritization, not a rebuild** — the expensive, defensible foundation (capture → Knowledge Base → retrieval/grounding) is exactly what a copilot needs and already existed. The pivot mostly **adds a delivery layer**.

**Locked decisions (2026-06-22):**

1. **Copilot is the primary product; portal/articles are by-products.** Ship the copilot first; revisit the by-products later.
2. **Decouple copilot and portal into two independent publish targets.** Different audiences (in-app **authenticated end-users** vs. **public/SEO** readers) and potentially different visibility — some knowledge is answered in-copilot but never SEO-published, and vice-versa. Decoupling is *better*, not just lighter.
3. **Separate the *substrate* from the *trust gate*:**
   - **Substrate = the Knowledge Base.** The copilot retrieves and reasons over `KnowledgeItem`s (steps with selectors/routes/expected-outcomes), **not** published articles. This is what enables context-aware and (later) actionable answers, and it's the substrate Phase-3 freshness depends on. Articles are prose/lossy and can't do where-you-are awareness.
   - **Trust gate = a lightweight per-workflow "approve for copilot" flag (approved-KB).** Preserves the "no-leak / human-in-the-loop" intent — the copilot answers only from human-approved knowledge — but approval is **one click on a workflow**, *not* authoring a full article.
   - **Mental model:** `ONE raw KB → per-target approval/visibility → { Copilot, Portal }`.
4. **Grounding Stage A = copilot grounds on approved-KB only.** This is what's built (inside Phase 1).
5. **Grounding Stage B = "also prefer/cite a published Article when one exists" — DEFERRED.** Not built; revisited later. *(These grounding "Stages" sit within Phase 1 — distinct from the product Phases 1/2/3.)*

**Guardrails:**
- **Decoupled, always** — the copilot path must never *require* article authoring or portal publish; approving a workflow and publishing an article are independent actions over the same KB.
- **No-leak preserved** — the copilot answers **only** from approved-KB; never raw/un-approved items, never draft articles.
- **Don't build grounding Stage B** until explicitly revisited.
- **By-products are frozen, not deleted** — they keep working; investment pauses until the copilot is out. *(The standalone public-portal app was removed for the Phase-1 clean slate and returns in Phase 2 — see [`phase-2-portal.md`](phase-2-portal.md).)*

---

## 6. Product principles — what's commodity vs. moat

- **Commodity (table stakes; won't win on alone):** "record a screen flow → auto-generate a step-by-step doc." Scribe, Tango, Guidde, Supademo, Arcade already do versions of this, and generic LLMs are closing the gap.
- **Moats (the actual product):**
  1. **Grounded, context-aware copilot** — an in-app assistant grounded **only** in the customer's own approved recordings (never the model's general knowledge), that answers *for the screen the user is on* and **cites its source**. The KB's richness (selectors/routes/expected-outcomes, not lossy prose) is what makes context-awareness and future actionability possible.
  2. **Self-validation / freshness** — knowledge that re-checks itself and flags drift. Hardest to copy; directly answers "products change faster than docs." (Also the namesake: keeping the KB *in sync* with the product.)
  3. **The compounding feedback loop** — copilot questions, thumbs, and honest declines tell the founder exactly what to record next. The product improves with use.

**Grounded authorship (core principle).** Everything the copilot says, and every AI-written article, is synthesized *only* from the customer's own recorded sessions. If nothing was recorded (and approved) on a topic, the copilot **declines and flags a coverage gap** instead of inventing an answer. This is the trust differentiator vs. generic AI assistants, and it keeps the KB self-validatable.

**Operating principle:** treat capture + synthesis as quality we must achieve; treat **the copilot + freshness + feedback loop** as the things we differentiate and charge for.

---

## 7. The four surfaces

Sync ships as **four distinct surfaces** over one shared structured knowledge base. The **copilot is the headline**; the portal is a decoupled by-product.

| Surface | Who | Purpose |
|---|---|---|
| **Sync Recorder** (Chrome extension) | the builder | effortless multi-layer capture of narrated product workflows |
| **Studio** (web app) | the builder | review the KB, **approve for the copilot**, configure the copilot + see analytics; (by-product) author/publish articles |
| **In-App Copilot** (embeddable widget) ⭐ | the builder's customers | grounded, in-context answers inside the builder's product |
| **Help Portal** (public web) — *Phase 2 by-product* | the builder's customers | browse + search published help articles |

- **Recorder** — one-click "Connect with Sync"; start/stop; **mark new workflow**; **event/DOM-primary** capture (event + DOM + hi-res screenshot + post-action snapshot for `expected_outcome` + continuous audio); **PII masked before upload**; **capture reliability** (survives navigations, retry on upload failure, narration preserved). *(V1 capture is workflow-only; narration-only + video are Version 2.)*
- **Studio** — the **approval gate**, **copilot settings** (public key, embed snippet, origin allowlist, rotate), **copilot analytics** (questions, answered %, 👍/👎, coverage gaps), the KB browser, and the by-product article editor + curated generation.
- **Copilot widget ⭐** — one `<script>` renders a shadow-DOM launcher + chat panel; grounded in **approved-KB**; **cites its source**; **honest declines**; **context-aware** (biases to the host route); multi-turn; 👍/👎 feedback; embed security (public key + origin allowlist + rate limit). *Future:* "show me" actionability and human handoff.
- **Help Portal (Phase 2)** — published structured articles (steps + screenshots + element highlights), hybrid search, theming/custom domains/SEO/gating/"was this helpful?". **Decoupled** from the copilot.

> Full surface detail: Phase 1 surfaces in [`phase-1-copilot.md`](phase-1-copilot.md); Phase 2 portal/authoring in [`phase-2-portal.md`](phase-2-portal.md).

---

## 8. Hard problems & risks

- **Capture quality is the foundation** — copilot answer quality *is* capture quality. Highest-priority engineering (→ capture reliability).
- **Grounding strictness** — tuning the decline threshold (honest vs. uselessly cautious) is the core quality knob. Confidently-wrong answers are the trust-killer.
- **PII in answers** — approved-KB may still contain captured PII; client masking is the first line, a server backstop is the real protection before external beta.
- **Embed security & cost** — public key + origin allowlist + rate limiting; per-workspace LLM ceilings for an end-user-facing surface; anonymous session model.
- **Context mapping** — mapping host routes to captured routes when paths differ (params/hashes); privacy of host-sent context.
- **Citation UX without leaking structure** — Stage A has no articles to link, so a citation points to the workflow/step.
- **Hard-to-capture apps** — canvas-heavy (Figma-like) and infinite-scroll SPAs resist DOM capture; iframes are constrained.
- **Selector robustness** — obfuscated class names break brittle selectors; mitigate with multi-signal + visual matching (matters most for Phase 3).
- **Self-validation reliability** — sandbox replay (auth/MFA, robustness) is the riskiest bet; the user-provided sandbox adds onboarding friction. Prototype early.
- **Cold start / coverage gaps** — one recording leaves holes; the feedback loop fills them, so build it sooner than feels necessary.

---

## 9. Success metrics

- **Activation:** % of new signups who **embed a working copilot** from their first session; time-to-first-embedded-copilot.
- **Answer quality:** % of copilot answers grounded with a citation; honest-decline rate on uncovered questions (no hallucinations); 👍 rate.
- **Deflection (the ROI story):** % of copilot conversations resolved without human handoff; estimated tickets/$ deflected.
- **Loop health:** coverage gaps surfaced ("record this next") → new recordings created.
- **By-product (Phase 2):** portal searches/views; % of articles published.
- **Freshness (Phase 3):** % of knowledge validated "current"; mean time from product change → drift flagged.

---

## 10. Open questions

1. **Browser scope:** Chrome-only at launch, or Chromium-family (Edge/Brave) early?
2. **Pricing axes:** *(deferred)* which usage meter is primary — copilot resolutions, published articles, or validation runs?
3. **Copilot hosting/UI:** pure `<script>` widget (shipped) vs. also offering a headless API/SDK for custom UIs?
4. **End-user identity:** anonymous vs. host-authenticated sessions; how much host-provided context to trust.
5. ~~**Validation environment.**~~ **Resolved (2026-06-18):** customer-provisioned sandbox; validation runs only there, so full replay is safe.
6. ~~**Authoring beyond recording.**~~ **Resolved (2026-06-18): record-first; all AI output grounded in recordings** — copilot answers + AI articles draw only from the recorded corpus and decline + flag a gap when uncovered; a human-only `manual static` lane covers no-workflow content.
7. **Data residency / compliance** posture to sell to slightly-larger SaaS later (SOC 2 timing)?
