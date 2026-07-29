# FlowBuddy — Phase 6: Interop (the open agent interface)

> **Phase 6 opens the approved KB to third-party AI agents.** Phases 1–5 build FlowBuddy's *own* brain and hands over the workflow KB (answer → locate → stay fresh → act → pursue goals). Phase 6 points the same knowledge **outward**: the customer's approved workflows are exposed in an agent-consumable form so that outside agents — Claude-for-Chrome-class browser agents, computer-use agents, a company's internal agent fleet, custom automations — can **operate the customer's product reliably instead of improvising**. One recording session makes a web app **AI-agent compatible**; FlowBuddy becomes the agent-readiness layer for **any web application with task workflows** — SaaS, neobanks/fintech, internal tools.

- **Status:** 📝 **DIRECTION — captured 2026-07-23 · feasibility assessed + transport recommendation drafted 2026-07-24 (§3–§6). Not yet designed, not scheduled.** Transport is **recommended, not locked**: one two-layer export schema (§5), rendered as **remote MCP (v1 lead) + markdown (v1 rider) + WebMCP via the widget (the prepared bet)**; a bespoke REST API is skipped as a product.
- **Phase name is provisional** ("Interop"); rename freely when the phase is designed.
- **Companion docs:** the KB this phase exports → [`architecture.md`](../product/architecture.md) + [`kb-step-distillation.md`](kb-step-distillation.md) · the compiler head start (P2-M0 sense plan) → [`phase-2-sense.md`](phase-2-sense.md) · first-party execution (our own hands) → [`agent.md`](agent.md) · the goal brain → [`agent.md`](agent.md) · freshness/certification → [`roadmap.md`](../roadmap.md) §4 · the improvising-agent contrast → [`competitive-claude-chrome.md`](../product/competitive-claude-chrome.md) · the buyer-side sibling (FlowBuddy's *own* agent) → [`v3-company-agent.md`](v3-company-agent.md)
- **The trust story, opened outward:** answers are grounded in approved knowledge (P1) · actions are grounded in approved workflows (P4) · goals are grounded in both (P5) · **outside agents inherit the same grounding** — they receive only workflows the founder explicitly approved for agent consumption, with recorded input values masked as always. **Approval becomes the permission model for the agent era.**

---

## 1. The direction (what was decided 2026-07-23)

1. **The KB feeds third-party AI agents so they can perform actions in the customer's product.** The same recording session that powers the copilot produces the knowledge an outside agent needs to operate the app: outcome-oriented, "get the task done" step-by-step workflows. Recording is minutes of using your own product — vs. weeks of hand-writing agent documentation — so **anyone can make their web app agent-compatible, fast**.
2. **Transport is decided later** — on whatever proves **best and feasible**. *(2026-07-24: the analysis in §4 produced a recommendation — remote MCP lead · markdown rider · WebMCP prepared bet — awaiting lock.)*
3. **Scope is any web application with workflows, not only SaaS** — neobanks, internal tools, admin panels, marketplaces: wherever a task is completed through a web UI, FlowBuddy can make it operable by agents.

**On the word "training":** the presumed first shape is **serve-time grounding** — agents read the approved workflows (as context, resources, or tools) at the moment they operate the app — not fine-tuning model weights. Literal training on the KB stays an open question (§8), but grounding is the shape everything else in this doc assumes.

---

## 2. Why this phase (the thesis)

1. **The artifact already exists — and it's the hard part.** Distilled steps carry the `DistilledStep` shape ([`distill.ts`](../../packages/synthesis/src/distill.ts)) plus **R13 ranked multi-signal locators** (`{strategy, value, unique}` — built for machine replay) and expected outcomes. That is precisely what an agent needs to act **reliably** instead of improvising over pixels. It has shipped since Phase 1; this phase adds an export, not a new pipeline (§3).
2. **Market timing.** Agents that browse and operate web apps are becoming a default expectation ([`competitive-claude-chrome.md`](../product/competitive-claude-chrome.md)); every product owner will need an "agent-ready" story. Whoever holds the structured workflow KB is positioned to *be* that layer — and the web platform itself is now building the plumbing for it (WebMCP, §4).
3. **The safety inversion.** Free-form browser agents improvise — with published prompt-injection attack-success numbers to show for it. FlowBuddy's model inverts it: **agents follow only the workflows the founder recorded and approved.** The existing per-workflow approval gate generalizes into the permission model outside agents inherit.
4. **One KB, another audience.** Extends the locked mental model unchanged: `ONE raw KB → per-target approval/visibility → { Copilot, Portal (V2), Agents (this phase) }`. No new pipeline, no second source of truth — one more audience flag on the same approval model (exactly how P4's `autopilot` flag and V2's `portal` flag are designed).
5. **It widens the market.** Capture is already product-agnostic. Internal tools may be the strongest early wedge: enterprises pointing their *own* agent fleets at their *own* admin panels need exactly this manual — and internal tools never get documentation written.

---

## 3. Feasibility — assessed 2026-07-24: yes, near-term (in the knowledge-only shape)

**The compiler already exists.** `packages/api/src/sense-plan.ts` (P2-M0) is P6-M0 in embryo: it joins `CopilotApproval` so **only approved workflows are ever compiled** (the no-leak invariant), recovers each step's capture event from the recording manifest (`keyEventId`; legacy `screenshotFile`), and emits per-workflow `{ title, steps[{ index, instruction, route, kind: input|action, locators[] (ranked R13, capped 6), postRoute }] }` — per-workspace cached with a version hash, approval flips visible within a minute. It is probe-shaped today (200-char instructions, route-sharded serving); P6-M0 **generalizes** it (add `detail` + expected-outcome text + workflow goal/preconditions, drop the probe caps) rather than building new machinery.

| Piece | Status |
|---|---|
| Approved-only workflow compiler | ✅ exists — `sense-plan.ts`, to generalize |
| Trust-gate pattern (audience flags on the approval model) | ✅ designed — `autopilot` (P4-M1) and `portal` (V2) are already planned as flags; `agents` is one more value + a workspace opt-in toggle |
| `find_workflow` semantic lookup | ✅ exists — the hybrid keyword+pgvector retrieval seam in `@flowbuddy/synthesis` (`retrieval.ts`), approval-constrained |
| Key auth + rate limiting | ✅ exists — P1-M9 embed-auth patterns (+ `ApiToken`) |
| Public serving | ✅ exists — the Fastify api, live |
| Export schema (what leaves the building) | 🆕 to design — §5 |
| MCP endpoint · markdown renderer · WebMCP registration | 🆕 to build — thin transports over the one compiler |
| Studio opt-in UI + consumption analytics | 🆕 to build — small (the toast convention applies) |

**Verdict: a knowledge-only v1 is weeks-scale, not months** — Phases 1–2 quietly built the hard parts. Execution-as-a-service would be a different animal and stays out (footer).

**Caveats (managed, not blocking):**

1. **The quality bar rises.** A reading human plus our prompt guardrails tolerate an imperfect step; an acting agent turns it into a wrong action. The known recorder gap (full-page-nav form events not captured) costs more once agents consume the KB — it earns a higher fix priority when this phase is scheduled. Mitigation rides the data: **expected outcomes ship in the export** so agents can self-verify every step.
2. **No Phase 3 yet** — exposed workflows can drift silently. Industry-normal for documentation, worse for actors (§7): every export carries `compiled-at` / `last-verified` metadata from day one; Phase 3 later upgrades that to real certification.
3. **Locators serve only DOM-driving consumers.** Pixel-first agents (Claude for Chrome perceives via screenshot+DOM hybrid) use instructions/routes/outcomes, not CSS paths — hence the two-layer format (§5) with the machine layer optional.

**Injection posture (a selling point — state it):** as a context supplier into other people's agents, everything FlowBuddy serves is founder-recorded, founder-approved, value-masked — no raw events, no end-user content, no third-party text. Clean by construction.

---

## 4. Transport analysis — two consumption worlds (assessed 2026-07-24)

The §5 schema is the product; **transports are renderings of one compiler.** The 2026 landscape splits consumers into two worlds, each with a clear winner:

### World A — agents arriving AT the customer's page (browser agents operating the app)

**WebMCP** is the purpose-built emerging standard: a W3C Community Group proposal (Google + Microsoft editors) where **the page itself registers structured JS tools** (the `modelContext` API) that in-browser agents call — the site tells the agent what's possible instead of the agent screenshot-guessing. Status at assessment: accepted into the W3C WebML CG 2025-09 · Chrome 146 early preview 2026-02 · **Chrome 149 origin trial on real production traffic** following Google I/O 2026 (05-21) · **Gemini-in-Chrome support announced** · Firefox committed Q3 2026, Safari expected Q4. Google quotes ~67% fewer errors vs. visual scraping.

**FlowBuddy's structural advantage: the widget is already a `<script>` on every customer page.** It can register knowledge tools — `flowbuddy_find_workflow(task)`, `flowbuddy_get_workflow(id)` — and every customer becomes WebMCP-agent-ready **fleet-wide, with zero new integration**. Knowledge-serving tools match this phase's knowledge-only posture exactly: nothing registered ever acts.

**The sober counterweight:** as of a May-2026 independent audit, **no mainstream agent client calls WebMCP tools yet** ("a standard with everything except users"), and Anthropic — MCP's creator — has been publicly silent on it. → **Treat as the prepared bet:** build flag-gated in the widget; flip when consumer agents arrive (Gemini in Chrome shipping is the tell). Being ready first *is* the "AI-agent compatible" marketing claim.

### World B — agents reached from OUTSIDE the page

**Remote MCP is the de-facto standard today** — where working agent clients actually live: Claude Code / Desktop / claude.ai connectors, Cursor-class IDE agents, custom automations, server-side frameworks (and the Claude surfaces that drive Claude for Chrome). Shape: a **per-workspace MCP endpoint** (Streamable HTTP on the existing api) · bearer-key auth first, OAuth only when claude.ai-class connectors demand it · **expose tools, not resources** (client support for resources is spottier) · **`find_workflow` backed by the hybrid retrieval seam is the differentiator a static file can't match** — the agent asks "how do I upgrade a plan" and gets the one approved workflow, token-cheap and precise. → **v1 lead transport.**

### The rest

- **Markdown (`llms.txt`-style):** 2026 reality — ~10% site adoption; search/answer crawlers largely ignore it; **coding/IDE agents genuinely use it** as a routing layer. A near-free rendering of the same compiler → **v1 rider**: the paste-into-any-agent onboarding path + a GEO surface. Don't lead with it.
- **Bespoke REST API:** skipped as a product — MCP already rides HTTP; revisit only if a major consumer demands raw REST.

*Sources (checked 2026-07-24; re-verify on major agent releases):* [Chrome for Developers — WebMCP origin trial](https://developer.chrome.com/blog/ai-webmcp-origin-trial) · [InfoQ — WebMCP in Chrome origin trials (2026-06)](https://www.infoq.com/news/2026/06/webmcp-web-agent-standard-chrome/) · [The State of WebMCP: July 2026 (Spronta)](https://www.spronta.com/blog/state-of-webmcp-july-2026/) · [Zuplo — What is WebMCP](https://zuplo.com/blog/what-is-webmcp) · [llms.txt honest guide (codersera, 2026-05)](https://codersera.com/blog/llms-txt-complete-guide-2026/) · [State of llms.txt in 2026 (aeo.press)](https://www.aeo.press/ai/the-state-of-llms-txt-in-2026)

---

## 5. The export format — one schema, two layers

| Layer | Contents | Who reads it |
|---|---|---|
| **Instructional (universal)** | workflow title · goal/outcome · preconditions (start route, auth assumed) · steps: instruction + detail · route · **expected outcome** · input-step markers (**"value comes from your principal"** — recorded values are masked, always) · `compiled-at` / `last-verified` | every consumer — pixel agents, LLM context windows, humans |
| **Machine (optional)** | ranked R13 locators per step · post-routes · step kinds (`input`/`action`) | DOM-driving consumers (Playwright-class tooling; Phase-3/4 internals) |

Markdown renders the instructional layer; JSON (MCP tool results, and any future API) carries both. **Screenshots stay out until PII Cut 2** (§8-Q3).

---

## 6. Candidate module sketch (updated 2026-07-24 — still to be designed when the phase is scheduled)

| Module | What it is |
|:---|:---|
| **P6-M0** | **Agent export schema + compiler** — generalize `sense-plan.ts` into the §5 two-layer form (add `detail`, expected outcomes, goal/preconditions, freshness metadata; **recorded values masked, as everywhere**); the single source every transport renders |
| **P6-M1** | **Trust gate** — the `agents` audience flag on the existing per-workflow approval model **+ an explicit workspace-level opt-in switch**; nothing is exposed by default |
| **P6-M2a** | **Remote MCP server** — per-workspace Streamable HTTP endpoint on the api; tools: `find_workflow` (hybrid retrieval) · `list_workflows` · `get_workflow`; bearer-key auth, rate-limited |
| **P6-M2b** | **Markdown rendering** — the `llms.txt`-style workflow manual over the same compiler (instructional layer only) |
| **P6-M2c** | **WebMCP widget tools** — flag-gated registration of the knowledge tools on the host page; flipped on the adoption trigger (§8-Q10) |
| **P6-M3** | **Consumption analytics** — which agent fetched/used which workflow → founder visibility + the record-this-next loop extended to agent demand (also the sales/demand signal — build day one) |
| **P6-M4** | **Freshness hooks** — Phase-3 ties: certification surfaces in the export; detected drift flags or pulls a workflow from exposure |

**Recommended build sequence:** M0 → M1 → **M2a + M2b in one effort burst** (M3 alongside) → M2c on the WebMCP adoption trigger → M4 when Phase 3 lands.

---

## 7. Relationship to the other phases

| Phase | Role | This phase |
|---|---|---|
| **P1–P2** | Our copilot answers/locates over the KB | Same KB, exported for outside consumers — and P2-M0's sense-plan compiler is P6-M0's skeleton |
| **P3 Self-validation** | Certifies workflows still work | **Load-bearing here** — we can safe-stop our own runs live; an external agent may not. Drift handling and certification matter *more* for outside consumers |
| **P4 Autopilot** | **First-party hands** — our widget executes, with our consent UX + safety rails | **Third-party brains and hands** — knowledge out; no FlowBuddy runtime in the loop (in the knowledge-only shape) |
| **P5 Converse** | Our brain over our hands | Other brains, served |
| **V3 Company agent** ([`v3-company-agent.md`](v3-company-agent.md)) | FlowBuddy's *own* grounded browser-agent extension, buyer-side — runs the tools a company uses from its own recorded KB | **The first consumer of this phase's export seam** — P6 feeds *their* agents; V3 brings *ours* |

**Positioning connection:** the "make your product AI-ready / AI-agent compatible" marketing claim is true **today about the artifact** (the KB is agent-grade). This phase makes **external consumption** literal — and the widget's WebMCP registration (§4) is the fleet-wide delivery of that claim. Until it ships, nothing customer-facing may present third-party agent access as available.

---

## 8. Open questions (for when the phase is designed)

1. **Knowledge-only vs. execution semantics** — agents read workflows and act themselves (presumed, and everything above assumes it), or call a FlowBuddy runner as a service (out for now).
2. **Agent identity & auth** — bearer key first (2026-07-24 recommendation); OAuth when claude.ai-class connectors matter; a per-agent allowlist analogous to the widget's origin allowlist + revocation UX still to design.
3. **Screenshots in the export?** Strong grounding but they cross the pixel-PII boundary — **P1-M12 Cut 2 (screenshot OCR/blur) gates any pixel exposure**, exactly as it gates V2 portal publish. The §5 format is text-only until then.
4. **Input-step semantics** — the format marks input steps + "value comes from your principal" (§5); the exact marker/parameter shape (names? types? validation hints?) is a P6-M0 design task.
5. **Freshness signaling** — `compiled-at`/`last-verified` from day one (§3); still open: hard-pull vs. flag on detected drift, and validity windows.
6. **Discoverability** — World A is solved by WebMCP registration itself; for World B/markdown: well-known URL vs. key-gated only, and whether an MCP-registry listing is worth it.
7. **Customer consent & terms** — a workspace explicitly opts its product into agent operation; what the customer promises *their* end-users; liability language.
8. **Packaging/pricing** — per-fetch, per-agent, or plan-tiered. (P6-M3's consumption analytics is also the pricing-model data.)
9. **Literal training** — is fine-tuning/distilling on the KB ever the right shape, or does serve-time grounding stay canonical?
10. **The WebMCP flip trigger** — which adoption signal flips the widget flag (Gemini-in-Chrome GA? first customer ask? Anthropic engaging WebMCP?), and whether host pages need per-page/per-origin control over tool registration beyond the workspace opt-in.

---

## 9. Decision log

- **2026-07-23 — Phase opened.** Direction captured (§1): the approved KB will feed third-party agents so they can operate the customer's product; transport deliberately deferred to best-and-feasible; scope = any web application with task workflows, not only SaaS.
- **2026-07-24 — Feasibility assessed + transport recommendation drafted (not locked).** Feasibility: **yes, weeks-scale for a knowledge-only v1** — the P2-M0 sense-plan compiler, the audience-flag approval pattern, the hybrid retrieval seam, and the embed-auth patterns are the head start (§3). Transports: one two-layer export schema (§5) rendered as **remote MCP (v1 lead) · markdown (v1 rider) · WebMCP via the widget (flag-gated prepared bet — Chrome 149 origin trial live, but no mainstream consumer agents yet) · bespoke REST skipped** (§4). Recommended module sequence recorded (§6).

> **Not in this phase (until designed otherwise):** endorsing free-form agent browsing · exposing unapproved/raw KB items · screenshot exposure before PII Cut 2 · execution-as-a-service — and WebMCP-registered tools are **knowledge-serving only; nothing registered may act**.
