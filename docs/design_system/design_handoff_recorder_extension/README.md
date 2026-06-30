# Handoff: Sync Recorder — Extension UI Revamp

## Overview
This package specifies a UI revamp for the **Sync Recorder**, the Chrome browser-action popup that is Sync's *capture surface*. The builder opens the popup, narrates their way through a real product workflow, and the recorder captures screen + voice + DOM + events + routes, segments the session into named workflows, and uploads it securely. Studio then distils that recording into the Knowledge Base.

The revamp covers the **four core popup states**:

| ID | State | Trigger |
|----|-------|---------|
| **F10** | Idle / ready | Popup opened, org connected, no active capture |
| **F11** | Recording + mark workflow | User pressed *Start recording* |
| **F12** | Uploading | User pressed *Stop & upload* |
| **F13** | Upload interrupted (retry) | Network dropped mid-upload |

## About the Design Files
The files in this bundle are **design references created in HTML** — a prototype showing the intended look, copy, and behavior of the recorder popup. **They are not production code to copy directly.**

The task is to **recreate these designs inside the Sync Recorder extension's real codebase**, using its established framework and patterns (React/Preact/vanilla — whatever the extension is built in) and the canonical **Sync design system** (tokens summarised below and included under `tokens/`). If the extension has no component system yet, choose the most appropriate approach for a Chrome MV3 popup and implement the design tokens as CSS custom properties.

- **`recorder_extension_states.html`** — the visual reference. All four states side by side, each popup at its native **360px** width, rendered with the canonical brand fonts. Open it in a browser to see the target.
- **`tokens/`** — the canonical Sync design tokens (colors, typography, spacing, elevation, fonts) as CSS custom properties. Implement against these, not the literal hexes baked into the reference HTML.

## Fidelity
**Mid-to-high fidelity.** Layout, spacing, copy, states, and color intent are final and should be matched precisely. Two deliberate normalisations to apply when implementing:

1. **Fonts** — the reference renders in the canonical brand faces **Plus Jakarta Sans** (UI) + **JetBrains Mono** (labels/status/timers). Use these, not `system-ui`.
2. **Brand blue** — the reference uses the literal wireframe hex `#3a5bd9`. **Use the canonical token `--primary` = `--indigo-500` = `#3b50e0`** instead; the two are visually interchangeable and `#3b50e0` is the system source of truth.

Placeholder marks to replace with real assets: the **logo mark** (currently a 20×20 indigo square → use the Sync logo mark) and the **org avatar** (24×24 grey circle → org/workspace avatar).

---

## Shared popup shell (all states)
- **Popup width:** 360px (Chrome popup native). Height is content-driven.
- **Card:** `background #fff`; `border 1px solid #d8d8d8`; `border-radius 14px`; `box-shadow 0 6px 22px rgba(0,0,0,.10)`; `overflow hidden`.
- **Header:** flex row, `align-items center`, `gap 9px`, `padding 12px 14px`, `border-bottom 1px solid #f0f0f0`.
  - Default header (F10/F12/F13): logo mark `20×20`, `radius 6px`, fill `--primary` · title **"Sync Recorder"** `700 13px` `#1c1c1c` · trailing gear `⚙` `13px` `#c4c4c4` pushed right (`margin-left:auto`).
  - Recording header (F11): see F11 below — warm tint + REC timer.
- **Body:** `padding 14px`.
- **Micro-labels** ("CAPTURES", "RECENT", "CURRENT WORKFLOW"): `700 9.5px` JetBrains Mono, `letter-spacing .03em`, color `#aaa`, uppercase.

---

## Screens / States

### F10 · Idle / ready
**Purpose:** Default landing state; user starts a capture.

**Layout (top → bottom, in 14px-padded body):**
1. **Connection row** — flex, `gap 9px`, `padding 9px 11px`, `border 1px #ececec`, `radius 9px`, `margin-bottom 14px`.
   - Avatar `24×24` circle, `#e0e0e0`.
   - Text block: **"Acme Inc."** `600 12px` `#2a2a2a`; **"Connected as Fiona"** `10px` mono `#a4a4a4`.
   - Live dot `8×8` circle `#4e8d6e` (success/live).
2. **Primary CTA** — full-width button: `background --primary`, `color #fff`, `border-radius 10px`, `padding 13px`, font `700 13.5px`, flex-centered with `gap 9px`; leading `11×11` white dot (record glyph). Label **"Start recording"**. `margin-bottom 13px`.
3. **PII toggle row** — flex space-between, `padding 10px 0`, `border-top 1px #f2f2f2`. Label **"Mask PII before upload"** `12px` `#4a4a4a`. Toggle `34×20`, `radius 10px`, track `--primary` (ON), knob `16×16` white at `top:2 right:2`. **Default = ON.**
4. **"CAPTURES"** micro-label (`margin 10px 0 7px`) + chip row — flex `gap 5px` wrap. Five pills, each `600 10px` mono `#7a7a7a`, `background #f4f4f4`, `border 1px #e6e6e6`, `radius 999px`, `padding 3px 9px`: **Screen · Voice · DOM · Events · Routes** (read-only scope indicators).
5. **"RECENT"** micro-label (`margin-top 13px`) + one row (`margin-top 7px`): live dot `6×6` `#4e8d6e`, **"Billing & account flows"** `11.5px` `#5a5a5a` (flex:1), trailing **"uploaded"** `10px` mono `#b0b0b0`.

**Interactions:** *Start recording* → F11. Gear → settings. Toggle flips PII masking. Connection row may open an org switcher (out of scope here).

### F11 · Recording + mark workflow
**Purpose:** Active capture; segment the session into workflows.

**Header (overrides default):** `background #fef6f4` (warm record tint). Pulsing dot `11×11` `#cc4a3a` with halo `box-shadow 0 0 0 3px rgba(204,74,58,.18)`. Timer **"REC · 02:14"** `700 12.5px` mono `#a23d30`, `letter-spacing .04em`. Trailing domain **"app.acme.com"** `10px` mono `#b07a72` (`margin-left:auto`).

**Body:**
1. **"CURRENT WORKFLOW"** micro-label (`margin-bottom 7px`).
2. **Workflow card** — `border 1px #e0e5fb`, `background #f4f6ff`, `radius 10px`, `padding 11px 13px`, `margin-bottom 11px`. Title **"Workflow 2 · Reset a password"** `700 13px` `#1c1c1c`; meta **"started 0:41 ago · 6 steps captured"** `10px` mono `#8b93b4` (`margin-top 3px`). *(Step count increments live as the user clicks.)*
3. **"+ Mark new workflow"** — full-width secondary button: `background #fff`, `color --primary`, `border 1.5px #c9d3f7`, `radius 9px`, `padding 10px`, `700 12.5px`. `margin-bottom 12px`. Starts a new workflow segment.
4. **Mic meter** — flex `gap 9px`, `margin-bottom 13px`. Label **"MIC"** `10px` mono `#aaa`. Meter = flex row, `height 18px`, `gap 3px`, of 7 bars (each `flex:1`, `radius 2px`); reference heights `40/75/55/90/48/65/35%`; active bars `--primary`, idle bars `#cdd5f2`. **Animate live from the mic input.**
5. **Action row** — flex `gap 9px`. **Pause** (flex:1, `#fff`, `color #555`, `border 1px #d6d6d6`, `radius 9px`, `padding 11px`, `600 12.5px`). **Stop & upload** (flex:1, `background #1f2330`, `color #fff`, `radius 9px`, `padding 11px`, `700 12.5px`).
6. **Reassurance footer** — centered flex `gap 7px`, `margin-top 12px`: live dot `6×6` `#4e8d6e` + **"PII masked · survives page navigation"** `10px` mono `#9a9a9a`.

**Interactions:** *Mark new workflow* → increments workflow counter, resets step counter. *Pause* → freezes timer + meter (define a paused visual). *Stop & upload* → F12. Recorder must persist across page navigations / SPA route changes.

### F12 · Uploading
**Purpose:** Confirm capture is complete; show secure upload progress.

**Header:** default (Sync Recorder).

**Body:**
1. **Centered summary block** (`padding 8px 0 14px`): spinner `46×46`, `border 3px #eef1fd` with `border-top-color --primary` (rotating), `margin 0 auto 12px`. Title **"Recording complete"** `700 14px` `#1c1c1c`. Meta **"12:10 · 5 workflows · narration saved"** `11.5px` `#8a8a8a` (`margin-top 3px`).
2. **Progress label row** — flex space-between, `11px` mono `#8a8a8a`, `margin-bottom 6px`: **"Uploading securely…"** / **"64%"** (percent in `--primary`).
3. **Progress track** — `height 7px`, `background #eee`, `radius 4px`, `overflow hidden`, `margin-bottom 13px`; fill `width 64%`, `background --primary`, `radius 4px`. (Bind width to real progress.)
4. **Resume note** — flex `gap 9px`, `border 1px #ececec`, `radius 9px`, `padding 10px 12px`. Glyph **↻** `13px` `--primary` + **"Keep this open — uploads resume automatically if your connection drops."** `11px/1.45` `#8a8a8a`.
5. **Footer** — **"Then Studio distils it into your Knowledge Base"** `10px` mono `#aaa`, centered, `margin-top 12px`.

**Interactions:** progress 0→100 from real upload events. Drop → F13. Complete → close / success.

### F13 · Upload interrupted (retry)
**Purpose:** Recover gracefully when the upload drops. **This is a warning, not an error** — captured data is safe.

**Header:** default (Sync Recorder).

**Body:**
1. **Warning banner** — flex `gap 11px`, `border 1px #ecdfc2`, `background #fbf7ec`, `radius 10px`, `padding 12px 13px`, `margin-bottom 13px`. Glyph **⚠** `18px` `#b89030`. Title **"Upload interrupted"** `700 12.5px` `#6a5a30`; body **"Your narration is safe — nothing is lost."** `11px/1.45` `#8a7a4e` (`margin-top 2px`).
2. **Progress label** — flex space-between, `11px` mono `#8a8a8a`, `margin-bottom 6px`: **"Uploaded"** / **"3 of 5 workflows"**.
3. **Progress track** — same geometry as F12; fill `width 60%`, `background #b89030` (amber, not indigo). `margin-bottom 14px`.
4. **Retry upload** — full-width primary: `background --primary`, `color #fff`, `radius 10px`, `padding 12px`, `700 13px`. `margin-bottom 9px`.
5. **Resume later** — full-width tertiary: `background #fff`, `color #666`, `border 1px #d6d6d6`, `radius 10px`, `padding 11px`, `600 12.5px`.
6. **Footer** — **"Retries automatically when you're back online"** `10px` mono `#aaa`, centered, `margin-top 11px`.

**Interactions:** *Retry upload* → resume from last good chunk → F12. *Resume later* → dismiss, retry in background. Auto-retry on reconnect (`navigator.onLine`).

---

## Interactions & Behavior (cross-cutting)
- **State machine:** `F10 → F11 → F12`, with `F12 ⇄ F13` on connection loss/recovery. *Pause* keeps F11. After F12 success, return to F10 (with the new recording listed under RECENT).
- **Timer:** monospace `mm:ss`, ticking every second while recording (pause halts it).
- **Mic meter:** drive bar heights from a `getUserMedia` analyser (RMS/peak); ~7 bars; idle colour `#cdd5f2`, active `--primary`.
- **Workflow segmentation:** *Mark new workflow* increments the workflow index and resets the per-workflow step counter; steps increment on captured user actions.
- **Resilience:** capture must survive full-page navigations and SPA route changes; chunked, resumable upload; PII masked **in-browser before upload** (the reassurance copy promises this — honour it).
- **Transitions:** keep them quick and calm — `--dur 180ms`, `--ease cubic-bezier(.2,.7,.3,1)` (see `tokens/elevation.css`). Pulsing record dot may use a slow opacity/scale loop.

## State Management
Minimum state the popup needs:
- `status`: `idle | recording | paused | uploading | interrupted`
- `org`: `{ name, user, avatarUrl, connected }`
- `maskPII`: boolean (default `true`)
- `captureScope`: `['Screen','Voice','DOM','Events','Routes']` (currently fixed)
- `session`: `{ elapsedSeconds, domain, workflows: [{ name, startedAt, steps }], currentWorkflowIndex }`
- `upload`: `{ percent, uploadedWorkflows, totalWorkflows, lastError }`
- `recent`: `[{ name, status }]`
- `micLevel`: live float for the meter
- Popup reads session/upload state from the extension background/service worker (popup can close without stopping capture).

## Design Tokens
Full source in **`tokens/`**. Key values used by these screens:

**Color**
- Primary / brand: `--primary` `#3b50e0` (`--indigo-500`). *(Reference HTML uses `#3a5bd9` — substitute the token.)* Tints: `--indigo-50 #eef0fe`, `--indigo-100 #dfe3fc`, `--indigo-200 #c3ccfb`.
- Record / danger: `--danger-500 #cc4a3a`; rec-ink `#a23d30`; rec header tint `#fef6f4`.
- Live / success: `--success-dot #4e8d6e`.
- Warning / amber: `--warning-dot #b89030`, `--warning-bg-2 #fbf7ec`, `--warning-border #ecdfc2`, warn-ink `#6a5a30`.
- Dark action ("Stop & upload"): `--code-bg #1f2330`.
- Ink/text: `--ink #14161f` (titles use `#1c1c1c` here), body `#2a2a2a`/`#4a4a4a`, muted `#8a8a8a`, faint `#aaa`.
- Borders: card `#d8d8d8`, hairline `#f0f0f0`/`#f2f2f2`, chip `#e6e6e6`.

**Typography** — `--font-sans 'Plus Jakarta Sans'`, `--font-mono 'JetBrains Mono'`. Weights 400/500/600/700/800. Sizes in play: 9.5 / 10 / 11 / 11.5 / 12 / 12.5 / 13 / 13.5 / 14px. Mono is the "technical voice": timers, micro-labels, domain, chips, status, footnotes.

**Radius** — controls/inputs `9px`; inner tiles `10px`; primary CTA `10px`; **popup card `14px`**; pills/toggles/avatars `999px`; logo mark / chips `6px`.

**Spacing** — 4px grid; body padding `14px`; common gaps `7 / 9 / 11 / 13px`.

**Elevation** — popup shadow `0 6px 22px rgba(0,0,0,.10)` (close to `--shadow-widget`). Focus ring `0 0 0 3px rgba(58,80,221,.18)`.

## Assets
- **Logo mark** — replace the 20×20 indigo square with the real Sync mark (`assets/logo-mark.svg` exists in the parent project).
- **Org avatar** — 24×24 circular workspace avatar (placeholder grey).
- **Icons** — gear `⚙`, retry `↻`, warning `⚠` are placeholders; swap for the product icon set (**Material Symbols Outlined** in the Sync system) or the extension's existing icons.
- No raster images; everything else is CSS shapes (dots, bars, spinner, progress).

## Files
- `recorder_extension_states.html` — the four-state visual reference (this folder).
- `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`, `tokens/elevation.css`, `tokens/fonts.css` — canonical Sync design tokens.
- Source of truth in the parent project: **`Sync Studio Wireframes.dc.html`**, Section **06 · Recorder Extension**, frames F10–F13.
