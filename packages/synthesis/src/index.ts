import OpenAI from 'openai';
import type { SessionManifest, CapturedEvent, Marker } from '@sync/shared';
import { transcribe, type Transcript } from './transcribe';
import { alignNarration } from './align';
import { segment, eventLabel, type Segment } from './segment';
import { synthesizeArticles, type SynthArticle } from './synthesize';
import type { ArtifactReader } from './types';

export type { ArtifactReader } from './types';
export type { SynthArticle, SynthStep } from './synthesize';
export type { Transcript } from './transcribe';
export type { Segment } from './segment';
export { promptToArticle } from './prompt';
export type { PromptItem, PromptArtifactReader, PromptToArticleResult } from './prompt';

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

/** Extract a workflow capture into KB knowledge: persistable transcript + normalized step items. */
export async function buildKB(input: BuildKBInput): Promise<BuiltKB> {
  const openai = new OpenAI({ apiKey: input.apiKey });
  const transcript = await transcribe(openai, input.transcribeModel, input.manifest, input.getArtifact);
  const narration = alignNarration(input.manifest.events, transcript);

  const items: KbStepItem[] = input.manifest.events.map((event, i) => {
    const n = narration.get(event.id) ?? null;
    return {
      orderIndex: i,
      kind: 'step',
      text: `${eventLabel(event)}${n ? ` — ${n}` : ''}`,
      event,
      narration: n,
    };
  });

  return { transcript, items };
}

// ---------- Module 2 (cont.): segment the KB into workflow candidates ----------

export interface SegmentItemsInput {
  items: KbStepItem[];
  markers: Marker[];
  apiKey: string;
  synthModel: string;
}

/** Segment the KB items into candidate workflows (titles). Runs at KB build (no synthesis).
 *  The worker persists the result onto each item (segmentIndex/segmentTitle, Option C); those
 *  titles become the candidates the Studio "Auto Generate Articles" picker lists — M6.1. */
export async function segmentItems(input: SegmentItemsInput): Promise<Segment[]> {
  const openai = new OpenAI({ apiKey: input.apiKey });
  const { events, narration } = eventsAndNarration(input.items);
  return segment(openai, input.synthModel, events, input.markers ?? [], narration);
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

// ---------- KB persistence helpers (Module 2 ⇄ DB) ----------

/** Shape of `KnowledgeItem.data` for a `step` item, as the worker writes it. */
export interface StepItemData {
  event: CapturedEvent;
  narration: string | null;
}

/** Safely decode a `KnowledgeItem.data` JSON value (Prisma `Json`) into its typed step payload.
 *  Centralizes the cast so callers (worker, Studio actions) don't repeat `as unknown as {...}`. */
export function decodeStepData(data: unknown): StepItemData {
  const d = (data ?? {}) as Partial<StepItemData>;
  return { event: d.event as CapturedEvent, narration: d.narration ?? null };
}
