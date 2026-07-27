# 6 · The help portal

*(The plain-English version of `v2-portal.md`.)*

**Status: not built. Nothing here exists. No work has started.**

---

## The idea

The same recordings that power the in-app assistant can also produce a **public help website**.

A help article, in this design, isn't something anyone writes. **A help article is an approved
workflow, displayed.** Your recordings already become a title plus clean steps, each with an
instruction, extra detail, the URL, and a screenshot with the clicked element highlighted. That's a
help article already — it just needs a page to live on.

---

## Why it's second, not first

This was originally going to be the *first* thing built. It got deliberately demoted, and the reason
is worth keeping in mind:

**Someone stuck inside your app wants the answer right there.** Not a link to a portal they have to
go and search. The in-app assistant meets the user at the moment of confusion; a help site makes them
leave and go looking.

The portal is real value — public help pages get found by search engines, and some people genuinely
prefer to read the whole thing — but it's a **by-product**, not the product.

---

## The rule that keeps them independent

**Approving a workflow for the assistant and publishing it to a help site are two separate actions
over the same knowledge.** Neither requires the other, ever.

This matters more than it sounds. Different audiences: your in-app assistant talks to people already
logged in, and a public site talks to the whole internet. You'll want things answered in-app that you
would never publish publicly, and probably the reverse too.

The assistant must **never** depend on anyone writing or publishing an article. That's a hard rule.

---

## What would get built

Roughly in this order:

**1 · The publishing foundation.** Approval becomes per-audience — a workflow can be approved for the
assistant, for the portal, both, or neither.

Alongside it, **an editing layer that sits on top rather than changing anything underneath.** If you
want the public version to have a friendlier title, an intro paragraph, a reordered step or a hidden
one, those edits are applied **when the page is drawn** — the underlying knowledge is untouched. So
the assistant and the portal can never drift apart. One source of truth, two presentations.

**2 · Type a topic, get an article.** Rather than picking from recordings, you type what you want an
article about. FlowBuddy searches everything you've recorded and writes a grounded article — or
declines and logs it as a gap. Because it searches everything, an article can span several separate
recordings.

**3 · The public site itself.** A per-workspace public website showing only portal-approved
workflows, rendered server-side with the steps, screenshots and highlights.

**4 · Search.** For both the public site and Studio. Searches that return nothing get logged — those
are gap signals too.

**5 · Editing depth.** Split, merge and reorder steps. Retake or crop a screenshot. Add callouts and
warnings. Link related workflows. Write plain pages that aren't backed by any recording at all
(badged as such, since they can't be self-checked).

**6 · Making it a real product.** Your branding, your own domain, control over who can see it,
"was this helpful?", and search-engine basics.

**7 · Gaps and teams.** One dashboard for everything users couldn't find — across the assistant, the
portal search, and article writing. Plus multiple people per account with roles.

---

## The thing that has to happen first

**Hiding sensitive data inside screenshots isn't built.**

Today, sensitive text is masked during recording and stripped out of the assistant's answers. But the
*pixels* of a screenshot aren't scanned. Right now that's contained — screenshots are only ever seen
by you, in your own Studio.

**A public help site would put those screenshots on the open internet.** So screenshot redaction is a
hard blocker for publishing, not a nice-to-have. It's tracked as part of this track for exactly that
reason.

→ Next: [opening up to other AI agents](07-other-ai-agents.md)
