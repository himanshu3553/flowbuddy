import { Worker } from 'bullmq';
import { RENDER_QUEUE, SYNTHESIS_QUEUE } from '@flowbuddy/shared';
import type { SessionManifest } from '@flowbuddy/shared';
import { prisma } from '@flowbuddy/db';
import {
  attachOutcomeMarkers,
  buildDemoVideo,
  buildWorkflowKB,
  compileExecutionPlan,
  distilledStepText,
  hashPlan,
  loadMarkerSnapshots,
  markerSnapshotRefs,
  embedTexts,
  matchPageIdentities,
  matchWorkflowIdentities,
  meanVector,
  pageEmbedText,
  pageSimilarity,
  PAGE_CONTENT_AGREE_THRESHOLD,
  toVectorLiteral,
  type ExtractedPage,
  type WorkflowFingerprint,
} from '@flowbuddy/synthesis';
import { createLogger } from '@flowbuddy/logger';
import type { DistilledStep } from '@flowbuddy/synthesis';
import { config } from './config';
import { connection } from './queue';
import { putObject, sessionArtifactReader, sessionKey } from './storage';

const log = createLogger('worker');

/**
 * P3-M1 — fingerprint every workflow currently stored for a recording, from the vectors already on
 * its steps. Must be read BEFORE the worker deletes those steps; afterwards the evidence is gone.
 *
 * A workflow whose steps were never embedded has no fingerprint and so cannot be matched. That is
 * the fail-closed direction on purpose: an unverifiable identity must not silently keep an approval.
 */
async function readWorkflowFingerprints(sourceId: string): Promise<WorkflowFingerprint<string>[]> {
  const rows = await prisma.$queryRaw<Array<{ workflowId: string; vec: string }>>`
    SELECT "workflowId", embedding::text AS vec
    FROM "KnowledgeItem"
    WHERE "sourceId" = ${sourceId} AND embedding IS NOT NULL
    ORDER BY "workflowId", "orderIndex"`;

  const byWorkflow = new Map<string, number[][]>();
  for (const r of rows) {
    let parsed: number[];
    try {
      parsed = JSON.parse(r.vec) as number[];
    } catch {
      continue;
    }
    byWorkflow.set(r.workflowId, [...(byWorkflow.get(r.workflowId) ?? []), parsed]);
  }

  const out: WorkflowFingerprint<string>[] = [];
  for (const [workflowId, vecs] of byWorkflow) {
    const centroid = meanVector(vecs);
    const goal = vecs[vecs.length - 1];
    if (centroid && goal) out.push({ key: workflowId, centroid, goal });
  }
  return out;
}

/** The same fingerprint shape for freshly distilled workflows, keyed by their new segment index. */
function fingerprintsFrom(
  workflows: Array<{ segmentIndex: number; steps: unknown[] }>,
  stepTexts: string[][],
  vectors: number[][],
): WorkflowFingerprint<number>[] {
  const out: WorkflowFingerprint<number>[] = [];
  let cursor = 0;
  workflows.forEach((wf, i) => {
    const count = stepTexts[i]?.length ?? 0;
    const slice = vectors.slice(cursor, cursor + count);
    cursor += count;
    const centroid = meanVector(slice);
    const goal = slice[slice.length - 1];
    if (centroid && goal) out.push({ key: wf.segmentIndex, centroid, goal });
  });
  return out;
}

/** Provenance entries for one source, merged over what a page already carries: this recording's
 *  entries replace its own older ones; other recordings' entries stand. */
function mergeProvenance(
  existing: unknown,
  sourceId: string,
  quotes: string[],
): Array<{ sourceId: string; quote: string }> {
  const kept = (Array.isArray(existing) ? existing : []).filter(
    (e): e is { sourceId: string; quote: string } =>
      !!e &&
      typeof (e as { sourceId?: unknown }).sourceId === 'string' &&
      typeof (e as { quote?: unknown }).quote === 'string' &&
      (e as { sourceId: string }).sourceId !== sourceId,
  );
  return [...kept, ...quotes.map((quote) => ({ sourceId, quote }))];
}

const normalizeTitle = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * AIL slice 2 — reconcile freshly extracted pages with the workspace's stored ones.
 *
 * The lifecycle rules (docs/build/application-intelligence.md, AI-5/AI-6 + the update flow):
 *  - Nothing extracted → stored pages UNTOUCHED. Narration silence is not evidence; only the
 *    founder retires a page.
 *  - Incoming matches a stored page (by embedding; same-type title equality as fallback):
 *      · content agrees → merge provenance; the text stands.
 *      · content differs + page was ever APPROVED → park as a PENDING UPDATE (with its embedding,
 *        so accepting keeps vector and text in step). Never a silent change.
 *      · content differs + never approved → overwrite the draft in place.
 *  - No match → a new page, born unapproved.
 *
 * Embedding failure aborts the whole pass (unverifiable identity — the workflow-identity rule one
 * level up) but never the job: pages are additive, the recording still lands ready.
 */
async function syncProductPages(
  workspaceId: string,
  sourceId: string,
  pages: ExtractedPage[],
): Promise<void> {
  if (pages.length === 0) {
    log.info({ sourceId, component: 'pages' }, 'no product pages extracted — stored pages untouched');
    return;
  }

  let vectors: number[][];
  try {
    vectors = await embedTexts(
      pages.map((p) => pageEmbedText(p.title, p.content)),
      { apiKey: config.openaiApiKey, model: config.embedModel || undefined, timeoutMs: 60_000, maxRetries: 2 },
    );
  } catch (e) {
    log.warn(
      { sourceId, component: 'pages', err: e instanceof Error ? e.message : String(e) },
      'page embedding failed — page pass skipped (identity unverifiable), stored pages untouched',
    );
    return;
  }

  const existing = await prisma.$queryRaw<
    Array<{
      id: string;
      type: string;
      title: string;
      approvedAt: Date | null;
      provenance: unknown;
      vec: string | null;
    }>
  >`SELECT id, type, title, "approvedAt", provenance, embedding::text AS vec
    FROM "ProductPage" WHERE "workspaceId" = ${workspaceId}`;

  // Slice 3 — resolve each page's related workflow TITLES to durable workflow ids. Titles were
  // already validated against this recording's workflow list; here they land on rows. When two
  // workflows share a title (a duplicate not yet resolved), prefer the one that is live-approved —
  // the one the copilot can actually open.
  const workspaceWorkflows = await prisma.workflow.findMany({
    where: { workspaceId },
    select: { id: true, title: true, approval: { select: { inactiveReason: true } } },
  });
  const workflowByTitle = new Map<string, { id: string; title: string }>();
  for (const wf of workspaceWorkflows) {
    if (!wf.title) continue;
    const key = normalizeTitle(wf.title);
    const isLive = wf.approval !== null && wf.approval.inactiveReason === null;
    if (!workflowByTitle.has(key) || isLive) workflowByTitle.set(key, { id: wf.id, title: wf.title });
  }
  const linksFor = (p: ExtractedPage): Array<{ kind: 'workflow'; workflowId: string; title: string }> =>
    p.related
      .map((t) => workflowByTitle.get(normalizeTitle(t)))
      .filter((w): w is { id: string; title: string } => Boolean(w))
      .map((w) => ({ kind: 'workflow' as const, workflowId: w.id, title: w.title }));

  const existingVec = new Map<string, number[]>();
  for (const row of existing) {
    if (!row.vec) continue;
    try {
      existingVec.set(row.id, JSON.parse(row.vec) as number[]);
    } catch {
      /* unreadable vector → matched by title fallback only */
    }
  }

  const matched = matchPageIdentities(
    pages.map((p, i) => ({ key: i, vector: vectors[i] ?? [] })),
    existing.filter((e) => existingVec.has(e.id)).map((e) => ({ key: e.id, vector: existingVec.get(e.id)! })),
  );
  // Title fallback for what embeddings didn't claim — catches a page whose vector is missing and
  // the same concept re-titled identically but re-explained from scratch.
  const claimed = new Set(matched.values());
  for (let i = 0; i < pages.length; i++) {
    if (matched.has(i)) continue;
    const p = pages[i]!;
    const hit = existing.find(
      (e) => !claimed.has(e.id) && e.type === p.type && normalizeTitle(e.title) === normalizeTitle(p.title),
    );
    if (hit) {
      matched.set(i, hit.id);
      claimed.add(hit.id);
    }
  }

  let created = 0;
  let refreshed = 0;
  let parked = 0;
  let overwritten = 0;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]!;
    const vector = vectors[i];
    const existingId = matched.get(i);
    if (!existingId) {
      // Genuinely new — born unapproved (AI-5).
      const row = await prisma.productPage.create({
        data: {
          workspaceId,
          type: p.type,
          title: p.title,
          content: p.content,
          provenance: p.quotes.map((quote) => ({ sourceId, quote })),
          links: linksFor(p),
        },
        select: { id: true },
      });
      if (vector) {
        await prisma.$executeRaw`UPDATE "ProductPage" SET embedding = ${toVectorLiteral(vector)}::vector WHERE id = ${row.id}`;
      }
      created += 1;
      continue;
    }

    const page = existing.find((e) => e.id === existingId)!;
    const storedVector = existingVec.get(existingId);
    const agrees =
      vector && storedVector ? pageSimilarity(vector, storedVector) >= PAGE_CONTENT_AGREE_THRESHOLD : false;
    const provenance = mergeProvenance(page.provenance, sourceId, p.quotes);

    // Links are structural, not prose — they refresh on every sync regardless of the pending flow
    // (see the schema comment for why that is safe by construction).
    if (agrees) {
      await prisma.productPage.update({
        where: { id: existingId },
        data: { provenance, links: linksFor(p) },
      });
      refreshed += 1;
    } else if (page.approvedAt) {
      // The founder vouched for the current text — the new derivation waits for them.
      await prisma.productPage.update({
        where: { id: existingId },
        data: {
          pendingContent: p.content,
          pendingProvenance: provenance,
          pendingAt: new Date(),
          links: linksFor(p),
        },
      });
      if (vector) {
        await prisma.$executeRaw`UPDATE "ProductPage" SET "pendingEmbedding" = ${toVectorLiteral(vector)}::vector WHERE id = ${existingId}`;
      }
      parked += 1;
    } else {
      // An unapproved draft nobody vouched for — the fresher derivation replaces it.
      // (pendingProvenance is Json?: Prisma updates can't take a bare null, so the raw SQL below
      // clears it alongside the vector columns.)
      await prisma.productPage.update({
        where: { id: existingId },
        data: { content: p.content, provenance, links: linksFor(p), pendingContent: null, pendingAt: null },
      });
      await prisma.$executeRaw`UPDATE "ProductPage" SET embedding = ${vector ? toVectorLiteral(vector) : null}::vector, "pendingEmbedding" = NULL, "pendingProvenance" = NULL WHERE id = ${existingId}`;
      overwritten += 1;
    }
  }

  log.info(
    { sourceId, component: 'pages', extracted: pages.length, created, refreshed, parked, overwritten },
    'product pages synced',
  );
}

const worker = new Worker(
  SYNTHESIS_QUEUE,
  async (job) => {
    const sessionId = job.data.sessionId as string;
    log.info({ sessionId, jobId: job.id }, 'processing session');

    const rec = await prisma.knowledgeSource.findUnique({ where: { id: sessionId } });
    if (!rec) {
      log.warn({ sessionId }, 'source not found — skipping');
      return;
    }
    // The row now exists from the first uploaded artifact, so it can legitimately be reached before
    // the recording was ever stopped and finalized. Nothing to synthesize until the manifest lands.
    if (!rec.manifest) {
      log.warn({ sessionId, status: rec.status }, 'no manifest yet — recording not finalized, skipping');
      return;
    }
    await prisma.knowledgeSource.update({ where: { id: sessionId }, data: { status: 'processing' } });

    try {
      const manifest = rec.manifest as unknown as SessionManifest;
      const getArtifact = sessionArtifactReader(rec.workspaceId, sessionId);

      // ── Module 2 (LIVE copilot path): capture → distilled workflow KB ──
      // transcribe → align → clean (B) → segment → distill (A). Persists clean steps grouped by
      // workflow (segmentIndex/segmentTitle); raw events are NOT stored. See docs/build/kb-step-distillation.md.
      const { transcript, workflows, warning, recordingDescription, pages } = await buildWorkflowKB({
        manifest,
        getArtifact,
        apiKey: config.openaiApiKey,
        transcribeModel: config.transcribeModel,
        synthModel: config.synthModel,
      });

      // `description` is overwritten (null included) like the per-workflow descriptions: on a
      // reprocess a stale coverage line about content that changed is worse than none.
      await prisma.knowledgeSource.update({
        where: { id: sessionId },
        data: { transcript: transcript as object, description: recordingDescription },
      });

      // ── P3-M1: which of these workflows ARE the ones already here? ──────────────────────────────
      // Fingerprint what is stored RIGHT NOW, before the delete below destroys it. Identity is then
      // decided by comparing content — never by position, which is what used to walk a founder's
      // approval onto a workflow nobody had reviewed.
      const existingFingerprints = await readWorkflowFingerprints(sessionId);
      const existingWorkflowIds = (
        await prisma.workflow.findMany({ where: { sourceId: sessionId }, select: { id: true } })
      ).map((w) => w.id);

      // Embed the incoming steps BEFORE writing them: the same vectors decide identity and serve
      // hybrid retrieval, so one call does both jobs instead of two.
      const stepTexts = workflows.map((wf) => wf.steps.map((step) => distilledStepText(step)));
      const flatTexts = stepTexts.flat();
      let embedWarning: string | null = null;
      let vectors: number[][] | null = null;
      if (flatTexts.length > 0) {
        try {
          vectors = await embedTexts(flatTexts, {
            apiKey: config.openaiApiKey,
            model: config.embedModel || undefined,
            timeoutMs: 60_000, // batch path: generous but bounded (the SDK default is 600s)
            maxRetries: 2,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // On a REPROCESS this is fatal, deliberately. Without vectors we cannot tell which
          // workflow is which, and both alternatives are worse: guessing by position is the bug
          // this stage exists to kill, and detaching everything would unapprove a whole KB over a
          // transient API blip. Throwing here leaves the existing KB and every approval untouched —
          // nothing has been deleted yet.
          if (existingWorkflowIds.length > 0) {
            throw new Error(`cannot verify workflow identity — embedding failed: ${msg}`);
          }
          // A FIRST process has no identity to protect, so it degrades to keyword-only as before.
          embedWarning = `Semantic search is unavailable for this recording (embedding failed: ${msg}) — answers use keyword matching until it is re-processed.`;
          log.warn({ sessionId, err: msg }, 'embedding failed — items stay keyword-only');
        }
      }

      const matched = vectors
        ? matchWorkflowIdentities(fingerprintsFrom(workflows, stepTexts, vectors), existingFingerprints)
        : new Map<number, string>();

      // ONE transaction around everything that rewrites the stored KB. The identity evidence lives
      // in the old items' embeddings — the very rows deleted below — so a death between that delete
      // and the last vector write (OOM, the shutdown failsafe, a thrown write) must roll back to
      // the pre-write state. Without this, the BullMQ retry reads zero fingerprints, matches
      // nothing, and suspends every approval in the workspace: the exact blast radius the fatal
      // embedding rule above exists to prevent, reached through a side door. All model/embedding
      // calls already happened; this wraps only DB writes, so the 30s budget is generous.
      const identified = await prisma.$transaction(
        async (tx) => {
          // Detach every existing workflow first so positions are free: a re-split can swap two
          // workflows' indices, and updating them one at a time would collide on the unique key.
          await tx.workflow.updateMany({
            where: { sourceId: sessionId },
            data: { segmentIndex: null },
          });

          const kept: Array<{ workflowId: string; wf: (typeof workflows)[number] }> = [];
          for (const wf of workflows) {
            const existingId = matched.get(wf.segmentIndex);
            if (existingId) {
              await tx.workflow.update({
                where: { id: existingId },
                data: { segmentIndex: wf.segmentIndex, title: wf.title, description: wf.description },
              });
              kept.push({ workflowId: existingId, wf });
            } else {
              // Nothing here matched it, so it is genuinely new — and born unapproved.
              const created = await tx.workflow.create({
                data: {
                  workspaceId: rec.workspaceId,
                  sourceId: sessionId,
                  segmentIndex: wf.segmentIndex,
                  title: wf.title,
                  description: wf.description,
                },
                select: { id: true },
              });
              kept.push({ workflowId: created.id, wf });
            }
          }

          // A workflow that nothing matched has lost its content. Its approval was granted for
          // something that is no longer there, so it stops answering until a human looks at it.
          const keptIds = new Set(kept.map((x) => x.workflowId));
          const detachedIds = existingWorkflowIds.filter((id) => !keptIds.has(id));
          if (detachedIds.length > 0) {
            const { count } = await tx.copilotApproval.updateMany({
              where: { workflowId: { in: detachedIds }, inactiveReason: null },
              data: { inactiveReason: 'needs_review', inactiveAt: new Date() },
            });
            log.warn(
              { sessionId, detached: detachedIds.length, approvalsSuspended: count },
              'workflows no longer present after reprocess — their approvals need re-review',
            );
          }

          // Replace the recording's KB items idempotently with the freshly distilled steps.
          await tx.knowledgeItem.deleteMany({ where: { sourceId: sessionId } });
          const rows = kept.flatMap(({ workflowId, wf }) =>
            wf.steps.map((step, i) => ({
              sourceId: sessionId,
              workspaceId: rec.workspaceId,
              workflowId,
              kind: 'step',
              orderIndex: i, // order WITHIN the workflow (retrieval sorts by segmentIndex, then orderIndex)
              text: distilledStepText(step), // searchable: instruction + detail + narration
              segmentIndex: wf.segmentIndex,
              segmentTitle: wf.title,
              data: step as object,
            })),
          );
          if (rows.length > 0) await tx.knowledgeItem.createMany({ data: rows });

          // P1-M3 — persist the vectors computed above. Raw SQL: Prisma cannot write
          // Unsupported("vector"), and a handful of rows makes per-row updates fine.
          if (vectors && rows.length > 0) {
            const created = await tx.knowledgeItem.findMany({
              where: { sourceId: sessionId },
              select: { id: true, text: true },
            });
            // Matched on TEXT rather than on read-back order. The order rows come back in need not
            // mirror the order the texts were embedded in, and writing a vector onto the wrong step
            // corrupts retrieval invisibly — the failure would look like bad answers, not a bug.
            const vectorByText = new Map<string, number[]>();
            flatTexts.forEach((t, i) => {
              const v = vectors?.[i];
              if (v && !vectorByText.has(t)) vectorByText.set(t, v);
            });
            let written = 0;
            for (const row of created) {
              const vector = vectorByText.get(row.text);
              if (!vector) continue;
              await tx.$executeRaw`UPDATE "KnowledgeItem" SET embedding = ${toVectorLiteral(vector)}::vector WHERE id = ${row.id}`;
              written += 1;
            }
            log.info({ sessionId, count: written }, 'embedded items for hybrid retrieval');
          }

          return kept;
        },
        { maxWait: 10_000, timeout: 30_000 },
      );

      // AIL slice 2 — reconcile the extracted product pages. Best-effort by design: a page-pass
      // failure must never fail a recording whose KB built cleanly (pages are additive knowledge).
      try {
        await syncProductPages(rec.workspaceId, sessionId, pages);
      } catch (e) {
        log.warn(
          { sessionId, component: 'pages', err: e instanceof Error ? e.message : String(e) },
          'product page sync failed — recording proceeds without page updates',
        );
      }

      // ── P4-M1: keep compiled execution plans honest across the reprocess ────────────────────
      // Only workflows the founder enabled acting for are touched. Identity was settled by content
      // above; this asks the SECOND question — is the surviving content still ELIGIBLE to run?
      // Fail-closed like everything else here: a workflow that lost its content, or whose new
      // steps no longer compile clean, drops to `needs_review` and stops being runnable until a
      // human looks. One that recompiles clean gets its plan (and consent-pin hash) refreshed
      // silently — the same contract as the approval itself surviving a content match. A parked
      // (`needs_review`) flag is NEVER silently re-enabled by a clean compile: the founder's gate
      // stands until they flip it, and the enable action recompiles for itself anyway.
      const flagged = await prisma.copilotApproval.findMany({
        where: { workflowId: { in: existingWorkflowIds }, executeState: { not: null } },
        select: { workflowId: true },
      });
      if (flagged.length > 0) {
        const distilledById = new Map(identified.map((x) => [x.workflowId, x.wf]));
        for (const appr of flagged) {
          const wf = distilledById.get(appr.workflowId);
          const srcSteps = wf
            ? wf.steps.map((s) => ({
                instruction: s.instruction,
                route: s.route,
                keyEventId: s.keyEventId,
                screenshotFile: s.screenshotFile,
                evidence: s.evidence,
              }))
            : [];
          const compiled = wf ? compileExecutionPlan({ steps: srcSteps, events: manifest.events }) : null;
          if (compiled?.eligible) {
            // Legacy fallback only: steps whose data carries stored evidence compiled their
            // `expect` above; `attachOutcomeMarkers` leaves those alone and diffs the last +
            // destructive steps for evidence-less rows (same best-effort rule as the enable
            // action: unreadable snapshot ⇒ step compiles bare).
            const snapshots = await loadMarkerSnapshots(
              markerSnapshotRefs(compiled.steps, srcSteps, manifest.events),
              getArtifact,
            );
            const finalSteps = attachOutcomeMarkers(compiled.steps, snapshots);
            const finalHash = hashPlan(finalSteps, compiled.contract);
            await prisma.executionPlan.upsert({
              where: { workflowId: appr.workflowId },
              create: {
                workspaceId: rec.workspaceId,
                workflowId: appr.workflowId,
                planHash: finalHash,
                stepCount: finalSteps.length,
                steps: finalSteps as object,
                contract: compiled.contract as object,
              },
              update: {
                planHash: finalHash,
                stepCount: finalSteps.length,
                steps: finalSteps as object,
                contract: compiled.contract as object,
              },
            });
          } else {
            await prisma.copilotApproval.update({
              where: { workflowId: appr.workflowId },
              data: { executeState: 'needs_review' },
            });
            log.warn(
              {
                sessionId,
                workflowId: appr.workflowId,
                issues: compiled ? compiled.issues.map((i) => i.code) : ['workflow-detached'],
              },
              'workflow no longer eligible to run after reprocess — acting parked for re-review',
            );
          }
        }
      }

      // A degraded-but-successful build (e.g. narration too long to transcribe, or an embedding
      // failure) lands `ready` with the notice in `error` — the Studio shows it as a notice, not
      // a failure.
      const notice = [warning, embedWarning].filter(Boolean).join(' · ') || null;
      await prisma.knowledgeSource.update({
        where: { id: sessionId },
        data: { status: 'ready', error: notice },
      });
      log.info(
        {
          sessionId,
          workflows: workflows.length,
          steps: flatTexts.length,
          segments: transcript.segments.length,
          ...(warning ? { warning } : {}),
        },
        'ready',
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // BullMQ retries this job while attempts remain (attemptsMade is pre-increment inside the
      // processor — see Job.shouldRetryJob). Only the FINAL attempt marks the recording `error`;
      // earlier failures keep it `processing` so the UI doesn't flash Failed→Ready across a retry.
      const willRetry = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
      if (!willRetry) {
        await prisma.knowledgeSource.update({ where: { id: sessionId }, data: { status: 'error', error: msg } });
      }
      log.error(
        { sessionId, jobId: job.id, willRetry, err: msg },
        willRetry ? 'attempt failed (will retry)' : 'failed',
      );
      throw e;
    }
  },
  // Concurrency 1, not 2: in production this worker shares one 512 MB instance with the api that
  // serves the public copilot, and a synthesis job holds whole screenshots in memory for the vision
  // calls. Two at once is the realistic OOM path, and an OOM kills the copilot too. Throughput is
  // not the constraint here — recordings arrive one at a time, from a human pressing Stop.
  { connection, concurrency: 1 },
);

worker.on('ready', () => log.info({ queue: SYNTHESIS_QUEUE }, 'listening on queue'));
worker.on('failed', (job, err) => log.error({ jobId: job?.id, err: err?.message }, 'job failed'));
// An emitted 'error' with no listener throws and can take the process down — on the free tier the
// worker shares a process with the public API (all.ts), so a Redis hiccup must never crash it.
// Throttled like the queue handlers (one line / 30s).
let lastWorkerErrLog = 0;
worker.on('error', (err) => {
  const now = Date.now();
  if (now - lastWorkerErrLog < 30_000) return;
  lastWorkerErrLog = now;
  log.error({ err: err?.message || String(err) }, 'Redis connection error (jobs resume when it recovers)');
});

// ── Demo-video renders (RENDER_QUEUE) ────────────────────────────────────────────────────────────
// The DemoVideo row is the durable request; the job only names it. So a job whose row is gone is
// dropped silently (the founder deleted the workflow, or re-queued — a fresh job carries the rest),
// and all real state transitions happen on the row, mirroring the recording pipeline above.
const renderWorker = new Worker(
  RENDER_QUEUE,
  async (job) => {
    const { workflowId } = job.data as { workflowId: string };
    log.info({ workflowId, jobId: job.id }, 'rendering demo video');

    const video = await prisma.demoVideo.findUnique({
      where: { workflowId },
      include: { workflow: { include: { source: true } } },
    });
    if (!video) {
      log.warn({ workflowId }, 'demo video row not found — skipping');
      return;
    }
    const workflow = video.workflow;
    const manifest = workflow.source.manifest as unknown as SessionManifest | null;
    if (!manifest) {
      await prisma.demoVideo.update({
        where: { id: video.id },
        data: { status: 'error', error: 'Recording manifest missing' },
      });
      return;
    }
    await prisma.demoVideo.update({ where: { id: video.id }, data: { status: 'processing', error: null } });

    try {
      const items = await prisma.knowledgeItem.findMany({
        where: { workflowId, kind: 'step' },
        orderBy: { orderIndex: 'asc' },
        select: { data: true },
      });
      const steps = items.map((i) => i.data as unknown as DistilledStep);
      if (steps.length === 0) throw new Error('Workflow has no steps');

      const { mp4, durationMs, degradedAudio } = await buildDemoVideo({
        apiKey: config.openaiApiKey,
        scriptModel: config.synthModel,
        ttsModel: config.ttsModel,
        ttsVoice: config.ttsVoice,
        title: workflow.title || 'Product demo',
        description: workflow.description,
        steps,
        manifest,
        getArtifact: sessionArtifactReader(workflow.workspaceId, workflow.sourceId),
        log,
        onProgress: (f, total) => {
          if (f % 300 === 0 || f === total) log.info({ workflowId, frames: `${f}/${total}` }, 'render progress');
        },
      });

      // Under the recording's session prefix, so deleting the recording deletes the video too.
      const fileKey = sessionKey(workflow.workspaceId, workflow.sourceId, `video/demo-${workflowId}.mp4`);
      await putObject(fileKey, mp4, 'video/mp4');
      await prisma.demoVideo.update({
        where: { id: video.id },
        data: { status: 'ready', fileKey, durationMs, error: degradedAudio ? 'Some narration fell back to silence' : null },
      });
      log.info({ workflowId, durationMs, bytes: mp4.length, degradedAudio }, 'demo video ready');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Same retry contract as synthesis: only the final attempt writes `error`.
      const willRetry = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
      if (!willRetry) {
        await prisma.demoVideo.update({ where: { id: video.id }, data: { status: 'error', error: msg } });
      }
      log.error({ workflowId, jobId: job.id, willRetry, err: msg }, willRetry ? 'render attempt failed (will retry)' : 'render failed');
      throw e;
    }
  },
  // Concurrency 1 for the same reason as synthesis above — and a render additionally spawns an
  // ffmpeg subprocess whose memory sits OUTSIDE the node heap cap, on the shared 512 MB instance.
  { connection, concurrency: 1 },
);

renderWorker.on('ready', () => log.info({ queue: RENDER_QUEUE }, 'listening on queue'));
renderWorker.on('failed', (job, err) => log.error({ jobId: job?.id, err: err?.message }, 'render job failed'));
let lastRenderErrLog = 0;
renderWorker.on('error', (err) => {
  const now = Date.now();
  if (now - lastRenderErrLog < 30_000) return;
  lastRenderErrLog = now;
  log.error({ err: err?.message || String(err) }, 'Redis connection error (render jobs resume when it recovers)');
});

// Graceful shutdown (§3.4): worker.close() waits for the in-flight job (BullMQ default), so a
// deploy doesn't hard-kill mid-distillation when the job can finish in time. If it can't, the
// unref'd failsafe exits before the host's SIGKILL — the job then recovers via retries (attempts:3)
// or, past those, the Recordings "Stalled → Re-process" surface. Coexists with the API's handler
// in the combined all.ts process (both are `once` listeners; neither exits in the happy path).
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    log.info({ signal }, 'signal received — closing (waiting for any in-flight job)');
    setTimeout(() => process.exit(0), 25_000).unref();
    void Promise.all([worker.close(), renderWorker.close()])
      .then(() => prisma.$disconnect())
      .catch(() => {});
  });
}
