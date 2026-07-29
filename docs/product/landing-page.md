# FlowBuddy — Landing Page (ideas, positioning & structure)

> The working doc for the **flowbuddyai.com** marketing landing page: the story to tell, the page structure, and the open decisions. **Current state:** a minimal "coming soon + sign in" card is live; the full marketing page is to build.

- **Where it lives:** `packages/landing` (static site → `flowbuddy-landing` Render service, apex `flowbuddyai.com` + `www`). Build = copy `public/` → `dist/`. It ships on a `main` push like the rest of prod; there is no separate staging URL for it. Deploy mechanics: [`deploy.md`](../ops/deploy.md) §4. Brand tokens/components: [`design_system/`](../design_system/README.md).
- **Companion docs:** product narrative → [`product.md`](product.md) · the phases the page describes → [`roadmap.md`](../roadmap.md) · competitive framing → [`competitive-claude-chrome.md`](competitive-claude-chrome.md).

---

## 1. What the page has to say

The story is **one knowledge base, four consumers** — the copilot (built), the help portal (Version
2), third-party AI agents (Phase 6), and documents/SOPs. The product framing behind it is
[`product.md`](product.md); the consumer roadmap is [`roadmap.md`](../roadmap.md). Not repeated here,
because this doc is about the *page*, not the product.

**The positioning question is still open:** "make your product AI-agent-ready" is the direction being
explored, but **copilot-first stays canonical** until that's deliberately changed. The marketing ladder
— lead with the copilot because it exists, and let the other three consumers be the reason to believe
— is the part of this that is genuinely a landing-page decision rather than a product one.

---

## 3. Page structure (proposed sections)

1. **Hero** — H1 (positioning, above) + subhead carrying the grounding promise + "Get started free" (signup is open) + a visual of the copilot answering with a citation.
2. **What FlowBuddy is** — one plain declarative paragraph (deliberate GEO bait — generative engines quote pages that define the product in declarative sentences).
3. **How it works** — the 4-step loop: Record (PII masked in-browser) → Approve (one click per workflow) → Embed (one script tag; origin allowlist, rotatable key) → Answer (grounded, cited, honest declines). Benefit + safeguard paired at each step.
4. **One KB, three consumers** — Part 2 as the differentiator section (copilot · portal · agents).
5. **It knows where your user is** — Sense · Reason · Walkthrough (the moat vs. a generic RAG bot).
6. **Grounded or silent** — the anti-hallucination story: answers only from approved recordings; declines become "record this next."
7. **The feedback loop** — declines + questions + "where users get stuck" tell the founder what to record next.
8. **Live demo** — dogfood the real widget on the page (see open decisions).
9. **FAQ** — objection-shaped Q&As (best on-page GEO/SEO asset; later gets FAQPage structured data).
10. **Final CTA** + minimal footer.

Deliberately out (for now): fake logos/testimonials, a pricing table (no billing yet — "free during early access" instead), Autopilot beyond a one-line roadmap tease.

---

## 4. Open decisions

1. **Hero slogan** — pick from §2 (or a variant).
2. **Whisper the Phase-6 future on the page, or keep the agent story to our own copilot for now?**
3. **Live demo** — embed the real prod widget answering from a FlowBuddy-about-FlowBuddy KB (strongest proof; needs recording FlowBuddy itself + allowlisting `flowbuddyai.com`), vs. a static mock conversation, vs. no demo.
4. **Visuals** — hybrid (widget/copilot recreated in HTML on the design tokens + a couple of real Studio screenshots) vs. all real screenshots vs. all HTML recreations.
5. **Optional sections** — FAQ (recommended), a problem/agitation section, a roadmap teaser, an early-access/pricing note.
6. **Topic 2 — not yet started: the SEO/GEO-friendly tech stack** for building the page (the second half of the original two-part landing-page discussion).

---

## 5. Current state & constraints

- The live page is the minimal **coming-soon + sign-in card** ([`packages/landing/public/index.html`](../../packages/landing/public/index.html)) on the design-system tokens — a placeholder built to launch first and market later.
- Static host, so any build that outputs to `packages/landing/dist` works — plain HTML today, or a real build step if the stack decision (§4.6) calls for one.
- It only exists in the **prod** blueprint (no dev/staging landing service), so preview is local and it goes live on the next `main` deploy.
- Self-contained brand assets should follow [`design_system/`](../design_system/README.md) (indigo, Plus Jakarta Sans + JetBrains Mono, the "F" mark).
