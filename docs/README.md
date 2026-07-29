# FlowBuddy docs — the map

**This file is navigation only.** It says which doc holds what, and nothing else.
For *what is built*, see [`roadmap.md`](roadmap.md) — the only status surface in the repo.

Before editing any doc, read **[Doc rules](../CLAUDE.md#doc-rules-read-before-editing-any-doc)** in `CLAUDE.md`.

---

## Start here

| Doc | Holds |
|---|---|
| [`roadmap.md`](roadmap.md) | Versions → phases → modules, with status. The only place status lives. |
| [`product.md`](product.md) | What FlowBuddy is, who it's for, why copilot-first. Personas, moats, locked decisions. |
| [`architecture.md`](architecture.md) | The three modules, KB scope, and the technical decisions behind them. |
| [`plain-english/`](plain-english/README.md) | The whole system in ordinary words. The gentlest way in. |

## Build specs — shipped

| Doc | Holds |
|---|---|
| [`phase-1-copilot.md`](phase-1-copilot.md) | Phase 1 scope, locked decisions, the capture contract, non-functional requirements. |
| [`phase-2-sense.md`](phase-2-sense.md) | Sense (in-context help) and Reason (diagnostics) — decision records and the diagnosis-quality rules. |
| [`kb-step-distillation.md`](kb-step-distillation.md) | Why raw capture events become clean steps, and the options weighed. |

## Build specs — forward

| Doc | Holds |
|---|---|
| [`agent.md`](agent.md) | The unified agent — decisions D1–D9, the three modes, the acting layer (was Phase 4) and the goal layer (was Phase 5). |
| [`phase-6-interop.md`](phase-6-interop.md) | Opening the approved KB to third-party AI agents. |
| [`v2-portal.md`](v2-portal.md) | The help portal and article authoring track. |
| [`v3-company-agent.md`](v3-company-agent.md) | The buyer-side track: record the tools you use, run them with a grounded browser agent. |

## Operations

| Doc | Holds |
|---|---|
| [`dev-setup.md`](dev-setup.md) | Local dev, tooling, and the canonical logging reference (§7). |
| [`deploy.md`](deploy.md) | Deploying to Render — shared invariants plus the dev and production walkthroughs. |
| [`e2e-testing.md`](e2e-testing.md) | The manual end-to-end test plan, at three levels: local, dev, prod. |
| [`extension-releases.md`](extension-releases.md) | The Chrome Web Store release log. The only place a recorder version number lives. |

## Reference

| Doc | Holds |
|---|---|
| [`internals/`](internals/README.md) | How it runs — seams, contracts, invariants, failure modes. Start at `connections.md`. |
| [`design_system/`](design_system/README.md) | Tokens, components, and the UI kit. The source of truth for all UI. |
| [`competitive-claude-chrome.md`](competitive-claude-chrome.md) | Competitive reference on Claude for Chrome, and how we compare. |
| [`landing-page.md`](landing-page.md) | Marketing page positioning and structure. |
| [`archive/`](archive/) | Dated records kept for their findings. Everything else is in `git log`. |
