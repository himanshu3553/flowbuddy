# FlowBuddy, in plain English

**Everything in `docs/` — rewritten without the jargon.**

The technical docs organise themselves around *versions, phases and module numbers* (`P5-M0`, `D9`,
`§7 Q1`). That vocabulary is useful when you're deep in a build, and it's genuinely bad for the
question anyone asks first: **what is this thing, and how does it actually work?**

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
   └─────────┘      └─────────────┘   └──────────────┘

   The copilot has two modes:
     Copilot     · decides how to help, turn by turn; never touches your page
     AI Agent    · everything Copilot does, and it can also carry out one of your
                   recorded workflows in the user's own session, on their say-so
```

---

## The docs

**Understand it**

| Doc | What's in it |
|---|---|
| [01 · What FlowBuddy is](01-what-flowbuddy-is.md) | The product, the problem it solves, who buys it, and what competitors can't copy |
| [02 · How it all fits together](02-how-it-all-fits-together.md) | The one picture: recording goes in, three things come out |

**The knowledge base, and what uses it**

| Doc | What's in it |
|---|---|
| [03 · Building the knowledge base](03-building-the-knowledge-base.md) | Recording, turning clicks into readable steps, and approving |
| [04 · The copilot](04-the-copilot.md) | What your customers' assistant can do today |
| [05 · The copilot's two modes](05-the-two-modes.md) | Copilot · AI Agent — where the line is, and why a third mode was retired |
| [06 · The three things we haven't built yet](06-not-built-yet.md) | A public help site · opening up to other companies' AI · the flip: recording the tools you *use* |

**Run it**

| Doc | What's in it |
|---|---|
| [07 · Running, shipping and testing it](07-running-and-shipping-it.md) | Getting it up locally, putting it live, and what to click through before believing something works |

**What's built and what's next** isn't here — it lives in [the roadmap](../roadmap.md), which is the
one place status is kept so it can't drift.

---

## If you need more than these

Two doors lead further, and they're the ones worth knowing about:

- **How each piece actually runs** — the recorder, the ingestion service, the knowledge-base build,
  the answer engine, the widget, Studio, the data layer. One document each, all following the same
  shape: what it's for, what goes in, what comes out, how it works inside, what can go wrong. They
  follow the code — if a document and the source disagree, the source wins.
  → [`internals/`](../internals/README.md)
- **What everything looks like** — the source of truth for every surface: Studio, the recorder and
  the widget. Colours, type, spacing, and a kit of ready-made Studio pieces. The brand is indigo;
  recording and delete actions are terracotta, so "this is recording" and "this deletes something"
  look the same everywhere. → [`design_system/`](../design_system/README.md)

---

## A note on names

The technical docs sometimes call the copilot's modes "mode 1 / mode 2 / mode 3", and sometimes
"Copilot / Agent read-only / Agent acting". Those are older internal names, and the numbers are now
doubly stale: a third mode, **AI Chatbot**, was retired in August 2026, so anything numbering from it
is counting from a rung that no longer exists.

**The names that are actually in the product are `Copilot` and `AI Agent`** — that's what you see in
Studio, and that's what these docs use throughout.
