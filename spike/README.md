# Sync — Phase 0 Spike

A throwaway, fully-automated pipeline to answer one question: **does capture → KB generation actually work?**
Record a narrated product session in Chrome → the bundle is sent to a local Node backend → OpenAI transcribes,
segments, and synthesizes it into structured help articles → you eyeball the result in a rendered HTML page.

Spec: [`../docs/SPIKE.md`](../docs/SPIKE.md). Code here is disposable; the **learnings** are the deliverable.

```
extension/   Chrome MV3 recorder (capture: events + DOM + screenshots + post-action + audio)
backend/     Node/TS Fastify service (persist → transcribe → segment → synthesize → render)
runs/        pipeline output, one dir per session (gitignored)
.env         OPENAI_API_KEY + model ids (gitignored; copy from .env.example)
```

## Prerequisites

- Node 20+ and Chrome.
- An OpenAI API key.

## 1. Configure

```bash
cp .env.example .env
# edit .env and set OPENAI_API_KEY
```

`.env` lives in `spike/` and is read by the backend only — **the key never ships in the extension.**

## 2. Run the backend

```bash
cd backend
npm install
npm start        # http://localhost:8787  (npm run dev for autoreload)
```

Check it: `curl http://localhost:8787/health` → `{"ok":true,"model":"gpt-4o"}`.

## 3. Build & load the extension

```bash
cd extension
npm install
npm run build    # outputs dist/
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `spike/extension/dist`.

## 4. Record a session

1. Open the **Sync Spike Recorder** popup → click **Grant microphone** once (needed for narration).
2. Open the web app you want to document in the active tab (a real, logged-in **dummy** account).
3. Popup → **Start**. Narrate as you click through several workflows; press **Mark new workflow** between tasks.
4. **Stop.** The bundle uploads, the backend runs the pipeline, and a new tab opens with the generated KB
   (`http://localhost:8787/runs/<id>/render.html`).

## Output / observability

Each run writes `runs/<id>/`:

```
bundle/        session.json + audio.webm + shots/*.png + dom/*.html   (raw capture)
transcript.json   narration → timestamped text
segments.json     proposed article boundaries
articles.json     synthesized structured articles
render.html       human-eyeball view
status.json       pipeline stage / error
```

When an article looks wrong, these files tell you **which stage** broke (capture vs. segmentation vs. synthesis).

## Config (`.env`)

| Var | Default | Notes |
|---|---|---|
| `OPENAI_API_KEY` | — | required |
| `TRANSCRIBE_MODEL` | `whisper-1` | whisper-1 gives reliable segment timestamps for alignment |
| `SYNTH_MODEL` | `gpt-4o` | vision-capable; used for segmentation + synthesis (Structured Outputs) |
| `PORT` | `8787` | backend port (also used in the render URL) |

## Known spike limitations (intentional)

- No auth / multi-tenancy / Studio / portal — see [`../docs/SPIKE.md`](../docs/SPIKE.md) for the cuts.
- Single tab; same-tab navigations only.
- `captureVisibleTab` is rate-limited (~2/s), so screenshots are spaced ~700ms apart; very rapid clicks may miss a shot.
- Recording buffers in the background service worker (kept alive by a long-lived port). Closing the tab mid-record loses the session.
- Microphone: if the prompt doesn't appear, grant it via the popup's **Grant microphone** button first.
- Cross-origin iframes and canvas-heavy apps are not reliably captured (a known thing the spike is meant to surface).
