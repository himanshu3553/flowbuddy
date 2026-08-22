import type { CapturedEvent } from '@flowbuddy/shared';
import { momentSignature } from './boundary-learning';

/**
 * Edit carry-over on Replace (workflow-editing arc follow-up) — the pure half.
 *
 * Founder edits are scoped to the recording they were made on: a recording is a frozen snapshot
 * of the product, so when the founder re-records a task and REPLACES the old workflow, the new
 * telling comes out fresh from the model. Many of the old edits still apply — the step that didn't
 * change is the same step. This matches old edited steps to new steps by the same MOMENT signature
 * boundary learning transfers across recordings (event type + screen + control label, resolved
 * from each recording's own manifest), so the founder can be OFFERED the carry-over as a
 * reviewable list — never applied silently, because the product may have changed exactly that step.
 *
 * Precision first, as everywhere in the arc: a pairing needs exactly ONE step with that signature
 * on each side — any ambiguity means no offer (a wrong carry-over puts stale words on a changed
 * step). Image picks are never carried: frames belong to their recording.
 */

export interface CarryStep {
  itemId: string;
  keyEventId: string | null;
}

/** `oldItemId → newItemId` for every unambiguous same-moment pair. */
export function matchStepsByMoment(
  oldSteps: CarryStep[],
  oldEvents: CapturedEvent[],
  newSteps: CarryStep[],
  newEvents: CapturedEvent[],
): Map<string, string> {
  const index = (steps: CarryStep[], events: CapturedEvent[]) => {
    const byId = new Map(events.map((e) => [e.id, e]));
    const bySig = new Map<string, string[]>();
    for (const s of steps) {
      const ev = s.keyEventId ? byId.get(s.keyEventId) : undefined;
      const sig = ev ? momentSignature(ev) : null;
      if (!sig) continue;
      const key = `${sig.type}|${sig.route}|${sig.control}`;
      bySig.set(key, [...(bySig.get(key) ?? []), s.itemId]);
    }
    return bySig;
  };
  const oldBySig = index(oldSteps, oldEvents);
  const newBySig = index(newSteps, newEvents);
  const out = new Map<string, string>();
  for (const [key, oldIds] of oldBySig) {
    const newIds = newBySig.get(key);
    if (oldIds.length === 1 && newIds?.length === 1) out.set(oldIds[0]!, newIds[0]!);
  }
  return out;
}
