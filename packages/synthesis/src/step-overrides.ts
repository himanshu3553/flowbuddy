import type { DistilledStep, EditedStepField } from './distill';

/**
 * Founder step edits surviving a reprocess — the pure half.
 *
 * A reprocess deletes and recreates every KnowledgeItem, so a founder's edits would silently revert
 * to model output. The worker prevents that by re-attaching stored edits to the freshly distilled
 * steps BY ANCHOR: the edit belongs to the step whose `data.keyEventId` it was made on, and event
 * ids are stable across reprocesses of the same recording (they come from the manifest, which never
 * changes). Two kinds of edit ride this, marked by `data.editedFields`:
 *
 * - `'text'` — instruction/detail, the founder's words.
 * - `'image'` — the step's frame, switched to another frame CAPTURED BY THE SAME RECORDING
 *   (Studio validates the choice against the manifest). The frame's `bbox` rides with it: an
 *   action frame carries its own target rect, an "after" frame carries none — re-applying restores
 *   exactly what the save wrote, highlight included.
 *
 * A row with `editedAt` set but NO field list is a text edit from before images were editable.
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

export interface StepOverride {
  editedFields: EditedStepField[];
  /** Present when `editedFields` includes 'text'. */
  instruction?: string;
  detail?: string;
  /** Present when `editedFields` includes 'image'. */
  screenshotFile?: string;
  /** The picked frame's own target rect, when it has one — rides with 'image' so a reprocess
   *  restores the highlight exactly as the save wrote it. Absent = the pick cleared it. */
  bbox?: DistilledStep['bbox'];
  editedAt: Date;
  editedById: string | null;
}

/** Index stored edits by their anchor. Rows without an anchor are skipped (pre-Sense rows have no
 *  `keyEventId` — there is nothing to re-attach them by), and so is an edit marker whose payload is
 *  missing. When two rows share an anchor, the LATEST edit wins. */
export function stepOverridesByKeyEvent(rows: EditedStepRow[]): Map<string, StepOverride> {
  const out = new Map<string, StepOverride>();
  for (const row of rows) {
    const d = (row.data ?? {}) as {
      keyEventId?: unknown;
      instruction?: unknown;
      detail?: unknown;
      screenshotFile?: unknown;
      bbox?: unknown;
      editedFields?: unknown;
    };
    const key = typeof d.keyEventId === 'string' ? d.keyEventId : '';
    if (!key) continue;
    const fields = Array.isArray(d.editedFields)
      ? d.editedFields.filter((f): f is EditedStepField => f === 'text' || f === 'image')
      : (['text'] as EditedStepField[]); // legacy: edited before images were editable
    const instruction = typeof d.instruction === 'string' ? d.instruction.trim() : '';
    const screenshotFile = typeof d.screenshotFile === 'string' && d.screenshotFile ? d.screenshotFile : '';

    const o: StepOverride = { editedFields: [], editedAt: row.editedAt, editedById: row.editedById };
    if (fields.includes('text') && instruction) {
      o.editedFields.push('text');
      o.instruction = instruction;
      const detail = typeof d.detail === 'string' ? d.detail.trim() : '';
      if (detail) o.detail = detail;
    }
    if (fields.includes('image') && screenshotFile) {
      o.editedFields.push('image');
      o.screenshotFile = screenshotFile;
      const b = d.bbox as { x?: unknown; y?: unknown; w?: unknown; h?: unknown } | null | undefined;
      if (b && [b.x, b.y, b.w, b.h].every((n) => typeof n === 'number')) {
        o.bbox = b as DistilledStep['bbox'];
      }
    }
    if (o.editedFields.length === 0) continue;

    const existing = out.get(key);
    if (existing && existing.editedAt >= row.editedAt) continue;
    out.set(key, o);
  }
  return out;
}

/** Re-apply overrides to freshly distilled steps, in place. Returns the anchors that found their
 *  step — the caller diffs against the override map to count LOST edits. A text override with no
 *  detail CLEARS the model's detail (the founder saw both fields and saved what they meant); an
 *  image override restores the picked frame's own `bbox` — or clears it when the pick had none.
 *  The step is stamped with `editedFields` so the persisted row tells the NEXT reprocess exactly
 *  what to carry again. */
export function applyStepOverrides(
  steps: DistilledStep[],
  overrides: Map<string, StepOverride>,
): Set<string> {
  const applied = new Set<string>();
  if (overrides.size === 0) return applied;
  for (const step of steps) {
    const key = step.keyEventId;
    if (!key) continue;
    const o = overrides.get(key);
    if (!o) continue;
    if (o.editedFields.includes('text') && o.instruction) {
      step.instruction = o.instruction;
      if (o.detail) step.detail = o.detail;
      else delete step.detail;
    }
    if (o.editedFields.includes('image') && o.screenshotFile) {
      step.screenshotFile = o.screenshotFile;
      if (o.bbox) step.bbox = o.bbox;
      else delete step.bbox;
    }
    step.editedFields = o.editedFields;
    applied.add(key);
  }
  return applied;
}
