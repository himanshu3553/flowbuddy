# FlowBuddy Recorder — Chrome Web Store release log

> **A living doc.** One entry per store build of the recorder extension (`packages/extension`) — what shipped, when it went live, permissions deltas, and the exact baked targets. **Updated every time a new store build is cut**, at packaging time (status flips `packaged → submitted → live` as the release moves). Newest first.
>
> **Naming:** the product was renamed **Sync → FlowBuddy** on 2026-07-17. Builds ≤ 0.4.0 shipped under the old name **"Sync Recorder"** — their entries below keep the names/URLs they actually shipped with. The next store build ships as **FlowBuddy Recorder** (a listing rename on the same item, same extension ID — installed users keep updating in place).
>
> - **Listing:** <https://chromewebstore.google.com/detail/sync-recorder/njkfcfpehcklldmeofolnpdljdhcgofk> (this URL is `FLOWBUDDY_EXTENSION_URL` on `flowbuddy-dev-web` — it powers the Home checklist's "Add to Chrome" CTA; the extension ID `njkf…` is the stable part and survives the listing rename, the name slug in the URL may update).
> - **Build/package mechanics:** [`deploy-render.md`](deploy-render.md) §11 (prod-targeted build, multi-origin `STUDIO_URL`, zip rules).

---

## v0.5.0 — 🚀 submitted 2026-07-17 · in review

**The FlowBuddy release** — the first build under the new name, and the first that connects to the renamed dev stack.

- **Rename (`5db16e1`):** manifest name/description/action title → **"FlowBuddy Recorder"**; connect-bridge channels `flowbuddy-ext`/`flowbuddy-page` (must match the Studio side — pre-rename Studios can't pair with this build and vice versa); recorder IndexedDB → `flowbuddy-recorder` (any chunks in the old `sync-spike` DB are orphaned — transient by design); host masking opt-in → `data-flowbuddy-redact`.
- **Content:** carries everything from the never-uploaded v0.4.0 (R13 ranked locators + structured logging).
- **Permissions:** unchanged since 0.3.0.
- **Baked targets:** `https://flowbuddy-dev-web.onrender.com` (primary) + `http://localhost:3000` (bridge only).
- **Artifact:** `packages/extension/flowbuddy-recorder-0.5.0.zip` (gitignored) — built `NODE_ENV=production`, verified: manifest 0.5.0 + new name, bridge matches both origins, popup bakes the dev Studio URL, `__DEV__` stripped.
- **Store mechanics:** uploads to the SAME listing (extension ID `njkf…`) — the listing renames in place; existing v0.3.0 installs auto-update and regain the ability to connect (v0.3.0's baked `sync-web-uir8` URL died with the re-deploy). After it goes live: set `FLOWBUDDY_EXTENSION_URL` on `flowbuddy-dev-web`.

## v0.4.0 — 📦 packaged 2026-07-13 · ⚠️ OBSOLETE, never uploaded — do not upload

**Superseded by the FlowBuddy rename (2026-07-17) before it reached the store:** the zip bakes the old `sync-web-uir8.onrender.com` Studio URL (dead once the dev services are recreated as `flowbuddy-dev-*`) and still ships under the "Sync Recorder" name. The next store build (v0.5.0, "FlowBuddy Recorder") carries this release's content plus the rename + new baked URLs.

**The R13 release** — the first store artifact whose recordings carry ranked multi-signal locators.

- **R13 ranked locators** (`351a454`): every captured event target now carries a ranked `{strategy, value, unique}` locator set (testid → human id → aria → name → placeholder → href → text, unique-first, positional css/xpath as tails, ≤8; generated ids rejected). This is what **Sense localization** anchors on and what **Phase-3 replay** will consume — recordings made with ≤0.3.0 builds fall back to brittle positional css/xpath in the sense plan.
- **Structured-logging pass** (`5d3fa13`): `__DEV__`-gated debug logging, compiled out of prod builds (this artifact ships silent).
- **Permissions:** unchanged (no new permissions since 0.3.0 — should ease review).
- **Baked targets:** `https://sync-web-uir8.onrender.com` (primary) + `http://localhost:3000` (bridge only).
- **Artifact:** `packages/extension/sync-recorder-0.4.0.zip` (gitignored) — built `NODE_ENV=production`, verified: manifest 0.4.0, bridge matches both origins, popup bakes the Render URL, R13 present, `__DEV__` stripped. Manifest bump commit: `07d1bbb`.

## v0.3.0 — ✅ LIVE (submitted 2026-07-06 · confirmed live 2026-07-13)

**Stop→upload feedback & resilience** (`6a06864`) — drove out the "stranded stop" incident found on the first store-install E2E (asleep API + service-worker eviction → stuck upload, popup falsely idle):

- Persisted recording **phase** + boot recovery, `chrome.alarms` fallback twin, upload **watchdog**.
- Persistent **Recent row** with live status polling (`GET /v1/sessions/:id`) + View-in-Studio link.
- On-page **status pill** during upload.
- **Permissions:** added `alarms`.
- **Baked targets:** same as v0.2.1.

## v0.2.1 — ✅ was LIVE (approved 2026-07-06; superseded by 0.3.0)

**The first prod-targeted artifact.** Multi-origin `STUDIO_URL` support landed (`ffa11a2`): comma-separated list, first entry = primary (popup "Connect with Sync" target), all entries get the connect-bridge content script — so one artifact connects against the deployed Studio **and** local dev.

- **Baked targets:** `https://sync-web-uir8.onrender.com` + `http://localhost:3000` — the first build store installers could actually connect.

## v0.2.0 — ⚠️ uploaded, superseded before use

Dev build — connect-bridge matched `http://localhost:3000/*` only, so store installs could never connect to the deployed Studio. Its pending review was replaced by v0.2.1.

## v0.1.0 — ⚠️ first upload (dev build)

Same localhost-only limitation as 0.2.0. Kept for history: the first time the recorder passed Web Store review.

---

## Cutting a new store release (the checklist)

1. **Bump** `packages/extension/src/manifest.json` `version` (never reuse a submitted number).
2. **Prod build:** `STUDIO_URL="https://<flowbuddy-dev-web>.onrender.com,http://localhost:3000" NODE_ENV=production pnpm --filter @flowbuddy/extension build` (use the real dev-Studio URL — Render appends a random suffix to `flowbuddy-dev-web`) — never zip a stale `dist/` (a default-env build is localhost-only and useless on the store).
3. **Verify the artifact:** `dist/manifest.json` has the new version + bridge `matches` for both origins; the popup bundle contains the deployed-Studio URL; prod-only expectations hold (minified, `__DEV__` stripped).
4. **Zip:** `cd packages/extension/dist && zip -r ../flowbuddy-recorder-<version>.zip .` (the zip is gitignored).
5. **Upload** via the Web Store developer dashboard → submit for review. New permissions = slower review; call them out in the entry.
6. **Restore the dev build:** plain `pnpm --filter @flowbuddy/extension build` (local unpacked loads should point at localhost again).
7. **Update the docs:** add the entry HERE (newest first, with commits/permissions/baked targets), plus the store-version notes in [`deploy-render.md`](deploy-render.md) §11 and the roadmap P1-M1 row; flip this doc's older entry statuses when a version goes live.

> ⚠️ **The baked Studio URL is part of the artifact.** Moving to a custom domain = rebuild + resubmission (add the new domain to the `STUDIO_URL` list; keep the old one during the transition).
