# 6 · The three things we haven't built yet

*(The plain-English version of `portal.md`, `interop.md` and `company-agent.md`.)*

Three directions, none of them built, in descending order of how settled they are: **a public help
site**, **opening your product up to other companies' AI**, and **the flip** — a company recording
the tools it *uses* rather than the one it sells.

---

## The one rule all three inherit

```
  ONE knowledge base  →  you approve per audience  →  { the assistant, a help site, outside agents }
```

Nothing extra gets recorded and there is no second copy of the truth. Each new audience is **one more
approval switch on the model that already exists**, and what an audience may see is decided by you,
per workflow, per audience. Recorded values stay masked everywhere, exactly as they are today.

**Approval becomes the permission model for the agent era.** That's the sentence worth remembering
from all three of these.

---

## 1 · A public help site

**Status: nothing exists. No work has started.**

### The idea

The same recordings that power the in-app assistant can also produce a **public help website**.

A help article, in this design, isn't something anyone writes. **A help article is an approved
workflow, displayed.** Your recordings already become a title plus clean steps, each with an
instruction, extra detail, the URL, and a screenshot with the clicked element highlighted. That's a
help article already — it just needs a page to live on.

### Why it's second, not first

This was originally going to be the *first* thing built. It got deliberately demoted, and the reason
is worth keeping in mind, because almost everything about the current shape follows from it:

**Someone stuck inside your app wants the answer right there.** Not a link to a portal they have to
go and search. The in-app assistant meets the user at the moment of confusion; a help site makes them
leave and go looking.

The portal is real value — public help pages get found by search engines, and some people genuinely
prefer to read the whole thing — but it's a **by-product**, not the product.

### The rule that keeps them independent

**Approving a workflow for the assistant and publishing it to a help site are two separate actions
over the same knowledge.** Neither requires the other, ever.

This matters more than it sounds. The audiences differ: your in-app assistant talks to people already
logged in, and a public site talks to the whole internet. You'll want things answered in-app that you
would never publish publicly, and probably the reverse too.

The assistant must **never** depend on anyone writing or publishing an article. That's a hard rule.

### What would get built

Roughly in this order:

**1 · The publishing foundation.** Approval becomes per-audience — a workflow can be approved for the
assistant, for the portal, both, or neither.

Alongside it, **an editing layer that sits on top rather than changing anything underneath.** If you
want the public version to have a friendlier title, an intro paragraph, a reordered step or a hidden
one, those edits are applied **when the page is drawn** — the underlying knowledge is untouched. So
the assistant and the portal can never drift apart. One source of truth, two presentations.

**2 · Type a topic, get an article.** Rather than picking from recordings, you type what you want an
article about. FlowBuddy searches everything you've recorded and writes a grounded article — or
declines and logs it as a gap. Because it searches everything, an article can span several separate
recordings.

**3 · The public site itself.** A per-workspace public website showing only portal-approved
workflows, rendered server-side with the steps, screenshots and highlights.

**4 · Search.** For both the public site and Studio. Searches that return nothing get logged — those
are gap signals too.

**5 · Editing depth.** Split, merge and reorder steps. Retake or crop a screenshot. Add callouts and
warnings. Link related workflows. Write plain pages that aren't backed by any recording at all
(badged as such, since they can't be self-checked).

**6 · Making it a real product.** Your branding, your own domain, control over who can see it,
"was this helpful?", and search-engine basics.

**7 · Gaps and teams.** One dashboard for everything users couldn't find — across the assistant, the
portal search, and article writing. Plus multiple people per account with roles.

### The thing that has to happen first

**Hiding sensitive data inside screenshots isn't built.**

Today, sensitive text is masked during recording and stripped out of the assistant's answers. But the
*pixels* of a screenshot aren't scanned. Right now that's contained — screenshots are only ever seen
by you, in your own Studio.

**A public help site would put those screenshots on the open internet.** So screenshot redaction is a
hard blocker for publishing, not a nice-to-have. It's tracked as part of this work for exactly that
reason.

---

## 2 · Opening up to other AI agents

**Status: a direction, not a plan.** The idea is captured and the feasibility has been checked. It
hasn't been designed and it isn't scheduled.

### The idea

The first two consumers point your knowledge at **people** — your customers, via the assistant or a
help site.

This one points it at **other companies' AI**.

Someone's AI agent — Claude for Chrome, an internal agent fleet, a custom automation — needs to
actually *do* something in your product. Right now it looks at your screen and guesses. With this, it
reads the workflows you recorded and approved, and follows them.

**One recording session makes your web app usable by AI agents.**

### Why this is a genuinely strong position

**The hard part is already built.** Your recorded steps already carry everything an agent needs to
act reliably: the instruction, the URL, several ranked ways to find each element on the page, and
what the screen should look like when the step worked. That was built for other reasons and it's
exactly the right shape. **This is an export, not a new pipeline.**

It has gone further than that since the feasibility check. The assistant's own acting mode now
compiles a fuller plan for every workflow you switch on — what each step *does*, several ways to find
the element, the address, the values it needs, which steps commit something, and what success looked
like. Exporting is now closer to generalising something that already runs than to building anything.

**The verdict was: weeks of work, not months**, for a knowledge-only first version.

**The timing is right.** Agents that operate web apps are becoming a default expectation. Every
product owner is about to need an answer to "is your app agent-ready?" Whoever holds the structured
workflow knowledge is positioned to *be* that answer.

**And the safety argument inverts in our favour.** Free-form browser agents improvise, and there are
published numbers on how often prompt-injection attacks against them succeed. Agents reading your
approved workflows don't improvise — they follow a path a human recorded and a human approved.

There's a clean claim to make here: **everything FlowBuddy would serve is founder-recorded,
founder-approved and value-masked.** No raw click logs, no end-user content, no third-party text. As
a supplier of context into someone else's AI, that's about as clean as it gets.

### How it would reach them

Several delivery routes were assessed and one is recommended but not locked, which is a decision at a
level of detail the technical docs own.

The strategically interesting one is worth knowing about here, though: **the snippet you already
pasted for the assistant could do double duty.** Browsers are starting to let a page announce what
can be done on it, directly to any AI agent visiting. If that lands, every customer who already has
the widget becomes agent-ready with no new integration at all — fleet-wide, in one move.

### What gets sent

**Two layers**, because different agents perceive differently:

**The instructional layer — always.** Human-readable steps, the URL each happens on, and what a
successful step looks like. Any agent can use this.

**The machine layer — optional.** The precise ways to find each element on the page. Useful to agents
that drive the page structure directly, useless to agents that work from screenshots. Optional
because half the market doesn't want it.

Screenshots would be valuable here too, and they're blocked behind the same thing blocking the help
site above: **redacting sensitive content inside images isn't built.**

### Three honest caveats, already written down

**1 · The quality bar goes up.** A human reading a slightly-wrong step notices and adjusts. An agent
turns it into a wrong action. The known recording gap — form values lost on a full page reload — is a
minor annoyance today and becomes a real problem here. It already got more urgent than this section
assumed, because the assistant now acts for users itself — a plan missing typed values is a form
submitted half-empty.

**2 · Nothing checks whether the workflows are still true.** Without self-validation, exported
workflows can go stale silently. Normal for documentation, worse for something that acts. The
mitigation from day one is honesty: every export carries when it was compiled and when it was last
verified, so a consuming agent can judge for itself.

**3 · The machine layer only serves some agents.** Which is why it's a separate, optional layer
rather than the main event.

### Why this might be bigger than it looks

The scope isn't "SaaS products". It's **any web application where tasks get done through a UI** —
banking, internal admin panels, marketplaces, back-office tools.

**Internal tools may be the strongest wedge.** Companies pointing their own AI at their own admin
panels need exactly this manual — and internal tools essentially never have documentation written for
them.

---

## 3 · The company agent

**Status: an idea, captured. Not designed, not scheduled, nothing built.**

### The flip

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

### The two halves

**Half one: your company's own operating manual.** Every repeatable process, recorded by whoever
actually does it, turned into clean steps automatically. Internal procedures are even less likely to
get written down than product documentation — and this gets them written by someone just doing their
job once, out loud.

**Half two, the interesting one: FlowBuddy ships its own AI agent.** A second Chrome extension — the
same *kind* of thing as Claude for Chrome — that the company uses to actually run those tools.

And the difference is the whole point: **it only runs workflows the company recorded and approved.**
It never improvises.

### Why that difference matters so much

General-purpose browser agents work by looking at a page and deciding what to do. Which means a page
can *talk to them*. Text on a website can influence what the agent does next — there are published
numbers on how often that attack works, and they aren't reassuring.

An agent whose available actions are a fixed list of recorded, approved workflows **cannot be talked
into anything**, because nothing it reads on a page can add to that list. The safety property isn't a
filter or a guardrail that might be bypassed — it's structural.

That's the sentence the whole idea rests on: **an agent that can only do what you showed it.**

### Why it's a natural fit rather than a new product

**The factory doesn't care whose product goes through it.** Record once → clean steps → approve. It
was never specific to recording your own software. That's a market flip, not a technology flip.

**It opens the product to every company with repeatable processes**, not just software companies —
operations teams, agencies, finance and back-office, anyone doing the same thing through a web
interface every week.

**One recording gives you both outputs**: something a human can read, and something an agent can run.

**And it completes the picture.** With the idea above, FlowBuddy supplies knowledge to *other
people's* AI. With this one, FlowBuddy **brings its own**. Two halves of the same story.

There's a nice engineering symmetry too — the machinery that replays a recorded workflow gets written
once and used three ways: for checking knowledge is still true, for the in-app assistant doing things
for users, and for this.

### The boundaries, stated up front

- **Never free-form browsing.** If a task can't be expressed as recorded, approved workflows, the
  agent doesn't attempt it. It declines honestly, same as everything else in FlowBuddy.
- **Not the same as the assistant acting for users.** That one runs inside a vendor's product for the
  vendor's customers. This is a standalone extension a company runs on tools it doesn't own. Same
  safety rules, different situation.
- **One company's recordings are never visible to another organisation.**

The safety rules carry over unchanged: consent before each run, every input value asked for at run
time (recorded values are masked, so it *has* to ask), explicit confirmation before anything
destructive, stop safely rather than guess, and a full log of what it did.

### One honest note on sequencing

"Version 3" is how the idea is packaged, **not the order things get built**. The agent half depends
on machinery that now exists in one place — the part that replays a workflow reliably, built first
for the in-app assistant because that's where the first real runs happen. It gets lifted into
something shared the moment a second thing needs it, and real scheduling follows that.

→ Next: [running, shipping and testing it](07-running-and-shipping-it.md)
