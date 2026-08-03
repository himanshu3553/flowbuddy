import { describe, expect, it } from 'vitest';
import type { CapturedEvent } from '@flowbuddy/shared';

import { transcriptWindow } from './align';
import { keepTail } from './describe';
import type { Transcript } from './transcribe';

// ── transcriptWindow — a workflow is described from its OWN run-up ──────────────────────────────
//
// The bug this pins: describeWorkflow reads a fixed slice of whatever transcript it is given, and the
// whole recording's used to be given to EVERY workflow — so every workflow but the first was
// described from the opening minutes of the tape. The failure is silent, because the prompt forbids
// inventing: the model falls back to a bland summary rather than an obviously wrong one.
//
// The rule under test: narration belongs to the workflow that owns the NEXT event after it.

const ev = (id: string, t: number): CapturedEvent => ({
  id,
  t,
  type: 'click',
  target: { tag: 'button' },
  route: { url: 'https://acme.test/x', path: '/x', hash: '', title: 'X' },
});

// A real-shaped tour: ~1 min explaining the concept with NOTHING clicked, then two tasks.
const TOUR: Transcript = {
  text: 'ALL OF IT',
  segments: [
    { start: 0, end: 20_000, text: 'So a chatbot is just something that answers your customers for you.' },
    { start: 20_000, end: 40_000, text: 'Before you start, have your website URL handy.' },
    { start: 40_000, end: 55_000, text: 'You can either upload a document or point it at a URL — not both.' },
    { start: 60_000, end: 66_000, text: 'Right, so I am creating it now.' },
    { start: 95_000, end: 101_000, text: 'And there it is, saved.' },
    { start: 120_000, end: 130_000, text: 'Completely separately, here is how billing settings work.' },
    { start: 135_000, end: 141_000, text: 'You have to pick a currency before any of this saves.' },
  ],
};
const WF1 = [ev('a', 62_000), ev('b', 92_000)];
const WF2 = [ev('c', 128_000), ev('d', 138_000)];
const ALL = [...WF1, ...WF2];

describe('transcriptWindow', () => {
  it('gives a MINUTES-LONG preamble to the workflow that follows it', () => {
    // The founder explains the concept for a full minute before touching anything. A fixed lead of a
    // few seconds would catch the tail of that and drop the rest — including the two things the PLAN
    // is actually made of, which are both spoken before the first click.
    const out = transcriptWindow(WF1, ALL, TOUR);

    expect(out).toContain('a chatbot is just something'); // concept
    expect(out).toContain('have your website URL handy'); // PREREQUISITE
    expect(out).toContain('either upload a document'); // CHOICE
  });

  it('keeps the outcome spoken after the last click', () => {
    // "And there it is, saved" at 95s trails WF1's last click at 92s — inside the 5s trail.
    expect(transcriptWindow(WF1, ALL, TOUR)).toContain('there it is, saved');
  });

  it('does not give a later workflow the earlier one\'s narration', () => {
    const out = transcriptWindow(WF2, ALL, TOUR);

    expect(out).toContain('billing settings');
    expect(out).toContain('pick a currency');
    // The whole point of the change.
    expect(out).not.toContain('a chatbot is just something');
    expect(out).not.toContain('website URL handy');
    expect(out).not.toContain('I am creating it now');
  });

  it('excludes an intervening workflow when the founder RETURNS to an earlier one', () => {
    // A, A, B, then back to A. Segments are not guaranteed contiguous (segment.ts assigns by
    // ownership, not adjacency), so a first-click-to-last-click span would swallow all of B.
    const t: Transcript = {
      text: 'ALL OF IT',
      segments: [
        { start: 0, end: 5_000, text: 'First I will set up the invoice template.' },
        { start: 10_000, end: 16_000, text: 'Adding the line items here.' },
        { start: 24_000, end: 30_000, text: 'Now something else entirely — the user permissions screen.' },
        { start: 50_000, end: 56_000, text: 'Back to the invoice — you can also duplicate an existing one.' },
      ],
    };
    const a = [ev('a1', 6_000), ev('a2', 18_000), ev('a3', 52_000)];
    const b = ev('b1', 32_000);

    const out = transcriptWindow(a, [...a, b], t);

    expect(out).toContain('invoice template');
    expect(out).toContain('line items');
    expect(out).toContain('duplicate an existing one'); // the return leg
    expect(out).not.toContain('user permissions'); // B's own span, skipped
  });

  it('keeps a sentence that STARTS before the run-up opens but is still being spoken inside it', () => {
    // Overlap, not segment-start. Filtering on `start` alone — which alignNarration does, and which is
    // its own separate bug — would drop a sentence already in progress when the previous task ended.
    const t: Transcript = {
      text: 'x',
      segments: [{ start: 0, end: 10_000, text: 'a long sentence that began early and is still going' }],
    };
    const mine = ev('m', 8_000);
    const out = transcriptWindow([mine], [ev('foreign', 5_000), mine], t);
    expect(out).toContain('still going');
  });

  it('returns empty when there is nothing to window, so the caller falls back to the whole transcript', () => {
    // A degraded transcription leaves text with no segments. Empty here must NOT be read as "the
    // founder said nothing" — index.ts falls back to transcript.text on exactly this.
    expect(transcriptWindow(WF1, ALL, { text: 'ALL OF IT', segments: [] })).toBe('');
    expect(transcriptWindow([], ALL, TOUR)).toBe('');
  });

  it('returns empty when nothing was said during the workflow\'s run-up', () => {
    const t: Transcript = { text: 'x', segments: [{ start: 0, end: 5_000, text: 'early talk only' }] };
    const mine = ev('m', 110_000);
    expect(transcriptWindow([mine], [ev('foreign', 100_000), mine], t)).toBe('');
  });
});

// ── keepTail — which END of an over-long run-up survives ────────────────────────────────────────

describe('keepTail', () => {
  it('drops the OLDEST talk and keeps the words closest to the clicks', () => {
    // Trimming the other end would feed the describer the concept preamble and cut the task's own
    // narration — the whole-tape bug, recreated inside one workflow.
    const text = `${'concept preamble '.repeat(50)}and here is the actual task`;
    const out = keepTail(text, 40);

    expect(out).toContain('the actual task');
    expect(out).not.toContain('concept preamble');
    expect(out.length).toBeLessThanOrEqual(40);
  });

  it('never opens mid-word', () => {
    expect(keepTail('alpha bravo charlie delta', 14)).toBe('charlie delta');
  });

  it('leaves a short run-up completely alone', () => {
    expect(keepTail('  short one  ', 10_000)).toBe('short one');
  });
});
