# 2 · How it all fits together

*(The plain-English version of `architecture.md`.)*

---

## The whole system in one sentence

**Recordings go in one end, get turned into a knowledge base, and three different things can read
that knowledge base — but only the parts you approved for each one.**

---

## The picture

```
  YOU RECORD                    Chrome extension. You click through your own
      │                         product and talk out loud while you do it.
      ▼
  RAW MATERIAL                  Clicks, the page structure, screenshots,
      │                         which URL you were on, your voice.
      ▼
  THE KNOWLEDGE BASE            Split into separate workflows, each one a
      │                         clean list of steps. This is the valuable bit.
      │
      ▼
  YOU APPROVE                   One click per workflow. Approve separately
      │                         for each consumer below.
      │
      ├──────────────┬──────────────────┬─────────────────┐
      ▼              ▼                  ▼                 ▼
  THE COPILOT    HELP PORTAL      OTHER AI AGENTS    CHECKING ITSELF
   ✅ built       not built         not built          not built
```

That last one is worth calling out: **checking itself** is the idea that FlowBuddy periodically
replays your recorded steps against your live product to see if they still work. It reads the same
knowledge base as everything else. It's the hardest thing on the list and it isn't built.

---

## The three stages, properly

### Stage 1 · Get the raw material in

Someone records themselves using the product. Right now there's exactly one way to do this: **click
through a real workflow while narrating.** One session can cover several workflows — "here's how you
reset a password… and now here's how you upgrade a plan."

FlowBuddy captures several layers at once, all lined up in time: what was clicked, what the page
looked like structurally, a screenshot at each step, a second screenshot *after* the click (so it
knows what success looks like), which URL you were on, and your voice throughout.

Two other ways to record are planned but not built: **just talking, no clicking** (for explaining
concepts rather than steps), and **uploading a video**.

What comes out of this stage is raw. It isn't knowledge yet.

### Stage 2 · Turn it into a knowledge base

This is the part that matters, and it's the part that's genuinely built.

A background worker takes the raw recording and:

- Transcribes what you said
- **Splits one recording into separate workflows** — it can tell "resetting a password" from
  "upgrading a plan", and gives each one a title
- **Turns raw clicks into readable steps.** Not "click on element #a7fd3" but "Click **Continue** to
  confirm your email." This is a real transformation, covered in
  [building the knowledge base](03-building-the-knowledge-base.md)
- Makes everything searchable, two ways at once — by literal keyword and by meaning

**Two things about the knowledge base are worth understanding, because a lot follows from them:**

**It's one growing pile per product, not one per recording.** Every recording you ever make feeds
into the same knowledge base and it compounds over time. When you search it, you search all of it.

**Once knowledge is in there, nothing downstream cares how it got there.** A step recorded by
clicking and a topic captured by talking are both just "knowledge you can look up." That's what lets
new recording methods slot in later without rewriting anything above them.

### Stage 3 · Things that use it

The knowledge base is the substrate. What sits on top are separate consumers, and — this is the
important design decision — **they're independent.**

Approving a workflow for the in-app assistant and publishing it to a public help site are two
different actions on the same underlying knowledge. Neither requires the other. You might answer
something in-app that you'd never publish publicly, and vice versa.

```
  ONE knowledge base
        │
        ├──► approved for the copilot   ──►  the in-app assistant     ✅ BUILT
        ├──► approved for the portal    ──►  a public help site       not built
        ├──► approved for agents        ──►  other companies' AI      not built
        └──► (no approval needed)       ──►  checking itself          not built
```

---

## Two decisions that explain most of the design

### The assistant reads the knowledge base directly, not published articles

An earlier version of the plan had the assistant answer from finished help articles. That was
changed deliberately, and it's why the product is shaped the way it is.

Articles are prose. Prose loses information — it can't tell you *which button on which screen*, so an
assistant built on articles can never know where the user is or (later) do anything for them. The
knowledge base keeps the structure: the actual element, the actual URL, what the screen looked like
after a successful click.

So the assistant reads **structured knowledge**, and approval is a **separate, lightweight gate** on
top of it. You get the safety of "a human approved this" without anyone having to write a document.

**Approving is one click on a workflow. It is not authoring an article.** That difference is most of
why setup takes an afternoon rather than a month.

### Nothing is ever published automatically

FlowBuddy proposes; you decide. Recording something doesn't make it live. The approval step is real,
and it's the gate everything downstream depends on.

---

## What happens when it doesn't know

This is a feature, not an error case.

If a user asks something the approved knowledge doesn't cover, the assistant **declines honestly**
and FlowBuddy logs a gap. Those gaps come in two flavours, and they need different fixes:

- **You recorded it but never approved it** → one click and it's live
- **You never recorded it at all** → "record this next"

Both show up in Studio. This is the feedback loop that makes the product improve by being used.

---

## Where the four surfaces live

| Surface | Who uses it | What it's for |
|---|---|---|
| **The Chrome extension** | you | recording your product |
| **Studio** (the web app) | you | reviewing, approving, configuring, and seeing what users asked |
| **The widget** ⭐ | your customers | the in-app assistant — one line of code |
| **The help portal** | your customers | a public help site — **not built** |

→ Next: [building the knowledge base](03-building-the-knowledge-base.md)
