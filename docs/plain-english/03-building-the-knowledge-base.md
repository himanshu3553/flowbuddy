# 3 · Building the knowledge base

*(The plain-English version of `kb-step-distillation.md` and the recording half of
`phase-1-copilot.md`.)*

**This is Part 1 of the product — everything else reads what this produces.**

---

## The three things that happen

```
   YOU RECORD  ──►  FLOWBUDDY CLEANS IT UP  ──►  YOU APPROVE
   (5 minutes)      (a few minutes, automatic)    (one click each)
```

---

## Step 1 · You record

You install the **FlowBuddy Recorder** Chrome extension, click "connect", hit record, and then just
*use your own product* while talking out loud about what you're doing and why.

One recording can cover several different workflows. You don't have to do a separate recording for
each one — FlowBuddy can tell them apart afterwards.

**What it's capturing while you do that**, all lined up on the same timeline:

- Every click, typed value, and form submission
- The structure of the page — what each element is, what it's called, where it sits
- A screenshot at the moment of each action
- **A second screenshot right after** — so it knows what success looks like
- The URL you were on
- Your voice, continuously

That second screenshot matters more than it sounds. It's how FlowBuddy can later tell whether a step
actually worked, which is what makes checking-itself and doing-things-for-users possible at all.

**Sensitive data is hidden before it leaves your browser.** Passwords are never captured at all.
Things that look like card numbers or national ID numbers are masked no matter what. That happens
locally, in the extension, before anything is uploaded.

**Recording survives real conditions** — page navigations, multiple tabs, embedded frames, the
browser putting the extension to sleep. There's a control bar on the page and you can pause and
resume.

**It uploads as you go, not all at once at the end.** Each screenshot and page snapshot is sent off to
storage moments after it's captured, using a one-off permission slip that lets your browser write that
one file and nothing else. So when you press Stop there's almost nothing left to send — mostly just
your audio and the index of what happened. A long recording no longer ends in a multi-minute wait.

A side effect you'll notice: **the recording appears in Studio while you're still recording**, marked
"Recording". That's expected, not a half-finished upload.

**If an upload fails it retries, and a retry can never create a duplicate.** Every recording carries
its own identity from the moment you press record, so re-sending it lands on the same recording rather
than making a second copy. (It used to: a slow upload would time out on your side while the server
kept it anyway, and the retry you were told to press created a twin.)

If any of that isn't available — the storage permission slip can't be obtained, or you're recording
against an older server — it quietly falls back to the old behaviour and sends everything in one
bundle when you stop.

Two rough edges that are known and not yet fixed: a recording you start and never stop leaves a
leftover entry and some orphaned files that nothing cleans up, and there's no size limit on the
as-you-go uploads.

**Two other ways to record are planned, not built:** just narrating with no clicking (for explaining
concepts), and uploading a video.

---

## Step 2 · FlowBuddy turns clicks into readable steps

This is the part that took the most work, and it's the reason the assistant sounds like a human
wrote it.

### The problem, with a real example

A simple sign-in recording produced **13 raw captured events**. Only about four of them were actually
steps. The rest were noise:

| What was captured | Real step? |
|---|---|
| Click "Go Live in 5 Minutes" on the homepage | ❌ just looking around |
| Click the chat widget | ❌ just looking around |
| Click the logo | ❌ just looking around |
| **Click "Sign In"** | ✅ |
| Type in Password *(recorded out of order)* | ✅ |
| **Type in Email** | ✅ |
| Click "Email" | ❌ that's just focusing the field before typing |
| Click "Password" × 3 | ❌ same thing, three times |
| **Click "Sign in"** | ✅ |
| Form submitted | ❌ duplicate of the click above |
| Click something on the dashboard | ❌ but useful — it proves they arrived |

And the narration smeared: because you talk continuously, the same sentence got attached to three
different clicks, and some sentences landed on the wrong action entirely.

### What it becomes

```
1. Click "Sign In" to open the login page
2. Enter your email
3. Enter your password
4. Click "Sign in" — you land on the dashboard
```

Four clean steps, each with the right narration, each with one good screenshot.

### How it gets there

Two passes, deliberately in that order:

**First, mechanical cleanup — no AI involved.** Rules that are always safe: collapse the same click
repeated three times, drop the "click the field then type in it" pair down to just the typing, drop
the duplicate form-submission. Clicks on things that aren't really buttons get *flagged* but not
deleted — that judgment needs context.

**Then AI does the judgment.** It sees the cleaned events, your narration, and the transcript, and
writes proper instructions: which actions were real steps, which were you looking around, how to
phrase it in plain imperative English, and which sentence you said belongs to which step.

**The guardrail that keeps it honest:** every step the AI writes must point at real captured events.
If it invents a step that references nothing, that step is thrown away. And if the whole pass somehow
returns nothing, FlowBuddy falls back to the cleaned events rather than losing your workflow.

### Splitting one recording into several workflows

Separately, FlowBuddy works out where one task ended and the next began. It looks mainly for
**endings** — you got redirected, you landed back on a dashboard, a success message appeared, you
signed out — with your narration and any markers you set as supporting evidence.

Each split gets a confidence score, so low-confidence boundaries can be flagged for you to check. And
there's a guard that makes sure no captured event is ever silently dropped between workflows.

### What gets kept, and what doesn't

**Kept:** the clean instruction, any extra detail, the URL, your narration for that step, one good
screenshot, and the location of the element on screen.

**Not kept as knowledge:** the raw event log. It stays in the original upload record so a recording
can be reprocessed later, but it is never shown to anyone and is never used as a source. The
assistant grounds on the clean steps, not on click telemetry.

---

## Step 3 · You approve

Recorded is not the same as live. **Nothing reaches your customers until you approve it**, one click
per workflow, in Studio.

Approval is **per consumer**. A workflow approved for the in-app assistant isn't automatically
published to a public help site or exposed to outside AI agents — those are separate switches, and
only the first one exists today.

```
   ONE knowledge base
     │
     ├── approved for the assistant   ✅ this is the one that exists
     ├── approved for the help portal    not built
     └── approved for other AI agents    not built
```

---

## What you can see and do in Studio

**Recordings** — everything you've recorded, with real thumbnails and details. A capture shows up here
**while it's still being recorded** (marked "Recording"), then "Processing", then "Ready". Open one
and you get a replay player that steps through the screenshots in sync with your audio. You can
rename, delete, or reprocess a recording.

**Knowledge Base** — your workflows and their steps, as the assistant sees them. Click a step's
screenshot and it opens full-size with the clicked element highlighted.

**Copilot** — approvals, the embed snippet, appearance, which websites are allowed, and the mode
selector. The preview on this page **is the real widget**, not a mock-up.

**Analytics** — what users asked, how often it answered versus declined, thumbs up and down, which
workflows get cited most, and where users get stuck.

---

## The loop that makes it better

When a user asks something the approved knowledge doesn't cover, that gets logged as a gap. Two
kinds, two different fixes:

- **You recorded it but didn't approve it** → one click
- **You never recorded it** → "record this next"

That's the compounding part. The product tells you what to do next, based on what your actual users
actually asked.

---

## One known weakness

**Some form data is lost when a page fully reloads.** If a form submission causes a full page
navigation, the final typed values can be missed. It's a known gap with an identified fix (flush the
values on submit and when the page is about to unload), and it isn't fixed yet.

→ Next: [the copilot](04-the-copilot.md)
