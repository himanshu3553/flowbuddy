import OpenAI from 'openai';
import type { SessionManifest, CapturedEvent, Marker } from '@sync/shared';
import { transcribe, type Transcript } from './transcribe';
import { alignNarration } from './align';
import { segment, eventLabel, type Segment } from './segment';
import { synthesizeArticles, type SynthArticle } from './synthesize';
import { redactText, redactTranscript } from './redact';
import { cleanEvents } from './clean';
import { distillSteps, type DistilledStep } from './distill';
import type { ArtifactReader } from './types';

export type { ArtifactReader } from './types';
export type { SynthArticle, SynthStep } from './synthesize';
export type { Transcript } from './transcribe';
export type { Segment } from './segment';
export { promptToArticle } from './prompt';
export type { PromptItem, PromptArtifactReader, PromptToArticleResult } from './prompt';
export { answerFromKB } from './copilot';
export type { CopilotKBItem, CopilotTurn, CopilotCitation, CopilotAnswer } from './copilot';
// P1-M5/M6 — the SINGLE retrieval + approved-KB enforcement seam (api answer route + Studio
// preview both call it; pgvector lands here). See retrieval.ts.
export { retrieveApprovedKBItems, shortlistItems, sanitizeHistory } from './retrieval';
export type { RetrievalDb, RetrievableKBItem, ShortlistOpts } from './retrieval';
export { redactText } from './redact'; // P1-M12 Cut 1 — PII scrub for KB text
export { cleanEvents, isLikelyInteractiveTarget } from './clean'; // KB step distillation B — see docs/kb-step-distillation.md
export { distillSteps, distilledStepText } from './distill'; // KB step distillation A
export type { DistilledStep, DistilledStepLLM } from './distill';
// Note: buildWorkflowKB + WorkflowKB/DistilledWorkflow/BuildWorkflowKBInput are declared+exported below (live copilot path).

/** A KB step-item as the synthesis package produces/consumes it (Module 2 ⇄ Module 3). */
export interface KbStepItem {
  orderIndex: number;
  kind: 'step';
  text: string; // searchable content
  event: CapturedEvent; // the captured interaction (ground truth)
  narration: string | null; // aligned narration ("why")
}

/** Split KB items into the parallel `events` + `narration`-by-event-id the synthesis stages expect. */
function eventsAndNarration(items: KbStepItem[]): {
  events: CapturedEvent[];
  narration: Map<string, string>;
} {
  const events = items.map((it) => it.event);
  const narration = new Map<string, string>();
  for (const it of items) if (it.narration) narration.set(it.event.id, it.narration);
  return { events, narration };
}

// ---------- Module 2: capture → KB ----------

export interface BuildKBInput {
  manifest: SessionManifest;
  getArtifact: ArtifactReader;
  apiKey: string;
  transcribeModel: string;
}

export interface BuiltKB {
  transcript: Transcript;
  items: KbStepItem[];
}

/** Extract a workflow capture into KB knowledge: persistable transcript + normalized step items.
 *  P1-M12 (Cut 1): high-confidence PII is scrubbed from everything the copilot later reads —
 *  the transcript (before alignment), each item's searchable text, and the aligned narration. */
export async function buildKB(input: BuildKBInput): Promise<BuiltKB> {
  const openai = new OpenAI({ apiKey: input.apiKey });
  // Scrub the transcript first so the narration spans derived from it are already clean.
  const transcript = redactTranscript(
    await transcribe(openai, input.transcribeModel, input.manifest, input.getArtifact),
  );
  const narration = alignNarration(input.manifest.events, transcript);

  const items: KbStepItem[] = input.manifest.events.map((event, i) => {
    const n = narration.get(event.id) ?? null;
    return {
      orderIndex: i,
      kind: 'step',
      // Redact the final searchable text too — it also carries event labels/values, not just narration.
      text: redactText(`${eventLabel(event)}${n ? ` — ${n}` : ''}`),
      event,
      narration: n ? redactText(n) : null,
    };
  });

  return { transcript, items };
}

// ---------- Module 2 (LIVE copilot path): capture → distilled workflow KB ----------
// docs/kb-step-distillation.md. This is what the worker runs: transcribe → align → clean (B) →
// segment → distill (A). It SUPERSEDES the raw 1:1 `buildKB` + `segmentItems` path for the copilot.
// (buildKB/segmentItems stay for the parked Phase-2 article engine, which still reads raw events.)

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
    console.warn(`[transcribe] degraded to transcript-less build: ${msg}`);
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
  console.log(
    `[segment] ${cleaned.length} cleaned events → ${segments.length} workflow(s) ` +
      `[${assigned} assigned]: ${segments.map((s) => `"${s.title}"(${s.eventIds.length})`).join(', ')}`,
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
      console.warn(`[distill] "${seg.title}": ${segEvents.length} events distilled to 0 steps — skipping`);
      continue;
    }
    console.log(`[distill] workflow "${seg.title}": ${segEvents.length} events → ${steps.length} steps`);
    // Drop-guard: a workflow shedding most of its events usually means a mis-scoped segment
    // (the distiller pruned a whole off-title sub-task). Surface it rather than let it pass silently.
    if (segEvents.length >= 10 && steps.length < segEvents.length * 0.3) {
      console.warn(
        `[distill] ⚠️ "${seg.title}" kept only ${steps.length}/${segEvents.length} events as steps — possible mis-scoped segment (a sub-task may have been dropped)`,
      );
    }
    // Contiguous segmentIndex (0..n) — the approval key; skip-on-empty keeps it dense.
    workflows.push({ segmentIndex: workflows.length, title: seg.title, steps });
  }

  return { transcript, workflows, warning };
}

// ---------- Module 2 (cont.): segment the KB into workflow candidates ----------

export interface SegmentItemsInput {
  items: KbStepItem[];
  markers: Marker[];
  apiKey: string;
  synthModel: string;
  /** Full session narration — gives the segmenter the author's overall intent so it can tell
   *  "one task across many steps" from "several independent tasks". Strongly reduces over-splitting. */
  transcriptText?: string;
}

/** Segment the KB items into candidate workflows (titles). Runs at KB build (no synthesis).
 *  The worker persists the result onto each item (segmentIndex/segmentTitle, Option C); those
 *  titles become the candidates the Studio "Auto Generate Articles" picker lists — M6.1. */
export async function segmentItems(input: SegmentItemsInput): Promise<Segment[]> {
  const openai = new OpenAI({ apiKey: input.apiKey });
  const { events, narration } = eventsAndNarration(input.items);
  return segment(openai, input.synthModel, events, input.markers ?? [], narration, input.transcriptText ?? '');
}

// ---------- Module 3.1: KB → article (curated — ONE selected candidate at a time) ----------

export interface GenerateArticleInput {
  items: KbStepItem[]; // the items belonging to ONE segment (ordered)
  title: string; // the candidate title to synthesize
  getArtifact: ArtifactReader;
  apiKey: string;
  synthModel: string;
}

/** Curated generation (M6.1): synthesize a SINGLE chosen workflow candidate into an article.
 *  Called synchronously from the Studio server action after the user selects candidates. */
export async function generateArticleForSegment(input: GenerateArticleInput): Promise<SynthArticle> {
  const openai = new OpenAI({ apiKey: input.apiKey });
  const { events, narration } = eventsAndNarration(input.items);

  const seg: Segment = { title: input.title, eventIds: events.map((e) => e.id) };
  const [article] = await synthesizeArticles(openai, input.synthModel, [seg], events, narration, input.getArtifact);
  return article ?? { title: input.title, tags: [], routes: [], preconditions: [], steps: [] };
}

// ---------- KB persistence helpers — PARKED (Phase-2 article engine only) ----------
// The worker NO LONGER writes this shape: since KB step distillation (2026-06-27),
// `KnowledgeItem.data` holds a `DistilledStep` ({ instruction, detail, route, narration,
// screenshotFile, bbox }) and raw events live only in `KnowledgeSource.manifest`. These decode the
// LEGACY `{ event, narration }` shape and are consumed only by the parked Phase-2 article engine
// (web/lib/generate-actions.ts, prompt-actions.ts) — which must re-source raw events from the
// manifest when Phase 2 resumes. See docs/phase-2-portal.md §6.

/** LEGACY shape of `KnowledgeItem.data` for a `step` item (pre-distillation rows only). */
export interface StepItemData {
  event: CapturedEvent;
  narration: string | null;
}

/** Decode a LEGACY `KnowledgeItem.data` JSON value into its typed step payload. PARKED — Phase 2. */
export function decodeStepData(data: unknown): StepItemData {
  const d = (data ?? {}) as Partial<StepItemData>;
  return { event: d.event as CapturedEvent, narration: d.narration ?? null };
}
