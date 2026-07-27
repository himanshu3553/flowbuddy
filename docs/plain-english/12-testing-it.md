# 12 · Testing it

*(The plain-English version of `e2e-testing.md`.)*

---

## What this is for

There's no automated test suite that proves FlowBuddy works. There are a handful of small tests over
the trickiest logic, and beyond that: **you click through it.**

That sounds primitive. It's actually correct for this product — most of what can break involves a
real browser, a real recording, a real AI call and a real page. The value here is doing it in the
**right order**, so when something breaks you know which piece broke.

You can run this in three places: **your own machine**, the **staging server**, or **production**.
Same journey, different setup.

---

## The journey

Each step feeds the next. Don't skip ahead — a failure three steps later is much harder to diagnose
than the one you skipped.

```
  clean slate → record → it becomes steps → approve → embed → ask → check analytics
```

---

## Before you start

Build everything and typecheck. Catch breakage before you spend twenty minutes recording.

Then, if you want a genuinely clean run, wipe the data. **Three separate stores** hold state, and
half the confusing failures come from clearing one and forgetting another:

| Store | What's in it | If you forget |
|---|---|---|
| The database | accounts, recordings, workflows, approvals, questions | old workflows keep showing up |
| File storage | screenshots, audio, page snapshots | orphaned images |
| The job queue | in-flight processing jobs | a stale job reprocesses something that no longer exists |

**Two things people always forget after a wipe:** the demo page still has the *old* workspace key in
it, and the extension is still connected to an account that no longer exists. Both need redoing.

---

## The steps

**1 · Get everything running.** Storage layer, then the API, the worker, and Studio. All three
programs. The worker is the one that gets forgotten — without it, recordings upload and then sit
there.

**2 · Make an account.** Sign up in Studio and confirm you land in a workspace.

**3 · Load the recorder.** Build the extension, load it unpacked in Chrome, and connect it to your
account.

**4 · Record something.** The standard test case is a sign-in flow, because it's short and exercises
everything — clicking, typing, a page navigation, and an obvious success state.

Watch the worker's log while it processes. It should tell you how many workflows it found and how
many steps each has.

**This is the step where quality is decided.** Did it split the recording into the right workflows?
Are the steps readable instructions or click telemetry? If this is wrong, everything downstream is
wrong, and no amount of fiddling with the assistant fixes it.

**5 · Look at the knowledge base in Studio.** Your workflows, their steps, each with a screenshot.
Click a screenshot — it should open full size with the clicked element outlined.

**6 · Approve one.** This is the trust boundary. Worth testing the negative case too: an unapproved
workflow should be **invisible** to the assistant, not merely deprioritised.

**7 · Set up the embed.** Get the key, put it in the demo page, and test the origin allowlist by
adding a domain that isn't yours — you should get blocked.

**Remember to serve the demo over HTTP**, not by opening the file. Opening it directly fails
silently.

**8 · Actually ask it something.** The real test. Ask something covered — you should get a grounded
answer with a source. Ask something genuinely not covered — you should get an honest decline, not an
invention. That second one matters more than the first.

**9 · Test the in-context behaviour.** Go to the page a workflow happens on, and ask a positional
question — "what do I do next?" It should know where you are. Ask a diagnostic one — "why is this
button greyed out?" Try a walkthrough and check it survives a page reload.

**10 · Check the analytics.** Your questions should be there, with answered-versus-declined counts,
and anything it couldn't answer should show up as a gap.

**11 · Reprocess a recording.** Make sure it doesn't duplicate anything and your approval survives.

---

## Testing Copilot mode specifically

Since it's now the default, a **fresh account tests this path automatically** — no setup needed.
Accounts made before July 2026 keep whatever they had.

What to look for:

**Simple questions should be no worse.** Same quality, same speed. If simple lookups got slower, the
loop is doing work it shouldn't.

**Ambiguity should produce a question, not a guess.** Needs two workflows that could both match — it
can't fire with only one workflow in the knowledge base.

**It should search on its own.** Ask a follow-up that shifts topic. It should go find the other
workflow rather than declining on your literal words.

**Highlights and walkthroughs appear less often — that's correct.** They now happen when the
assistant judges they help, rather than on every positional answer. Then turn the switches off and
confirm neither *ever* appears no matter what the assistant wants. **The switches must always win.**

**Declines must still be honest.** The whole point survives or dies here.

**Switch back to AI Chatbot** and confirm the old rule-driven behaviour returns exactly.

**The fallback is invisible by design.** If the loop fails, that question is answered simply and the
mode setting stays put. There's no UI for it — you'd confirm it's wired by finding
`agent path failed — falling back to AI Chatbot` in the API log, and in a healthy run you should
never see it.

---

## Testing answer quality after a change

Clicking through tells you it *works*. It doesn't tell you whether a change made answers **better or
worse** — that needs comparing.

There's a script for it. It asks a fixed set of questions and records the **decisions**: answered or
declined, which workflows cited, where it thought the user was. Deliberately **not the wording** —
the AI runs with a bit of randomness so the words always differ, and a diff on prose is pure noise.

A second script compares two runs and reports only what actually changed. If a question flipped from
answered to declined, that's flagged. If it just phrased things differently, you never hear about it.

It runs in preview mode, so a comparison run doesn't pollute your analytics.

---

## When something doesn't work

**No launcher on the demo page** — you opened the file directly instead of serving it, or the key is
stale after a wipe.

**Recording uploads but nothing happens** — the worker isn't running.

**The assistant declines everything** — nothing is approved, or the key points at a different
workspace.

**Studio's preview works but your page doesn't** — origin allowlist. Studio is always allowed;
your page has to be added.
