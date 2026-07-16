# Ingestion API — internals

> **Module:** the upload boundary of the Fastify service in
> [`packages/api/`](../../packages/api/). **Role:** the gate between [capture](recorder-capture.md)
> and the [Knowledge Base](knowledge-base.md). It accepts a bundle, stores the artifacts, persists a
> source record, and enqueues the build — then returns immediately. It does **no** AI work.

> The same Fastify process also serves the **copilot** routes; those are a different module, covered
> in [copilot.md](copilot.md). This doc is only the **ingestion** half.

---

## 1. Purpose

Receive a capture bundle over HTTP, durably land the heavy binaries in object storage, validate that
the manifest is well-formed, write one `KnowledgeSource` row that represents the recording, and put a
job on the queue so the worker can process it out of band. The design goal is a **fast, dumb accept**:
everything expensive is deferred to the [worker](knowledge-base.md).

---

## 2. Where it lives

| File | Role |
|---|---|
| [`server.ts`](../../packages/api/src/server.ts) | The Fastify app: CORS, multipart, the `/v1/sessions` routes (+ the copilot routes). |
| [`auth.ts`](../../packages/api/src/auth.ts) | Resolve a Bearer recorder token → workspace (by SHA-256 hash). |
| [`storage.ts`](../../packages/api/src/storage.ts) | The S3-compatible client, bucket bootstrap, key layout, and the `ArtifactReader` the worker uses. |
| [`queue.ts`](../../packages/api/src/queue.ts) | The BullMQ producer (`synthesisQueue`) + the Redis connection options. |
| [`config.ts`](../../packages/api/src/config.ts) | Env config (port, Redis URL, OpenAI key/models, R2/MinIO creds). |

Runs as `pnpm --filter @flowbuddy/api dev` on **`:8787`**.

---

## 3. Inputs / Outputs

- **`POST /v1/sessions`** — *the* ingestion route.
  - **In:** `multipart/form-data` (≤300 MB): a `manifest` field + N artifact files; `Authorization:
    Bearer <recorder token>`.
  - **Out:** `{ sessionId, status: "uploaded" }`. Side effects: artifacts in object storage, a
    `KnowledgeSource` row, a queued job.
- **`GET /v1/sessions/:id`** — status poll for a recording. Returns `{ id, status, error }`, scoped to
  the caller's workspace.
- **`GET /healthz`** — liveness.

---

## 4. Internal mechanics

### 4.1 CORS & multipart setup

A global `onRequest` hook sets permissive CORS (`Access-Control-Allow-Origin: *`, allowed headers
include `Authorization`, `Content-Type`, `X-FlowBuddy-Key`) and short-circuits `OPTIONS` preflights with
`204`. This is required because the caller origin is `chrome-extension://…` (recorder) or a customer's
domain (widget). Multipart is registered with generous limits: `fileSize: 300 MB`, `files: 10000`,
`fieldSize: 100 MB` — a long recording can have thousands of screenshots/DOM files.

### 4.2 The upload pipeline (`/v1/sessions`)

```mermaid
flowchart TD
    A["POST /v1/sessions<br/>Bearer token + multipart"] --> B{authWorkspace?}
    B -- no --> B401["401 invalid/missing token"]
    B -- "yes → {workspaceId, ownerId}" --> C["sessionId = randomUUID()"]
    C --> D["stream each part"]
    D --> E{"part.type == file?"}
    E -- file --> F["putObject(sessionKey(ws, id, relPath))<br/>relPath = field NAME"]
    E -- "field 'manifest'" --> G["JSON.parse → manifestRaw"]
    F --> D
    G --> D
    D --> H["sessionManifestSchema.safeParse(manifestRaw)"]
    H -- invalid --> H400["400 invalid manifest + first 5 zod issues"]
    H -- valid --> I["prisma.knowledgeSource.create<br/>status=uploaded, manifest stored"]
    I --> J["synthesisQueue.add('synthesize', {sessionId, workspaceId})"]
    J --> K["return {sessionId, status:'uploaded'}"]
```

Key mechanics worth understanding:

- **True streaming, no per-file buffering.** Parts are consumed with `for await (const part of
  req.parts())` and each file part is **piped** to object storage (`part.file` → `putObjectStream`,
  an `@aws-sdk/lib-storage` multipart `Upload` behind a byte-counting `Transform`), so no file is
  ever materialized in RAM — this process also serves the public copilot on a 512 MB instance.
  A **500 MB total-bundle cap** (checked between files, per-file `fileSize` limit still applies)
  and a per-file truncation check return `413`; any rejected/failed upload **deletes the session
  prefix** so nothing is orphaned in storage.
- **The field-name-is-the-path trick.** `const rel = part.fieldname || part.filename`. The recorder
  put the relative path (`shots/<id>.jpg`) on the field *name* precisely because multipart strips
  directories from filenames. The server uses it verbatim (after sanitization) as the object key
  suffix. This is the matching half of the recorder's upload step.
- **Validation happens after storage — with cleanup.** Artifacts are written as they stream; the
  manifest is parsed from its field, then validated with the **zod** `sessionManifestSchema`
  ([`schemas.ts`](../../packages/shared/src/schemas.ts)). An invalid manifest returns `400` with the
  first five issues **and deletes the already-streamed artifacts** (`deleteSessionPrefix`) — no
  orphans.
- **The `KnowledgeSource` row is the recording's identity.** It stores the **whole manifest as JSON**
  (`manifest` column), `appBaseUrl`, `status: "uploaded"`, and the owning workspace/user. The worker
  re-reads the manifest from here, not from the upload.
- **Enqueue carries only pointers.** `{ sessionId, workspaceId }` — see [connections.md](connections.md)
  Seam C. The job body is intentionally tiny; the worker rehydrates everything from Postgres + object
  storage.

### 4.3 Authentication (`authWorkspace`)

[`auth.ts`](../../packages/api/src/auth.ts) takes the `Authorization` header, strips `Bearer `,
**SHA-256-hashes** the token, and looks up `ApiToken.hashedToken` (unique), returning
`{ workspaceId, ownerId }`. Two consequences:

- The plaintext token is **never stored** — a DB leak yields only hashes, which can't be replayed.
- The token *is* the workspace scope. Everything the upload creates is keyed to the resolved
  `workspaceId`, so a token can only ever write into its own tenant.

### 4.4 Object storage (`storage.ts`)

One S3-compatible client points at **MinIO in dev** and **Cloudflare R2 in prod** — identical code,
different `R2_ENDPOINT`. `forcePathStyle: true` is set (MinIO requires it, R2 tolerates it).

- `ensureBucket()` runs at boot — `HeadBucket`, and `CreateBucket` if missing.
- `sessionKey(workspaceId, sessionId, rel)` builds
  `workspaces/<ws>/sessions/<id>/<rel>` after **sanitizing** `rel` (backslashes → `/`, `..` segments
  stripped) so a malicious field name can't escape the prefix.
- `sessionArtifactReader(ws, id)` returns an **`ArtifactReader`** — a `(relPath) => Promise<Buffer|null>`
  bound to one session. This is the exact function the [worker](knowledge-base.md) calls to fetch the
  audio (and any screenshot it needs); a miss returns `null` rather than throwing.

### 4.5 The queue producer (`queue.ts`)

A single BullMQ `Queue` named `synthesis` (the `SYNTHESIS_QUEUE` constant shared with the worker via
[`@flowbuddy/shared/jobs`](../../packages/shared/src/jobs.ts)). The Redis **connection options** (host/port/
user/pass, TLS for `rediss:`) are passed — not a pre-built client — so BullMQ can apply the settings
workers need. The producer (API) and consumer ([worker](knowledge-base.md)) share only this queue
name and the `{ sessionId, workspaceId }` shape.

Hardening (2026-07-06, review §2.1–2.3 — mirrored by the Studio producer
[`web/lib/queue.ts`](../../packages/web/lib/queue.ts)):

- **`defaultJobOptions`:** `attempts: 3` with exponential backoff (5 s base) — transient
  OpenAI/storage failures retry instead of permanently failing the recording (the worker is
  idempotent) — and bounded retention (`removeOnComplete: 100`, `removeOnFail: 500`) so finished
  jobs can't fill Redis (25 MB on the free tier).
- **A throttled `on('error')` listener** (one log line / 30 s) — an emitted `'error'` with no
  listener is an unhandled EventEmitter throw that could take down the process serving the public
  copilot.
- **Graceful shutdown:** SIGTERM/SIGINT close the Fastify app, the queue's Redis connection, and
  the Prisma pool, then let the process drain (unref'd failsafe exit); the worker's own handler
  waits for the in-flight job. Safe when both run in one process (`all.ts`).

### 4.6 Status polling (`GET /v1/sessions/:id`)

Re-auths the token, fetches the source **scoped to the caller's workspace** (`findFirst({ id,
workspaceId })`), and returns `{ id, status, error }`. This is how a caller learns when processing
moves `uploaded → processing → ready | error`. Studio shows the same status by reading the row
directly.

---

## 5. Data it reads / writes

| Store | Reads | Writes |
|---|---|---|
| **Postgres** | `ApiToken` (auth), `KnowledgeSource` (status poll) | `KnowledgeSource` (create, `status=uploaded`, full manifest) |
| **Object storage** | — | every uploaded artifact under `workspaces/<ws>/sessions/<id>/...` |
| **Redis** | — | one `synthesis` job per upload |

---

## 6. Failure modes & edge cases

- **Bad/missing token** → `401`, nothing stored or enqueued.
- **Malformed manifest** → `400` with zod issues; **no row, no job**, and the streamed artifacts are
  **cleaned up** (session prefix deleted).
- **Oversized bundle / truncated file** → `413`, artifacts cleaned up, no row/job; the recorder keeps
  its buffer for retry (R2).
- **Object-storage write fails mid-stream** → the request 500s after best-effort cleanup; no row/job,
  so the recorder treats it as a failed upload and keeps its buffer for retry (R2).
- **OpenAI / processing problems** are **not** this module's concern — it returns success the moment
  the row + job exist. Processing failures retry (attempts: 3) and only then surface as
  `status=error` on the source.
- **Crash between row-create and enqueue** (rare) would leave a source stuck in `uploaded`. The
  Recordings UI now surfaces this: >15 min without progress renders as **"Stalled — re-process"**
  (driven by `KnowledgeSource.updatedAt`), and the existing re-process action recovers it.

---

## 7. Connections

- **Accepts from ←** [Recorder](recorder-capture.md) (Seam A).
- **Lands artifacts in →** object storage; **persists** the `KnowledgeSource`; **enqueues** the job
  (Seams B & C in [connections.md](connections.md)).
- **Hands off to →** the [Knowledge Base worker](knowledge-base.md), which consumes the job and reads
  back the manifest + artifacts.
- **Shares its process with →** the [Copilot endpoints](copilot.md) (different routes, same Fastify
  app, same `config`/`storage`).
- **Schema reference →** the row shapes are in [data-model-and-storage.md](data-model-and-storage.md).
