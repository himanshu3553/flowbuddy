# FlowBuddy — Landing Page (positioning & structure)

> The working doc for the **flowbuddyai.com** marketing landing page: the positioning decision, the page structure as built, and what remains open. **Current state:** the full marketing page is live at [flowbuddyai.com](https://flowbuddyai.com) (`packages/landing`, Astro static build).

- **Deploy mechanics:** [`deploy.md`](../ops/deploy.md) §4 — prod-only static service, no staging URL, preview is local.
- **Companion docs:** product narrative → [`product.md`](product.md) · the phases the page describes → [`roadmap.md`](../roadmap.md) · competitive framing → [`competitive-claude-chrome.md`](competitive-claude-chrome.md) · brand tokens & voice → [`design_system/`](../design_system/README.md).

---

## 1. Positioning — two versions, sequenced

The old "copilot-first vs. agent-ready" fork is resolved: **both, in order.**

- **Version 1 (the live page):** *the in-app, context-aware AI assistant for your SaaS.* The hero stacks the positioning ("In-App / Context-Aware / AI Assistant / for your SaaS", with "AI Assistant" as the gradient-shimmer focal line); the promise line is "Show FlowBuddy your product once and let it help your users by giving the right answers at the right moment," with "Go live in 30 minutes · No credit card required" pinned at the bottom of the first viewport. Outcomes: in-app assistance · faster onboarding · higher activation · fewer support tickets. Context-awareness (it knows which page the user is on) leads because it is the moat a generic RAG chatbot can't claim.
- **Version 2 (the future positioning):** *make your product AI-agent ready — the AI interface layer for SaaS.* Lives today only as a placeholder page at **`/future`** ("one knowledge base, many consumers": assistant live · portal coming · agent access in development · documents planned). It is promoted to the hero when Phase 6 ships — whether it has is [`roadmap.md`](../roadmap.md) §12's to say, never this page's.
- **Copy guardrail:** third-party agent access is presented as *direction*, never as available, until Phase 6 ships. The rule is the phase's own ([`interop.md`](../build/interop.md) states it; the roadmap says whether it still binds), and the `/future` page is written inside it.
- **Scope of address:** version 1 deliberately says "your SaaS product" (that's the buyer). The "your product / your web app, never your SaaS" rule applies to the *version-2* positioning, whose scope is any web app.

---

## 2. Page structure (as built)

1. **Hero** — the version-1 positioning + an HTML recreation of the assistant answering in context (typed question → streamed answer → nav spotlight, looping with a hold between runs). Design-system rule: product recreated in HTML on the tokens, never a fake photo; every animated mock ships its finished state as the markup, so no-JS / reduced-motion / crawlers get the complete visual.
2. **Capabilities** — the three shipped capability tiers as full text-left/visual-right rows, each with an animated product mock that plays once on scroll: conversational help · showing/highlighting the next step when a user is stuck · end-to-end interactive task walkthroughs.
3. **How it works** — Record → Approve → Ready → Go live, each step pairing benefit + safeguard (in-browser masking, approval boundary, overlay-only embed).
4. **Benefits** — the four outcome tiles from §1.
5. **Sign-up block** — copy is provisional; the final content is an open decision.
6. **FAQ** — objection-shaped Q&As, mirrored into `FAQPage` structured data. One entry cross-links `/future`.
7. **Footer** (+ `/future` under "The road ahead").

**Deliberately out:** fake logos/testimonials · a pricing table ("free during early access" instead) · a standalone "what FlowBuddy is" prose section (cut when the structure was tightened to six sections).

**The demo is the page itself:** the real widget embeds as the landing page's own overlay (FlowBuddy answering questions about FlowBuddy) — no demo section. The embed renders only when the build provides the landing widget key (names & defaults: `.env.example`), so the page never blocks on the dogfood KB existing.

**SEO/GEO on-page:** canonical + OG/Twitter meta with a branded `og.png` card, JSON-LD (`Organization` + `SoftwareApplication` + `FAQPage`), `robots.txt` (explicit allow-groups for the named AI/LLM crawlers), `llms.txt` (the declarative product summary for generative engines), `sitemap.xml` with lastmod, a noindexed 404 page, declarative meta descriptions.

---

## 3. Open items

1. **Sign-up block (section 5) final copy** — placeholder-quality copy shipped; the founder decides the real content.
2. **Live-widget dogfood prerequisites:** record + approve a FlowBuddy-on-FlowBuddy KB in Studio, allowlist `flowbuddyai.com`, and set the widget key on the Render landing service.
3. **Off-page SEO/GEO** (content, articles, listings, Search Console/Bing submission) — untouched; a separate work stream.
4. **The capability story predates acting.** §2's three tiers end at guided walkthroughs. Whether version-1 positioning claims the acting mode — and with what caveat, given it is opt-in behind a terms acceptance and never a default — is open ([`roadmap.md`](../roadmap.md) for what has shipped).
