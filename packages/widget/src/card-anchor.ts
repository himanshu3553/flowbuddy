// P4-M0 walkthrough card anchoring (redesign 2026-08-11) — pure placement math for the step card
// that TRAVELS WITH the highlighted element instead of sitting in a fixed corner: the mouse was
// crossing the whole viewport between the element and the Next button on every step. The
// walkthrough is the only consumer today; the acting run's card stays docked on purpose (its user
// is watching, not steering) — extract further only at a real second consumer.
//
// The contract: given the target's viewport rect, the card's rendered size and the viewport, pick
// a side (below → above → right → left, first that fits whole), clamp the card fully on-screen,
// and place the beacon dot at the midpoint of the target edge FACING the card, centered in the
// gap. The card must never cover the target — the user has to click it — which is what the gap
// and the side preference exist for; only the nothing-fits fallback (a huge card in a tiny
// viewport) may overlap, and it picks the roomier vertical side so the overlap is minimal.
//
// Tuning constants (owned here, per the doc rule):
//   ANCHOR_GAP    18px — element edge → card edge. Wide enough for the beacon dot + halo to sit
//                 between the spotlight ring (element + ~12px of border and pulse) and the card.
//   VIEWPORT_PAD  12px — the card never touches the viewport edge; matches the widget's outer
//                 margins so an edge-clamped card still reads as deliberate.

export const ANCHOR_GAP = 18;
export const VIEWPORT_PAD = 12;

export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}
export interface AnchorSize {
  width: number;
  height: number;
}
export type AnchorSide = 'below' | 'above' | 'right' | 'left';
export interface CardPlacement {
  top: number;
  left: number;
  side: AnchorSide;
  /** The dot marking the anchor point. Hidden when the point itself is scrolled out of the
   *  viewport — a dot pinned at the screen edge would point at nothing. */
  beacon: { x: number; y: number; visible: boolean };
}

export function placeCard(target: AnchorRect, card: AnchorSize, viewport: AnchorSize): CardPlacement {
  const targetRight = target.left + target.width;
  const targetBottom = target.top + target.height;
  const centerX = target.left + target.width / 2;
  const centerY = target.top + target.height / 2;
  // Clamps keep the card whole on-screen; the outer Math.max keeps a too-wide card pinned to the
  // leading edge (never a negative coordinate) instead of oscillating.
  const clampX = (x: number): number =>
    Math.min(Math.max(x, VIEWPORT_PAD), Math.max(VIEWPORT_PAD, viewport.width - VIEWPORT_PAD - card.width));
  const clampY = (y: number): number =>
    Math.min(Math.max(y, VIEWPORT_PAD), Math.max(VIEWPORT_PAD, viewport.height - VIEWPORT_PAD - card.height));

  const fitsBelow = targetBottom + ANCHOR_GAP + card.height <= viewport.height - VIEWPORT_PAD;
  const fitsAbove = target.top - ANCHOR_GAP - card.height >= VIEWPORT_PAD;
  const fitsRight = targetRight + ANCHOR_GAP + card.width <= viewport.width - VIEWPORT_PAD;
  const fitsLeft = target.left - ANCHOR_GAP - card.width >= VIEWPORT_PAD;

  let side: AnchorSide;
  if (fitsBelow) side = 'below';
  else if (fitsAbove) side = 'above';
  else if (fitsRight) side = 'right';
  else if (fitsLeft) side = 'left';
  // Nothing fits whole: take the roomier vertical side; the clamps absorb the shortfall.
  else side = viewport.height - targetBottom >= target.top ? 'below' : 'above';

  let top: number;
  let left: number;
  if (side === 'below') {
    top = clampY(targetBottom + ANCHOR_GAP);
    left = clampX(centerX - card.width / 2);
  } else if (side === 'above') {
    top = clampY(target.top - ANCHOR_GAP - card.height);
    left = clampX(centerX - card.width / 2);
  } else if (side === 'right') {
    top = clampY(centerY - card.height / 2);
    left = clampX(targetRight + ANCHOR_GAP);
  } else {
    top = clampY(centerY - card.height / 2);
    left = clampX(target.left - ANCHOR_GAP - card.width);
  }

  let beaconX: number;
  let beaconY: number;
  if (side === 'below') {
    beaconX = centerX;
    beaconY = targetBottom + ANCHOR_GAP / 2;
  } else if (side === 'above') {
    beaconX = centerX;
    beaconY = target.top - ANCHOR_GAP / 2;
  } else if (side === 'right') {
    beaconX = targetRight + ANCHOR_GAP / 2;
    beaconY = centerY;
  } else {
    beaconX = target.left - ANCHOR_GAP / 2;
    beaconY = centerY;
  }
  const visible = beaconX >= 0 && beaconX <= viewport.width && beaconY >= 0 && beaconY <= viewport.height;

  return { top, left, side, beacon: { x: beaconX, y: beaconY, visible } };
}
