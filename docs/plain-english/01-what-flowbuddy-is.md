# 1 · What FlowBuddy is

*(The plain-English version of `product.md` and `competitive-claude-chrome.md`.)*

---

## The one-liner

**Record your product once. Your customers get an AI assistant inside your app that only ever tells
them things you approved.**

You install a Chrome extension, click through your own product while talking out loud, and approve
what FlowBuddy learned. Then you paste one line of code into your app. Your customers now have an
assistant that answers "how do I…" questions instantly — and admits it doesn't know rather than
making something up.

---

## The problem it solves

Every software company needs to help users at the exact moment they're stuck. All the usual options
fail in a specific way:

**Writing documentation is slow, and nobody wants to do it.** Small teams have no technical writer.
It falls to founders and engineers who hate it, so it doesn't get done.

**Products change faster than documentation.** One redesign makes your help articles wrong
overnight. Stale docs are worse than no docs, because people trust them and then get burned.

**Generic AI chatbots make things up.** A support bot is only as good as the knowledge behind it, and
most are bolted onto a knowledge base nobody had time to build. One confidently wrong answer and
your users stop trusting *every* answer.

**Generic assistants don't know where the user is.** "Here's how to do X" in the abstract is far less
useful than "you're on step 3 and here's what's blocking you."

**A help centre is the wrong first thing to build.** Someone stuck inside your app wants the answer
right there — not a link to a portal they have to go search.

---

## Who buys it

**Small SaaS companies — founder-led or a small engineering team, no technical writer.** Somebody who
knows their product cold, has zero time, and is losing build hours to the same support questions over
and over.

That person won't adopt anything that takes more than an afternoon to set up or needs constant
upkeep. Which sets some hard rules for the product:

- Sign up → record → approve → paste a snippet → live assistant, **in under an hour**
- A working assistant from **one recording session**, before anyone writes a single article
- Approving something is **one click**, not writing a document
- Cheap to start; you pay more as you use more

**Not the target, at least for now:** big enterprises with documentation teams and existing tooling.

---

## What your customer actually experiences

A small chat launcher in the corner of your app. They click it and ask something in their own words.

They get an answer built only from what you recorded. It shows which of your workflows it came from.
It knows what screen they're on, so the answer is about *their* situation. It remembers the
conversation, so "and then what?" works. And when it genuinely doesn't know something, **it says so**
instead of guessing.

## What you stay in control of

- Nothing goes live until you approve it
- You choose which websites are allowed to run your assistant
- One key you can regenerate any time
- Sensitive data is hidden **before it ever leaves your browser** during recording

---

## Why this is hard to copy

The easy part — "record a screen flow, get a step-by-step document" — is already a crowded market
(Scribe, Tango, Guidde, Supademo, Arcade), and general-purpose AI is closing that gap fast. That's
not the product.

Four things are:

**1 · An assistant that can only say what you approved.** Not "an AI with your docs in the
background" — an AI that has no other source. If you didn't record it, it declines and tells you
there's a gap. That's the trust difference, and it's why one confidently-wrong answer doesn't happen.

**2 · Knowledge that checks whether it's still true.** Recorded steps carry enough detail to be
*replayed* against your live product, so FlowBuddy can notice when your product changed and the
instructions went stale. This is the hardest thing on the list to copy, and it answers the "products
change faster than docs" problem directly. **Not built yet.**

**3 · It gets better the more it's used.** Every question your users ask, every thumbs-down, every
honest "I don't know" tells you exactly what to record next. The product improves by being used.

**4 · Doing things, not just explaining them.** The assistant can complete a task in the user's own
session — but only workflows you recorded, approved, and separately switched on for it, and only
after the user agrees to that specific run. That's a guarantee no general-purpose browser agent can
make.

---

## The competitor worth watching

**Claude for Chrome** — Anthropic's browser agent that works on the *user's* side. Install it, and it
can click around any website on your behalf.

**Where they beat us:** it works on every site immediately, with no setup and no recording. Enormous
distribution and a real research team behind the safety work.

**Where we beat them:** they improvise. They look at a page and guess what to click, which means
prompt injection is a live risk and there's no guarantee about what the agent will actually do. We
don't improvise — we replay a path a human recorded and a human approved. For anything touching
money, customer data, or an irreversible action, "it only does what you showed it" is a categorically
different promise.

**The uncomfortable read:** they will be good enough for a lot of casual use. Our answer isn't to be
more capable than them — it's to be the version a company can put in front of *its own customers*
and be accountable for.

Full head-to-head, including their published safety numbers: `../product/competitive-claude-chrome.md`.

---

## The honest risks

- **Recording quality is everything.** The assistant can only be as good as what it saw. This is the
  highest-value engineering work in the product.
- **Tuning the "I don't know" line.** Too eager and it invents; too cautious and it's useless. This
  is the core quality dial.
- **Sensitive data can end up in recordings.** Masking during recording is the first defence, and
  there's a second pass that strips it out of answers. Hiding it inside *screenshots* isn't built yet
  — that has to land before any public help portal shows recorded screenshots.
- **Cost.** The assistant talks to an AI model for every question, and the smarter modes talk to it
  several times.
- **Some apps are hard to record.** Canvas-heavy tools (think Figma) and endlessly-scrolling apps
  resist this kind of capture.
- **Acting on the user's behalf is where a mistake stops being cheap.** A wrong answer is a bad
  tooltip. A wrong click is a real event with real consequences.
- **Cold start.** One recording leaves holes. The feedback loop that says "record this next" matters
  earlier than it feels like it should.

---

## What "good" looks like

- Do new signups actually **get an assistant embedded** — and how fast?
- What fraction of answers come with a source, and how often does it honestly decline?
- How many conversations end **without** a human having to step in?
- Do the gaps it reports actually turn into new recordings?

→ Next: [how it all fits together](02-how-it-all-fits-together.md)
