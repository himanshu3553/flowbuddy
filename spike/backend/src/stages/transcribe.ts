import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { config } from '../config.js';
import { openai } from '../openai.js';
import { bundleFilePath } from '../storage.js';
import type { SessionManifest, Transcript, TranscriptSegment } from '../types.js';

/**
 * Transcribe the session audio via OpenAI. whisper-1 with verbose_json returns
 * segment-level timestamps (seconds), which we convert to ms for alignment.
 */
export async function transcribe(manifest: SessionManifest): Promise<Transcript> {
  if (!manifest.audio?.file) {
    return { text: '', segments: [] };
  }
  const audioPath = bundleFilePath(manifest.id, manifest.audio.file);
  try {
    await access(audioPath);
  } catch {
    return { text: '', segments: [] };
  }

  const res: any = await openai().audio.transcriptions.create({
    file: createReadStream(audioPath) as any,
    model: config.transcribeModel,
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
