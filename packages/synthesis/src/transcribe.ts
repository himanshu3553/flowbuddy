import OpenAI from 'openai';
import type { SessionManifest } from '@flowbuddy/shared';
import type { ArtifactReader } from './types';

export interface TranscriptSegment { start: number; end: number; text: string; } // ms
export interface Transcript { text: string; segments: TranscriptSegment[]; }

/**
 * Why a build has no narration, when nothing went wrong loudly enough to throw.
 *
 * These three used to be a bare `return { text: '', segments: [] }`, which is indistinguishable from
 * a founder who simply said nothing — so the recording landed `ready` looking perfectly healthy while
 * everything downstream of narration went quiet at once: no workflow descriptions (the plan, what is
 * optional, what is a choice), no recording summary, no product-knowledge pages. The only visible
 * symptom was a copilot that seemed shallow.
 *
 * They are kept APART because the founder's next move differs: re-record with the mic on · check
 * whether the recording uploaded · re-record and actually narrate. A single "no narration" would
 * collapse a fixable upload fault into user error.
 */
export type TranscriptGap =
  /** The manifest carries no audio track — nothing was ever recorded. */
  | 'no-audio'
  /** The manifest names an audio file that is not in storage — an upload or retention fault. */
  | 'audio-missing'
  /** Audio was transcribed and carried no speech. */
  | 'silent';

export interface TranscribeResult {
  transcript: Transcript;
  /** Absent on a normal transcription. */
  gap?: TranscriptGap;
}

const EMPTY: Transcript = { text: '', segments: [] };

/** Transcribe the session audio. whisper-1 + verbose_json gives segment timestamps. */
export async function transcribe(
  openai: OpenAI,
  model: string,
  manifest: SessionManifest,
  getArtifact: ArtifactReader,
): Promise<TranscribeResult> {
  if (!manifest.audio?.file) return { transcript: EMPTY, gap: 'no-audio' };
  const buf = await getArtifact(manifest.audio.file);
  if (!buf) return { transcript: EMPTY, gap: 'audio-missing' };

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

  const text = String(res.text ?? '');
  // Transcribed fine and heard nothing. Same downstream consequence as no audio at all, different
  // cause and different remedy — so it is reported, not folded into the happy path.
  if (!text.trim() && segments.length === 0) return { transcript: EMPTY, gap: 'silent' };
  return { transcript: { text, segments } };
}
