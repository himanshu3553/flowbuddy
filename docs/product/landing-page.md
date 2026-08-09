# FlowBuddy — Landing Page (positioning & structure)

> The working doc for the **flowbuddyai.com** marketing landing page: the positioning decision, the page structure as built, and what remains open. **Current state:** the full marketing page is live at [flowbuddyai.com](https://flowbuddyai.com) (`packages/landing`, Astro static build).

- **Deploy mechanics:** [`deploy.md`](../ops/deploy.md) §4 — prod-only static service, no staging URL, preview is local.
- **Companion docs:** product narrative → [`product.md`](product.md) · the phases the page describes → [`roadmap.md`](../roadmap.md) · competitive framing → [`competitive-claude-chrome.md`](competitive-claude-chrome.md) · brand tokens & voice → [`design_system/`](../design_system/README.md).

---

## 1. Positioning — two versions, sequenced

The old "copilot-first vs. agent-ready" fork is resolved: **both, in order.**

- **Version 1 (the live page):** *the in-app, context-aware AI assistant for your SaaS.* The hero stacks the positioning ("In-App / Context-Aware / AI Assistant / for your SaaS", with "AI Assistant" as the gradient-shimmer focal line); the promise line is "Record your product walkthrough once with our chrome extension and FlowBuddy automatically learns about your product to power an AI assistant for your users," with "Go live in 30 minutes · No credit card required" pinned at the bottom of the first viewport. Outcomes: in-app assistance · faster onboarding · higher activation · fewer support tickets. Context-awareness (it knows which page the user is on) leads because it is the moat a generic RAG chatbot can't claim.
- **Version 2 (the future positioning):** *make your product AI-agent ready — the AI interface layer for SaaS.* Lives today only as a placeholder page at **`/future`** ("one knowledge base, many consumers": assistant live · portal coming · agent access in development · documents planned). It is promoted to the hero when Phase 6 ships — whether it has is [`roadmap.md`](../roadmap.md) §12's to say, never this page's.
- **Copy guardrail:** third-party agent access is presented as *direction*, never as available, until Phase 6 ships. The rule is the phase's own ([`interop.md`](../build/interop.md) states it; the roadmap says whether it still binds), and the `/future` page is written inside it.
- **Scope of address:** version 1 deliberately says "your SaaS product" (that's the buyer). The "your product / your web app, never your SaaS" rule applies to the *version-2* positioning, whose scope is any web app.

---

## 2. Page structure (as built)

1. **Hero** — the version-1 positioning + an HTML recreation of the assistant answering in context (typed question → streamed answer → nav spotlight, looping with a hold between runs). Design-system rule: product recreated in HTML on the tokens, never a fake photo; every animated mock ships its finished state as the markup, so no-JS / reduced-motion / crawlers get the complete visual.
2. **How it works** — Record → Approve → Go live, each step pairing benefit + safeguard (in-browser masking, approval boundary, overlay-only embed). It sits directly under the hero: the objection the page must clear first is "what would this cost me to set up", not "what can it do".
3. **One knowledge base** — the product as a diagram: a single card states that one recording builds the knowledge base, and six consumers are fed by it (three live, three carrying a muted "Coming soon" pill), each carrying its own HTML product mock. **The three live consumers ARE the capability tiers** — heading, copy, checklist and the animated mock that plays once on scroll — folded in here when a standalone Capabilities section would have repeated them verbatim directly below. Its `#capabilities` anchor was repointed rather than dropped, since the nav, the footer and the "See it in action" fallback all aimed at it. The unbuilt three are drawn in **greyscale**, which is what stops a mock reading as a shipped screen — the visual has to carry the same "not available yet" claim the pill does, or the picture quietly contradicts the label. On desktop it is a **scroll sequence**: the build half starts level with the first consumer — both column labels on one line — then pins at the vertical centre as you scroll, while the consumers arrive one at a time along a rail that fills behind them. The KB is the fixed thing on screen and the uses are what move, which is the argument the section exists to make. One consumer owns the viewport at a time, with the next just breaking the fold; the slot height and the reveal threshold are a matched pair, and the source comments own both numbers. Below `lg` it stacks and the reveal still runs. It is the homepage's compressed version of `/future`'s argument and links there rather than restating it; `/future` remains the place that argues the version-2 positioning at length.
4. **Benefits** — the four outcome tiles from §1.
5. **Sign-up block** — copy is provisional; the final content is an open decision.
6. **FAQ** — objection-shaped Q&As, mirrored into `FAQPage` structured data. One entry cross-links `/future`; the section ends in a link to the full set.
7. **Footer** (+ `/future` under "The road ahead").

Sections **alternate white and paper**, and the band belongs to the position rather than to the section — reordering two sections means swapping their grounds too, or two paper bands end up adjacent and the seam between them becomes a doubled border across an unbroken grey block. "One knowledge base" is the one section that sits **outside** that alternation, on a brand-tinted ground: inserting a seventh section into a strict two-ground rhythm would have forced every band below it to flip, and the tint doubles as the marker that this is the page's centrepiece.

**Top nav carries only the two section links** (how it works · capabilities), in page order. The FAQ is reachable from the footer and from the end of the homepage FAQ section — a nav link to a page that mostly restates the homepage earns less than the space it costs.

**`/faq` — the full question set.** A second page carrying the search-shaped questions grouped into six categories (about · how it works · setup · accuracy & privacy · business impact · agents), each group an accordion, with its own `FAQPage` structured data. It is the AEO surface: written for the phrasings people and generative engines actually search, which is why it says **"FlowBuddy AI"** throughout — the phrasing the header and footer wordmarks now carry too. The homepage FAQ stays short and objection-shaped and links here; the two sets are written in different registers on purpose and are not generated from each other.

**Deliberately out:** fake logos/testimonials · a pricing table ("free during early access" instead) · a standalone "what FlowBuddy is" prose section (cut when the structure was tightened to six sections). The pricing decision reaches `/faq` too — it carries **no pricing Q&A**, because a pricing answer that says nothing invites the objection it cannot close.

**The demo is the page itself:** the real widget embeds as the landing page's own overlay (FlowBuddy answering questions about FlowBuddy) — no demo section. The embed renders only when the build provides the landing widget key (names & defaults: `.env.example`), so the page never blocks on the dogfood KB existing.

**SEO/GEO on-page:** canonical + OG/Twitter meta with a branded `og.png` card, JSON-LD (`Organization` + `SoftwareApplication` + `FAQPage`), `robots.txt` (explicit allow-groups for the named AI/LLM crawlers), `llms.txt` (the declarative product summary for generative engines), `sitemap.xml` with lastmod, a noindexed 404 page, declarative meta descriptions.

**The machine-readable surfaces sit inside §1's copy guardrail too, and are the easiest place to breach it.** `SoftwareApplication.featureList` and `llms.txt` are read as claims of what exists, by engines that will repeat them without the page's hedging around them — so only shipped capabilities belong in `featureList`, and anything unbuilt is named in `llms.txt` explicitly as in development. The pull is real: the section these describe lists three live consumers beside three that do not exist yet, and the tempting summary flattens all six.

---

## 3. Open items

1. **Sign-up block (section 5) final copy** — placeholder-quality copy shipped; the founder decides the real content.
2. **Live-widget dogfood prerequisites:** record + approve a FlowBuddy-on-FlowBuddy KB in Studio, allowlist `flowbuddyai.com`, and set the widget key on the Render landing service.
3. **The brand name is half-migrated.** The visible wordmarks (header, footer) and `/faq` say **"FlowBuddy AI"**; the identity strings say **"FlowBuddy"** — `Organization.name`, `SoftwareApplication.name`, `og:site_name`, the `© 2026` line, and `llms.txt` throughout. Those are what search engines, link previews and generative engines treat as the entity's name, so the split is worth resolving deliberately rather than one surface at a time. The copyright line is a separate question again: it names a legal entity, not a wordmark.
4. **Off-page SEO/GEO** (content, articles, listings, Search Console/Bing submission) — untouched; a separate work stream.
5. **The capability story predates acting.** The three live consumers in §2's knowledge-base section end at guided walkthroughs. Whether version-1 positioning claims the acting mode — and with what caveat, given it is opt-in behind a terms acceptance and never a default — is open ([`roadmap.md`](../roadmap.md) for what has shipped). **Until it is decided, `/faq` holds the line the rest of the page holds:** what is sold is guided, and having the assistant carry out steps itself is described as *in development* and always deliberately switched on — the same guardrail `/future` is written inside. Deciding this means editing both surfaces together.
