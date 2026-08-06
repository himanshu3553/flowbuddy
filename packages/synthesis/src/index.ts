import OpenAI from 'openai';
import type { SessionManifest, CapturedEvent } from '@flowbuddy/shared';
import { transcribe, type Transcript, type TranscriptGap } from './transcribe';
import { alignNarration, transcriptWindow } from './align';
import { segment } from './segment';
import { redactTranscript } from './redact';
import { cleanEvents } from './clean';
import { distillSteps, type DistilledStep } from './distill';
import { describeRecording, describeWorkflow } from './describe';
import { extractProductPages, type ExtractedPage } from './pages';
import { createLogger } from '@flowbuddy/logger';
import type { ArtifactReader } from './types';

const log = createLogger('synthesis');

export type { ArtifactReader } from './types';
export type { Transcript } from './transcribe';
export type { Segment } from './segment';
export type { CopilotKBItem, CopilotTurn, CopilotCitation, CopilotAnswer } from './copilot';
export type { SenseContext, SenseHypothesisContext, AnswerPosition } from './copilot'; // P2 Sense
// P2-M5 Reason — the diagnostic engine (structured page state + expected-vs-actual, agentic read-tools).
// `blockerList` is public so the fixture harness can assert the answer against THE SAME exhaustive
// list the prompt was given, rather than a reimplementation of it that would drift the moment the
// element vocabulary changed. See the preview branch of the answer route.
export { diagnoseFromKB, blockerList } from './reason';
// Copilot mode — the agent loop over KB-reading tools, and the FLOOR beneath it (the same prompt,
// one round, nothing bound) that answers when the loop fails. `answerFromKB` — the retired AI
// Chatbot engine, with its own second prompt and its own item renderer — was deleted into these two.
export { answerAsAgent, answerAsFloor } from './agent';
export type { AgentInput, AgentWorkflow } from './agent';
// What a loop DID, for the caller to log — the same record the loop de-duplicates tool calls with.
export type { AnswerLoopResult, ToolCallRecord, TokenUsage } from './engine';
export type {
  ReasonInput,
  ReasonSnapshot,
  ReasonSnapshotElement,
  ReasonWorkflow,
  ExpectedStepEvidence,
} from './reason';
// P1-M5/M6 — the SINGLE retrieval + approved-KB enforcement seam (api answer route + Studio
// preview both call it; the P1-M3 hybrid keyword+vector upgrade lives here). See retrieval.ts.
export { retrieveApprovedKBItems, shortlistItems, sanitizeHistory } from './retrieval';
export type { RetrievalDb, RetrievableKBItem, ShortlistOpts, RetrieveOpts } from './retrieval';
export {
  findWorkflowOverlaps,
  matchWorkflowIdentities,
  meanVector,
  canonicalPair,
  workflowKey,
  SIMILARITY_THRESHOLD,
  LAST_STEP_THRESHOLD,
} from './overlap'; // P3-M0 / P3-M1
export type {
  OverlapDb,
  OverlapPair,
  WorkflowRef,
  FindOverlapsOpts,
  WorkflowFingerprint,
} from './overlap';
export { embedTexts, toVectorLiteral, DEFAULT_EMBED_MODEL, EMBEDDING_DIMS } from './embeddings'; // P1-M3
export type { EmbedOpts } from './embeddings';
export { redactText } from './redact'; // P1-M12 Cut 1 — PII scrub for KB text
export {
  attachOutcomeMarkers,
  compileExecutionPlan,
  hashSteps,
  markerSnapshotRefs,
  planSummary,
  SNAPSHOT_MAX_CHARS,
} from './execution-plan'; // P4-M1/M2 — the acting substrate + outcome markers
export type { ExecutionStep, ExecutionStepSource, EligibilityIssue, CompiledExecutionPlan } from './execution-plan';
export { cleanEvents, isLikelyInteractiveTarget } from './clean'; // KB step distillation B — see docs/build/kb-step-distillation.md
// The two pure stages either side of segmentation. Exported so a harness can replay the pipeline
// in memory over a stored recording without re-transcribing or writing anything —
// `scripts/segmentation-drift.ts` is the reason these are public.
export { alignNarration } from './align';
export { segment } from './segment';
export { distillSteps, distilledStepText } from './distill'; // KB step distillation A
export { describeWorkflow } from './describe'; // P3-M1 — the workflow's PLAN in prose
export { describeRecording } from './describe'; // AIL slice 1 — what the RECORDING covers
// AIL slice 2 — product knowledge pages: extraction, quote-anchoring, identity matching.
export {
  extractProductPages,
  validateExtractedPages,
  matchPageIdentities,
  pageEmbedText,
  pageSimilarity,
  PAGE_MATCH_THRESHOLD,
  PAGE_CONTENT_AGREE_THRESHOLD,
} from './pages';
export type { ExtractedPage, PageFingerprint } from './pages';
export type { DistilledStep, DistilledStepLLM } from './distill';
// Note: buildWorkflowKB + WorkflowKB/DistilledWorkflow/BuildWorkflowKBInput are declared+exported below (live copilot path).

// ---------- Module 2 (LIVE copilot path): capture → distilled workflow KB ----------
// docs/build/kb-step-distillation.md. This is what the worker runs: transcribe → align → clean (B) →
// segment → distill (A). (The legacy raw 1:1 `buildKB`/`segmentItems` path it superseded was
// removed 2026-07-07 with the Phase-2 article-engine sweep — docs/phase-2-portal.md §7.)

export interface BuildWorkflowKBInput {
  manifest: SessionManifest;
  getArtifact: ArtifactReader;
  apiKey: string;
  transcribeModel: string;
  synthModel: string;
}

/** One workflow: a positional index (the approval key), a goal title, and its clean distilled steps. */
export interface DistilledWorkflow {
  segmentIndex: number;
  title: string;
  steps: DistilledStep[];
  /** P3-M1 — the workflow's PLAN in prose (what is optional, what is a choice). `null` when the
   *  narration revealed nothing beyond the steps, or the call failed — both leave today's behaviour. */
  description: string | null;
}

export interface WorkflowKB {
  transcript: Transcript;
  workflows: DistilledWorkflow[];
  /** Non-fatal build degradation (e.g. narration failed to transcribe) — the worker surfaces it
   *  on the source while the recording still lands `ready`. Null = clean build. */
  warning: string | null;
  /** AIL slice 1 — what the RECORDING covers, incl. narration content that isn't a workflow
   *  (pricing, concepts). Founder-facing. Best-effort: null when narration adds nothing. */
  recordingDescription: string | null;
  /** AIL slice 2 — product-knowledge pages extracted from the narration, quote-anchored and
   *  validated. `[]` when the narration explains nothing (legal and common) or the call failed.
   *  The WORKER owns what happens to them (identity match → merge/pending/create — pages.ts). */
  pages: ExtractedPage[];
}

/**
 * What the founder is told when a recording produced no narration.
 *
 * Each says the same two things — what is missing, and what it COST — because the cost is the part
 * they cannot see for themselves: a steps-only recording looks complete in Studio, and the absence
 * only shows up later as a copilot that answers thinly. Then they differ on the remedy, which is the
 * whole reason the three causes are kept apart upstream.
 *
 * Rendered verbatim by Studio's existing "Processed with a warning" banner — no formatting, so these
 * are written as finished sentences.
 */
const TRANSCRIPT_GAP_WARNING: Record<TranscriptGap, string> = {
  'no-audio':
    'No narration was captured — this recording has no audio at all. Steps were built from your actions alone, so it produced no workflow descriptions and no product knowledge. Re-record with the microphone granted to get them.',
  'audio-missing':
    'The narration audio never reached us, so it could not be transcribed. Steps were built from your actions alone — no workflow descriptions and no product knowledge were produced. The recording itself is fine; re-processing it will not help, so re-record if you need the narration.',
  silent:
    'The narration audio contained no speech. Steps were built from your actions alone, so this recording produced no workflow descriptions and no product knowledge. Re-record saying what each task is for, and what is optional, to get them.',
};

/** Build the copilot KB for one recording: a persistable transcript + clean steps grouped by workflow.
 *  Raw events are NOT returned/persisted — only the distilled steps (each with one curated screenshot). */
/**
 * The per-call ceiling for the BUILD path — deliberately far looser than the answer path's.
 *
 * Different failure, different number. Nobody is waiting on a screen here, and a call cut off early
 * does not degrade to a simpler answer — it fails the job and can leave a recording parked at
 * `processing`. Segmentation and distillation also send genuinely large prompts (every cleaned event
 * plus the transcript), so a healthy call here is legitimately slow in a way an answer never is.
 *
 * So this exists ONLY to stop a hung request from parking a recording forever: it must be
 * unreachable by any real call, not a tuning dial. The SDK's default is 600 s × 3 attempts — half an
 * hour per call, and the worker's concurrency is 1, so one hang stalls every recording behind it.
 */
const BUILD_TIMEOUT_MS = 300_000;

export async function buildWorkflowKB(input: BuildWorkflowKBInput): Promise<WorkflowKB> {
  const openai = new OpenAI({ apiKey: input.apiKey, timeout: BUILD_TIMEOUT_MS, maxRetries: 1 });

  // 1. Transcribe (PII-scrubbed) + align narration to the RAW events (alignment needs raw timestamps).
  // A transcription failure (Whisper's 25 MB cap on long recordings, a transient API error) must
  // NOT kill the job and discard perfectly good event capture — the whole pipeline works
  // transcript-less (narration just isn't attributed), so degrade and surface a warning instead.
  let transcript: Transcript = { text: '', segments: [] };
  let warning: string | null = null;
  try {
    const result = await transcribe(openai, input.transcribeModel, input.manifest, input.getArtifact);
    transcript = redactTranscript(result.transcript);
    // A build with no narration used to land `ready` looking healthy, because none of these three
    // throw. Everything downstream of narration is silently absent — descriptions, the recording
    // summary, product pages — so the founder sees a shallow copilot and no reason for it. Naming
    // WHICH failure it was is the point: the remedy differs, and one of the three is not their fault.
    if (result.gap) {
      warning = TRANSCRIPT_GAP_WARNING[result.gap];
      log.warn({ component: 'transcribe', gap: result.gap }, 'no narration — transcript-less build');
    }
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    warning = `Narration could not be transcribed (${msg}) — steps were built from the captured actions without voice-over context.`;
    log.warn({ component: 'transcribe', err: msg }, 'degraded to transcript-less build');
  }
  const narration = alignNarration(input.manifest.events, transcript);

  // 2. Deterministic cleanup (B) — collapse mechanical dupes / redundant events.
  const cleaned = cleanEvents(input.manifest.events);
  if (cleaned.length === 0) {
    return { transcript, workflows: [], warning, recordingDescription: null, pages: [] };
  }

  // 3. Segment the cleaned events into coherent workflows (one task = one workflow).
  const segments = await segment(
    openai,
    input.synthModel,
    cleaned,
    input.manifest.markers ?? [],
    narration,
    transcript.text,
  );
  // Observability: what the segmenter decided (counts must add up — the guard re-adds any omitted event).
  const assigned = segments.reduce((n, s) => n + s.eventIds.length, 0);
  log.info(
    {
      component: 'segment',
      cleanedEvents: cleaned.length,
      workflows: segments.length,
      assigned,
      titles: segments.map((s) => ({ title: s.title, events: s.eventIds.length })),
    },
    'segmented cleaned events into workflows',
  );

  // 4. Distill each workflow into clean, user-facing steps (A).
  const cleanedById = new Map(cleaned.map((e) => [e.id, e]));
  const workflows: DistilledWorkflow[] = [];
  for (const seg of segments) {
    const segEvents = seg.eventIds
      .map((id) => cleanedById.get(id))
      .filter((e): e is CapturedEvent => Boolean(e));
    if (segEvents.length === 0) continue;
    const steps = await distillSteps(openai, input.synthModel, seg.title, segEvents, narration, transcript.text);
    if (steps.length === 0) {
      // distillSteps has a 0-step fallback, so this is unexpected — surface it rather than silently drop.
      log.warn(
        { component: 'distill', title: seg.title, events: segEvents.length },
        'workflow distilled to 0 steps — skipping',
      );
      continue;
    }
    log.info(
      { component: 'distill', title: seg.title, events: segEvents.length, steps: steps.length },
      'distilled workflow',
    );

    // The PLAN, written from the FINAL steps plus THIS workflow's OWN narration — everything said in
    // the run-up to its clicks, never the head of the whole tape (see transcriptWindow). `cleaned` is
    // passed whole because the rule is "which workflow owns the NEXT event", which only the full
    // recording can answer. The `||` is the degrade path, not a nicety: with no segments to window
    // (transcription failed, or Whisper returned text without them) the whole transcript is still the
    // best material there is, and passing it preserves exactly the pre-window behaviour. Best-effort
    // throughout — a workflow without a description behaves as it always has.
    const narrationWindow = transcriptWindow(segEvents, cleaned, transcript);
    const description = await describeWorkflow(
      openai,
      input.synthModel,
      seg.title,
      steps,
      narrationWindow || transcript.text,
    );
    // `windowed: false` is the only signal that a workflow fell back to the whole recording. Worth
    // logging because segmentation is non-deterministic: this cannot be verified by diffing prose
    // across two runs, so the window has to say for itself whether it fired.
    if (description) {
      log.info(
        {
          component: 'describe',
          title: seg.title,
          chars: description.length,
          narrationChars: narrationWindow.length,
          windowed: narrationWindow.length > 0,
        },
        'described workflow',
      );
    } else {
      log.warn(
        {
          component: 'describe',
          title: seg.title,
          narrationChars: narrationWindow.length,
          windowed: narrationWindow.length > 0,
        },
        'no description produced — steps only',
      );
    }
    // Drop-guard: a workflow shedding most of its events usually means a mis-scoped segment
    // (the distiller pruned a whole off-title sub-task). Surface it rather than let it pass silently.
    if (segEvents.length >= 10 && steps.length < segEvents.length * 0.3) {
      log.warn(
        { component: 'distill', title: seg.title, kept: steps.length, events: segEvents.length },
        'workflow kept few events as steps — possible mis-scoped segment (a sub-task may have been dropped)',
      );
    }
    // Contiguous segmentIndex (0..n) — the approval key; skip-on-empty keeps it dense.
    workflows.push({ segmentIndex: workflows.length, title: seg.title, steps, description });
  }

  // The two narration-level reads run together: what the RECORDING covers (slice 1) and the
  // product-knowledge PAGES (slice 2). Both are written after distillation so they name the final
  // workflows; both are best-effort; neither adds latency beyond the slower of the two.
  const titles = workflows.map((w) => w.title);
  const [recordingDescription, pages] = await Promise.all([
    describeRecording(openai, input.synthModel, titles, transcript.text),
    extractProductPages(openai, input.synthModel, titles, transcript.text),
  ]);
  if (recordingDescription) {
    log.info(
      { component: 'describe-recording', chars: recordingDescription.length },
      'described recording',
    );
  } else {
    log.info({ component: 'describe-recording' }, 'no recording description produced');
  }

  return { transcript, workflows, warning, recordingDescription, pages };
}
