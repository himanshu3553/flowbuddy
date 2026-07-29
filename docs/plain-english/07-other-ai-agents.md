# 7 · Opening up to other AI agents

*(The plain-English version of `interop.md`.)*

**Status: a direction, not a plan.** The idea is captured and the feasibility has been checked. It
hasn't been designed and it isn't scheduled.

---

## The idea

The first two consumers point your knowledge at **people** — your customers, via the assistant or a
help site.

This one points it at **other companies' AI**.

Someone's AI agent — Claude for Chrome, an internal agent fleet, a custom automation — needs to
actually *do* something in your product. Right now it looks at your screen and guesses. With this, it
reads the workflows you recorded and approved, and follows them.

**One recording session makes your web app usable by AI agents.**

---

## Why this is a genuinely strong position

**The hard part is already built.** Your recorded steps already carry everything an agent needs to
act reliably: the instruction, the URL, several ranked ways to find each element on the page, and
what the screen should look like when the step worked. That was built for other reasons and it's
exactly the right shape. **This is an export, not a new pipeline.**

The check done in July found the compiler is already 80% there — the thing that turns approved
workflows into a machine-readable plan exists, because the assistant needed one to work out where a
user is. It needs generalising, not building.

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

---

## The same rule as everything else

`ONE knowledge base → you approve per consumer → { assistant, help portal, outside agents }`

An outside agent gets **only** workflows you specifically approved for that purpose, plus a
workspace-level opt-in. Recorded values stay masked, exactly as they are everywhere else. No new
pipeline, no second copy of the truth — one more approval switch on the model that already exists.

**Approval becomes the permission model for the agent era.** That's the sentence worth remembering
from this whole idea.

---

## How it would actually be delivered

Four options were assessed. The recommendation is drafted but **not locked**:

| Option | Verdict |
|---|---|
| **A dedicated endpoint agents connect to** (MCP) | **the lead** — a per-workspace address an agent connects to, with a "find the workflow for this task" lookup |
| **Plain markdown / a well-known text file** | **rides along in v1** — cheap, works with anything that can read a URL |
| **The browser announces it** (WebMCP) | **the prepared bet** — your existing widget snippet registers your workflows with the browser, so any agent on the page finds them without connecting to anything |
| **A custom REST API** | **skipped** — everyone would have to write a custom integration; that's not a product |

That third one is the interesting one strategically. If it lands, the snippet you already pasted for
the assistant does double duty, and every agent that visits your site discovers your workflows
automatically.

---

## What gets sent

**Two layers**, because different agents perceive differently:

**The instructional layer — always.** Human-readable steps, the URL each happens on, and what a
successful step looks like. Any agent can use this.

**The machine layer — optional.** The precise ways to find each element on the page. Useful to agents
that drive the page structure directly, useless to agents that work from screenshots. Optional
because half the market doesn't want it.

Screenshots would be valuable here too, and they're blocked behind the same thing blocking the help
portal: **redacting sensitive content inside images isn't built.**

---

## Three honest caveats, already written down

**1 · The quality bar goes up.** A human reading a slightly-wrong step notices and adjusts. An agent
turns it into a wrong action. The known recording gap — form values lost on a full page reload — is a
minor annoyance today and becomes a real problem here. It earns a higher fix priority the day this
gets scheduled.

**2 · Nothing checks whether the workflows are still true.** Without self-validation, exported
workflows can go stale silently. Normal for documentation, worse for something that acts. The
mitigation from day one is honesty: every export carries when it was compiled and when it was last
verified, so a consuming agent can judge for itself.

**3 · The machine layer only serves some agents.** Which is why it's a separate, optional layer
rather than the main event.

---

## Why this might be bigger than it looks

The scope isn't "SaaS products". It's **any web application where tasks get done through a UI** —
banking, internal admin panels, marketplaces, back-office tools.

**Internal tools may be the strongest wedge.** Companies pointing their own AI at their own admin
panels need exactly this manual — and internal tools essentially never have documentation written for
them.

→ Next: [the company agent](08-the-company-agent.md)
