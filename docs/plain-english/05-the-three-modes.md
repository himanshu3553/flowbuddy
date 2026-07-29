# 5 · The copilot's three modes

*(The plain-English version of `agent.md`, `agent.md` and
`agent.md`.)*

---

## The idea in one sentence

**The same assistant can be run three ways, and you pick which one your customers get.**

```
  AI Chatbot   Answers questions. Fixed rules decide everything else.
               ✅ built · this is the simple, predictable one

  Copilot      Decides how to help as the conversation goes — explains,
               points at things, offers to guide. Never touches your page.
               ✅ built · ⭐ THIS IS WHAT NEW ACCOUNTS GET

  AI Agent     Does things for the user.
               ❌ not built
```

You choose in **Studio → Copilot → Settings**, and you can switch between the two built ones freely
in either direction. **These are also intended to be the pricing tiers.**

---

## Where the real line is

The instinct is to draw the line at *"is there an AI agent involved?"* That's the wrong place.

The line is at **acting**.

When the assistant *tells* someone what to do, or *points* at a button, or *walks them through*
steps — **the user is still the one doing it.** They read, they judge, they click. If the assistant
is wrong, they've been given a bad tooltip and they notice.

The moment the assistant clicks the button itself, **accountability moves.** The same mistake stops
being an unhelpful suggestion and becomes something that happened in a real account with real
consequences.

So: everything up to and including guiding is safe, and lives in Copilot mode. Doing is separate,
and gated. **The safe half is deliberately not held hostage to the risky half.**

---

## Mode 1 · AI Chatbot

Someone asks a question. One trip to the AI model. An answer comes back, grounded in your approved
workflows, with a source — or an honest decline.

Everything else is decided by **fixed rules**. Was this a positional answer? Then highlight, and
offer a walkthrough. Every time, the same way.

**Why it still exists** even though Copilot is better:

- It's predictable and cheap. Exactly one AI call per question, always.
- It's a **sold tier** — the simple, cheaper option.
- It's the **safety net.** If anything ever goes wrong with the stored setting, this is where it
  lands. And if the smarter mode fails on a question, that question quietly falls back to this.

---

## Mode 2 · Copilot ⭐ the default

Same knowledge, same guarantees, different **orchestration**.

Instead of one shot at answering, the assistant runs a short loop and can decide, turn by turn, what
it needs: search the knowledge base again with better words, pull up a whole workflow to read the
steps, ask a clarifying question, point at something, offer to guide.

### What that actually changes

| | AI Chatbot | Copilot |
|---|---|---|
| Question it can't match on the user's literal words | usually declines | searches again with better words |
| Genuinely ambiguous question | guesses or declines | **asks which one you mean** |
| Highlighting and walkthrough offers | fixed rule, every positional answer | **when the assistant judges it helps** |
| Cost | exactly one AI call | one for simple questions, more when it needs them |

That third row is worth understanding properly, because it's the one that surprises people.

**Your switches still win.** Nothing the AI decides can turn on something you turned off. What
changes is the *meaning* of a switch being on: in AI Chatbot it means *"do this every time"*, and in
Copilot it means *"you may do this when it helps."* So you'll see highlights and walkthrough offers
**less often** in Copilot mode — and that's the feature, not a fault.

### The one rule that makes it safe

**The assistant's options are things in your knowledge base — never things on the page.**

It can say "run workflow 4 from step 2." It can never say "click the element in the top right."
That's enforced by only ever *giving* it knowledge-base-shaped options, not by asking it nicely in a
prompt.

### A structural fact worth knowing

AI Chatbot and Copilot are **the same machine**. AI Chatbot is that loop with no options given to it
and a hard stop after one round. Bind zero tools, and the loop makes exactly one call and finishes.

That's not trivia — it means if you ever decide the simple mode isn't worth keeping, collapsing it
into Copilot is raising a limit, not a rewrite.

### It's now the default

Since 2026-07-27, **anyone who signs up gets Copilot**, with pointing and guided walkthroughs already
permitted. Nothing to find, nothing to switch on.

Accounts that existed before that date keep whatever they had — a default only applies to new
accounts, and the setting can't tell "someone chose this" from "someone inherited this."

---

## Mode 3 · AI Agent — not built

The assistant completes the task instead of describing it.

The design decisions are locked even though nothing is written:

**It only runs workflows you recorded and approved.** Not "an AI that browses your app." It replays a
path a human demonstrated and a human approved.

**Sensitive input is never typed by FlowBuddy.** For a password or a card number, the assistant
highlights **your app's own field** and asks the user to type there. The value never passes through
FlowBuddy at all.

**An unavailable action doesn't exist, rather than being refused.** If a workflow isn't approved for
acting, the assistant simply isn't given the option — so it can never say *"I could do this but your
admin hasn't enabled it"*, which would leak your configuration to your customers and generate support
tickets for you.

**Offering is conversational; agreeing is not.** The assistant can *ask* "want me to do this for
you?" in normal language. But the actual go-ahead is a real button, not the user typing "yeah go on".

**A warning that's already been written down:** today there's a natural speed bump between being told
something and being acted for — you have to press a distinct button. A fluid conversational agent
erases that bump. So the approval gate and the safety rails become the *only* clear line between
answering a question and changing something in someone's account. That makes them **more** important
under this design, not less.

---

## How to think about choosing

**AI Chatbot** if you want the cheapest, most predictable thing, or your workflows are simple enough
that one-shot answers are always right.

**Copilot** for basically everyone else. It was measurably more accurate in testing — the founder's
verdict after end-to-end testing was *"much more accurate than the AI Chatbot."*

**AI Agent** doesn't exist yet.

---

## What's still missing in Copilot mode

Two things left, plus one that's now fixed — in priority order:

**1 · It knows your recipes, not your product.** Every orienting question — "what does this do?",
"can it handle X?" — gets declined, because no single recorded workflow answers it. The fix is a
place for you to describe your product in your own words, which then joins the knowledge base.
**This is the biggest one.**

**2 · ✅ Fixed — you can see how it's behaving.** Every question now records the workspace's setting,
**which engine actually answered it**, how many times it went back to the AI and how many times it
looked something up — plus one line per question in the server's own log holding the exact wording it
searched for, and its own words when it refuses. The setting and the answering engine are stored
separately because they disagree more often than you'd think, and recording only the setting would
have blamed the wrong one. So *"is the smarter mode worth its cost?"* is now a lookup rather than an
argument. Still missing: a screen showing it — the numbers are being collected, nothing displays them
yet.

**3 · The diagnostic reasoning isn't folded in.** Working out *why* someone is stuck still runs as
its own separate path rather than being one of the things the assistant can choose. Merging them is
deliberately deferred until there are proper test fixtures for page state — **do not merge it blind.**

One more thing worth knowing: **the knowledge base it's been tested against is barely two workflows deep.** A second was recorded on 2026-07-29 — which is what finally made a long-standing answering bug reproducible at all.
So the searching and disambiguating abilities — the whole reason Copilot mode is better — have never
actually had a chance to fire in anger.

→ Next: [the help portal](06-the-help-portal.md)
