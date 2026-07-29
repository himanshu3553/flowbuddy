# 11 · Putting it live

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

**v0.7.0** is the recording-upload rewrite: uploading while you record, narration going the same way,
and abandoned recordings cleaning themselves up. **It is live on the store.** The ordering trap above
did briefly stop being hypothetical: the server half went out first, by explicit decision, and for a
short window the published recorder couldn't upload at all because it didn't send the identity the
newer server requires. Publishing v0.7.0 closed it, and Chrome updates installed copies on its own.
Worth remembering as the concrete case: that window is only survivable while nobody is using the
product.

---

## If something goes wrong with the assistant in production

**The fastest lever is switching a workspace to AI Chatbot mode** in Studio → Copilot → Settings.
Instant, per account, no deploy required.

Individual failures already handle themselves — if the smarter mode fails on one question, that
question quietly falls back to a simple answer, and the setting stays put.

→ Next: [testing it](12-testing-it.md)
