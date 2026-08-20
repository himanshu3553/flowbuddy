import type { CapturedEvent } from '@flowbuddy/shared';
import { stepFromEvent, type DistilledStep } from './distill';

/**
 * Founder step INCLUSION (delete + restore-from-capture) — the pure half, applied inside the
 * rebuild so both edits survive every reprocess, like the rest of the founder's layer:
 *
 * - `removed` — captured moments the founder took OUT: a freshly distilled step whose anchor is on
 *   this list is dropped again on every rebuild.
 * - `added` — pruned captured moments the founder put BACK: re-inserted at their timeline position
 *   with the founder's instruction and the EVENT's own anchor (`stepFromEvent`). An addition whose
 *   event already became a step is skipped (the distiller kept it this time — nothing to restore);
 *   one whose event left the cleaned timeline entirely is reported lost, never guessed at.
 *
 * The shape lives on the RECORDING (`KnowledgeSource.stepInclusions` — the column comment owns it),
 * keyed by anchor event ids, because an event belongs to exactly one workflow: the caller applies
 * this per segment with that segment's own events, and additions land wherever their event lives.
 */

export interface StepAddition {
  keyEventId: string;
  instruction: string;
  detail?: string;
}

export interface StepInclusions {
  removed: string[];
  added: StepAddition[];
}

/** Parse the stored Json shape, trusting nothing — only well-formed entries survive. */
export function parseStepInclusions(raw: unknown): StepInclusions | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as { removed?: unknown; added?: unknown };
  const removed = Array.isArray(o.removed)
    ? o.removed.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
  const added = Array.isArray(o.added)
    ? o.added.flatMap((a): StepAddition[] => {
        const e = (a ?? {}) as { keyEventId?: unknown; instruction?: unknown; detail?: unknown };
        if (typeof e.keyEventId !== 'string' || !e.keyEventId) return [];
        if (typeof e.instruction !== 'string' || !e.instruction.trim()) return [];
        return [
          {
            keyEventId: e.keyEventId,
            instruction: e.instruction,
            ...(typeof e.detail === 'string' && e.detail.trim() ? { detail: e.detail } : {}),
          },
        ];
      })
    : [];
  if (removed.length === 0 && added.length === 0) return null;
  return { removed, added };
}

/** Apply the founder's inclusion edits to ONE workflow's freshly distilled steps, in timeline
 *  order. Returns the new step list plus which additions landed — the caller diffs across all
 *  segments to count LOST additions for the recording's notice. */
export function applyStepInclusions(
  steps: DistilledStep[],
  segEvents: CapturedEvent[],
  narration: Map<string, string>,
  inclusions: StepInclusions,
): { steps: DistilledStep[]; appliedAdditions: Set<string> } {
  const removed = new Set(inclusions.removed);
  const eventIndex = new Map(segEvents.map((e, i) => [e.id, i]));
  const appliedAdditions = new Set<string>();

  let out = steps.filter((s) => !s.keyEventId || !removed.has(s.keyEventId));
  const present = new Set(out.map((s) => s.keyEventId).filter(Boolean));

  for (const a of inclusions.added) {
    const evIdx = eventIndex.get(a.keyEventId);
    if (evIdx == null || present.has(a.keyEventId) || removed.has(a.keyEventId)) continue;
    const step = stepFromEvent(segEvents[evIdx]!, narration, a.instruction, a.detail);
    const pos = out.findIndex((s) => {
      const i = s.keyEventId ? eventIndex.get(s.keyEventId) : undefined;
      return i != null && i > evIdx;
    });
    out = pos === -1 ? [...out, step] : [...out.slice(0, pos), step, ...out.slice(pos)];
    present.add(a.keyEventId);
    appliedAdditions.add(a.keyEventId);
  }
  return { steps: out, appliedAdditions };
}
