import { describe, expect, it } from 'vitest';
import { assembleTimeline, parseWav, silentWav, wavDurationMs } from './video-audio';

describe('wav utilities', () => {
  it('round-trips duration through silentWav', () => {
    expect(wavDurationMs(silentWav(2500))).toBe(2500);
    expect(wavDurationMs(silentWav(100, 48000))).toBe(100);
  });

  it('parses format from the header', () => {
    const f = parseWav(silentWav(1000, 24000));
    expect(f.sampleRate).toBe(24000);
    expect(f.channels).toBe(1);
    expect(f.bitsPerSample).toBe(16);
  });

  it('rejects a non-wav buffer', () => {
    expect(() => parseWav(Buffer.from('not audio at all, definitely'))).toThrow(/RIFF/);
  });
});

describe('assembleTimeline', () => {
  it('lays clips at their offsets inside a track of the requested length', () => {
    const out = assembleTimeline(
      [
        { atMs: 500, wav: silentWav(1000) },
        { atMs: 3000, wav: silentWav(2000) },
      ],
      6000,
    );
    expect(wavDurationMs(out)).toBe(6000);
  });

  it('places clip samples at the right byte offsets, silence elsewhere', () => {
    // A "loud" clip: constant 0x7fff samples, 100ms at 1kHz mono = 100 samples.
    const rate = 1000;
    const loud = silentWav(100, rate);
    const fmt = parseWav(loud);
    loud.fill(0x7f, fmt.dataOffset);
    const out = assembleTimeline([{ atMs: 200, wav: loud }], 500);
    const o = parseWav(out);
    const sample = (ms: number) => out.readInt16LE(o.dataOffset + (ms / 1000) * rate * 2);
    expect(sample(100)).toBe(0); // before the clip
    expect(sample(250)).not.toBe(0); // inside it
    expect(sample(400)).toBe(0); // after it
  });

  it('throws on overlapping clips instead of garbling audio', () => {
    expect(() =>
      assembleTimeline(
        [
          { atMs: 0, wav: silentWav(1000) },
          { atMs: 500, wav: silentWav(1000) },
        ],
        3000,
      ),
    ).toThrow(/overlap/);
  });

  it('throws on mixed sample rates', () => {
    expect(() =>
      assembleTimeline(
        [
          { atMs: 0, wav: silentWav(500, 24000) },
          { atMs: 1000, wav: silentWav(500, 48000) },
        ],
        3000,
      ),
    ).toThrow(/mixed/);
  });

  it('truncates a clip that runs past the end of the timeline', () => {
    const out = assembleTimeline([{ atMs: 900, wav: silentWav(1000) }], 1000);
    expect(wavDurationMs(out)).toBe(1000);
  });
});
