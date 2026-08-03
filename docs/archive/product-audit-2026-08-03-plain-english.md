# FlowBuddy — The 2026-08-03 Audit, in Plain English

> **What this is.** The same audit as [`product-audit-2026-08-03.md`](product-audit-2026-08-03.md),
> written in ordinary words. No file paths, no module IDs, no jargon — just what's wrong, why it
> matters, and what to do about it.
>
> **Read the technical version when you're ready to actually fix something** — it has the exact
> lines, the reasoning, and the six findings that turned out to be wrong.

---

## 1. Three things are quietly making the copilot worse than it should be

### Long recordings poison their own knowledge

When you record for more than about seven minutes, only the **first** workflow gets described from
the right part of your narration. Everything after that gets described using what you said at the
**beginning** of the recording.

So the "what this task actually is, and what's optional" summary — the one thing that stops the
copilot marching a customer down a path they can't follow — comes out generic for most of a long
tour.

It doesn't look like a bug. It looks like the AI just being vague.

**This is the single best fix-to-effort ratio in the whole audit: about six lines of code.**

### You approve things you can't see

When you flip the switch to approve a workflow, that screen doesn't show you the AI-written
description — only the steps. But the copilot reads that description out to your customers.

And "Approve all" puts your entire knowledge base live without ever showing you a single one of them.

Your own project notes say this must never happen. The screen just never caught up.

### When the AI fails, you get told to record something you already recorded

If the model runs out of room mid-answer, it comes back empty — which looks exactly like "we don't
cover this."

So two things happen at once: your customer is told the product doesn't know something it *does*
know, and a fake entry lands in your "record this next" list.

You could spend an afternoon re-recording a workflow that was never missing.

---

## 2. People are getting stuck before they ever see value

### The very first button is broken

"Install the recorder" sends people to your Settings page, which shows two lines of text: workspace
name and email address. No download link, no instructions, no way to connect.

That's the first click every single signup makes.

### Capital letters can lock someone out forever

If someone signs up as `Fiona@acme.com` and later types `fiona@acme.com`, that's a different account.
Sign-in fails.

They click "forgot password" — and because that flow correctly refuses to reveal whether an account
exists, no email arrives and they get **no explanation at all**. They conclude your product is broken.

One-line fix.

### Nothing coaches people while they're recording

Narration is the raw material for everything — the descriptions, the plans, the product-knowledge
pages. You already discovered that most people's narration is useless click-commentary ("now I click
here, now I click this").

And the screen in front of them while recording shows… a stopwatch.

One rotating hint line — *"say what you're about to do and why someone would do it"* — would improve
titles, descriptions and workflow splitting all at once, with no changes to the AI at all.

### And if the microphone silently fails, nothing tells them

The recording finishes, looks completely fine, and quietly has no narration layer at all.

### Your own website's copilot is switched off

The "See it in action" button on flowbuddyai.com just scrolls down the page, because the widget key
was never set in the deploy config.

So the one thing that would prove your pitch in five seconds — ask FlowBuddy about FlowBuddy — doesn't
exist. Meanwhile every competitor can be tried in a browser before signing up; you're asking someone
to install a Chrome extension and record themselves first.

**This one fix is three things at once:** your demo, your best production health-check, and the second
knowledge base that half your roadmap is waiting on.

---

## 3. Your customers' users have some rough edges

- **The chat can hang forever.** There's no time limit on the AI call. If it's slow, the user watches
  three dots with the text box locked, and no way to cancel.
- **Blind users can't use it.** The answer arrives but is never announced by a screen reader. They can
  type; they just never hear the reply.
- **No dark mode.** In any dark-themed product it's a glaring white box.
- **Light brand colours make it unreadable.** The text sitting on your accent colour is permanently
  white, so a yellow or pale-blue brand gives white-on-white.
- **On phones,** tapping the box zooms the whole page, and the keyboard covers the place you type.
- **Sometimes it scolds people.** When the rate limit trips, the user reads *"rate limit exceeded —
  slow down"* — which sounds like **they** did something wrong, inside someone else's product.

---

## 4. The dashboard is telling you things that aren't quite true

### "Tickets deflected" is just the count of questions answered

Five follow-up questions from one confused person count as five deflected tickets.

That's the number you'd put in an investor update. The day you notice your support inbox didn't shrink
is the day you stop trusting the whole page.

### You can't see what the copilot actually said

When someone gives a thumbs-down, you see the question and nothing else. You can't tell whether it
cited the wrong workflow, made something up, or just phrased it badly.

Every day this stays unfixed is a day of feedback you can never get back.

### "Record this next" never closes

You record the thing. You approve it. And the red warning card still sits there until you manually
dismiss it. Nothing ever checks whether your work actually fixed the problem.

That moment — *"did that afternoon pay off?"* — is the strongest reason a solo founder keeps going,
and right now it produces nothing.

### A quiet week reads as failure

If nobody asked anything in the last 7 days, the page says "0% resolved without a human" instead of
"no data yet."

### Nothing shows you which workflows are dead weight

Approved, live, and never once used. You can't see them.

---

## 5. You can't take money yet

- **No price anywhere.**
- **No spending cap** — someone could run up a large AI bill on your account and the first you'd know
  is the invoice.
- **No terms of service**, and no list of the outside companies that touch customer data.
- **No way for someone to delete their account or export their data** without emailing you.
- **No way to add a second person to a workspace.** The only option is sharing your password.

None of these matter for ten hobbyist users. All of them together are why the first serious prospect
will stall.

### One more, on trust

Your marketing says "sensitive data is masked in your browser" — but only **typed form fields** are
masked. Screenshots and page snapshots go up as they are.

There's no leak here, and your privacy policy itself is honest. But the wording promises more than the
mechanism does.

**The worst version is inside the recorder itself:** a permanently-on switch reading *"Mask PII before
upload — always on"*, sitting in front of someone at the exact moment they press record.

That's five sentences to fix.

---

## 6. Things that break when you succeed, not now

- **Every question loads your entire knowledge base into memory.** Fine at two workflows. Expensive at
  two hundred.
- **The database is missing a few indexes** it will badly want later. Cheapest to add now, while the
  tables are still tiny.
- **Detail pages confuse the copilot.** A workflow recorded on one customer's record doesn't recognise
  someone standing on a different customer's record — so it can tell them to "click Edit" when they're
  already inside the edit form.
- **Your tests take 187 milliseconds and nothing runs them.** Pushing to the main branch deploys
  straight to customers with zero checks in between. That's one small config file.

---

## 7. The one big call

**Spend the next quarter getting real depth into two or three knowledge bases — not building the next
phase.**

Almost every open question in your own notes is waiting on the same thing, and each note says so
separately:

- *"calibrate on a second product"*
- *"record two or three more first"*
- *"the KB is only two workflows deep, so every judgment is provisional"*

Three of the copilot's smartest abilities — searching in its own words, choosing between workflows,
and asking *"did you mean X or Y?"* — **have literally never run**, because there has never been more
than one option to pick from.

Self-validation can't validate two workflows. Autopilot can't safely act on knowledge that was never
validated. Both are waiting on the same missing input — and so is your ability to honestly say how
good this thing is.

---

## What I'd actually do first

If you only do one week of work, do these. They're all small and independent:

1. **Fix the transcript slicing** — so long recordings stop producing vague descriptions
2. **Show the description on the approval screen** — so approving means what you think it means
3. **Put a time limit on the AI calls** — so the chat can't hang forever
4. **Stop filing your own failures as coverage gaps** — so "record this next" stays honest
5. **Lowercase email addresses** — so nobody gets permanently locked out
6. **Add the three missing confirmation messages** — approve-all, save-origins, and key rotation
   *(that last one takes your live copilot offline with no confirmation at all)*
7. **Turn on the tests** — so a bad push can't reach customers
8. **Point "Install the recorder" somewhere real**
9. **Switch on the copilot on your own website**

---

## One caution before you act

About **150 of the 180 findings were read by one reviewer and never challenged.**

The 18 that *were* challenged got knocked down or corrected **17 times** — including the one that
originally looked like the biggest problem of all.

So before acting on anything outside the list above, open the technical document and read the lines it
points at. Its final section lists the six findings that turned out to be wrong, so nobody wastes a day
"fixing" them.
