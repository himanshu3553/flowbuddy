import OpenAI from 'openai';
import type { SessionManifest } from '@flowbuddy/shared';
import type { ArtifactReader } from './types';

export interface TranscriptSegment { start: number; end: number; text: string; } // ms
export interface Transcript { text: string; segments: TranscriptSegment[]; }

/** Transcribe the session audio. whisper-1 + verbose_json gives segment timestamps. */
export async function transcribe(
  openai: OpenAI,
  model: string,
  manifest: SessionManifest,
  getArtifact: ArtifactReader,
): Promise<Transcript> {
  if (!manifest.audio?.file) return { text: '', segments: [] };
  const buf = await getArtifact(manifest.audio.file);
  if (!buf) return { text: '', segments: [] };

  const file = await OpenAI.toFile(buf, 'audio.webm', { type: 'audio/webm' });
  const res: any = await openai.audio.transcriptions.create({
    file,
    model,
    response_format: 'verbose_json',
  });

  const segments: TranscriptSegment[] = Array.isArray(res.segments)
    ? res.segments.map((s: any) => ({
        start: Math.round((s.start ?? 0) * 1000),
        end: Math.round((s.end ?? 0) * 1000),
        text: String(s.text ?? '').trim(),
      }))
    : [];

  return { text: String(res.text ?? ''), segments };
}
