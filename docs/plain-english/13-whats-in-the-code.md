# 13 · What's in the code

*(The plain-English version of `internals/` and `design_system/`.)*

**This is a tour, not a manual.** It answers "which folder do I open?" If you need to know how
something works *inside*, `internals/` is the engineering deep-dive — start at
`internals/connections.md`.

---

## The whole path, once

```
  You click, in your browser
        │        ← the EXTENSION is watching
        ▼
  Uploaded
        │        ← screenshots and page snapshots go STRAIGHT to storage as you record;
        │          the API only hands out one-file permission slips, then takes the
        │          index and audio when you stop
        ▼
  Processed in the background
        │        ← the WORKER + SYNTHESIS turn it into steps
        ▼
  Stored
        │        ← the DATABASE and file storage
        ▼
  You approve it in STUDIO
        │
        ▼
  A customer asks a question
        │        ← the WIDGET sends it to the API
        ▼        ← SYNTHESIS finds knowledge and writes the answer
  They get an answer
```

**Four different credentials gate four different hops**, and they're never mixed up: the extension has
a secret token for uploading, Studio has your login, the widget has a public key that's safe to sit in
anyone's page source, and each captured file gets its **own one-off, expiring permission slip** that
can write exactly one file and can't read, list, or overwrite anything else.

---

## The folders

Everything is under `packages/`.

### The ones you'd open most

| Folder | What it is |
|---|---|
| **`extension`** | The Chrome recorder. Watches clicks, captures the page and screenshots, masks sensitive data **before anything is uploaded**, and survives navigations and multiple tabs. |
| **`synthesis`** | The brain. Transcribes audio, cleans raw clicks, splits recordings into workflows, writes readable steps, finds relevant knowledge, and writes answers. **If answer quality is the question, it's in here.** |
| **`api`** | Hands out one-file permission slips so the recorder uploads straight to storage (**it deliberately never handles those bytes** — that's why long recordings stopped stalling), takes the index and audio when a recording stops, answers the assistant's questions, and *also* runs the background worker that processes recordings. |
| **`web`** | Studio — the web app you log into. |
| **`widget`** | The assistant your customers see. One script, no dependencies, isolated from the host page's styling so it can't be broken by someone's CSS. |

### The supporting ones

| Folder | What it is |
|---|---|
| **`db`** | The database schema, in one file. Every table lives here. |
| **`shared`** | Type definitions everyone agrees on — including the one place the three modes are defined. |
| **`logger`** | One logger for everything that runs on the server. |
| **`landing`** | The marketing page. Currently a coming-soon card. |

*(The public help site isn't here — it doesn't exist yet.)*

---

## Why it's one repository

The extension, the API, Studio and the widget all have to agree on the **same shapes** — what a
recorded click looks like, what a step looks like, what the modes are called.

Those shapes are written down once, in `shared` and `db`, and everything imports them. Change one and
everything that now disagrees **fails to compile**. That's the main safety net in a codebase with
almost no tests.

---

## The bits worth knowing about

**The answer engine is one loop with three settings.** The simple mode, the smarter mode, and the
diagnostic reasoning are the *same code*, configured differently. The simple mode is that loop with
no options given to it and a hard stop after one round. That's why collapsing the modes later would
be a config change rather than a rewrite.

**Finding knowledge happens in exactly one place.** Both the assistant and Studio's preview go
through the same function. Two things it does: matches on literal keywords *and* on meaning, then
merges the results. If the meaning-based half ever fails, it silently falls back to keywords rather
than failing the question.

**The widget is deliberately paranoid.** It's running inside someone else's product. It never touches
their layout, it's silent in the console by default, it works even if the page blocks its storage,
and everything it's allowed to do is re-checked on the server on every single request.

**One store handles anything that must survive a page reload.** The chat thread and a
walkthrough-in-progress both use it, and a future acting mode is planned as its third user. What gets
stored is controlled by an explicit allowlist — so anything sensitive is excluded by simply never
being added to it, with no migration needed.

---

## The design system

`docs/design_system/` is the **source of truth for every user interface** — Studio, the recorder, and
the widget.

It holds the colours, typography, spacing, shadows and corner radii, plus a full kit of ready-made
Studio components. The brand is indigo; recording and delete actions are terracotta, so "this is
recording" and "this deletes something" always look the same everywhere.

All three surfaces are aligned to it. If you're building UI, take from here rather than inventing.

---

## Two conventions that are actually followed

**Every action that changes something on the server shows a toast** — success or error, top right.
No silent saves. If you add something that mutates, add the toast.

**Anything new should work for all three modes.** Build the general thing, make today's feature one
user of it. Prefer open lists and allowlists over closed either-or choices, so a future mode adds a
value rather than forcing a rewrite. Extract shared code at the *second* user, not speculatively.

---

## Where the deep version lives

`internals/` has one document per piece — the recorder, the ingestion API, the knowledge base build,
the answer engine, the widget, Studio, and the data layer — each following the same shape: what it's
for, what goes in, what comes out, how it works inside, what can go wrong.

**It follows the code.** If a document and the source disagree, the source wins.
