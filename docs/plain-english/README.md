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
| [10 · Running it on your machine](10-running-and-shipping-it.md) | Getting the whole thing up locally |
| [11 · Putting it live](10-running-and-shipping-it.md) | How deploys work, and what to watch |
| [12 · Testing it](10-running-and-shipping-it.md) | What to click through before believing something works |
| [13 · What's in the code](13-whats-in-the-code.md) | A tour of the folders, and which one to open for what |

---

## A note on names

The technical docs sometimes call the copilot's modes "mode 1 / mode 2 / mode 3", and sometimes
"Copilot / Agent read-only / Agent acting". Those are older internal names.

**The names that are actually in the product are `AI Chatbot`, `Copilot`, and `AI Agent`** — that's
what you see in Studio, and that's what these docs use throughout.

Last updated 2026-07-27.
