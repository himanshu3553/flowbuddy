import { describe, expect, it } from 'vitest';
import type { CapturedEvent } from '@flowbuddy/shared';
import { buildScreens } from './screen-runs';

/**
 * The shared screen-run builder — one implementation under the sense plan AND the execution
 * contract (extracted at its second consumer). Pinned: run-keying by consecutive same-pattern
 * events (never by route), the unidentifiable-screen drop, and byEventId only mapping events whose
 * screen survived — the exact behavior the sense plan shipped with.
 */

let seq = 0;
function ev(path: string, title: string, label: string): CapturedEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    t: seq * 1000,
    type: 'click',
    target: { tag: 'button', accessibleName: label },
    route: { url: `https://app.example.com${path}`, path, hash: '', title },
  } as CapturedEvent;
}

describe('buildScreens', () => {
  it('keys screens by RUNS of consecutive same-pattern events and fingerprints the touched labels', () => {
    const events = [
      ev('/team', 'Team', 'Invite member'),
      ev('/team', 'Team', 'Pending invites'),
      ev('/team', 'Team', 'Send invite'),
      ev('/billing', 'Billing', 'Change plan'),
      ev('/billing', 'Billing', 'Add card'),
      ev('/billing', 'Billing', 'Save billing'),
    ];
    const { screens, byEventId } = buildScreens(events);
    expect(screens.size).toBe(2);
    expect(byEventId.get(events[0]!.id)).toBe('s0');
    expect(byEventId.get(events[5]!.id)).toBe('s1');
    expect(screens.get('s0')?.title).toBe('Team');
    expect(screens.get('s0')?.anchors).toContain('invite member');
  });

  it('two visits to one pattern are two runs — WHEN, not where', () => {
    const events = [
      ev('/team', 'Team', 'Invite member'),
      ev('/team', 'Team', 'Pending invites'),
      ev('/team', 'Team', 'Send invite'),
      ev('/billing', 'Billing', 'Change plan'),
      ev('/billing', 'Billing', 'Add card'),
      ev('/billing', 'Billing', 'Save billing'),
      ev('/team', 'Team', 'Remove member'),
      ev('/team', 'Team', 'Confirm removal'),
      ev('/team', 'Team', 'Member removed'),
    ];
    const { screens, byEventId } = buildScreens(events);
    expect(screens.size).toBe(3); // the return visit is its own run
    expect(byEventId.get(events[8]!.id)).toBe('s2');
  });

  it('a screen too sparse to identify is dropped, and its events with it — a miss, never a wrong screen', () => {
    const events = [
      ev('/team', 'Team', 'Invite member'), // one anchor — below the identifiability floor
      ev('/billing', 'Billing', 'Change plan'),
      ev('/billing', 'Billing', 'Add card'),
      ev('/billing', 'Billing', 'Save billing'),
    ];
    const { screens, byEventId } = buildScreens(events);
    expect(screens.size).toBe(1);
    expect(byEventId.has(events[0]!.id)).toBe(false);
    expect(byEventId.get(events[1]!.id)).toBe('s1');
  });
});
