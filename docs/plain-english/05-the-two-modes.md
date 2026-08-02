# 5 · The copilot's two modes

*(The plain-English version of `agent.md`.)*

---

## The idea in one sentence

**There is one assistant, and the only question is whether it may do things for your customers or
only tell them.**

```
  Copilot      Decides how to help as the conversation goes — explains,
               points at things, offers to guide. Never touches your page.
               ✅ built · this is what everyone gets

  AI Agent     Does things for the user.
               ❌ not built
```

You choose in **Studio → Copilot → Settings**. **These are also intended to be the pricing tiers.**

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

## Copilot — what everyone gets

Someone asks a question. The assistant runs a short loop and decides, turn by turn, what it needs:
search your knowledge again with better words, pull up a whole workflow to read the steps, ask a
clarifying question, point at something, offer to guide. Then it answers — grounded in your approved
workflows, with a source, or with an honest decline.

**Your switches decide, and nothing else does.** Pointing at things and offering to guide are on or
off, and when they're on they happen on every answer that knows where the user is standing. For a
while the assistant judged it per message; that was reversed, because a switch that might or might
not do anything is one you can't demonstrate to a customer or tell apart from a switch that's off.

### The one rule that makes it safe

**The assistant's options are things in your knowledge base — never things on the page.**

It can say "run workflow 4 from step 2." It can never say "click the element in the top right."
That's enforced by only ever *giving* it knowledge-base-shaped options, not by asking it nicely in a
prompt.

---

## There used to be a third mode

Until August 2026 there was a simpler one below Copilot, called **AI Chatbot**: one trip to the AI
model per question, and fixed rules deciding everything else. It was retired.

**Why it went.** It was a worse Copilot that cost twice as much to look after. It had its own separate
set of instructions and its own separate way of showing the assistant what it knew — so every
improvement to the product's knowledge had to be built twice. There was even a standing note in the
codebase warning that if anyone ever improved one and forgot the other, the *safety net* would start
answering worse than the paid tier above it.

Nobody could name a customer who'd want it. So rather than keep documenting a trap, it was deleted.

**What survived.** The machinery underneath it is still there, doing one job: if the smart loop ever
fails on a question — a timeout, an error from the AI provider — that question quietly falls back to a
single simple answer rather than showing your customer an error. It isn't a mode, you can't select it,
and it doesn't appear anywhere in Studio. Safety nets you can sell are safety nets you get asked to
make nicer.

Two details made this cheap, and they're worth knowing because they'll make the *next* change cheap
too:

- The two modes were always **the same machine**. The simple one was the loop with nothing to choose
  from and a hard stop after one round. So there was nothing to port — the safety net *is* that same
  loop, unchanged.
- The setting is stored as plain text rather than a fixed list of allowed values, so removing an
  option cost one line of database housekeeping instead of a schema change.

---

## AI Agent — not built

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

## What's still missing in Copilot mode

**1 · ✅ Fixed — it knows your product, not just your recipes.** Orienting questions — "what does this
do?", "what's the difference between the plans?" — used to be declined, because no single recorded
workflow answers them. The assistant now derives what your product *is* from the same recordings your
workflows come from, and you approve that knowledge separately.

**2 · You can see how it's behaving, but only in the logs.** Every question records which engine
actually answered it, how many times it went back to the AI, and what it looked up. Still missing: a
screen showing it. The numbers are being collected; nothing displays them yet. This is worth watching
for a new reason now — a run of questions answered by the safety net means something upstream is
failing, and nothing else would tell you.

**3 · The diagnostic reasoning isn't folded in.** Working out *why* someone is stuck still runs as
its own separate path rather than being one of the things the assistant can choose. Merging them is
deliberately deferred until there are proper test fixtures for page state — **do not merge it blind.**

→ Next: [the help portal](06-the-help-portal.md)
