# 10 · Running it on your machine

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

## First time only

```bash
corepack enable      # gives you the pnpm command
pnpm install         # installs everything, once, from the repo root
```

---

## Every working session

**Start the storage layer:**

```bash
docker compose up -d
```

That's Postgres (the database), Redis (a job queue), and MinIO (file storage that behaves like the
real thing).

**Then start the three programs, each in its own terminal:**

```bash
pnpm --filter @flowbuddy/api dev       # answers questions          → :8787
pnpm --filter @flowbuddy/api worker    # turns recordings into steps
pnpm --filter @flowbuddy/web dev       # Studio                     → localhost:3000
```

All three need to be running. The worker is the one people forget — without it, recordings upload and
then sit there doing nothing.

**Build the browser bits when you're working on them:**

```bash
pnpm --filter @flowbuddy/widget build      # the assistant your customers see
pnpm --filter @flowbuddy/extension build   # the recorder — then load it unpacked in Chrome
```

---

## Checking your work

```bash
pnpm typecheck    # does everything still fit together?
pnpm test         # the tests
pnpm build        # does it all actually build?
```

Run all three before believing anything works. `typecheck` is the main safety net — because all the
packages share the same type definitions, changing a shape in one place makes everything that
disagrees fail to compile.

**About the tests:** there aren't many, deliberately. They cover the trickiest, purest logic —
the rules that decide which knowledge gets found for a question, the answering loop's contract, and
the safety rules around the three modes. They deliberately **don't** test what the AI writes: a test
that asserts on generated text fails for the wrong reasons.

There's no automated CI. That's a standing decision, not an oversight.

**For answer quality** there's a separate thing: a script that asks a fixed list of questions and
records the **decisions** — did it answer or decline, which workflows did it cite, where did it think
the user was. Not the wording, because the wording always differs. Then a second script compares two
runs and reports only what actually changed. That's how you tell whether a change to the assistant
made things better or worse.

---

## The database

```bash
pnpm db:migrate     # apply a schema change
pnpm db:generate    # regenerate the typed client
pnpm db:validate    # check the schema is valid
pnpm --filter @flowbuddy/db exec prisma studio   # browse the data → :5555
```

**A trap worth knowing about**, because it cost real time: Prisma bakes default values into its
generated client at `db:generate` time. So if you change a default in the schema and *don't*
regenerate, **nothing happens** — while the database itself reports the new default. It looks exactly
like the migration didn't work. Run `pnpm build` (which regenerates) after any schema change.

---

## Testing the assistant locally

**Serve the demo page over HTTP, not by opening the file.**

```bash
cd packages/widget
python3 -m http.server 8080
```

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

## Shutting down

```bash
docker compose down       # stop everything
docker compose down -v    # ...and wipe all the data
```

→ Next: [putting it live](11-putting-it-live.md)
