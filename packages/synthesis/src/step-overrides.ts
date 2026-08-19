import type { DistilledStep } from './distill';

/**
 * Founder step edits surviving a reprocess — the pure half.
 *
 * A reprocess deletes and recreates every KnowledgeItem, so a founder's edited instruction/detail
 * would silently revert to model output. The worker prevents that by re-attaching stored edits to
 * the freshly distilled steps BY ANCHOR: the edit belongs to the step whose `data.keyEventId` it
 * was made on, and event ids are stable across reprocesses of the same recording (they come from
 * the manifest, which never changes).
 *
 * ORDER MATTERS: the worker applies these overrides BEFORE embedding, so the item's `text`, its
 * vector, the identity fingerprints and the execution-plan refresh all see the founder's words —
 * one text everywhere, never a patched copy (the vector write matches rows BY TEXT, so a
 * post-embedding patch would desync retrieval invisibly).
 *
 * An edit whose anchor no longer keys any step is LOST by design (the step it described is gone or
 * was re-keyed); the worker counts these and surfaces them in the recording's notice rather than
 * guessing a new home for them.
 */

/** A stored step row carrying a founder edit (`editedAt` set) — the worker's select shape. */
export interface EditedStepRow {
  data: unknown;
  editedAt: Date;
  editedById: string | null;
}

export interface StepTextOverride {
  instruction: string;
  detail?: string;
  editedAt: Date;
  editedById: string | null;
}

/** Index stored edits by their anchor. Rows without an anchor or an instruction are skipped
 *  (pre-Sense rows have no `keyEventId` — there is nothing to re-attach them by). When two rows
 *  share an anchor, the LATEST edit wins. */
export function stepOverridesByKeyEvent(rows: EditedStepRow[]): Map<string, StepTextOverride> {
  const out = new Map<string, StepTextOverride>();
  for (const row of rows) {
    const d = (row.data ?? {}) as { keyEventId?: unknown; instruction?: unknown; detail?: unknown };
    const key = typeof d.keyEventId === 'string' ? d.keyEventId : '';
    const instruction = typeof d.instruction === 'string' ? d.instruction.trim() : '';
    if (!key || !instruction) continue;
    const existing = out.get(key);
    if (existing && existing.editedAt >= row.editedAt) continue;
    out.set(key, {
      instruction,
      detail: typeof d.detail === 'string' && d.detail.trim() ? d.detail.trim() : undefined,
      editedAt: row.editedAt,
      editedById: row.editedById,
    });
  }
  return out;
}

/** Re-apply overrides to freshly distilled steps, in place. Returns the anchors that found their
 *  step — the caller diffs against the override map to count LOST edits. An override with no
 *  detail CLEARS the model's detail: the founder saw both fields and saved what they meant. */
export function applyStepTextOverrides(
  steps: DistilledStep[],
  overrides: Map<string, StepTextOverride>,
): Set<string> {
  const applied = new Set<string>();
  if (overrides.size === 0) return applied;
  for (const step of steps) {
    const key = step.keyEventId;
    if (!key) continue;
    const o = overrides.get(key);
    if (!o) continue;
    step.instruction = o.instruction;
    if (o.detail) step.detail = o.detail;
    else delete step.detail;
    applied.add(key);
  }
  return applied;
}
