# FlowBuddy docs — the map

**This file is navigation only.** It says which doc holds what, and nothing else.
For *what is built*, see [`roadmap.md`](roadmap.md) — the only status surface in the repo.

Before editing any doc, read **[Doc rules](../CLAUDE.md#doc-rules-read-before-editing-any-doc)** in `CLAUDE.md`.

---

## The shape of this folder

**Altitude is the top-level axis.** Three layers describe the same system at different depths, and
two of them may not carry anything volatile:

| | Layer | Holds |
|---|---|---|
| | **`product/` · `build/` · `ops/`** | **Decisions** — why we chose this, what we rejected, what's locked. |
| | [`internals/`](internals/README.md) | **Mechanics** — seams, contracts, invariants, failure modes. |
| | [`plain-english/`](plain-english/README.md) | **The stable core in ordinary words.** No commands, no status, no source paths. |

Inside the decisions layer, folders group by **who's asking and why** — never by status or version.
A doc does not move when it ships, and `roadmap.md` is the only thing that tracks what's built.

`roadmap.md` and this file sit at the root because they're the two you want at zero clicks.

---

## Start here

| Doc | Holds |
|---|---|
| [`roadmap.md`](roadmap.md) | Versions → phases → modules, with status. The only place status lives. |
| [`product/product.md`](product/product.md) | What FlowBuddy is, who it's for, why copilot-first. Personas, moats, locked decisions. |
| [`product/architecture.md`](product/architecture.md) | The three modules, KB scope, and the technical decisions behind them. |
| [`plain-english/`](plain-english/README.md) | The whole system in ordinary words. The gentlest way in. |

## `product/` — why it exists, and for whom

| Doc | Holds |
|---|---|
| [`product.md`](product/product.md) | The product case: problem, persona, locked decisions, what's moat and what's commodity. |
| [`architecture.md`](product/architecture.md) | The three-module model — capture, knowledge base, article creation — and the decisions behind it. |
| [`landing-page.md`](product/landing-page.md) | Marketing page positioning and structure. |
| [`competitive-claude-chrome.md`](product/competitive-claude-chrome.md) | Competitive reference on Claude for Chrome, and how we compare. |

## `build/` — what we're building, and why

*Shipped and forward specs sit together on purpose. Status is [`roadmap.md`](roadmap.md)'s job.*

| Doc | Holds |
|---|---|
| [`phase-1-copilot.md`](build/phase-1-copilot.md) | Phase 1 scope, locked decisions, the capture contract, non-functional requirements. |
| [`phase-2-sense.md`](build/phase-2-sense.md) | Sense (in-context help) and Reason (diagnostics) — decision records and the diagnosis-quality rules. |
| [`kb-step-distillation.md`](build/kb-step-distillation.md) | Why raw capture events become clean steps, and the options weighed. |
| [`agent.md`](build/agent.md) | The unified agent — decisions D1–D9, the three modes, the acting layer and the goal layer. |
| [`phase-6-interop.md`](build/phase-6-interop.md) | Opening the approved KB to third-party AI agents. |
| [`v2-portal.md`](build/v2-portal.md) | The help portal and article authoring track. |
| [`v3-company-agent.md`](build/v3-company-agent.md) | The buyer-side track: record the tools you use, run them with a grounded browser agent. |

## `ops/` — run it, ship it, test it

| Doc | Holds |
|---|---|
| [`dev-setup.md`](ops/dev-setup.md) | Local dev, tooling, and the canonical logging reference (§7). |
| [`deploy.md`](ops/deploy.md) | Deploying to Render — shared invariants plus the dev and production walkthroughs. |
| [`e2e-testing.md`](ops/e2e-testing.md) | The manual end-to-end test plan, at three levels: local, dev, prod. |
| [`extension-releases.md`](ops/extension-releases.md) | The Chrome Web Store release log. The only place a recorder version number lives. |

## Reference

| Doc | Holds |
|---|---|
| [`internals/`](internals/README.md) | How it runs — seams, contracts, invariants, failure modes. Start at `connections.md`. |
| [`design_system/`](design_system/README.md) | Tokens, components, and the UI kit. The source of truth for all UI. |
| [`archive/`](archive/) | Dated records kept for their findings. Everything else is in `git log`. |
