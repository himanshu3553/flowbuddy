# FlowBuddy Recorder — Chrome Web Store release log

> **A living doc.** One entry per store build of the recorder extension (`packages/extension`) — what shipped, when it went live, permissions deltas, and the exact baked targets. **Updated every time a new store build is cut**, at packaging time (status flips `packaged → submitted → live` as the release moves). Newest first.
>
> **Naming:** the product was renamed **Sync → FlowBuddy** on 2026-07-17. Builds ≤ 0.4.0 shipped under the old name **"Sync Recorder"** — their entries below keep the names/URLs they actually shipped with. Builds ≥ 0.6.0 ship as **FlowBuddy Recorder** (the listing renamed in place — same item, same extension ID; installed users keep updating).
>
> - **Listing:** <https://chromewebstore.google.com/detail/sync-recorder/njkfcfpehcklldmeofolnpdljdhcgofk> (this URL goes in `FLOWBUDDY_EXTENSION_URL` on **both** `flowbuddy-web` (prod) and `flowbuddy-dev-web` — **still pending** — powering the Home checklist's "Add to Chrome" CTA; the extension ID `njkf…` is the stable part and survives the listing rename, the name slug in the URL may update).
> - **Build/package mechanics:** [`deploy.md`](deploy.md) §5 (prod-targeted build, multi-origin `STUDIO_URL`, zip rules).

---

## v0.8.0 — 🔨 **built 2026-08-08, NOT packaged/submitted** — the fill-flush build

**The full-page-nav capture fix** — a typed value can no longer be lost to the navigation that follows it.

- **Why it exists:** a text field's `change` only fires on commit (blur/Enter), and real apps break that around navigation — a custom submit control that `preventDefault()`s its mousedown never blurs the field, and a programmatic redirect mid-typing commits nothing. The typed value (a whole fill step) silently missed the recording. Harmless-ish for answers; **not** for the acting layer, where a plan compiled without its fill steps submits a half-empty form in a live account — which is what re-prioritised this from capture-quality polish.
- **Content:**
  - **Fill-flush on `submit`:** before emitting the submit event, the form's still-uncaptured field values are emitted as `input` events, so the capture reads fill → fill → submit in the user's actual order.
  - **Fill-flush on `pagehide`:** last chance before a full-page nav — any user-typed value `change` never delivered is committed, the pending post-action watcher settles NOW (`settleReason: "pagehide"`) instead of losing the post-state to the navigation, and the outbox drains while the document can still reach the background.
  - Only fields the **user actually typed in** are swept (tracked via `input` events) — server-prefilled values the user never touched are never captured as the user's steps. A de-dup map guarantees a value `change` already delivered is never emitted twice. Every swept value passes the same `maskValue()` redaction as normal captures.
- **Compatibility:** none required — emits only the existing `input` event shape, no API/header changes, no release-ordering constraint (store-first is satisfied trivially).
- **Permissions:** **unchanged.**
- **Baked targets:** unchanged from v0.7.0 (set at packaging time).
- **Status:** built (version bumped in `src/manifest.json`); **not packaged, not submitted** — cut via the checklist below when releasing.

## v0.7.0 — ✅ **LIVE on the Chrome Web Store** (packaged 2026-07-28) — the build production requires

**The upload-identity release** — one recording now has one identity, and its artifacts upload while you record instead of in one lump at Stop.

- **Why it exists:** a ~10-minute recording stalled at "Finishing…", the recorder aborted after a flat 120 s, the API committed the recording anyway, and the Retry the user was told to click produced a **second identical recording**. Full analysis in [`copilot.md`](../build/copilot.md) §8·A (R14).
- **Content:**
  - Mints an `uploadId` at Record and sends it as `X-FlowBuddy-Upload-Id`, so a retry resolves to the same recording instead of creating another.
  - Screenshots and DOM snapshots upload **directly to object storage while recording** over short-lived presigned PUT URLs; narration follows the same path at Stop. On a healthy connection the finalize request carries **the manifest and nothing else**. Confirmed artifacts are tracked as `up:<sessionId>:<rel>` markers in IndexedDB.
  - **Removed** (net −85 lines): the hand-rolled `streamingUpload()` ReadableStream, the HTTP/2-only path and its HTTP/1.1 fallback, the 90 %-capped byte progress, the `FINISHING` sentinel, and the dual re-arming watchdogs. **"Finishing… forever" is no longer a reachable state.** The popup shows "Finishing up…", then after 8 s "Sending the rest of your recording…" *with a running timer*.
  - Discards an abandoned recording server-side (`DELETE /v1/uploads/:uploadId`) on "Start fresh" and when a new recording starts over an unsent buffer — so a thrown-away capture no longer strands uploaded artifacts.
  - Degrades to the old all-in-one Stop bundle if signing is unavailable; that path is a deliberate fallback, not leftover.
- **⚠️ COMPATIBILITY — this build is REQUIRED, not optional.** The API returns `400` on `/v1/sessions` without the identity header, and **v0.6.0 does not send it**. The intended ordering is store-first; it was not followed here — the API shipped to production on 2026-07-28 by explicit decision (no customers on prod), which left a window where any installed v0.6.0 could not upload at all. **That window is closed: v0.7.0 is live.** Anyone still on v0.6.0 is fixed by Chrome's own auto-update. Ordering rule for next time: [`deploy.md`](deploy.md) §7.6 — and the lesson is that the window is only survivable when nobody is using the product.
- **Permissions:** **unchanged.** The direct PUTs to object storage are covered by the existing `<all_urls>` host permission — a Chrome MV3 service worker is not subject to CORS for hosts it holds permission for, so **no bucket CORS rule was needed**. Verified end to end against real Cloudflare R2 on dev/Render, 2026-07-28.
- **Baked targets:** `https://app.flowbuddyai.com` (primary — the popup's Connect target) + `https://flowbuddy-dev-web.onrender.com` + `http://localhost:3000` (bridge only).
- **Artifact:** `packages/extension/flowbuddy-recorder-0.7.0.zip` (gitignored) — built `NODE_ENV=production`.
- **Status:** submitted and **live**. No permissions delta, so review took the fast path.

## Superseded versions

One line each. The listing (extension ID `njkfcfpehcklldmeofolnpdljdhcgofk`) is stable across every
version, and `git log -- packages/extension` carries the detail.

| Version | Status | What it was |
|---|---|---|
| **v0.6.0** | ⛔ superseded by v0.7.0 | The production release — first build connecting to `app.flowbuddyai.com`, FlowBuddy "F" icons. **Sends no `X-FlowBuddy-Upload-Id`, so it cannot upload against the current API.** |
| **v0.5.0** | ⚠️ review cancelled 2026-07-17 | The FlowBuddy rename (bridge channels `flowbuddy-ext`/`flowbuddy-page` — a renamed build cannot pair with a pre-rename Studio). Replaced by v0.6.0 to spend one review cycle instead of two. |
| **v0.4.0** | ⚠️ never uploaded | Packaged 2026-07-13 with R13 + logging; obsolete. Do not upload. |
| **v0.3.0** | superseded 2026-07-23 | Was live from 2026-07-13. Its baked Studio URL died with the pre-rename re-deploy. |
| **v0.2.1** | superseded | Approved 2026-07-06. |
| **v0.2.0** | superseded before use | — |
| **v0.1.0** | first upload | Dev build. |

**Permissions have been unchanged since v0.3.0.**

## Cutting a new store release (the checklist)

1. **Bump** `packages/extension/src/manifest.json` `version` (never reuse a submitted number).
2. **Prod build:** `STUDIO_URL="https://app.flowbuddyai.com,https://flowbuddy-dev-web.onrender.com,http://localhost:3000" NODE_ENV=production pnpm --filter @flowbuddy/extension build` (prod Studio FIRST = the popup's primary target; use the real deployed dev URL — Render *may* append a random suffix to a service name) — never zip a stale `dist/` (a default-env build is localhost-only and useless on the store).
3. **Verify the artifact:** `dist/manifest.json` has the new version + bridge `matches` for all three origins; the popup bundle contains `app.flowbuddyai.com`; prod-only expectations hold (minified, `__DEV__` stripped).
4. **Zip:** `cd packages/extension/dist && zip -r ../flowbuddy-recorder-<version>.zip .` (the zip is gitignored).
5. **Check the API contract both ways.** Confirm the artifact sends every header the API requires (today: `X-FlowBuddy-Upload-Id` on `/v1/sessions`), and record in the entry whether this build **must go live before** the matching API reaches prod. Since the upload-identity change, extension and API releases are **ordered, not independent** ([`deploy.md`](deploy.md) §7.6).
6. **Upload** via the Web Store developer dashboard → submit for review. New permissions = slower review; call them out in the entry.
7. **Restore the dev build:** plain `pnpm --filter @flowbuddy/extension build` (local unpacked loads should point at localhost again).
8. **Update the docs:** add the entry HERE (newest first, with commits/permissions/baked targets), plus the store-version notes in [`deploy.md`](deploy.md) §5 and the roadmap P1-M1 row; flip this doc's older entry statuses when a version goes live.

> ⚠️ **The baked Studio URL is part of the artifact.** Moving to a custom domain = rebuild + resubmission (add the new domain to the `STUDIO_URL` list; keep the old one during the transition).
