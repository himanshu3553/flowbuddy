# FlowBuddy — Landing Page (ideas, positioning & structure)

> The working doc for the **flowbuddyai.com** marketing landing page: the story to tell, the page structure, and the open decisions. **Current state:** a minimal "coming soon + sign in" card is live; the full marketing page is to build.

- **Where it lives:** `packages/landing` (static site → `flowbuddy-landing` Render service, apex `flowbuddyai.com` + `www`). Build = copy `public/` → `dist/`. It ships on a `main` push like the rest of prod; there is no separate staging URL for it. Deploy mechanics: [`deploy.md`](deploy.md) §4. Brand tokens/components: [`design_system/`](design_system/README.md).
- **Companion docs:** product narrative → [`product.md`](product.md) · the phases the page describes → [`roadmap.md`](roadmap.md) · competitive framing → [`competitive-claude-chrome.md`](competitive-claude-chrome.md).

---

## 1. The core story — one asset, many consumers

FlowBuddy is **two halves joined by one Knowledge Base**. This is the spine of the whole page: you build the KB once, and everything else is a consumer of it.

```
PART 1 — the factory                      PART 2 — the consumers
record once (Chrome extension)            ┌─ 2.1  FlowBuddy's own AI agent (the copilot)   ✅ live
   → automated workflow Knowledge Base ──►├─ 2.2  Help portal for humans                    (Version 2)
   (distilled steps + locators +          └─ 2.3  Knowledge base for third-party AI agents  (Phase 6)
    routes + expected outcomes)
```

The mental model FlowBuddy is built on: **`ONE approved KB → per-audience approval → { copilot · portal · agents }`**. The hard, defensible half is Part 1; Part 2 is where the KB is spent.

---

### Part 1 — Record once → the workflow Knowledge Base (the USP)

**The pitch:** you don't hand-write documentation workflow by workflow. You **record your product once** with the Chrome extension — click through real tasks while narrating — and FlowBuddy automatically turns that into a structured **Knowledge Base of workflows**: clean, outcome-oriented, step-by-step, and machine-grade.

What makes the KB more than a screen recording (and why it powers everything downstream):

- Each distilled step carries `{ instruction, detail, route, narration, screenshotFile, bbox, keyEventId }`.
- Every captured element carries **R13 ranked, multi-signal locators** (`{strategy, value, unique}`), uniqueness-verified at capture — the thing an agent needs to *operate* a UI reliably instead of guessing.
- Steps carry **routes** and **expected-outcome markers** (`post_action`) — so consumers can navigate and verify.
- A per-workflow **approval gate** is the trust boundary: nothing is answerable/exportable until the founder approves it.

The value line: **minutes of recording your own product replaces weeks of writing agent- and human-readable documentation.** And it's product-agnostic — any web app with task workflows (SaaS, fintech/neobanks, internal tools), not only SaaS.

*Refs:* [`phase-1-copilot.md`](phase-1-copilot.md) (capture → KB → approval, the four surfaces, the data model) · [`kb-step-distillation.md`](kb-step-distillation.md) (raw events → clean steps) · [`extension-releases.md`](extension-releases.md) (the recorder, live on the Chrome Web Store).

---

### Part 2 — The consumers

One approved KB, three consumers (plus a noted fourth). Each is a different audience over the same substrate.

#### 2.1 Consumer 1 — FlowBuddy's own AI agent (the copilot) ✅ live

The embeddable in-app copilot: one `<script>` and the founder's customers get grounded, in-context help. This is the **buyable-today proof** that the KB works. What it already does:

- **Answers** grounded **only** in approved workflows — with citations, and honest "I don't know yet" declines instead of hallucinations.
- **Sense** — knows *which workflow and which step* the user is on and answers **positionally** ("you're on step 3 of X — here's how to get unstuck, then the path to done").
- **Reason** — diagnoses *why* the user is stuck ("why is this button disabled?") by comparing their live page state against the founder's own recording of that step working.
- **Guided walkthrough (P4-M0)** — highlights each step in the user's live app on request.
- Founder controls: live-served appearance, origin allowlist, rotatable public key, per-workspace toggles; PII masked in the browser before anything leaves.

*Refs:* [`phase-1-copilot.md`](phase-1-copilot.md) (the copilot, embed, widget) · [`phase-2-sense.md`](phase-2-sense.md) (Sense + Reason) · [`phase-4-autopilot.md`](phase-4-autopilot.md) (P4-M0 walkthrough; acting Autopilot to come) · [`phase-5-converse.md`](phase-5-converse.md) (the Tell → Guide → Do goal agent, drafted).

**The ladder the page can tell honestly:** **Answers** (shipped) → **Guides** (shipped: show-me + walkthrough) → **Acts** (coming: Autopilot). Two of three rungs are live, so the trajectory is real, not vapor.

#### 2.2 Consumer 2 — Help portal for humans (Version 2)

The same approved recordings also render a **public, searchable help center** — because *a help article is an approved workflow, rendered*. The worker already distills each workflow into a title + clean steps + one curated screenshot per step, so the portal renders exactly that (with a render-time presentation overlay and per-audience approval). Decoupled from the copilot — approving for the copilot and publishing to the portal are independent actions over the same KB.

*Refs:* [`v2-portal.md`](v2-portal.md) (the portal track, modules V2·P0…P6 — to build in Version 2).

#### 2.3 Consumer 3 — Knowledge base for third-party AI agents (Phase 6, direction)

The category play: expose the approved KB so **outside** AI agents — browser-use agents, **Claude for Chrome**, **Browserbase**-class runners, a company's own agent fleet, custom automations — can **operate the customer's product reliably instead of improvising over pixels**. One recording session makes a web app **AI-agent compatible**.

- **The safety inversion:** generic browser agents improvise (with published prompt-injection attack rates to show for it); FlowBuddy-fed agents follow **only the workflows the founder recorded and approved**. The approval gate becomes the permission model for the agent era.
- **How the KB is exposed (transport recommended, not locked):** one two-layer export → **remote MCP server** (per-workspace endpoint; `find_workflow` over hybrid retrieval — the lead) · **markdown / `llms.txt`** (a near-free rider) · **WebMCP registered by the widget** (the fleet-wide prepared bet — the widget is already on every customer page) · bespoke REST skipped. Recorded input values stay masked; screenshots gated by PII Cut 2.

⚠️ **Page-copy guardrail:** this is a **direction, not shipped** — the page may present the KB as *agent-ready* (true today about the artifact) but must **not** present third-party agent access as *available* until Phase 6 ships.

*Refs:* [`phase-6-interop.md`](phase-6-interop.md) (feasibility, the two-layer export, transports, WebMCP analysis) · [`competitive-claude-chrome.md`](competitive-claude-chrome.md) (the improvising-agent contrast; "your user's agent vs your product's agent").

#### 2.4 (Noted idea) Consumer 4 — exported documents / SOPs

A fourth renderer over approved workflows: **downloadable step-by-step documents / SOPs** (e.g. PDF). Standalone record→PDF is a commodity zone (Scribe/Tango/Guidde) — good as a checkbox feature or lead-gen hook, not a headline. Its bigger form is the **buyer-side flip**: any company records the tools/processes *it uses* and gets both human SOPs and an agent-operable KB — captured as **Version 3 (the company agent)**.

*Refs:* [`v3-company-agent.md`](v3-company-agent.md) (buyer-side track: record the tools you use + FlowBuddy's own grounded browser-agent extension).

---

## 2. Positioning & messaging (under discussion — not locked)

The debate we've had, recorded so the page copy can resolve it:

- **The reframe:** "AI support copilot for SaaS" is a crowded 2024-era category with a weak narrative. **"Make your product AI-ready / AI-agent compatible"** is a near-empty category (docs-to-MCP tools like Mintlify exist; recorded-UI-workflows-to-agent-KB does not) and rides the biggest current anxiety — agents operating apps. It's also the stronger GEO/SEO play.
- **Recommended shape (not yet locked):** **hero = the category claim** (record once → an AI-ready workflow KB, in an afternoon), **the shipped copilot = the buyable proof** (deflects tickets today), the page arc = the **Answers → Guides → Acts** ladder. Ticket deflection demotes from headline to evidence. The key asymmetry: the agent wave *powers* the KB story and *erodes* a plain support-widget, and FlowBuddy owns both surfaces — so headline the one with the wave behind it. It's reversible (the KB serves both framings), so it's a low-regret bet.
- **Still canonical until a lock:** the product docs remain **copilot-first** ([`product.md`](product.md) §5); this repositioning is a landing-page direction, not a decided product-wide change.
- **Scope of address:** copy says "your product" / "your web app," never "your SaaS"; name the classes once (SaaS · fintech · internal tools) so the internal-tools reader recognizes themselves.
- **Slogan candidates:** "Make your product AI-ready. In one afternoon." · "Record your product once. It becomes AI-ready knowledge." · "Turn your product's workflows into AI-agent-ready knowledge — answers today, actions next." · "The fastest way to make your web app work with AI agents."

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

- The live page is the minimal **coming-soon + sign-in card** ([`packages/landing/public/index.html`](../packages/landing/public/index.html)) on the design-system tokens — a placeholder built to launch first and market later.
- Static host, so any build that outputs to `packages/landing/dist` works — plain HTML today, or a real build step if the stack decision (§4.6) calls for one.
- It only exists in the **prod** blueprint (no dev/staging landing service), so preview is local and it goes live on the next `main` deploy.
- Self-contained brand assets should follow [`design_system/`](design_system/README.md) (indigo, Plus Jakarta Sans + JetBrains Mono, the "F" mark).
