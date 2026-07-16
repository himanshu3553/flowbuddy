# Sync — Competitive analysis: Claude for Chrome

> **Claude for Chrome ("Claude in Chrome") is Anthropic's user-side browser agent** — a Chrome extension that lets Claude see, click, type, and run multi-step workflows in the end-user's own browser session. It is the closest large-scale product to Sync's Phase-4 Autopilot ambition, and the clearest proof that in-browser agents are going mainstream. **It plays a different game than Sync** — horizontal + user-installed vs. vertical + vendor-embedded — and that asymmetry is the strategy.

- **Status:** 📄 **Living competitive reference** — re-check on major Anthropic releases.
- **Last updated:** 2026-07-15 · **Branch:** `dev`
- **Companion docs:** Phase 4 (where this matters most) → [`phase-4-autopilot.md`](phase-4-autopilot.md) · roadmap → [`roadmap.md`](roadmap.md) · why copilot-first → [`product.md`](product.md)

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

## 4. Head-to-head with Sync

**Framing: different games on the same board.** Claude for Chrome is a *horizontal, user-side* agent — the individual installs it, pays Anthropic, points it anywhere. Sync is a *vertical, vendor-side* copilot — the SaaS embeds it; every user gets it free, grounded only in approved knowledge. Claude sits in the user's browser; Sync sits in the vendor's product.

### Where Sync is structurally better

| # | Edge | Why Claude can't match it |
|---|---|---|
| 1 | **Distribution** | A SaaS vendor cannot deploy Claude for Chrome to its customers — it needs each end user to pay Anthropic, install an extension, and grant invasive permissions. Sync = one `<script>`, 100% of users, zero install, free to them. Anthropic has no vendor-embeddable offering. |
| 2 | **Grounding** | Claude improvises any UI from general knowledge; nothing stops a confident wrong path. Sync answers **only** from founder-recorded, approved workflows. For support, approved-KB grounding beats frontier improvisation on trust. |
| 3 | **Expected-vs-actual ground truth** | Reason (P2-M5) compares live page state against the founder's TRUE reference screenshots + locators; Phase 3 adds validated-current certification. Claude has no reference for what the product *should* look like. This is the compounding data asset. |
| 4 | **Vendor control + telemetry** | Live-served appearance, approval gates, admin control, "where users get stuck" analytics. Claude gives the vendor nothing — no visibility, no branding, and its screenshots of the vendor's app flow to a third party the vendor never contracted with. |
| 5 | **Safety surface** | Sync's copilot is read-only today (locator probes, masked values). Phase 4's "execute only recorded + approved workflows, human-in-the-loop" is categorically stronger than "improvise on any site, filtered by classifiers." |
| 6 | **Cost model** | Vendor pays once; end users pay nothing. Claude gates every end user behind a subscription. |

### Where Sync lags

| # | Gap | Reality check |
|---|---|---|
| 1 | **Claude acts today, at GA quality** | Clicks, fills, uploads, tabs, scheduled jobs, recorded-workflow replay — shipping now. Sync's Autopilot is Phase 4, gated behind Phase 3; today's closest feature is the "show me" highlight. Every open month makes "why not just use Claude?" easier to ask. |
| 2 | **End-user record-and-replay** | Claude in Chrome lets *any user* record a workflow and replay it. Validates Sync's capture→replay architecture — and shrinks the runway to ship the vendor-grade (approved, validated, drift-checked) version. |
| 3 | **Agent-loop maturity** | Hybrid perception, batched read-only calls, plan-mode permission discipline, CAPTCHA/login handoff, model switching — years of harness engineering. (Cf. the recorder's known full-page-nav capture gap.) |
| 4 | **Published, quantified safety** | ASR metrics (23.6% → 11.2% → <0.08%), classifier layers, hard-blocked categories, org admin controls. Enterprise buyers will benchmark Autopilot's safety story against exactly this. |
| 5 | **Cross-app breadth** | Claude spans calendar → CRM → docs → email in one workflow. Sync is single-product by design — correct for the wedge, but a real ceiling. |

## 5. How Sync beats Claude in this game

1. **Don't play their game — make them unable to play yours.** The winning position is "the agent layer the *vendor* ships." Claude structurally can't be embedded, can't be grounded to approved-only, can't give the vendor control or analytics, can't be free to the end user. Sales line: *Claude is your user's agent; Sync is your product's agent.*
2. **Compress the road to Phase 3 + 4.** The biggest strategic risk is that grounded, vendor-approved execution stays on paper while user-side improvised execution becomes normal. Reason's agent loop is already Phase 4's skeleton; R13 ranked locators are the replay substrate. One narrow, certified, human-in-the-loop workflow executing in an end-user session flips the comparison from "Sync talks, Claude acts" to "Claude guesses, Sync executes the vendor-certified path."
3. **Steal their permissions UX wholesale for Phase 4.** Ask-before-acting vs. act-within-approved-boundaries, per-action confirmation for irreversible steps, hard-blocked categories, admin allowlists, reviewable action history — a proven, user-tested control vocabulary. Adopting its analogues (and citing the analogy) borrows their safety credibility. Cross-referenced from [`phase-4-autopilot.md`](phase-4-autopilot.md) §5.
4. **Publish safety numbers early — and win by construction.** Sync's action space is closed; Claude's is open. "Injection attempts in page content cannot alter the action set — 0% action-hijack *by construction*" is a claim Anthropic cannot make. Make it explicit, tested, and marketed.
5. **Turn their weaknesses into features.** Screenshots-leak-everything and zero-vendor-visibility are Sync talking points: values masked, end-user-silent by policy, vendor in the loop. Position Sync as the *compliant* way to give users agentic help inside a SaaS.

## 6. Watch items

- **An embeddable/white-label agent SDK for site owners** from Anthropic would be the moment they enter Sync's lane. No sign of it today — the extension is user-side only. Until then it *helps* Sync: it normalizes in-browser agents while leaving the vendor-side seat empty.
- **End-user bypass:** users with Claude for Chrome may skip the vendor's copilot. Counter: Sync is grounded, free, in-product, zero-friction.
- **Their cadence:** 10 months preview→GA. Assume capability gaps quoted here have a short shelf life; re-verify before repeating them externally.

## 7. Sources

[Claude for Chrome (official)](https://claude.com/claude-for-chrome) · [Piloting Claude in Chrome (blog)](https://claude.com/blog/claude-for-chrome) · [Get started with Claude in Chrome](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome) · [Permissions guide](https://support.claude.com/en/articles/12902446-claude-for-chrome-permissions-guide) · [Use Claude in Chrome safely](https://support.claude.com/en/articles/12902428-use-claude-in-chrome-safely) · [Claude Code × Chrome docs](https://code.claude.com/docs/en/chrome) · [Mitigating prompt injections in browser use (Anthropic research)](https://www.anthropic.com/news/prompt-injection-defenses) · [Engadget: GA for all paid users](https://www.engadget.com/ai/claudes-chrome-plugin-is-now-available-to-all-paid-users-221024295.html) · [VentureBeat: injection failure rates published](https://venturebeat.com/security/prompt-injection-measurable-security-metric-one-ai-developer-publishes-numbers) · [TechSpot: 11% ASR at launch](https://www.techspot.com/news/109252-claude-chrome-arrives-despite-11-prompt-injection-success.html) · [ppc.land: 1,000-user research preview](https://ppc.land/anthropic-launches-claude-for-chrome-extension-research-preview-with-1-000-users/) · [Chrome Web Store listing](https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn)
