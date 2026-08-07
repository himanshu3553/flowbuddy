# FlowBuddy — Competitive analysis: Claude for Chrome

> **Claude for Chrome ("Claude in Chrome") is Anthropic's user-side browser agent** — a Chrome extension that lets Claude see, click, type, and run multi-step workflows in the end-user's own browser session. It is the closest large-scale product to what FlowBuddy's acting mode now does, and the clearest proof that in-browser agents are going mainstream. **It plays a different game than FlowBuddy** — horizontal + user-installed vs. vertical + vendor-embedded — and that asymmetry is the strategy.

- **Status:** 📄 **Living competitive reference** — re-check on major Anthropic releases.
- **Companion docs:** Phase 4 (where this matters most) → [`agent.md`](../build/agent.md) · roadmap → [`roadmap.md`](../roadmap.md) · why copilot-first → [`product.md`](product.md)

---

## 1. What it is

A Chrome (MV3) extension giving Claude eyes and hands inside the user's browser: it reads pages (hybrid screenshot + DOM), clicks, types, fills forms, uploads files, manages tabs, and runs cross-site workflows — **using the user's existing logins** (it shares browser session state, so it acts inside any SaaS the user is signed into). It pauses and hands control back at login pages and CAPTCHAs.

**Rollout speed (the thing to respect):**

| When | Milestone |
|---|---|
| 2025-08-26 | Research preview — 1,000 Max ($200/mo) users + waitlist; framed as a safety pilot |
| 2025-11 | All Max subscribers |
| 2025-12 | Beta for all paid plans (Pro / Team / Enterprise) |
| Mid-2026 | **GA on all direct Anthropic plans**; GA inside Claude Cowork and Claude Code. Not available via Bedrock/Vertex/Foundry accounts |

~10 months from 1,000-user experiment to a GA feature bundled free into every paid Claude subscription.

**Four surfaces:** (1) Chrome side panel; (2) Claude Desktop connector (drive the browser from chat/Cowork); (3) Claude Code integration (`claude --chrome`, VS Code — console/network/DOM reading, live debugging; Chrome + Edge); (4) scheduled/background execution.

## 2. Capability inventory (as of 2026-07)

- **Act:** navigate, click, type, fill forms, image/file upload, multi-tab coordination, cross-site workflows (calendar → CRM → docs in one run).
- **Perceive:** screenshots + DOM; console output and network requests (Code integration); screen-highlight targeting (drag to point Claude at an exact element).
- **Workflow record & replay:** the user demonstrates a workflow once; Claude learns and repeats it. *Capture→replay, democratized to end users.*
- **Scheduled tasks** (daily/weekly/monthly), background tasks, saved prompt shortcuts.
- **Enhanced handling** for Slack, Gmail, Google Calendar, Google Docs, GitHub; per-task **model selection** (Haiku ↔ Opus).
- **Tool-level read/write discipline:** read-only calls (read page, find, screenshot, console read) run without prompts; state-changing calls (click, type, navigate) require approval — including flags that flip an otherwise read-only call to state-changing.

## 3. Permissions & safety model — the part to study

Two operating modes:

- **Ask Before Acting** — Claude presents a plan (target sites + approach); the user approves; it still pauses at sensitive junctures.
- **Act Without Asking** — autonomous within approved boundaries, with background classifiers screening actions; it self-interrupts on anything risky.

**Site-level grants:** *allow this action* / *always allow on this site* / *decline*, with reviewable permission history. Even under "always allow": downloads, credential entry, and authorization grants force explicit confirmation.

**Hard-blocked regardless of permissions:** financial transactions/purchases, account creation, permanent deletions, credit-card/ID data handling, downloads from untrusted sources, modifying security permissions, and *following instructions found in email or web content*. Team/Enterprise admins get org-wide site allowlists/blocklists. HIPAA-covered orgs are excluded entirely.

**Published prompt-injection numbers** (their flagship risk): 23.6% attack success rate unmitigated → 11.2% after the first mitigation wave (site permissions, action confirmations, classifiers, category blocking, RL-trained refusal; 0% on a browser-specific challenge set) → **<0.08%** claimed for the shipped configuration. They openly document that screenshots capture whatever is visible in a tab, and steer users away from banking/legal/medical contexts.

## 4. Head-to-head with FlowBuddy

**Framing: different games on the same board.** Claude for Chrome is a *horizontal, user-side* agent — the individual installs it, pays Anthropic, points it anywhere. FlowBuddy is a *vertical, vendor-side* copilot — the SaaS embeds it; every user gets it free, grounded only in approved knowledge. Claude sits in the user's browser; FlowBuddy sits in the vendor's product.

### Where FlowBuddy is structurally better

| # | Edge | Why Claude can't match it |
|---|---|---|
| 1 | **Distribution** | A SaaS vendor cannot deploy Claude for Chrome to its customers — it needs each end user to pay Anthropic, install an extension, and grant invasive permissions. FlowBuddy = one `<script>`, 100% of users, zero install, free to them. Anthropic has no vendor-embeddable offering. |
| 2 | **Grounding** | Claude improvises any UI from general knowledge; nothing stops a confident wrong path. FlowBuddy answers — and now **acts** — only from founder-recorded, approved workflows: the model picks a grounded primitive, never a selector. For support, approved-KB grounding beats frontier improvisation on trust. |
| 3 | **Expected-vs-actual ground truth** | Reason compares live page state against the founder's TRUE reference screenshots + locators; Phase 3 adds validated-current certification — and the same recorded evidence now verifies every act during a run, not just a diagnosis. Claude has no reference for what the product *should* look like. This is the compounding data asset. |
| 4 | **Vendor control + telemetry** | Live-served appearance, approval gates, admin control, "where users get stuck" analytics. Claude gives the vendor nothing — no visibility, no branding, and its screenshots of the vendor's app flow to a third party the vendor never contracted with. |
| 5 | **Safety surface** | The action space is the KB, never the DOM: the model never authors a selector — it starts a consented run over a plan compiled from the founder's own recording and pinned by content hash at the moment of consent. Acting stays absent until the founder accepts terms and enables it per workflow; a workflow that cannot be run safely is refused at enable time, not discovered mid-run. Every act is verified against recorded evidence, destructive steps confirm, sensitive values are typed into the app's own field, and every run is an audit row ([`agent.md`](../build/agent.md) §A2). Categorically stronger than "improvise on any site, filtered by classifiers." |
| 6 | **Cost model** | Vendor pays once; end users pay nothing. Claude gates every end user behind a subscription. |

### Where FlowBuddy lags

| # | Gap | Reality check |
|---|---|---|
| 1 | **Breadth and hours of acting** | Claude's acting is GA-hardened anywhere: multi-tab, cross-site, scheduled and background runs, uploads, replays of the end user's own recordings. FlowBuddy's acting is deliberately narrower by design — inside one product, one workflow per run, grounded to a recorded and approved workflow, with the user present and consenting ([`agent.md`](../build/agent.md)). The open question is not whether we act, but how far a single-product agent gets a user, and how fast their harness hardens against ours. |
| 2 | **End-user record-and-replay** | Claude in Chrome lets *any user* record a workflow and replay it. Validates FlowBuddy's capture→replay architecture. FlowBuddy's version of it is vendor-grade by design — approved, eligibility-checked, audited — so what Claude has that our design does not offer is the **end-user's own** ability to author a workflow, plus the drift-checked half that belongs to Phase 3. |
| 3 | **Agent-loop maturity** | Hybrid screenshot+DOM perception, batched read-only calls, multi-tab coordination, model switching, background and scheduled runs — years of harness engineering. (Cf. the recorder's known full-page-nav capture gap.) |
| 4 | **Published, quantified safety** | ASR metrics (23.6% → 11.2% → <0.08%), classifier layers, hard-blocked categories, org admin controls. Enterprise buyers will benchmark Autopilot's safety story against exactly this. |
| 5 | **Cross-app breadth** | Claude spans calendar → CRM → docs → email in one workflow. FlowBuddy is single-product by design — correct for the wedge, but a real ceiling. |

## 5. How FlowBuddy beats Claude in this game

1. **Don't play their game — make them unable to play yours.** The winning position is "the agent layer the *vendor* ships." Claude structurally can't be embedded, can't be grounded to approved-only, can't give the vendor control or analytics, can't be free to the end user. Sales line: *Claude is your user's agent; FlowBuddy is your product's agent.*
2. **The claim to defend is execution, not intent.** The risk this line named — vendor-approved execution staying on paper while user-side improvisation became normal — is answered by design: a consented, human-in-the-loop run over the founder's own compiled plan, in the end user's own session ([`roadmap.md`](../roadmap.md) for how far that has got). The half that was always slower is **freshness**: a plan is only as current as the recording it came from, and production safe-stops are the live drift signal that arrives before the sandbox half does. "Claude guesses, FlowBuddy executes the vendor-certified path" is a claim to keep true, not one to reach.
3. **Their permissions UX is already borrowed — keep citing the analogy.** The one-to-one mapping onto FlowBuddy's own controls is recorded in [`agent.md`](../build/agent.md) §A5. What the analogy is *for* is sales: adopting a vocabulary Anthropic has already trained buyers on borrows its safety credibility. Their hard-blocked action categories and org allowlists remain deliberately unmatched.
4. **Publish safety numbers early — and win by construction.** FlowBuddy's action space is closed — compiled from the recording before the run and pinned by content hash at consent, so nothing on the page can add to it; Claude's is open. "Injection attempts in page content cannot alter the action set — 0% action-hijack *by construction*" is a claim Anthropic cannot make. Make it explicit, tested, and marketed.
5. **Turn their weaknesses into features.** Screenshots-leak-everything and zero-vendor-visibility are FlowBuddy talking points: values masked, end-user-silent by policy, vendor in the loop. Position FlowBuddy as the *compliant* way to give users agentic help inside a SaaS.

## 6. Watch items

- **An embeddable/white-label agent SDK for site owners** from Anthropic would be the moment they enter FlowBuddy's lane. No sign of it today — the extension is user-side only. Until then it *helps* FlowBuddy: it normalizes in-browser agents while leaving the vendor-side seat empty.
- **WebMCP posture (added 2026-07-25).** The W3C page-registers-tools standard (Google + Microsoft; Chrome 149 origin trial live, Gemini-in-Chrome support announced — assessment in [`interop.md`](../build/interop.md) §4) has had **no public engagement from Anthropic** in its first year — MCP's creator staying silent on the browser-native variant is itself signal. If Claude for Chrome starts calling WebMCP tools, FlowBuddy's widget-registered knowledge tools become directly consumable by it (P6-M2c's flip trigger); if Anthropic counter-proposes, re-evaluate the Phase-6 transport mix.
- **End-user bypass:** users with Claude for Chrome may skip the vendor's copilot. Counter: FlowBuddy is grounded, free, in-product, zero-friction.
- **Their cadence:** 10 months preview→GA. Assume capability gaps quoted here have a short shelf life; re-verify before repeating them externally.

## 7. Sources

[Claude for Chrome (official)](https://claude.com/claude-for-chrome) · [Piloting Claude in Chrome (blog)](https://claude.com/blog/claude-for-chrome) · [Get started with Claude in Chrome](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome) · [Permissions guide](https://support.claude.com/en/articles/12902446-claude-for-chrome-permissions-guide) · [Use Claude in Chrome safely](https://support.claude.com/en/articles/12902428-use-claude-in-chrome-safely) · [Claude Code × Chrome docs](https://code.claude.com/docs/en/chrome) · [Mitigating prompt injections in browser use (Anthropic research)](https://www.anthropic.com/news/prompt-injection-defenses) · [Engadget: GA for all paid users](https://www.engadget.com/ai/claudes-chrome-plugin-is-now-available-to-all-paid-users-221024295.html) · [VentureBeat: injection failure rates published](https://venturebeat.com/security/prompt-injection-measurable-security-metric-one-ai-developer-publishes-numbers) · [TechSpot: 11% ASR at launch](https://www.techspot.com/news/109252-claude-chrome-arrives-despite-11-prompt-injection-success.html) · [ppc.land: 1,000-user research preview](https://ppc.land/anthropic-launches-claude-for-chrome-extension-research-preview-with-1-000-users/) · [Chrome Web Store listing](https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn)
