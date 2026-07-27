# FlowBuddy, in plain English

**Everything in `docs/` — rewritten without the jargon.**

The technical docs organise themselves around *versions, phases and module numbers* (`P5-M0`, `D9`,
`§7 Q1`). That vocabulary is useful when you're deep in a build, and it's genuinely bad for the one
question you actually ask most often: **where are we, and what should I do next?**

So these docs are organised around **what FlowBuddy is**, not around the order it got built in.

Nothing here is new information. Every fact comes from the existing docs, and those stay exactly as
they are — they're still the source of truth if the two ever disagree. This folder is a second door
into the same house.

---

## The whole product in one shape

```
   ┌─────────────────────────────────────────────────────┐
   │  PART 1 — Build the knowledge base                  │
   │  Record your product → clean steps → you approve    │
   └───────────────────────┬─────────────────────────────┘
                           │
                           │   one knowledge base
                           │   you approve what each consumer may use
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────┐      ┌─────────────┐   ┌──────────────┐
   │ THE     │      │ THE HELP    │   │ OTHER AI     │
   │ COPILOT │      │ PORTAL      │   │ AGENTS       │
   │  BUILT  │      │ not built   │   │ not built    │
   └─────────┘      └─────────────┘   └──────────────┘

   The copilot has three modes:
     AI Chatbot  · answers questions                       built
     Copilot     · decides how to help, turn by turn       built · the default
     AI Agent    · does things for the user                not built
```

---

## The docs

**Understand it**

| Doc | What's in it |
|---|---|
| [01 · What FlowBuddy is](01-what-flowbuddy-is.md) | The product, the problem it solves, who buys it, and what competitors can't copy |
| [02 · How it all fits together](02-how-it-all-fits-together.md) | The one picture: recording goes in, three things come out |

**The knowledge base, and the three things that use it**

| Doc | What's in it |
|---|---|
| [03 · Building the knowledge base](03-building-the-knowledge-base.md) | Recording, turning clicks into readable steps, and approving |
| [04 · The copilot](04-the-copilot.md) | What your customers' assistant can do today |
| [05 · The copilot's three modes](05-the-three-modes.md) | AI Chatbot · Copilot · AI Agent — what each one is and who picks |
| [06 · The help portal](06-the-help-portal.md) | The second consumer: a public help site. Not built |
| [07 · Opening up to other AI agents](07-other-ai-agents.md) | The third consumer: letting Claude and friends use your product. Not built |
| [08 · The company agent](08-the-company-agent.md) | The flip: record the tools you *use*, not the one you sell. An idea, not a plan |

**Run it**

| Doc | What's in it |
|---|---|
| [09 · Where we are and what's next](09-where-we-are.md) | Honest status, the open gaps, and what to build next |
| [10 · Running it on your machine](10-running-it-locally.md) | Getting the whole thing up locally |
| [11 · Putting it live](11-putting-it-live.md) | How deploys work, and what to watch |
| [12 · Testing it](12-testing-it.md) | What to click through before believing something works |
| [13 · What's in the code](13-whats-in-the-code.md) | A tour of the folders, and which one to open for what |

---

## Where each original doc went

Nothing was dropped. If you're looking for something you remember reading:

| Original | Now covered in |
|---|---|
| `product.md` | [01](01-what-flowbuddy-is.md) |
| `architecture.md` | [02](02-how-it-all-fits-together.md) |
| `roadmap.md` | [09](09-where-we-are.md) — and the shape at the top of [02](02-how-it-all-fits-together.md) |
| `phase-1-copilot.md` | [03](03-building-the-knowledge-base.md) + [04](04-the-copilot.md) |
| `phase-2-sense.md` | [04](04-the-copilot.md) — "knowing where the user is" and "working out why they're stuck" |
| `kb-step-distillation.md` | [03](03-building-the-knowledge-base.md) — "turning clicks into readable steps" |
| `unified-agent.md` | [05](05-the-three-modes.md) |
| `phase-4-autopilot.md` | [05](05-the-three-modes.md) — the guided walkthrough, and the acting mode |
| `phase-5-converse.md` | [05](05-the-three-modes.md) — memory, and the goal-based assistant |
| `phase-6-interop.md` | [07](07-other-ai-agents.md) |
| `v2-portal.md` | [06](06-the-help-portal.md) |
| `v3-company-agent.md` | [08](08-the-company-agent.md) |
| `dev-setup.md` | [10](10-running-it-locally.md) |
| `deploy.md` | [11](11-putting-it-live.md) |
| `e2e-testing.md` | [12](12-testing-it.md) |
| `extension-releases.md` | [11](11-putting-it-live.md) — "the Chrome extension is different" |
| `internals/` | [13](13-whats-in-the-code.md) — the tour; `internals/` stays the deep version |
| `design_system/` | [13](13-whats-in-the-code.md) |
| `competitive-claude-chrome.md` | [01](01-what-flowbuddy-is.md) — "what competitors can't copy" |
| `landing-page.md` | [09](09-where-we-are.md) — "parked" |
| `archive/phase-1-review.md` | [09](09-where-we-are.md) — the leftovers from it |

---

## A note on names

The technical docs sometimes call the copilot's modes "mode 1 / mode 2 / mode 3", and sometimes
"Copilot / Agent read-only / Agent acting". Those are older internal names.

**The names that are actually in the product are `AI Chatbot`, `Copilot`, and `AI Agent`** — that's
what you see in Studio, and that's what these docs use throughout.

Last updated 2026-07-27.
