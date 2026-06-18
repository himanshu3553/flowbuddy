import OpenAI from 'openai';
import type { SessionManifest } from '@sync/shared';
import { transcribe } from './transcribe';
import { alignNarration } from './align';
import { segment } from './segment';
import { synthesizeArticles, type SynthArticle } from './synthesize';
import type { ArtifactReader } from './types';

export type { ArtifactReader } from './types';
export type { SynthArticle, SynthStep } from './synthesize';

export interface SynthesizeInput {
  manifest: SessionManifest;
  getArtifact: ArtifactReader;
  apiKey: string;
  transcribeModel: string;
  synthModel: string;
}

/** Full pipeline: transcribe → align → segment → synthesize. Grounded in the bundle only. */
export async function synthesizeSession(input: SynthesizeInput): Promise<SynthArticle[]> {
  const openai = new OpenAI({ apiKey: input.apiKey });
  const { manifest, getArtifact } = input;

  const transcript = await transcribe(openai, input.transcribeModel, manifest, getArtifact);
  const narration = alignNarration(manifest.events, transcript);
  const segments = await segment(openai, input.synthModel, manifest.events, manifest.markers || [], narration);
  return synthesizeArticles(openai, input.synthModel, segments, manifest.events, narration, getArtifact);
}
