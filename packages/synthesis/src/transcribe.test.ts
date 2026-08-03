import { describe, expect, it } from 'vitest';
import type OpenAI from 'openai';
import type { SessionManifest } from '@flowbuddy/shared';

import { transcribe } from './transcribe';

// ── transcribe — a build with no narration must SAY so ──────────────────────────────────────────
//
// All three of these paths used to return a bare empty transcript, which is indistinguishable from a
// founder who said nothing. The recording then landed `ready` looking healthy while every
// narration-derived artefact was silently absent — workflow descriptions, the recording summary,
// product-knowledge pages — so the only symptom was a copilot that answered thinly.
//
// The `gap` is what makes Studio's existing "Processed with a warning" banner fire. Collapsing these
// back into one empty return, or into a single reason, re-breaks that silently.

const manifest = (audio?: { file: string }): SessionManifest =>
  ({ id: 's1', events: [], ...(audio ? { audio } : {}) }) as unknown as SessionManifest;

/** The early-return paths never reach the client; the silent path needs only this one method. */
const clientReturning = (res: unknown): OpenAI =>
  ({ audio: { transcriptions: { create: async () => res } } }) as unknown as OpenAI;

describe('transcribe', () => {
  it('reports no-audio when the manifest carries no audio track', async () => {
    const out = await transcribe(clientReturning(null), 'whisper-1', manifest(), async () => null);
    expect(out.gap).toBe('no-audio');
    expect(out.transcript).toEqual({ text: '', segments: [] });
  });

  it('reports audio-missing when the manifest names a file that is not in storage', async () => {
    // Distinct from no-audio on purpose: this one is an upload or retention fault, not the founder
    // forgetting the microphone, and re-processing cannot fix it.
    const out = await transcribe(
      clientReturning(null),
      'whisper-1',
      manifest({ file: 'audio.webm' }),
      async () => null,
    );
    expect(out.gap).toBe('audio-missing');
  });

  it('reports silent when the audio transcribed to nothing', async () => {
    const out = await transcribe(
      clientReturning({ text: '   ', segments: [] }),
      'whisper-1',
      manifest({ file: 'audio.webm' }),
      async () => Buffer.from('fake audio'),
    );
    expect(out.gap).toBe('silent');
  });

  it('sets NO gap on a normal transcription', async () => {
    const out = await transcribe(
      clientReturning({
        text: 'first I open the invoice screen',
        segments: [{ start: 1.5, end: 4, text: ' first I open the invoice screen ' }],
      }),
      'whisper-1',
      manifest({ file: 'audio.webm' }),
      async () => Buffer.from('fake audio'),
    );
    expect(out.gap).toBeUndefined();
    expect(out.transcript.text).toContain('invoice screen');
    // Whisper speaks seconds; everything downstream aligns against event timestamps in ms.
    expect(out.transcript.segments[0]).toEqual({
      start: 1500,
      end: 4000,
      text: 'first I open the invoice screen',
    });
  });

  it('keeps text that arrived without segment timings, rather than calling it silent', async () => {
    // Load-bearing: `transcriptWindow` returns '' with no segments and the describer falls back to
    // the whole transcript. Treating this as silent would throw away narration we actually have.
    const out = await transcribe(
      clientReturning({ text: 'plenty was said here', segments: null }),
      'whisper-1',
      manifest({ file: 'audio.webm' }),
      async () => Buffer.from('fake audio'),
    );
    expect(out.gap).toBeUndefined();
    expect(out.transcript.text).toBe('plenty was said here');
    expect(out.transcript.segments).toEqual([]);
  });
});
