/**
 * Voiceover audio for the demo video: OpenAI TTS in, one contiguous WAV out.
 *
 * WHY WAV AND NOT MP3. The plan compiler needs each clip's exact duration to time the
 * step it narrates, and the renderer needs one gapless track aligned to the plan. WAV
 * gives both from the file header and plain PCM math — no ffprobe dependency, no
 * decoder, no VBR duration guessing. The final mp4 re-encodes to AAC anyway, so the
 * intermediate being uncompressed costs only transient worker memory.
 *
 * All clips in one video must share sample format (same model + response_format, so
 * they do); `concatClips` asserts that rather than resampling.
 */
import type OpenAI from 'openai';

export interface TtsClip {
  wav: Buffer;
  durationMs: number;
}

interface WavFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
}

export function parseWav(buf: Buffer): WavFormat {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('video-audio: not a RIFF/WAVE buffer');
  }
  let offset = 12;
  let fmt: { sampleRate: number; channels: number; bitsPerSample: number } | null = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      if (!fmt) throw new Error('video-audio: data chunk before fmt chunk');
      return {
        ...fmt,
        dataOffset: body,
        dataLength: Math.min(size, buf.length - body),
      };
    }
    offset = body + size + (size % 2);
  }
  throw new Error('video-audio: no data chunk found');
}

export function wavDurationMs(buf: Buffer): number {
  const f = parseWav(buf);
  const bytesPerSecond = f.sampleRate * f.channels * (f.bitsPerSample / 8);
  return Math.round((f.dataLength / bytesPerSecond) * 1000);
}

function wavHeader(dataLength: number, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'ascii');
  h.writeUInt32LE(36 + dataLength, 4);
  h.write('WAVE', 8, 'ascii');
  h.write('fmt ', 12, 'ascii');
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  h.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  h.writeUInt16LE(bitsPerSample, 34);
  h.write('data', 36, 'ascii');
  h.writeUInt32LE(dataLength, 40);
  return h;
}

/** Generate a silent PCM16 mono WAV of the given length — used as a test/fallback clip. */
export function silentWav(durationMs: number, sampleRate = 24000): Buffer {
  const samples = Math.round((durationMs / 1000) * sampleRate);
  const data = Buffer.alloc(samples * 2);
  return Buffer.concat([wavHeader(data.length, sampleRate, 1, 16), data]);
}

/**
 * Lay clips onto one timeline: each entry starts at `atMs` (absolute), gaps become
 * silence. Overlapping clips throw — the plan spaces narration; an overlap means the
 * plan and the clips disagree, which should fail loudly rather than garble audio.
 */
export function assembleTimeline(clips: Array<{ atMs: number; wav: Buffer }>, totalMs: number): Buffer {
  if (clips.length === 0) return silentWav(totalMs);
  const formats = clips.map((c) => parseWav(c.wav));
  const { sampleRate, channels, bitsPerSample } = formats[0]!;
  for (const f of formats) {
    if (f.sampleRate !== sampleRate || f.channels !== channels || f.bitsPerSample !== bitsPerSample) {
      throw new Error('video-audio: mixed clip formats on one timeline');
    }
  }
  if (bitsPerSample !== 16) throw new Error(`video-audio: expected PCM16, got ${bitsPerSample}-bit`);

  const bytesPerMs = (sampleRate * channels * 2) / 1000;
  const align = channels * 2;
  const toOffset = (ms: number) => Math.floor((ms * bytesPerMs) / align) * align;

  const sorted = [...clips].sort((a, b) => a.atMs - b.atMs);
  const total = toOffset(totalMs);
  const out = Buffer.alloc(total);
  let lastEnd = -1;
  for (const clip of sorted) {
    const f = parseWav(clip.wav);
    const start = toOffset(clip.atMs);
    if (start < lastEnd) throw new Error('video-audio: overlapping narration clips');
    const len = Math.min(f.dataLength, Math.max(0, total - start));
    clip.wav.copy(out, start, f.dataOffset, f.dataOffset + len);
    lastEnd = start + len;
  }
  return Buffer.concat([wavHeader(out.length, sampleRate, channels, bitsPerSample), out]);
}

export async function synthesizeSpeech(opts: {
  openai: OpenAI;
  model: string;
  voice: string;
  text: string;
}): Promise<TtsClip> {
  const res = await opts.openai.audio.speech.create({
    model: opts.model,
    voice: opts.voice as 'alloy',
    input: opts.text,
    response_format: 'wav',
  });
  const wav = Buffer.from(await res.arrayBuffer());
  return { wav, durationMs: wavDurationMs(wav) };
}
