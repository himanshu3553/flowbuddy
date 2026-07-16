import OpenAI from 'openai';
import type { SessionManifest, CapturedEvent } from '@flowbuddy/shared';
import { transcribe, type Transcript } from './transcribe';
import { alignNarration } from './align';
import { segment } from './segment';
import { redactTranscript } from './redact';
import { cleanEvents } from './clean';
import { distillSteps, type DistilledStep } from './distill';
import { createLogger } from '@flowbuddy/logger';
import type { ArtifactReader } from './types';

const log = createLogger('synthesis');

export type { ArtifactReader } from './types';
export type { Transcript } from './transcribe';
export type { Segment } from './segment';
export { answerFromKB } from './copilot';
export type { CopilotKBItem, CopilotTurn, CopilotCitation, CopilotAnswer } from './copilot';
export type { SenseContext, SenseHypothesisContext, AnswerPosition } from './copilot'; // P2 Sense
// P2-M5 Reason — the diagnostic engine (structured page state + expected-vs-actual, agentic read-tools).
export { diagnoseFromKB } from './reason';
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
export { embedTexts, toVectorLiteral, DEFAULT_EMBED_MODEL, EMBEDDING_DIMS } from './embeddings'; // P1-M3
export type { EmbedOpts } from './embeddings';
export { redactText } from './redact'; // P1-M12 Cut 1 — PII scrub for KB text
export { cleanEvents, isLikelyInteractiveTarget } from './clean'; // KB step distillation B — see docs/kb-step-distillation.md
export { distillSteps, distilledStepText } from './distill'; // KB step distillation A
export type { DistilledStep, DistilledStepLLM } from './distill';
// Note: buildWorkflowKB + WorkflowKB/DistilledWorkflow/BuildWorkflowKBInput are declared+exported below (live copilot path).

// ---------- Module 2 (LIVE copilot path): capture → distilled workflow KB ----------
// docs/kb-step-distillation.md. This is what the worker runs: transcribe → align → clean (B) →
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
}

export interface WorkflowKB {
  transcript: Transcript;
  workflows: DistilledWorkflow[];
  /** Non-fatal build degradation (e.g. narration failed to transcribe) — the worker surfaces it
   *  on the source while the recording still lands `ready`. Null = clean build. */
  warning: string | null;
}

/** Build the copilot KB for one recording: a persistable transcript + clean steps grouped by workflow.
 *  Raw events are NOT returned/persisted — only the distilled steps (each with one curated screenshot). */
export async function buildWorkflowKB(input: BuildWorkflowKBInput): Promise<WorkflowKB> {
  const openai = new OpenAI({ apiKey: input.apiKey });

  // 1. Transcribe (PII-scrubbed) + align narration to the RAW events (alignment needs raw timestamps).
  // A transcription failure (Whisper's 25 MB cap on long recordings, a transient API error) must
  // NOT kill the job and discard perfectly good event capture — the whole pipeline works
  // transcript-less (narration just isn't attributed), so degrade and surface a warning instead.
  let transcript: Transcript = { text: '', segments: [] };
  let warning: string | null = null;
  try {
    transcript = redactTranscript(
      await transcribe(openai, input.transcribeModel, input.manifest, input.getArtifact),
    );
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    warning = `Narration could not be transcribed (${msg}) — steps were built from the captured actions without voice-over context.`;
    log.warn({ component: 'transcribe', err: msg }, 'degraded to transcript-less build');
  }
  const narration = alignNarration(input.manifest.events, transcript);

  // 2. Deterministic cleanup (B) — collapse mechanical dupes / redundant events.
  const cleaned = cleanEvents(input.manifest.events);
  if (cleaned.length === 0) return { transcript, workflows: [], warning };

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
    // Drop-guard: a workflow shedding most of its events usually means a mis-scoped segment
    // (the distiller pruned a whole off-title sub-task). Surface it rather than let it pass silently.
    if (segEvents.length >= 10 && steps.length < segEvents.length * 0.3) {
      log.warn(
        { component: 'distill', title: seg.title, kept: steps.length, events: segEvents.length },
        'workflow kept few events as steps — possible mis-scoped segment (a sub-task may have been dropped)',
      );
    }
    // Contiguous segmentIndex (0..n) — the approval key; skip-on-empty keeps it dense.
    workflows.push({ segmentIndex: workflows.length, title: seg.title, steps });
  }

  return { transcript, workflows, warning };
}
