# 7 · Running, shipping and testing it

Three things that used to be three chapters: getting it running on your own machine, putting it in
front of real people, and checking it still works. They're one chapter because they're one loop —
you run it, you ship it, you check it, you go again.

> **Commands live in `CLAUDE.md`; the step-by-step test plan lives with the other operations docs.**
> This chapter is the shape of the thing, not the keystrokes — so it doesn't go stale when a script
> gets renamed.

The three parts, in the order you'd meet them:
[running it on your own machine](#running-it-on-your-own-machine) ·
[putting it live](#putting-it-live) ·
[checking it still works](#checking-it-still-works)

---

## Running it on your own machine

*(The plain-English version of `dev-setup.md`.)*

---

## The mental model

FlowBuddy isn't one program — it's **several small programs that talk to each other**, plus a
database. To work on it locally you start them all.

```
   Postgres · Redis · MinIO       the storage layer, in Docker
            ▲
            │
     ┌──────┴──────┬────────────┐
     │             │            │
   THE API      THE WORKER    STUDIO
   answers      turns         the web app
   questions    recordings    you log into
                into steps
```

Four tools do the housekeeping:

| Tool | Its one job |
|---|---|
| **pnpm** | installs things and runs scripts — like `npm`, better with many packages |
| **Turborepo** | runs a script across every package, in the right order, skipping what hasn't changed |
| **Docker Compose** | runs the database and storage as containers so you don't install them |
| **Prisma** | manages the database tables |

---

## Every working session

**The storage layer comes up first** — Postgres (the database), Redis (a job queue), and MinIO (file
storage that behaves like the real thing).

**Then the three programs, each in its own terminal.** All three need to be running. The worker is
the one people forget — without it, recordings upload and then sit there doing nothing.

The browser bits — the widget and the recorder extension — are built on demand, when you're working
on them.

---

## Checking your work

Before believing anything works: build everything, check the types, and run the tests.
**Type-checking is the main safety net** — because all the packages share the same type definitions,
changing a shape in one place makes everything that disagrees fail to compile.

**About the tests:** there aren't many, deliberately. They cover the trickiest, purest logic —
the rules that decide which knowledge gets found for a question, the answering loop's contract, the
safety rules around the modes, and — since the assistant started acting — the machinery that drives a
step on a page and the code that touches a control, run against a stand-in page rather than a real
browser. They deliberately **don't** test what the AI writes: a test that asserts on generated text
fails for the wrong reasons.

There's no automated CI. That's a standing decision, not an oversight.

**For answer quality** there's a separate thing: a script that asks a fixed list of questions and
records the **decisions** — did it answer or decline, which workflows did it cite, where did it think
the user was. Not the wording, because the wording always differs. Then a second script compares two
runs and reports only what actually changed. That's how you tell whether a change to the assistant
made things better or worse.

A question in that list can also carry the questions that come **before** it, so it gets asked as a
follow-up rather than from a standing start. Some problems only appear on the second question, and a
list that always starts fresh can't see them.

---

## The database

**A trap worth knowing about**, because it cost real time: Prisma bakes default values into its
generated client at `db:generate` time. So if you change a default in the schema and *don't*
regenerate, **nothing happens** — while the database itself reports the new default. It looks exactly
like the migration didn't work. Run `pnpm build` (which regenerates) after any schema change.

**A second trap of the same shape:** recordings now upload their screenshots straight to file storage
while you record, using a temporary permission slip the server hands out. **The local file storage is
more forgiving than the real cloud one** — it accepts permission slips the real one refuses. So
recording working perfectly on your machine is *not* evidence it works deployed; that one has to be
tried on a real server. It has been: the same path is now confirmed working against the real cloud
storage on the staging server, from a real browser (July 2026).

---

## Testing the assistant locally

**Serve the demo page over HTTP, not by opening the file.**

Opening `demo/index.html` directly from disk silently fails — no launcher appears, no obvious error.

Also: the demo page has a workspace key in it. After wiping your database that key is stale and needs
replacing with the new one from Studio.

---

## Logging

One logger for everything that runs on the server. It's chatty in development and quiet in
production, prints readable text locally and machine-readable JSON in production, and strips secrets
automatically.

Browser code — the widget, the extension, Studio's client side — uses small local loggers instead,
because the server logger only runs on Node.

**The widget is silent by default.** It only logs if you explicitly ask it to, because it's running
inside someone else's product and shouldn't be filling their console.

---

## Putting it live

*(The plain-English version of `deploy.md` and `extension-releases.md`.)*

---

## The one thing to internalise

**`dev` is the staging server. `main` is production.**

Pushing to `main` **is** a production deploy. There's no separate "now deploy" step — the host
watches the branch and rebuilds. So `main` only ever receives code by an explicit, deliberate merge
from `dev`.

---

## Three places the code runs

| Where | Branch | Costs | What it's for |
|---|---|---|---|
| **Your machine** | anything | nothing | day-to-day work |
| **The staging server** | `dev` | free tier | testing in something prod-shaped, demos |
| **Production** | `main` | ~$30/month | the real thing, at flowbuddyai.com |

The staging database is on a free plan that **deletes itself every 30 days.** Treat it as disposable
— that's deliberate, not a problem to solve.

---

## What's actually running in production

| Address | What it is | Cost |
|---|---|---|
| `app.flowbuddyai.com` | Studio — the web app you log into | paid |
| `api.flowbuddyai.com` | answers questions, and processes recordings | paid |
| `widget.flowbuddyai.com` | the assistant script your customers load | free |
| `flowbuddyai.com` | the marketing page | free |
| — | the database | paid |
| — | the job queue | paid |

Plus **Cloudflare R2** for screenshots, audio and page snapshots. Two completely separate buckets,
staging and production, never shared — so wiping staging data can't touch anything real. Files are
private; the app hands out temporary links when they're needed.

---

## Some things that are worth knowing

**The recording processor runs inside the API**, not as a separate service. On staging that's forced
(background services cost money); in production it's a deliberate choice, because processing a
recording is mostly waiting on network calls and barely competes with answering questions.

**The trade-off:** deploying restarts the API, which kills any recording being processed at that
moment. There's no automatic retry — you re-record.

**Splitting them into two services has been considered and deliberately skipped.** It costs about $7
a month, and most of the argument for it went away once the service stopped carrying recordings' files
itself. Instead they share one small machine carefully: the program is told to keep its memory use
under the machine's limit, and it processes **one recording at a time** rather than two, because a
single recording holds whole screenshots in memory while the AI looks at them. Two at once was the
realistic way to run out of memory — and running out of memory there would take the customer-facing
assistant down along with the processing. Throughput isn't the constraint; recordings arrive one at a
time, from a person pressing stop.

**The host now checks that each service actually answers a request**, not merely that it has opened a
port. It used to do only the latter, which a jammed process passes without trouble — so a jammed
process would never have been restarted.

**A sick job queue can no longer fail a recording that arrived safely.** Handing the recording to the
processing queue is the very last thing that happens, long after it's been stored, so it's now given a
few seconds and then given up on. If that happens the recording is still there and you re-process it
from Studio, rather than the recorder telling the person it failed.

**Database migrations run automatically** when the API starts, before it accepts traffic. You don't
run anything by hand.

**Each environment has its own config file** in the repo. Changes to staging infrastructure go in
one, production in the other, and production changes only reach the host through the merge to `main`.
Never point one environment at the other's file — applying the production file from the staging
branch would build the entire paid stack.

---

## Gotchas that have actually bitten

**Secrets typed during a failed setup die with it.** If a deploy configuration fails to apply,
anything you typed into it is gone, and you get a "missing secret" error later that looks unrelated.
Re-enter them after a successful apply.

**Domain parking records block certificates.** Leftover records at the registrar stopped the
certificate for the root domain from being issued. Remove them.

**Wiping production data** isn't "drop everything" — you empty every table *except* the migration
history, or the app tries to re-run migrations that already ran.

---

## Releasing

1. Work on `dev`, push, let staging rebuild, test it there
2. When you're happy: fast-forward `main` from `dev` and push
3. Production rebuilds itself; migrations run on the way up
4. Check the API came up, and click through the thing you changed

Two things to eyeball after any deploy that touched the assistant: that the API actually started
(migrations run first, so a failure shows there), and that Studio still loads.

---

## The Chrome extension is different

**This is the one thing that doesn't ship by pushing code.**

The **recorder extension** — the one you install to record your product — lives on the Chrome Web
Store. New versions need packaging, uploading and a review. That's days, not minutes.

**Everything else ships through the normal deploy.** Including the widget — the widget is *not* a
Chrome extension, it's a script served from a URL, so your customers get updates on their next page
load with no action from anyone.

**You only need a store release when the recorder itself changes**: new recording features, changed
permissions, or a new baked-in address for Studio.

**But the order can matter, and it did for the recording-upload rewrite.** The server can start
requiring something only a newer recorder sends, and that's exactly what that change does. When that's
the case, **the new recorder has to be live on the store *before* the server change reaches
production**, otherwise everyone's installed recorder stops being able to upload. So a store release
isn't always the last step; sometimes it's the blocker.

That last one is a real trap. **The extension has the Studio address compiled into it.** If that
domain ever changes, every installed copy breaks and you must submit a new version. It happened once
already, during the rename.

Two standing rules:

- **Never zip a stale build.** Always rebuild before packaging, or you'll ship whatever was last on
  disk — possibly pointing at localhost.
- **Log every store release.** `extension-releases.md` is a living record of what shipped, which
  permissions changed, and which addresses were baked in. Update it every time.

The current recorder is the recording-upload rewrite: uploading while you record, narration going the
same way, and abandoned recordings cleaning themselves up. The ordering trap above did briefly stop
being hypothetical: the server half went out first, by explicit decision, and for a
short window the published recorder couldn't upload at all because it didn't send the identity the
newer server requires. Publishing the newer recorder closed it, and Chrome updates installed copies on its own.
Worth remembering as the concrete case: that window is only survivable while nobody is using the
product.

---

## If something goes wrong with the assistant in production

**There is no longer a "make it simpler" lever, and that is worth knowing before you need one.**
Until August 2026 you could drop a misbehaving workspace to the single-shot AI Chatbot mode from
Studio — instant, per account, no deploy. Retiring that mode removed the escape hatch along with the
maintenance cost. It was the right trade (nobody was on the tier, and it cost double to maintain
forever), but it is a real loss and this is where you'd have felt it.

What you still have, per account and without a deploy, in Studio:

- **Turn off the on-page abilities** — pointing and guided walkthroughs. Narrows what the assistant
  can do on your customers' screens without touching what it knows.
- **Turn off diagnostics** — stops the assistant reading page state at all, so every question takes
  the plain answering path.
- **Put the workspace back to Copilot** — instant, per account. The assistant keeps answering; it
  stops doing anything. Modes switch both ways.
- **Turn off running for one workflow** — leaves it answerable, stops it being runnable. The narrower
  instrument when only one task is misbehaving.
- **Un-approve a workflow** — the sharpest instrument. If one workflow is producing bad answers, it
  stops being answerable at all, immediately.

Individual failures already handle themselves — if the smarter mode fails on one question, that
question quietly falls back to a simple answer, and the setting stays put.

---

## Checking it still works

*(The plain-English version of `e2e-testing.md`.)*

---

## What this is for

Nothing automated proves FlowBuddy works end to end. There are small tests over the trickiest logic,
and a script that measures whether the assistant's answers got better or worse — but nothing that
opens a browser. Beyond those: **you click through it.**

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

**Before you press stop, look at Studio.** The recording should already be listed, marked
"Recording". That's the new behaviour — files upload as you go, so the entry exists from the first
screenshot. If it shows as failed, something's wrong.

Stopping should be quick now — your narration is the last thing to go up, and after that there's only
a small index left to send. There's no percentage to watch; it should just say it's finishing up and
then be done. If stopping takes minutes, the as-you-go upload isn't working and it quietly fell back
to sending everything at once.

**Then retry the upload deliberately** — from the recorder, once it has already finished. You must
still see **exactly one** recording in Studio. Two is the bug this whole change exists to fix.

**And test throwing one away.** Start a recording, let a few screenshots go up so it appears in Studio
marked "Recording", then choose "start fresh" in the recorder. The entry should disappear from Studio,
along with its files. Starting a brand-new recording while an unsent one is still sitting there should
do the same thing. Neither should ever be able to remove a recording you actually finished.

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
Accounts made before the default changed, in late July 2026, keep whatever they had.

What to look for:

**Simple questions should be no worse.** Same quality, same speed. If simple lookups got slower, the
loop is doing work it shouldn't.

**Ambiguity should produce a question, not a guess.** Needs two workflows that could both match — it
can't fire with only one workflow in the knowledge base.

**It should search on its own.** Ask a follow-up that shifts topic. It should go find the other
workflow rather than declining on your literal words.

**Highlights and walkthroughs appear on every positional answer.** Your switch is the only thing
that decides — on means always, off means never. (For a few months the assistant judged it per
message; that was reversed in August 2026, because a switch that might or might not do anything is
one you can't demo, can't support, and can't tell apart from an off switch.) Turn the switches off
and confirm neither *ever* appears. **The switches must always win.**

**Declines must still be honest.** The whole point survives or dies here.

**Change the subject and make sure it keeps up.** Ask about one thing, let it answer, then ask about
something completely different. It must answer the *new* question. This is worth doing every single
time, because it is exactly what went wrong for months without anyone noticing: the assistant would
quietly answer the *earlier* question instead — sometimes repeating the previous answer's steps,
sometimes claiming it knew nothing about a workflow it was holding in full. Every single-question
check passed the entire time it was broken.

*(This step used to end by switching back to AI Chatbot to confirm the old rule-driven behaviour
returned. That mode was retired in August 2026, so there is nothing to switch back to — which also
means the on-page abilities are now always the assistant's judgment, never a fixed rule.)*

**The fallback is invisible by design.** If the loop fails, that question is answered simply and the
mode setting stays put. There's no UI for it — you'd confirm it's wired by finding
`agent path failed — falling back to the floor` in the API log, and in a healthy run you should
never see it. Since the simple mode was retired, this path is no longer exercised by ordinary
traffic, so a run of these lines is the only signal that it fired at all.

---

## Testing answer quality after a change

Clicking through tells you it *works*. It doesn't tell you whether a change made answers **better or
worse** — that needs comparing.

There's a script for it. It asks a fixed set of questions and records the **decisions**: answered or
declined, which workflows cited, where it thought the user was. Deliberately **not the wording** —
the AI runs with a bit of randomness so the words always differ, and a diff on prose is pure noise.

A second script compares two runs and reports only what actually changed. If a question flipped from
answered to declined, that's flagged. If it just phrased things differently, you never hear about it.

**A question in that set can now carry the questions that come before it**, so it gets asked as a
follow-up in a real conversation rather than from a standing start. That matters more than it
sounds: a whole class of problem only shows up on the *second* question, and a list that only ever
asks one question at a time is blind to it — which is how the assistant shipped for months answering
the wrong question. The earlier questions are asked for real rather than faked, so they can't go
stale when you re-record your product, and the report says so plainly if one of them failed, because
then the case is measuring a broken conversation rather than the thing you meant to test.

It runs in preview mode, so a comparison run doesn't pollute your analytics. Two things it still
can't see: anything that depends on the *state of the page* someone is looking at, and the retry
that happens when the assistant can't answer and goes looking at the screen. Both need a real
browser — that's what the click-through above is for.

---

## When something doesn't work

**No launcher on the demo page** — you opened the file directly instead of serving it, or the key is
stale after a wipe.

**Recording uploads but nothing happens** — the worker isn't running.

**It's stuck saying "Recording"** — the recording was never stopped. The processor ignores it on
purpose, because there's nothing to process until you stop. It will clear itself away after half a day
of silence, and "start fresh" in the recorder removes it immediately, so you rarely need to touch it.

**The recorder can't upload at all** — you're using an older Chrome Web Store version that doesn't
send the identity the server now requires. Build and load the recorder from this repo instead, or wait
for the current store version to be live.

**The assistant declines everything** — nothing is approved, or the key points at a different
workspace.

**Studio's preview works but your page doesn't** — origin allowlist. Studio is always allowed;
your page has to be added.