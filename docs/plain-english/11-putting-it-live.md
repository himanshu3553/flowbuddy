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
moment. There's no automatic retry — you re-record. Splitting them apart is the first step on the
scaling list if that ever starts mattering.

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

That last one is a real trap. **The extension has the Studio address compiled into it.** If that
domain ever changes, every installed copy breaks and you must submit a new version. It happened once
already, during the rename.

Two standing rules:

- **Never zip a stale build.** Always rebuild before packaging, or you'll ship whatever was last on
  disk — possibly pointing at localhost.
- **Log every store release.** `extension-releases.md` is a living record of what shipped, which
  permissions changed, and which addresses were baked in. Update it every time.

Currently live: **v0.6.0**, since July 2026.

---

## If something goes wrong with the assistant in production

**The fastest lever is switching a workspace to AI Chatbot mode** in Studio → Copilot → Settings.
Instant, per account, no deploy required.

Individual failures already handle themselves — if the smarter mode fails on one question, that
question quietly falls back to a simple answer, and the setting stays put.

→ Next: [testing it](12-testing-it.md)
