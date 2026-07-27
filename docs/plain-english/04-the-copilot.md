# 4 · The copilot

*(The plain-English version of `phase-2-sense.md` and the widget half of `phase-1-copilot.md`.)*

**This is the first of the three things that use your knowledge base — and the only one that's
built.** It's live in production and real people have used it.

---

## What your customer sees

One line of code in your app puts a small launcher in the corner. They click it, a chat panel opens,
they type a question in their own words.

The panel floats above your app — **it never pushes your layout around**. They can drag it by its
header, and expand it taller if they want more room. You choose which corner, the colour, the title,
and the greeting, and you change all of that from Studio without touching your code again.

---

## The five things it can do

### 1 · Answer from what you approved

The core promise. It searches your approved workflows two ways at once — literal keyword matching and
matching by *meaning* — then writes an answer grounded only in what it found.

It shows which workflow the answer came from. **And if the knowledge doesn't cover the question, it
says so** rather than reaching for what the AI model happens to know about software in general.

### 2 · Know where the user is

This is what makes it feel different from a support bot.

When someone sends a message, the widget quickly checks the page they're actually looking at against
the workflows you approved: are the elements from step 3 here? Are they visible? Filled in? Is there
an error showing?

It scores the best guesses and sends them along with the question. The AI then decides what to do
with that, **with the question in hand** — which matters, because context should never override what
was actually asked. Three things can happen:

| The situation | What it does |
|---|---|
| They're on your billing page but asking about something else entirely | Ignores where they are. Answers the question they asked. |
| They're on billing and asking about billing | *"You're on step 3 of Create an invoice — here's what's blocking you, then here's the rest."* |
| They ask **"what now?"** or **"why can't I continue?"** | This is the one that's impossible without it. "This" means *this screen, this step*. |

**Some important properties:**

- It only checks the page **when a message is sent**. Never when the panel opens, never in the
  background, never continuously.
- It only tests against workflows **you approved**.
- What leaves the page is **yes/no answers** — "was this element found, is it visible, is it filled"
  — plus one masked error message if there's an error on screen. Not the page contents.
- It re-checks on **every follow-up**, so if the user moves forward it notices: *"Nice, you're on
  step 4 now."*
- If two workflows genuinely tie, it **asks** instead of guessing: *"Are you creating a new invoice
  or editing an existing one?"*

That last posture is the design principle throughout: **sensing, not surveillance.**

### 3 · Point at things on the page

When it knows which step someone is on, it can **highlight the actual element** on your page — the
button they need, outlined right there — instead of describing it in words.

### 4 · Work out why they're stuck

The step above answers *where are you*. This one answers *why isn't it working*.

Someone asks "why is this button greyed out?" FlowBuddy captures a structured description of the
page's current state — what's there, what's enabled, what's filled in, what error text is showing,
**with all the actual values masked** — and compares it against your own recording of that step
working correctly.

Then it reasons about the difference. *You've filled in three of four required fields; the amount is
still empty, which is why Send is disabled.*

Optionally it can also take a picture of the page, because some blockers are purely visual — a
half-ticked checklist, a banner — that don't show up in the page structure. That's the most sensitive
thing FlowBuddy captures, so it's a separate switch with a privacy-disclosure snippet you can paste
into your policy.

**This only runs when it's actually needed** — a diagnostic-sounding question, a genuinely blocked
state, or a normal answer having failed. It doesn't run on every message.

**Where the facts come from matters here.** Product facts still come only from your approved
knowledge. What the live page adds is *the user's current situation*. It never invents product
behaviour, and it declines when neither source covers the question.

### 5 · Walk them through it

Instead of listing steps in chat, it can guide them one at a time. A compact card shows "step 2 of
5", the element for that step stays highlighted, and it watches for them completing it.

**FlowBuddy never clicks anything.** The user does everything. When it detects they've done a step it
says *"Detected ✓ — hit Next to continue"* and waits. **It never advances on its own** — that's a
deliberate decision, so the user is never surprised by the card jumping ahead.

It survives full page reloads: if a step navigates them somewhere else, the card comes back on the
new page and picks up where it was. And when it isn't sure, it stops safely rather than guessing.

---

## The conversation remembers

Two things that used to be broken and now aren't:

**The conversation survives page reloads.** It used to die on every full navigation — including
navigations that a walkthrough itself caused. So the walkthrough's own "explain what's blocking me"
button would land you in an empty chat panel. Now the thread persists.

**It stays on topic.** The workflows cited in the last answer ride along with the next question, so a
follow-up with no keywords in it — *"and then what?"* — stays in the workflow you were discussing
instead of searching the whole knowledge base for those three words.

That memory is deliberately a **nudge, not a rule**. If someone genuinely changes the subject, a real
keyword match wins over what you were just talking about. Otherwise the assistant would hold you
hostage to the previous topic — which is a worse bug than the one it fixes.

---

## Your controls

All in **Studio → Copilot → Settings**:

**How your assistant works** — the mode. See [the three modes](05-the-three-modes.md).

**What it may do on your page** (folded under Advanced):

| Switch | Default | What it does |
|---|---|---|
| Knowing where the user is | on | the whole positional layer |
| Pointing at things | on | highlight the element on the page |
| Guided walkthrough | on | offer to walk through step by step |
| Working out why they're stuck | on | the diagnostic reasoning |
| Taking a picture of the page | on | for visual blockers — the most sensitive one |
| Showing typed values | **off** | leave this off unless you know why you need it |
| Showing sources | on | the "from workflow X" tag on answers |

Two things are locked on and can't be turned off: **answering only from approved workflows**, and
declining honestly.

**Security:** a public key you can regenerate, a list of websites allowed to run your assistant, and
a rate limit. The key is safe to have in your page source — it's meant to be public. Access is
re-checked on the server on every single request, so a page can never talk itself into more than you
allowed.

---

## What it doesn't do yet

**It knows your recipes, not your product.** Ask "what does this tool do?" or "can it handle
X?" and it declines — because a question like that isn't answered by any single recorded workflow.
It knows how to *do* things without knowing what your product *is*. Fixing this needs somewhere for
you to describe your product in your own words. **This is the biggest gap.**

**It can't do anything for the user.** That's [the third mode](05-the-three-modes.md), not built.

**It can't check whether its own knowledge is still true.** If you redesign a screen, the assistant
keeps confidently describing the old one until you re-record. Fixing this is the hardest item on the
whole roadmap.

**It never starts a conversation.** It waits to be asked. Whether it *should* ever tap someone on
the shoulder is an open idea, deliberately parked.

→ Next: [the copilot's three modes](05-the-three-modes.md)
