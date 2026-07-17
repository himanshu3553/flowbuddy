# FlowBuddy — Phase 1 Modules Map (visual)

> **The end-to-end picture of the Phase 1 system.** Capture raw signal → turn it into a Knowledge Base → gate it with approval → answer customers from it. Everything connects through **one cumulative KB per workspace**. For the canonical 3-module model see [`architecture.md`](architecture.md); for the per-module build/as-built record see [`phase-1-copilot.md`](phase-1-copilot.md).

There are **two halves joined by the KB**:

1. **Builder side** (record → process → approve) — asynchronous (BullMQ): `extension → api ingestion → worker + synthesis → KB → approval`.
2. **Customer side** (ask → answer) — synchronous: `widget → copilot API → answerFromKB → approved-KB`.

The **approval gate** is the seam between them — a customer can only ever get answers from knowledge the founder explicitly approved (the **no-leak** guarantee). `synthesis` is the shared brain: the *same* package builds the KB on the way in and grounds the answers on the way out.

---

## End-to-end flow

> The boxes below are an **overview** — each one's full detail (key files, responsibilities, P1-M number) is in the [package map](#how-the-pieces-map-to-packages) and [cross-reference](#module--p1-m-number-cross-reference) tables further down.

```mermaid
%%{ init: { "flowchart": { "htmlLabels": true, "useMaxWidth": true, "nodeSpacing": 45, "rankSpacing": 55 } } }%%
flowchart TB
    subgraph BUILDER["🛠️ BUILDER SIDE — record &amp; curate (async · BullMQ)"]
        direction TB

        EXT["<b>M1 · CAPTURE</b><br/>extension (Chrome MV3)<br/>events + DOM + screenshots + narration<br/>client-side PII mask · reliable upload"]

        ING["<b>INGESTION API</b><br/>api · server.ts<br/>store artifacts → S3/R2<br/>write KnowledgeSource · enqueue job"]

        WORKER["<b>M2 · KNOWLEDGE BASE worker</b><br/>api · worker.ts + synthesis<br/>transcribe → align → clean events<br/>segment → distill into clean steps · server PII scrub<br/>status: uploaded → processing → ready"]

        KB[("<b>THE KNOWLEDGE BASE</b> · Postgres<br/>one cumulative KB per workspace<br/>KnowledgeSource + distilled-step KnowledgeItem[]<br/>· segmentIndex · segmentTitle")]

        APPROVAL{{"<b>TRUST GATE — Approval (P1-M5)</b><br/>CopilotApproval (sourceId, segmentIndex)<br/>⇒ defines the approved-KB"}}

        EXT -- "raw session bundle" --> ING
        ING -- "async job" --> WORKER
        WORKER --> KB
        KB --> APPROVAL
    end

    subgraph CUSTOMER["💬 CUSTOMER SIDE — ask &amp; answer (sync)"]
        direction TB

        WIDGET["<b>WIDGET ⭐</b><br/>widget · flowbuddy-copilot.js<br/>one &lt;script&gt; · shadow-DOM chat<br/>sends page route · 👍/👎 feedback"]

        COPILOTAPI["<b>COPILOT API</b><br/>api · copilot.ts + copilot-auth.ts<br/>/answer · /feedback<br/>embed key · origin allowlist · rate limit"]

        ENGINE["<b>RETRIEVAL &amp; GROUNDING (P1-M3/M6)</b><br/>synthesis · answerFromKB()<br/>retrieve approved-KB → grounded answer + cites<br/>low confidence → honest DECLINE"]

        WIDGET -- "question + route + key" --> COPILOTAPI
        COPILOTAPI --> ENGINE
        ENGINE -- "answer + citations / decline" --> COPILOTAPI
        COPILOTAPI --> WIDGET
    end

    APPROVAL -- "no-leak: retrieval filters<br/>to APPROVED items only" --> ENGINE

    STUDIO["<b>STUDIO — builder console</b><br/>web (Next.js · Tailwind + shadcn · indigo)<br/>Home · Recordings · Knowledge Base · Copilot · Analytics · Settings"]

    STUDIO -. "approve toggle" .-> APPROVAL
    KB -. "browse / status" .-> STUDIO
    ENGINE -. "queries + gaps" .-> STUDIO

    classDef capture fill:#e7f0ff,stroke:#2b6cb0,color:#1a365d;
    classDef kb fill:#e6fffa,stroke:#2c7a7b,color:#234e52;
    classDef gate fill:#fffaf0,stroke:#dd6b20,color:#7b341e;
    classDef customer fill:#faf5ff,stroke:#6b46c1,color:#44337a;
    classDef studio fill:#f7fafc,stroke:#4a5568,color:#1a202c;

    class EXT,ING capture;
    class WORKER,KB kb;
    class APPROVAL gate;
    class WIDGET,COPILOTAPI,ENGINE customer;
    class STUDIO studio;
```

---

## How the pieces map to packages

| Module / role | Package(s) | Key files | Responsible for |
|---|---|---|---|
| **M1 · Capture** | `extension` | `content.ts`, `background.ts`, `offscreen.ts`, `controlbar.ts`, `idb.ts` | Record the session bundle (events + DOM + screenshots + audio), client-side PII mask, on-page control bar, reliable upload |
| **Ingestion** | `api` | `server.ts`, `storage.ts`, `queue.ts` | Receive upload → store artifacts (S3/R2) → write `KnowledgeSource` → enqueue worker job |
| **M2 · Knowledge Base** | `api` (worker) + `synthesis` | `worker.ts`; `index.ts` (`buildWorkflowKB`), `transcribe.ts`, `align.ts`, `clean.ts`, `segment.ts`, `distill.ts`, `embeddings.ts`, `redact.ts` | Transcribe → align → **clean** events → segment into workflows → **distill** clean steps → server PII scrub → embed → `ready` |
| **The KB store** | `db` | `schema.prisma` | One cumulative KB per workspace; `KnowledgeSource` + `KnowledgeItem` + index |
| **Approval gate (P1-M5)** | `api` + `web` | `CopilotApproval`; Studio toggle | Per-workflow "approve for copilot" → defines **approved-KB** (the trust gate) |
| **M3 · Retrieval & grounding (P1-M3/M6)** | `synthesis` | `retrieval.ts` (the single no-leak seam — hybrid keyword∪pgvector RRF) + `embeddings.ts` → `copilot.ts` `answerFromKB()` | Retrieve approved-KB → grounded answer + citations, or honest decline → `CoverageGap` |
| **Copilot API (P1-M6/M8/M9)** | `api` | `copilot.ts`, `copilot-auth.ts` | `/v1/copilot/answer` + `/feedback`; embed key auth, origin allowlist, rate limit, route-bias |
| **Widget (P1-M7/M10)** | `widget` | `index.ts`, `styles.ts` | One `<script>` shadow-DOM chat; renders answers/citations; 👍/👎 feedback |
| **Studio (P1-M10 + console)** | `web` | `app/dashboard/*` | Builder UI: KB browser, approve toggle, embed snippet, activity + coverage gaps |
| **Shared contracts** | `shared` | capture contract + zod schemas | The session-bundle shape every module agrees on |

---

## Module → P1-M number cross-reference

| Build module | Where it lives in this map |
|---|---|
| **P1-M0** Monorepo, infra & auth | the substrate under everything (`api`, `db`, `web`, docker-compose) |
| **P1-M1** Recorder / capture | **M1 · Capture** (extension) |
| **P1-M2** Knowledge Base | **M2 · KB** (worker + synthesis) → the KB store |
| **P1-M3** Retrieval & grounding engine | **Retrieval & grounding engine** (`answerFromKB`) |
| **P1-M4** Cloud deploy | ✅ **deployed** — Render (api + worker + web) + R2; dev at `flowbuddy-dev-web.onrender.com` |
| **P1-M5** Approval gate | **Trust gate — Approval** |
| **P1-M6** Answer endpoint | **Copilot API** `/v1/copilot/answer` |
| **P1-M7** Widget & SDK | **Widget** |
| **P1-M8** Context API | route on the Widget → boost in the engine |
| **P1-M9** Embed auth & tenant scoping | **Copilot API** (`copilot-auth.ts`) |
| **P1-M10** Feedback loop & analytics | Widget 👍/👎 → Copilot API → Studio activity/gaps |
| **P1-M11** Capture reliability | hardening inside **M1 · Capture** |
| **P1-M12** PII redaction | client mask in **M1** + `redactText` server scrub in **M2** |

> **Note:** Module 3 (article creation) and the Help Portal are **Version 2 by-products** — decoupled from this copilot flow. See [`v2-portal.md`](v2-portal.md).
