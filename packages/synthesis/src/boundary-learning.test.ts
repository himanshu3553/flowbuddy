import { describe, expect, it } from 'vitest';
import type { CapturedEvent } from '@flowbuddy/shared';

import {
  activeBoundaryLessons,
  deriveBoundarySignatures,
  matchLearnedBoundaries,
  parseBoundarySignatures,
  type BoundarySignature,
} from './boundary-learning';

// ── every founder correction becomes permanent product knowledge ────────────────────────────────
//
// A boundary drawn on one recording must cut future recordings at the same moment — and a founder
// contradicting a lesson must retire it. These tests pin the precision-first rules: label-based
// transfer, unknown routes teach nothing, self-ambiguity teaches nothing, newest-wins aggregation,
// exact-screen matching through the ONE route matcher (ids scrubbed, so record ids never block a
// match across recordings).

const ev = (
  id: string,
  label: string,
  path: string,
  opts: { type?: string; tag?: string } = {},
): CapturedEvent =>
  ({
    id,
    t: 0,
    type: opts.type ?? 'click',
    target: { tag: opts.tag ?? 'button', accessibleName: label },
    route: { url: `https://x.test${path}`, path, hash: '', title: '' },
  }) as unknown as CapturedEvent;

const start = (label: string, path: string, at = '2026-08-21T10:00:00Z'): BoundarySignature => ({
  kind: 'start',
  type: 'click',
  route: path,
  control: `button:${label}`,
  at,
});

describe('deriveBoundarySignatures', () => {
  it('teaches a start signature for each drawn boundary', () => {
    const events = [ev('e1', 'Home', '/dashboard'), ev('e2', 'Invite teammate', '/team')];
    const out = deriveBoundarySignatures(events, ['e2'], [], '2026-08-21T10:00:00Z');
    expect(out).toEqual([
      { kind: 'start', type: 'click', route: '/team', control: 'button:invite teammate', at: '2026-08-21T10:00:00Z' },
    ]);
  });

  it('scrubs record ids from the taught route', () => {
    const out = deriveBoundarySignatures(
      [ev('e1', 'Settings', '/projects/6a6a49ca11b2aa00/settings')],
      ['e1'],
      [],
      'now',
    );
    expect(out[0]!.route).toBe('/projects/:id/settings');
  });

  it('an unlabeled control teaches nothing — there is no transferable identity', () => {
    const bare = ev('e1', '', '/team');
    expect(deriveBoundarySignatures([bare], ['e1'], [], 'now')).toEqual([]);
  });

  it('an unknown route teaches nothing — empty is not the root', () => {
    expect(deriveBoundarySignatures([ev('e1', 'Invite', '')], ['e1'], [], 'now')).toEqual([]);
  });

  it('a self-ambiguous signature teaches nothing — the same control also appears mid-task', () => {
    const events = [
      ev('e1', 'New Project', '/dashboard'), // the drawn boundary
      ev('e2', 'New Project', '/dashboard'), // the same control, deliberately NOT a boundary
    ];
    expect(deriveBoundarySignatures(events, ['e1'], [], 'now')).toEqual([]);
  });

  it('records a targeted not-start when an event contradicts an active lesson', () => {
    const events = [ev('e1', 'Start here', '/a'), ev('e2', 'Invite teammate', '/team')];
    const out = deriveBoundarySignatures(events, ['e1'], [start('invite teammate', '/team')], 'T2');
    expect(out).toContainEqual({
      kind: 'not-start',
      type: 'click',
      route: '/team',
      control: 'button:invite teammate',
      at: 'T2',
    });
  });

  it('never records a not-start without a contradicted lesson — negatives are targeted, not global', () => {
    const events = [ev('e1', 'Start here', '/a'), ev('e2', 'Random button', '/b')];
    const out = deriveBoundarySignatures(events, ['e1'], [], 'now');
    expect(out.every((s) => s.kind === 'start')).toBe(true);
  });
});

describe('activeBoundaryLessons', () => {
  it('newest wins per signature — a later suppression retires the lesson', () => {
    const lessons = [start('invite teammate', '/team', 'T1'), { ...start('invite teammate', '/team', 'T2'), kind: 'not-start' as const }];
    expect(activeBoundaryLessons(lessons)).toEqual([]);
  });

  it('a later re-teaching revives it', () => {
    const lessons = [
      { ...start('invite teammate', '/team', 'T1'), kind: 'not-start' as const },
      start('invite teammate', '/team', 'T2'),
    ];
    expect(activeBoundaryLessons(lessons)).toHaveLength(1);
  });

  it('a tie prefers the suppression — fail toward fewer cuts', () => {
    const lessons = [start('x', '/a', 'T1'), { ...start('x', '/a', 'T1'), kind: 'not-start' as const }];
    expect(activeBoundaryLessons(lessons)).toEqual([]);
  });
});

describe('matchLearnedBoundaries', () => {
  const lessons = [start('invite teammate', '/team')];

  it('cuts a future recording at the taught moment — across different record ids', () => {
    const events = [
      ev('n1', 'Home', '/dashboard'),
      ev('n2', 'Invite teammate', '/team'),
      ev('n3', 'Send', '/team'),
    ];
    expect(matchLearnedBoundaries(events, lessons)).toEqual(['n2']);
  });

  it('requires the SAME screen — a prefix route never matches', () => {
    const events = [ev('n1', 'Invite teammate', '/team/settings/advanced')];
    expect(matchLearnedBoundaries(events, lessons)).toEqual([]);
  });

  it('requires the same control label and event type', () => {
    expect(matchLearnedBoundaries([ev('n1', 'Invite people', '/team')], lessons)).toEqual([]);
    expect(matchLearnedBoundaries([ev('n1', 'Invite teammate', '/team', { type: 'input' })], lessons)).toEqual([]);
  });

  it('label matching is case- and whitespace-insensitive', () => {
    expect(matchLearnedBoundaries([ev('n1', '  INVITE   Teammate ', '/team')], lessons)).toEqual(['n1']);
  });

  it('every occurrence of the taught moment cuts — a task started twice is two tasks', () => {
    const events = [ev('n1', 'Invite teammate', '/team'), ev('n2', 'Ok', '/x'), ev('n3', 'Invite teammate', '/team')];
    expect(matchLearnedBoundaries(events, lessons)).toEqual(['n1', 'n3']);
  });
});

describe('parseBoundarySignatures', () => {
  it('keeps only well-formed entries', () => {
    const parsed = parseBoundarySignatures([
      start('a', '/a'),
      { kind: 'maybe', type: 'click', route: '/a', control: 'x', at: 'T' },
      { kind: 'start', type: 'click', route: '', control: 'x', at: 'T' },
      null,
      42,
    ]);
    expect(parsed).toHaveLength(1);
  });

  it('non-arrays parse to empty', () => {
    expect(parseBoundarySignatures(null)).toEqual([]);
    expect(parseBoundarySignatures({})).toEqual([]);
  });
});
