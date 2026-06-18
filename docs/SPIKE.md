# Sync — Phase 0 (Discovery) Spike

> **Purpose:** a throwaway, lightweight spike to answer one question before we build any product: **does capture → KB generation actually work?** No login, no Studio, no multi-tenancy, no portal — just the core pipeline and a way to eyeball the output.

- **Status:** ✅ **DONE — verdict: GO** (2026-06-18). Built, run on a real app, hypothesis validated. See [Outcome & findings](#outcome--findings-2026-06-18).
- **Last updated:** 2026-06-18
- **Relationship to roadmap:** precedes [Phase 1](phase-1-spec.md). Code here is **disposable**; the *learnings* are the deliverable.
- **Build decisions:** LLM = **OpenAI** (quality over cost, cost ignored for now); **fully multimodal**; **Node/TS** local backend; API key **backend-only**; flow is **fully automated, no manual steps**.

---

## 1. The hypothesis

> A narrated screen recording can be captured in multi-layer form (event + DOM + screenshot + post-action + audio) and **synthesized into accurate, structured, step-by-step articles**.

Everything else in the product is productization around this. If this fails, stop and rethink. If it works, Phase 1 is "wrap product around a proven core."

### Split into two independently-testable risks
| | Risk | Question | Can be tested by |
|---|---|---|---|
| **A** | Synthesis quality | Given a *good* capture bundle, can the AI produce accurate structured articles? | Hand-crafted / scripted bundle → synthesis (no extension needed) |
| **B** | Capture fidelity | Can capture actually produce a good-enough bundle from real apps? | Minimal extension/script → inspect bundles |

**Test A first** — it's the cheaper, more fundamental risk and needs no extension. Then test B. Keep them separate so a failure points at the right stage.

---

## 2. Kill / go criteria

Record real, narrated, multi-workflow sessions on **2–3 real SaaS apps** (include ≥1 React SPA, optionally a throwaway toy app).

- ✅ **GO** if a session reliably yields ≥3 articles where **~80% of steps are correct and usable with only minor edits**.
- 🔁 **ITERATE** if output is close but a single identifiable stage is weak (e.g., segmentation).
- ❌ **KILL / RETHINK** if even with good captures the synthesis can't produce usable articles.

> Judgement is **human eyeball** on the rendered output — that's the only metric that matters at this stage.

---

## 3. Explicitly OUT of scope (the cuts)

No production concerns. Deliberately excluded:
- ❌ Auth / login / accounts
- ❌ Multi-tenancy / workspaces
- ❌ Studio (editor, segmentation UI, KB management)
- ❌ Published help portal / hosting / custom domains
- ❌ Billing
- ❌ Self-validation, copilot
- ❌ **Prompt-to-article** (second hypothesis — stretch goal only)
- ❌ Productized redaction (keep only minimal self-protection — record with a dummy account)
- ❌ Queues / orchestration / scalable infra (the backend runs the pipeline **inline on upload** — automated, just not scalable)

---

## 4. What we KEEP (the irreducible core)

- ✅ **Real multi-layer capture** — the contract is the thing under test, so it must be real, not faked:
  event + DOM snapshot + hi-res screenshot + **post-action snapshot** + continuous audio, on one timeline.
  (Shape per [Phase 1 spec §6](phase-1-spec.md#6-the-capture-contract-session-bundle).)
- ✅ **Transcription** of narration.
- ✅ **Segmentation** of one session into candidate articles (markers + route changes + narration cues).
- ✅ **Synthesis** into the structured Article/Step model (instruction + rationale + screenshot + selector + expected_outcome).
- ✅ **Output viewer** — a dead-simple static HTML / markdown render (or even raw JSON) to eyeball article quality. **No portal.**
- ✅ **Observability** — dump every intermediate artifact (bundle, transcript, segments, article) to local files.

---

## 5. Method

Everything is **automated** — no manual capture, no hand-authoring. We build the two components (extension + backend) and let the pipeline run end-to-end. The Risk A / Risk B split is kept as a **diagnosis lens** and drives build order, *not* a manual-vs-automated distinction.

### Validate Risk A (synthesis quality) — iterate on a stored bundle
- Build the backend pipeline first. Capture **one** real session with the extension, then **re-run synthesis repeatedly on that stored bundle** (transcribe → segment → synthesize → render) while tuning prompts/models. No re-recording needed.
- **Outcome:** given a real bundle, does synthesis produce accurate structured articles?

### Validate Risk B (capture fidelity) — inspect real bundles
- Record narrated sessions on the 2–3 test apps; inspect the emitted bundles.
- Are events/DOM/selectors/screenshots/post-action snapshots complete and correct? Where are the gaps (iframes, SPA settle timing, custom widgets)?
- **Outcome:** can capture produce bundles good enough for synthesis?

### End-to-end
Record → stop → auto-upload → pipeline → render, fully automated; apply the [kill/go bar](#2-kill--go-criteria).

---

## 6. Observability (so failures are actionable)

Persist intermediate artifacts for every run so we can localize *where* quality breaks:
```
runs/<id>/
  bundle/              # raw capture (session.json, audio.webm, shots/, dom/)
  transcript.json      # narration → timestamped text
  segments.json        # proposed article boundaries
  articles.json        # synthesized structured articles
  render.html          # human-eyeball view
```
When an article is wrong, the question is always: capture gap? segmentation gap? or synthesis gap? — and these files answer it.

---

## 7. Test apps (to refine)

- App 1: _TBD_ (a straightforward CRUD SaaS)
- App 2: _TBD_ (a **React SPA** — surfaces selector + settle-timing issues)
- App 3 (optional): a throwaway toy app we control (clean baseline)

Each: one ~10-min narrated session covering ≥3 distinct workflows, using a dummy account.

---

## 8. Time-box & deliverables

- **Time-box:** ~1–2 weeks. *(adjust)*
- **Deliverable is learnings, not code:**
  - Go / iterate / kill decision against the bar.
  - Documented failure modes (capture gaps, segmentation errors, synthesis weaknesses).
  - Refinements to the **capture contract** and **synthesis prompts** that carry into Phase 1.
  - A short writeup of what surprised us.

---

## 9. Decisions to make after the spike

- Does the core hold? Proceed to Phase 1, iterate, or pivot?
- Capture-model adjustments (what layers actually mattered; what was noise).
- Where synthesis needs the most help (segmentation? rationale extraction? screenshot selection?).
- Is prompt-to-article worth pursuing (if the stretch goal was attempted)?
- Realistic synthesis cost per recorded minute → informs Phase 1 caps & later pricing.

---

# Part B — Dev Spec (Phase 0 build)

> The buildable detail for the spike. Three local components, OpenAI for all LLM work, fully automated. This is what we build next.

## 10. Architecture

Three components, all running locally — no cloud, no auth, no multi-tenancy:

```
┌─────────────────────────┐     session bundle      ┌──────────────────────────────┐
│  1. Chrome Extension     │  (multipart upload)     │  2. Local Backend (Node/TS)  │
│  (capture)               │ ──────────────────────► │  receive → persist → pipeline │
│  events+DOM+shots+audio  │     POST /sessions      │  transcribe → segment →       │
│  buffer (IndexedDB)      │                         │  synthesize (OpenAI) → render │
└─────────────────────────┘                         └──────────────┬───────────────┘
            ▲                                                       │ writes
       Start/Stop                                                   ▼
        (popup)                                          ┌────────────────────────┐
                                                         │ 3. Output viewer       │
                                                         │ runs/<id>/render.html  │
                                                         └────────────────────────┘
```

**Stack:** Extension = MV3 + TypeScript (bundled with Vite/esbuild). Backend = Node 20+ / TypeScript / Fastify + the official `openai` SDK. Storage = local filesystem under `runs/<id>/`. Secrets via `.env`.

---

## 11. Component 1 — Chrome Extension (MV3)

**Files / structure**
- `manifest.json` (MV3). Permissions: `activeTab`, `tabs`, `scripting`, `storage`, `offscreen`; `host_permissions: ["<all_urls>"]` (to record any app).
- **Popup** — Start / Stop / Pause controls, recording indicator, "new workflow" marker button, backend URL field.
- **Background service worker** — owns recording state; on each event triggers `chrome.tabs.captureVisibleTab`; assembles + uploads the bundle on Stop.
- **Content script** — injected into the page: attaches event listeners, serializes sanitized DOM, computes selectors + bbox, detects route changes, runs the post-action settle watcher.
- **Offscreen document** — required in MV3 to access the mic; runs `getUserMedia({audio})` + `MediaRecorder` for continuous narration.

**Capture mechanics**
| Layer | How |
|---|---|
| Events | Content-script listeners: `click`, `input`/`change`, `submit`, `keydown` (Enter/Tab), throttled `scroll`, navigation (History API patch + `popstate`). Each meaningful event → an `Event` object. |
| Element semantics | role (ARIA/implicit), accessible name, visible text, tag, key attributes, `cssPath`, `xpath`, `bbox` (`getBoundingClientRect`), iframe path if any. |
| Screenshot | Background `captureVisibleTab({format:'png'})` on each event (debounced), DPR-aware. |
| DOM snapshot | Content script serializes a **sanitized, size-capped** DOM at the event (redaction applied first). |
| Post-action snapshot | After the event, watch `MutationObserver` for a quiet window (~500ms) or network-idle; then capture screenshot + DOM + route as `postAction`. Hard timeout (~3s). |
| Audio | Offscreen `MediaRecorder` → one continuous `audio.webm` (Opus) finalized on Stop. |
| Markers | Popup button / hotkey → `marker` event with timestamp. |

**Buffering & upload**
- Events + DOM accumulate in the service worker; screenshots (PNG) and audio buffered; mirror to **IndexedDB** for resilience.
- On **Stop**: finalize audio, assemble the bundle, and **POST `multipart/form-data`** to the backend: `manifest` (JSON) + `audio` (file) + `shots/*` (files) + `dom/*` (files).

**Minimal redaction (spike-level only):** never capture `type=password` values; mask input values in DOM/events by default; rely on "record with a dummy account." No productized PII tooling.

---

## 12. Session bundle format (the contract)

The artifact that connects capture → synthesis. Spike subset of [phase-1-spec §6](phase-1-spec.md#6-the-capture-contract-session-bundle).

```jsonc
// manifest: session.json
{
  "id": "...", "createdAt": "...",
  "app": { "baseUrl", "userAgent", "viewport": {"w","h"}, "devicePixelRatio" },
  "audio": { "file": "audio.webm", "durationMs" },
  "video": null,                                  // not used in spike
  "markers": [ { "t", "label" } ],
  "events": [ Event ]
}

Event {
  "id", "t",                                      // ms from session start (sync key)
  "type",                                         // click | input | submit | nav | scroll | keydown | marker
  "target": {
    "role", "accessibleName", "text", "tag",
    "attributes", "cssPath", "xpath",
    "bbox": {"x","y","w","h"}, "framePath?"
  },
  "value?",                                        // masked input value
  "route": { "url", "path", "hash", "title" },
  "domSnapshot": { "file": "dom/<eventId>.html" },
  "screenshot":  { "file": "shots/<eventId>.png" },
  "postAction?": {
    "screenshot": { "file": "shots/<eventId>-post.png" },
    "domSnapshot": { "file": "dom/<eventId>-post.html" },
    "route", "settleReason"                        // mutation_quiet | network_idle | timeout
  }
}
```
Persisted by the backend at `runs/<id>/bundle/`.

---

## 13. Component 2 — Local backend (Node/TS)

**Endpoints**
- `POST /sessions` — accept multipart bundle → persist to `runs/<id>/bundle/` → run the pipeline inline → return `{ id, status }`.
- `GET /sessions/:id` — status + output links.
- `GET /sessions/:id/render` — serve `render.html`.
- Static-serve `runs/` for inspection.

**Storage layout** — see [§6](#6-observability-so-failures-are-actionable) (`runs/<id>/`).

**Pipeline (inline, sequential — no queue)**
1. **Persist** the bundle.
2. **Transcribe** `audio.webm` via OpenAI → `transcript.json` (timestamped segments).
3. **Align** transcript to events by timestamp (attach nearby narration to each event).
4. **Segment** → LLM call over (events + aligned narration + markers/routes) → `segments.json` = `[{ title, eventIds[] }]`.
5. **Synthesize per segment** → multimodal call (events as structured text + relevant screenshots as images + narration) → an `Article` with `Steps` via **Structured Outputs (JSON schema)**.
6. **Assemble** `articles.json`.
7. **Render** `render.html` from `articles.json`.

Each stage writes its artifact and logs; on failure, partial artifacts remain so the broken stage is identifiable.

---

## 14. Synthesis / OpenAI usage

- **Models (pinned in config; pick strongest, cost ignored):**
  - Transcription: `gpt-4o-transcribe` (fallback `whisper-1`).
  - Segmentation + synthesis: a **vision-capable** model (GPT‑4o / GPT‑4.1‑class) — exact id in `.env`.
- **Multimodal:** screenshots sent as image inputs alongside the structured event text and narration. (Optionally pre-crop to `bbox` before sending for a cleaner signal — refine during Risk-A tuning.)
- **Structured Outputs:** enforce the Article/Step JSON schema so output is directly storable.
- **Grounding guardrail (core principle):** the system prompt instructs the model to use **only** the provided captured data + narration, never general knowledge; if a step is unclear, mark it uncertain rather than invent. Mirrors the product's "grounded authorship."
- **Output schema:**
  ```jsonc
  Article { title, intent, tags[], routes[], preconditions[], steps: Step[] }
  Step    { instruction, rationale, screenshotRef, selector, route, expectedOutcome, uncertain? }
  ```

---

## 15. Component 3 — Output viewer

- `render.html` — static, self-contained (plain CSS). Lists articles; each article shows ordered steps with the (optionally cropped) screenshot, instruction, rationale, and expected outcome; flags `uncertain` steps; shows which session it came from. Open from disk or via `GET /sessions/:id/render`. **No portal.**

---

## 16. Project structure & how to run

```
/spike
  /extension      # MV3 + TS (Vite)
  /backend        # Node/TS (Fastify) + openai SDK
  /runs           # gitignored pipeline output
  .env            # OPENAI_API_KEY=... ; model ids ; PORT
  README.md
```
**Run:**
1. `cd backend && npm i && npm run dev` → backend on `localhost:<PORT>`.
2. `cd extension && npm i && npm run build` → load unpacked at `chrome://extensions`; set backend URL in the popup.
3. Open a test app → **Start** → narrate workflows (press the marker between workflows) → **Stop** → bundle auto-uploads → open the rendered KB.

---

## 17. Config & secrets

- `.env` (backend only): `OPENAI_API_KEY`, transcription + synthesis model ids, `PORT`.
- The **API key never ships in the extension**; the extension only knows the backend's localhost URL.
- `.gitignore`: `.env`, `runs/`, `node_modules/`.

---

## 18. Build sequence (milestones)

- **B1 — Backend skeleton:** `POST /sessions` persist + storage layout + static serve.
- **B2 — Synthesis pipeline (Risk A):** transcribe → segment → synthesize → render, iterated on **one captured bundle**. This is where most quality tuning happens.
- **B3 — Extension capture (Risk B):** events + DOM + screenshots + post-action + audio → buffer → upload.
- **B4 — End-to-end:** real apps, record → render; tune prompts; apply the kill/go bar.

> Build order rationale: **backend pipeline first** so we can iterate synthesis on a single captured bundle (Risk A) before polishing capture (Risk B) — automated throughout, no manual authoring.

---

> _Part A = why/what (discovery). Part B = how (build). Remaining `_TBD_`: the 2–3 test apps and the exact OpenAI model ids to pin in `.env`._

---

## Outcome & findings (2026-06-18)

**Verdict: GO.** The spike was built and run on a real third-party SaaS (Chatful AI — a narrated "create + test an AI chatbot" session). The core hypothesis — *record once → accurate structured KB* — holds.

### Risk A — synthesis quality: VALIDATED
- Narration transcribed cleanly (whisper-1, segment timestamps reliable).
- One session auto-segmented into 2 correct workflows ("Create a New AI Chatbot Project", "Build & Test the AI Chatbot").
- Generated articles were accurate and well-structured: imperative instructions, rationale (from narration), real selectors + routes (from events), and expected outcomes. `gpt-4o` Structured Outputs reliably produced the Article/Step schema; the grounding guardrail held (no invented steps).
- Notable: articles were good **even before screenshots worked** — narration ("why") + events ("what") carried the quality. Validates the narration-driven thesis.

### Risk B — capture fidelity: VALIDATED (after two fixes)
- Events + DOM + audio captured correctly on a real React SPA.
- **Bug 1:** `captureVisibleTab` returned 0 screenshots → fixed by adding the **`activeTab`** permission (now ~29 shots/session).
- **Bug 2:** screenshots uploaded but didn't display — multipart **strips directories from filenames**, so `shots/<id>.png` saved flat as `<id>.png` while the HTML pointed to `bundle/shots/`. Fixed by sending each file's relative path as the form **field name** (server reads `part.fieldname`).
- End-to-end now works: capture → transcribe → segment → synthesize → render with inline screenshots.

### Other learnings / fixes made
- `dotenv` must load `.env` by absolute path (`spike/.env`), not from cwd.
- Mic permission must be requested from a real tab (`permission.html`), not the popup (the prompt closes the popup).
- Added `npm run reprocess <id>` to re-run synthesis on a stored bundle (the "iterate on Risk A" loop).

### Carry forward into Phase 1 (port + harden)
- The **extension capture engine**, the **capture contract/types**, and the **synthesis pipeline + prompts**.

### Known limitations to address in Phase 1 (not blockers for GO)
- Single tab only; capture stops on a **full** page navigation (SPA history nav is fine).
- Buffer is in-memory + a keep-alive port (IndexedDB resilience was simplified).
- Redaction is minimal (password fields only).
- No screenshot cropping/highlighting yet (full-frame shots).
- `captureVisibleTab` rate limit (~2/s) → shots spaced ~700ms.
