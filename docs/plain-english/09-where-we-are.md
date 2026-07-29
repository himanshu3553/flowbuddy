# 9 · Where we are and what's next

*(The plain-English version of `roadmap.md`, plus the leftovers from `archive/phase-1-review.md`
and `landing-page.md`.)*

**As of 2026-07-29.**

---

## The one-line answer

**The whole first product is live in production and real people have used it end to end. The
assistant is the only one of the three consumers that exists. The next real decisions are about
depth, not breadth.**

---

## What's actually built and working

| | Status |
|---|---|
| Recording your product (Chrome extension) | ✅ live on the Chrome Web Store |
| Turning recordings into clean steps | ✅ built and verified |
| Splitting one recording into separate workflows | ✅ built |
| Approving workflows | ✅ built |
| Studio — recordings, knowledge base, settings, analytics | ✅ built |
| The in-app assistant, embedded with one line | ✅ **live in production** |
| Knowing which screen and step a user is on | ✅ built and verified |
| Pointing at the element on the page | ✅ built |
| Working out why someone is stuck | ✅ built and verified |
| Guided walkthroughs, step by step | ✅ built and verified |
| The conversation surviving page reloads | ✅ built |
| Staying on topic across follow-ups | ✅ built |
| **Copilot mode — the assistant that decides how to help** | ✅ **built, verified, and now the default** |
| Search that works by keyword *and* by meaning | ✅ built |
| Deployed on real infrastructure, on your own domain | ✅ live at flowbuddyai.com |

**The verdict after end-to-end testing of Copilot mode:** *"much more accurate than the AI Chatbot."*

---

## What isn't built

| | Why it matters |
|---|---|
| **The assistant understanding your product** | Every "what does this do?" question gets declined. **The biggest gap.** |
| **Knowledge that checks itself** | Redesign a screen and the assistant confidently describes the old one forever |
| **The assistant doing things for users** | The third mode |
| **The public help portal** | The second consumer |
| **Opening up to other AI agents** | The third consumer |
| **Hiding sensitive data inside screenshots** | Blocks the help portal specifically |
| **Recording by narration only, or from video** | Only click-through recording exists |

---

## The gaps in the assistant, in priority order

These are specific and small enough to actually do.

### 1 · It knows your recipes, not your product

Ask "how do I create an invoice?" and it's excellent. Ask "**what does this tool actually do?**" or
"**can it handle recurring billing?**" and it declines — because no single recorded workflow answers
that. It knows how to *do* things without knowing what your product *is*.

**The fix:** somewhere for you to write, in your own words, what your product is and who it's for.
That gets folded into the knowledge base alongside your recordings.

### 2 · ✅ Fixed — you can now see how it's behaving

Every question now records which setting the workspace was on, **which engine actually answered it**,
how many times the assistant went back to the AI, and how many times it looked something up. The
server also writes one line per question with the exact wording it searched for and, when it refuses,
its own words for why.

Those two things — the setting and the engine that answered — are kept apart on purpose, because they
disagree more often than you'd expect. A workspace set to the smarter mode can still have a question
answered by the screen-reading engine, or by the simple fallback when something goes wrong. Recording
only the setting would have quietly blamed the wrong one.

So *"is the smarter mode worth what it costs?"* is now something you can look up rather than argue
about. **What's still missing is a screen for it** — nothing in the dashboard shows these yet. The
data starts piling up from now, which means the answer gets better the longer you leave it before
asking.

It became urgent the day Copilot became the default, because until then every logged question looked
identical and couldn't be reconstructed afterwards. That's what forced it.

### 3 · The diagnostic reasoning isn't folded in

Working out why someone is stuck still runs as its own separate path rather than being one of the
things the assistant can choose to do. Merging them is deliberately deferred until there are proper
test fixtures for page state. **Do not merge it blind.**

---

## Two things worth knowing about the current state

**The knowledge base is barely two workflows deep.** A second was recorded on 2026-07-29 — which is
what finally made a long-standing answering bug reproducible — but Copilot mode's searching and
disambiguating, the whole reason it's better, has still had almost no chance to fire. More
recordings would test the thing that's supposed to be the improvement.

**The recorder and the server briefly disagreed.** The server was updated to require something the
published recorder didn't send, and for a short window anyone installing from the store had a
recorder that couldn't upload. The newer version is live now and Chrome updates installed copies
itself. Worth remembering: that only went unnoticed because nobody was using it yet.

**There's no spending limit.** Copilot mode can go back and forth with the AI model several times on
a hard question. That was a deliberate decision to skip for now, and it was fine when the smarter
mode was opt-in and only one person used it. **It's now what every new account gets.**

---

## A suggested order

1. **Record more workflows.** Cheap, and it's the only way to find out whether the smarter mode
   actually earns its keep.
2. **Let the founder describe their product.** The biggest quality improvement available.
3. **Fold in the diagnostic reasoning** — but only after there are test fixtures for it.

   *(Recording how the assistant answered used to sit at the top of this list. It's done — see
   above. What's left of it is a screen to show the numbers on.)*

Then the bigger forks: knowledge that checks itself (hardest, best moat), the assistant doing things
(highest risk, highest value), the help portal, or opening up to other AI agents (assessed as
weeks not months, and strategically well-timed).

---

## Smaller things on the list

Nothing here blocks anything. Roughly by usefulness:

- **Error tracking** — nothing aggregates errors from the live services today
- **Cost visibility** — no record of what any question cost to answer
- **Recording quality** — form values are lost on a full page reload; better labels for typed and
  scrolled actions
- **No size limit on what a recording uploads** — now that files go straight from the browser to
  storage, nothing caps how much a single recording can write. **Deliberately left alone for now**,
  not overlooked. It isn't a way in for a stranger — you need an account's own recorder key to upload
  at all — but a runaway recording would show up as a storage bill rather than an error, and a leaked
  recorder key does more damage than it used to. The fix is to state each file's exact size when the
  permission slip is issued, so storage itself rejects anything else; that means the recorder has to
  prepare each file before asking permission, which is a reordering of a hot path and not something to
  rush into a batch of small hardening fixes
- **A private-beta gate** — signup is deliberately open right now
- **Tightening the extension's permissions** — it currently asks for access to all sites; it could
  ask only for the tabs actually being recorded, which reads better both to the Chrome Web Store and
  to users
- **Studio and widget polish** — accessibility on the widget, per-account time zones for analytics,
  a real "tickets deflected" number

There's also an **automated test layer** that used to be on this list. That's now partly done — the
first tests exist, they cover the trickiest logic, and they've already caught two real bugs.

---

## Parked on purpose

**The landing page.** Currently a coming-soon card. The positioning direction — *"make your product
AI-agent-ready"* — is captured but not locked, and copilot-first stays the official story. Parked
deliberately: no customers are being chased yet.

**Proactive help.** Should the assistant ever tap someone on the shoulder unprompted? Interesting,
risky, and set aside. If it ever happens the shape is roughly: off by default, triggered by real
evidence of being stuck rather than a guess, once per session at most, permanently dismissible, and a
quiet badge rather than a panel that opens itself.

---

## One piece of history worth keeping

The product used to be planned portal-first — build a help site, then maybe an assistant. That got
deliberately reversed, because **someone stuck inside your app wants the answer right there**, not a
link to go and search.

Almost everything about the current shape follows from that one decision.

→ Next: [running it on your machine](10-running-it-locally.md)
