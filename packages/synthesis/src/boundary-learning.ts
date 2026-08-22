import type { CapturedEvent } from '@flowbuddy/shared';
import { routeMatchStrength, routePattern } from '@flowbuddy/shared/route-pattern';

/**
 * Boundary learning (workflow-editing arc, item 5) — every founder boundary correction becomes
 * permanent product knowledge: "in this product, a task starts at this moment."
 *
 * A LESSON is a signature of a boundary moment — the event's type, its id-scrubbed ROUTE PATTERN
 * (the one shared matcher, never string equality), and its CONTROL identity by LABEL. Labels, not
 * css paths: markup positions drift between sessions of the same product, names don't — the same
 * transfer reasoning as Sense's screen fingerprints. On a FUTURE recording, a matching event
 * becomes a hard cut point exactly like a founder-pressed marker: deterministic, structural, the
 * model still segments freely WITHIN spans. A recording's own drawn boundaries always supersede.
 *
 * Precision beats recall everywhere here, because a false cut costs founder trust while a missed
 * one costs nothing (the model still segments):
 *  - an event with NO transferable label teaches nothing (fail-closed);
 *  - an EMPTY route means unknown, never "the root" — it teaches and matches nothing;
 *  - a signature that is SELF-AMBIGUOUS in its own recording (also present at a non-boundary
 *    moment) is never learned — an unreliable teacher teaches nothing;
 *  - matching requires the SAME screen (route strength 2), never a prefix.
 *
 * Corrections converge instead of accumulating: when a founder saves boundaries and an event that
 * MATCHES an existing lesson is deliberately not a start, that contradiction is recorded as a
 * `not-start` signature, and aggregation is NEWEST-WINS per signature — the founder's latest
 * judgment steers, and a wrong lesson dies the first time it is corrected (application is
 * automatic on purpose: the remedy for a wrong cut is the same Reorganize page that teaches).
 */

export interface BoundarySignature {
  kind: 'start' | 'not-start';
  /** Event type of the boundary moment (click / submit / nav / input). */
  type: string;
  /** Id-scrubbed route pattern of the moment's screen. */
  route: string;
  /** Transferable control identity: `tag:normalized-label`. */
  control: string;
  /** When the founder taught it (ISO) — newest wins on conflict. */
  at: string;
}

const sigKey = (s: Pick<BoundarySignature, 'type' | 'route' | 'control'>): string =>
  `${s.type}|${s.route}|${s.control}`;

/** The control identity that transfers across recordings — label-based; null = nothing to learn. */
function controlSignature(ev: CapturedEvent): string | null {
  const t = ev.target ?? {};
  const label = (t.accessibleName || t.text || t.attributes?.placeholder || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 80);
  if (!label) return null;
  return `${(t.tag || '').toLowerCase()}:${label}`;
}

/** The transferable identity of a captured MOMENT — type + screen + control label. Exported for its
 *  second consumer (edit carry-over on Replace: edit-carryover.ts); null = nothing transferable. */
export function momentSignature(ev: CapturedEvent): Pick<BoundarySignature, 'type' | 'route' | 'control'> | null {
  const path = ev.route?.path ?? '';
  if (!path) return null;
  const control = controlSignature(ev);
  if (!control) return null;
  return { type: String(ev.type), route: routePattern(path), control };
}

/** Parse the stored Json column, trusting nothing. */
export function parseBoundarySignatures(raw: unknown): BoundarySignature[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x): BoundarySignature[] => {
    const s = (x ?? {}) as Partial<BoundarySignature>;
    if (s.kind !== 'start' && s.kind !== 'not-start') return [];
    if (typeof s.type !== 'string' || typeof s.route !== 'string' || typeof s.control !== 'string') return [];
    if (!s.type || !s.route || !s.control || typeof s.at !== 'string' || !s.at) return [];
    return [{ kind: s.kind, type: s.type, route: s.route, control: s.control, at: s.at }];
  });
}

/**
 * What THIS save teaches, derived from the founder's drawn boundaries on the cleaned timeline:
 * a `start` signature per boundary event (minus the self-ambiguous), plus a targeted `not-start`
 * for every event that matches an ACTIVE workspace lesson yet was deliberately not made a start.
 */
export function deriveBoundarySignatures(
  events: CapturedEvent[],
  startEventIds: string[],
  activeWorkspaceLessons: BoundarySignature[],
  at: string,
): BoundarySignature[] {
  const startSet = new Set(startEventIds);
  const startSigs = new Map<string, BoundarySignature>();
  const ambiguous = new Set<string>();

  for (const ev of events) {
    const s = momentSignature(ev);
    if (!s) continue;
    if (startSet.has(ev.id)) startSigs.set(sigKey(s), { kind: 'start', ...s, at });
  }
  for (const ev of events) {
    if (startSet.has(ev.id)) continue;
    const s = momentSignature(ev);
    if (!s) continue;
    if (startSigs.has(sigKey(s))) ambiguous.add(sigKey(s));
  }

  const out: BoundarySignature[] = [...startSigs.entries()]
    .filter(([key]) => !ambiguous.has(key))
    .map(([, sig]) => sig);

  const seenNegative = new Set<string>();
  for (const ev of events) {
    if (startSet.has(ev.id)) continue;
    const s = momentSignature(ev);
    if (!s || seenNegative.has(sigKey(s))) continue;
    const contradicts = activeWorkspaceLessons.some(
      (l) =>
        l.kind === 'start' &&
        l.type === s.type &&
        l.control === s.control &&
        routeMatchStrength(l.route, s.route) === 2,
    );
    if (contradicts) {
      seenNegative.add(sigKey(s));
      out.push({ kind: 'not-start', ...s, at });
    }
  }
  return out;
}

/** Aggregate every stored lesson in the workspace to the ACTIVE start set: newest wins per
 *  signature (a tie prefers the suppression — fail toward fewer cuts). */
export function activeBoundaryLessons(signatures: BoundarySignature[]): BoundarySignature[] {
  const byKey = new Map<string, BoundarySignature>();
  for (const s of signatures) {
    const key = sigKey(s);
    const cur = byKey.get(key);
    if (!cur || s.at > cur.at || (s.at === cur.at && s.kind === 'not-start')) byKey.set(key, s);
  }
  return [...byKey.values()].filter((s) => s.kind === 'start');
}

/** The events of a NEW recording where a learned boundary applies — each becomes a hard cut point. */
export function matchLearnedBoundaries(
  events: CapturedEvent[],
  activeLessons: BoundarySignature[],
): string[] {
  if (activeLessons.length === 0) return [];
  const out: string[] = [];
  for (const ev of events) {
    const s = momentSignature(ev);
    if (!s) continue;
    const hit = activeLessons.some(
      (l) => l.type === s.type && l.control === s.control && routeMatchStrength(l.route, s.route) === 2,
    );
    if (hit) out.push(ev.id);
  }
  return out;
}
