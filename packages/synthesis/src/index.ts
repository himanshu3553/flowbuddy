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

/** A KB step-item as the synthesis package produces/consumes it (Module 2 ⇄ Module 3). */
export interface KbStepItem {
  orderIndex: number;
  kind: 'step';
  text: string; // searchable content
  event: CapturedEvent; // the captured interaction (ground truth)
  narration: string | null; // aligned narration ("why")
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

// ---------- Module 3.1: KB → articles (auto) ----------

export interface CreateArticlesInput {
  items: KbStepItem[];
  markers: Marker[];
  getArtifact: ArtifactReader;
  apiKey: string;
  synthModel: string;
}

/** Auto article creation FROM the KB: segment (at creation) then synthesize. Also returns the
 *  segments so the KB items can be tagged with the workflow they belong to (Path 2). */
export async function createArticlesFromItems(
  input: CreateArticlesInput,
): Promise<{ articles: SynthArticle[]; segments: Segment[] }> {
  const openai = new OpenAI({ apiKey: input.apiKey });
  const events = input.items.map((it) => it.event);
  const narration = new Map<string, string>();
  for (const it of input.items) if (it.narration) narration.set(it.event.id, it.narration);

  const segments = await segment(openai, input.synthModel, events, input.markers || [], narration);
  const articles = await synthesizeArticles(openai, input.synthModel, segments, events, narration, input.getArtifact);
  return { articles, segments };
}

// ---------- Convenience: full pipeline (capture → KB → articles) in one call ----------

export interface SynthesizeInput {
  manifest: SessionManifest;
  getArtifact: ArtifactReader;
  apiKey: string;
  transcribeModel: string;
  synthModel: string;
}

/** Used where a single call is convenient; the worker uses buildKB + createArticlesFromItems separately so the KB is persisted in between. */
export async function synthesizeSession(input: SynthesizeInput): Promise<SynthArticle[]> {
  const { items } = await buildKB(input);
  const { articles } = await createArticlesFromItems({
    items,
    markers: input.manifest.markers || [],
    getArtifact: input.getArtifact,
    apiKey: input.apiKey,
    synthModel: input.synthModel,
  });
  return articles;
}
