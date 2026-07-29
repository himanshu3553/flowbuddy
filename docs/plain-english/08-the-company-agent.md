# 8 · The company agent

*(The plain-English version of `company-agent.md`.)*

**Status: an idea, captured. Not designed, not scheduled, nothing built.**

---

## The flip

Everything so far assumes you're recording **the product you sell**, so that **your customers** get
help.

Turn it around. **A company records the tools it *uses*.** Its CRM, its billing tool, its internal
admin panel, the four-tool process someone does every Tuesday.

Same Chrome extension. Same Studio. Same pipeline. What changes is who owns the result and who it's
for.

| | Who records | What they record | Who benefits |
|---|---|---|---|
| **What exists today** | the company that **makes** a product | their **own** product | their **customers** |
| **This idea** | **any** company | the tools **they use** | **themselves** — their team, and their own AI |

---

## The two halves

**Half one: your company's own operating manual.** Every repeatable process, recorded by whoever
actually does it, turned into clean steps automatically. Internal procedures are even less likely to
get written down than product documentation — and this gets them written by someone just doing their
job once, out loud.

**Half two, the interesting one: FlowBuddy ships its own AI agent.** A second Chrome extension — the
same *kind* of thing as Claude for Chrome — that the company uses to actually run those tools.

And the difference is the whole point: **it only runs workflows the company recorded and approved.**
It never improvises.

---

## Why that difference matters so much

General-purpose browser agents work by looking at a page and deciding what to do. Which means a page
can *talk to them*. Text on a website can influence what the agent does next — there are published
numbers on how often that attack works, and they aren't reassuring.

An agent whose available actions are a fixed list of recorded, approved workflows **cannot be talked
into anything**, because nothing it reads on a page can add to that list. The safety property isn't a
filter or a guardrail that might be bypassed — it's structural.

That's the sentence the whole idea rests on: **an agent that can only do what you showed it.**

---

## Why it's a natural fit rather than a new product

**The factory doesn't care whose product goes through it.** Record once → clean steps → approve. It
was never specific to recording your own software. That's a market flip, not a technology flip.

**It opens the product to every company with repeatable processes**, not just software companies —
operations teams, agencies, finance and back-office, anyone doing the same thing through a web
interface every week.

**One recording gives you both outputs**: something a human can read, and something an agent can run.

**And it completes the picture.** With [opening up to other AI agents](07-other-ai-agents.md),
FlowBuddy supplies knowledge to *other people's* AI. With this, FlowBuddy **brings its own**. Two
halves of the same story.

There's a nice engineering symmetry too — the machinery that replays a recorded workflow gets written
once and used three ways: for checking knowledge is still true, for the in-app assistant doing things
for users, and for this.

---

## The boundaries, stated up front

- **Never free-form browsing.** If a task can't be expressed as recorded, approved workflows, the
  agent doesn't attempt it. It declines honestly, same as everything else in FlowBuddy.
- **Not the same as the assistant acting for users.** That one runs inside a vendor's product for the
  vendor's customers. This is a standalone extension a company runs on tools it doesn't own. Same
  safety rules, different situation.
- **One company's recordings are never visible to another organisation.**

The safety rules carry over unchanged: consent before each run, every input value asked for at run
time (recorded values are masked, so it *has* to ask), explicit confirmation before anything
destructive, stop safely rather than guess, and a full log of what it did.

---

## One honest note on sequencing

"Version 3" is how the idea is packaged, **not the order things get built**. The agent half depends
on machinery that doesn't exist yet — the part that replays a workflow reliably. So real scheduling
follows that work, whenever it happens.

→ Next: [where we are and what's next](09-where-we-are.md)
