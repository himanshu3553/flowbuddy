import { describe, expect, it } from 'vitest';
import { ANCHOR_GAP, placeCard, VIEWPORT_PAD, type AnchorRect } from './card-anchor.js';

/**
 * The anchored walkthrough card's placement math. Pure geometry, so these pin the contract
 * directly: side preference (below → above → right → left), whole-card viewport clamping, the
 * never-cover-the-target rule, and the beacon sitting mid-gap on the facing edge.
 */

const CARD = { width: 300, height: 120 };
const VIEW = { width: 1280, height: 800 };
const rect = (top: number, left: number, width = 120, height = 40): AnchorRect => ({ top, left, width, height });

describe('placeCard', () => {
  it('prefers below, horizontally centered on the target', () => {
    const t = rect(300, 500);
    const p = placeCard(t, CARD, VIEW);
    expect(p.side).toBe('below');
    expect(p.top).toBe(340 + ANCHOR_GAP); // target bottom + gap
    expect(p.left).toBe(500 + 60 - 150); // target centerX − card/2
  });

  it('flips above when below would run off-screen', () => {
    const t = rect(700, 500); // bottom at 740; 740+gap+120 > 800−pad
    const p = placeCard(t, CARD, VIEW);
    expect(p.side).toBe('above');
    expect(p.top).toBe(700 - ANCHOR_GAP - CARD.height);
  });

  it('goes right when neither vertical side fits, vertically centered', () => {
    const view = { width: 1280, height: 200 };
    const t = rect(20, 100, 120, 160); // fills the height — no room below or above
    const p = placeCard(t, CARD, view);
    expect(p.side).toBe('right');
    expect(p.left).toBe(220 + ANCHOR_GAP); // target right + gap
    expect(p.top).toBe(Math.max(VIEWPORT_PAD, 20 + 80 - CARD.height / 2));
  });

  it('goes left when right has no room either', () => {
    const view = { width: 500, height: 200 };
    const t = rect(20, 340, 140, 160); // right edge at 480 — no room right of it
    const p = placeCard(t, CARD, view);
    expect(p.side).toBe('left');
    expect(p.left).toBe(340 - ANCHOR_GAP - CARD.width);
  });

  it('when nothing fits whole, takes the roomier vertical side and stays clamped on-screen', () => {
    const view = { width: 320, height: 260 };
    const t = rect(10, 10, 300, 200); // dominates a viewport smaller than the card
    const p = placeCard(t, CARD, view);
    expect(p.side).toBe('below'); // 50px free below vs 10 above
    expect(p.top + CARD.height).toBe(view.height - VIEWPORT_PAD); // clamped fully on-screen
    expect(p.left).toBe(VIEWPORT_PAD);
  });

  it('clamps horizontally for a target hugging the left edge', () => {
    const p = placeCard(rect(300, 4, 40, 40), CARD, VIEW);
    expect(p.side).toBe('below');
    expect(p.left).toBe(VIEWPORT_PAD); // centering would go negative
  });

  it('clamps horizontally for a target hugging the right edge', () => {
    const p = placeCard(rect(300, 1240, 40, 40), CARD, VIEW);
    expect(p.left).toBe(VIEW.width - VIEWPORT_PAD - CARD.width);
  });

  it('never covers the target on a fitting side', () => {
    const t = rect(300, 500);
    const p = placeCard(t, CARD, VIEW);
    expect(p.top).toBeGreaterThanOrEqual(t.top + t.height); // fully beneath it
  });

  it('puts the beacon mid-gap on the facing edge (below)', () => {
    const t = rect(300, 500);
    const p = placeCard(t, CARD, VIEW);
    expect(p.beacon).toEqual({ x: 560, y: 340 + ANCHOR_GAP / 2, visible: true });
  });

  it('puts the beacon mid-gap on the facing edge (right)', () => {
    const view = { width: 1280, height: 200 };
    const t = rect(20, 100, 120, 160);
    const p = placeCard(t, CARD, view);
    expect(p.beacon).toEqual({ x: 220 + ANCHOR_GAP / 2, y: 100, visible: true });
  });

  it('hides the beacon when the anchor point is scrolled out of the viewport', () => {
    // Target entirely above the fold: the card clamps back on-screen, but the anchor point
    // (target bottom + gap/2 = −251) is off the top — a dot there would point at nothing.
    const p = placeCard(rect(-300, 500, 120, 40), { width: 300, height: 60 }, { width: 1280, height: 800 });
    expect(p.side).toBe('below');
    expect(p.beacon.visible).toBe(false);
  });
});
