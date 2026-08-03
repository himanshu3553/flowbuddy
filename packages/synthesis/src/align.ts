import type { CapturedEvent } from '@flowbuddy/shared';
import type { Transcript } from './transcribe';

// Narration explaining an action usually comes slightly before or during it.
const LEAD_MS = 4000;
const TRAIL_MS = 1500;

/** Attach the narration spoken around each event (by timestamp window). */
export function alignNarration(events: CapturedEvent[], transcript: Transcript): Map<string, string> {
  const byEvent = new Map<string, string>();
  for (const ev of events) {
    const lo = ev.t - LEAD_MS;
    const hi = ev.t + TRAIL_MS;
    const text = transcript.segments
      .filter((s) => s.start >= lo && s.start <= hi)
      .map((s) => s.text)
      .join(' ')
      .trim();
    if (text) byEvent.set(ev.id, text);
  }
  return byEvent;
}

// How long a workflow's narration keeps running PAST its last click — enough for "…and there it is,
// saved", which belongs to the task that just finished rather than the one about to start. There is
// no matching lead constant on purpose: see below.
const WORKFLOW_TRAIL_MS = 5000;

/**
 * The narration spoken FOR one workflow — the run-up to its clicks, not a fixed pad around them.
 *
 * WHY THIS EXISTS. `describeWorkflow` reads a fixed head of whatever transcript it is handed, and it
 * used to be handed the whole recording's for every workflow. Past that head, workflow 1 is described
 * from workflow 1's narration and so is every workflow after it. The prompt forbids inventing, so the
 * model's only remaining move is a bland one-line summary — the failure reads as vagueness rather
 * than as an error, and it deepens the more a founder invests in one long recording.
 *
 * THE RULE: every moment of narration belongs to the workflow that owns the NEXT event after it.
 * Talking without clicking is set-up for what is about to happen. A fixed lead cannot express this —
 * people explain for minutes before they act ("a chatbot is…, you'll need your site URL handy, and
 * you can either upload a doc or point it at a URL"), and prerequisites and choices are exactly what
 * a PLAN is made of. Anything short enough to be safe near a boundary is far too short for a real
 * preamble. What falls out:
 *   · Talk before the recording's first click → the first workflow, however long it ran.
 *   · Talk between two of one workflow's own clicks → that workflow, with no gap cap needed.
 *   · Talk between workflow A's last click and B's first → B, because it is B's set-up. A still
 *     keeps WORKFLOW_TRAIL_MS past its own last click, so the two overlap by a few seconds there.
 *     That overlap is deliberate and is the only direction bleed can happen.
 *   · A workflow the founder RETURNS to starts counting from the intervening workflow's last event,
 *     never before it. Segments are NOT guaranteed contiguous — `segment.ts` rebuilds each
 *     workflow's eventIds by assignment, not by adjacency — so an interleaved recording is a real
 *     case, and a first-click-to-last-click span would swallow the whole intervening task.
 *
 * Note this hands the describer MORE than it can use on a long tour; keeping the right end of it is
 * `describe.ts`'s job (see `keepTail` — trimming the wrong end recreates the bug inside one workflow).
 *
 * Returns '' when nothing overlaps — no segments at all, or a degraded transcription. The caller must
 * decide what that means; it is NOT the same as "the founder said nothing" here.
 *
 * Unlike `alignNarration` this tests OVERLAP rather than segment start: a sentence that began before
 * the run-up opened is still being spoken inside it.
 *
 * `allEvents` must contain `workflowEvents` — it is the recording's full cleaned event list, which is
 * what makes "the next event after this moment" answerable at all.
 */
export function transcriptWindow(
  workflowEvents: CapturedEvent[],
  allEvents: CapturedEvent[],
  transcript: Transcript,
): string {
  if (workflowEvents.length === 0 || transcript.segments.length === 0) return '';
  const mine = new Set(workflowEvents.map((e) => e.id));

  // Walk the WHOLE recording in time order. Each of this workflow's events closes a run that opened
  // at the last foreign event (or at the recording's start, when nothing foreign has happened yet).
  // Runs from consecutive own-events share a `from` and so always overlap — the merge below collapses
  // them; a foreign event between them is what forces a genuine break.
  const ordered = [...allEvents].sort((a, b) => a.t - b.t);
  const runs: { from: number; to: number }[] = [];
  let from = 0;
  for (const ev of ordered) {
    if (mine.has(ev.id)) runs.push({ from, to: ev.t + WORKFLOW_TRAIL_MS });
    else from = ev.t;
  }
  if (runs.length === 0) return '';

  const merged: { from: number; to: number }[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r.from <= last.to) last.to = Math.max(last.to, r.to);
    else merged.push({ ...r });
  }

  return transcript.segments
    .filter((s) => merged.some((r) => s.end >= r.from && s.start <= r.to))
    .map((s) => s.text)
    .join(' ')
    .trim();
}
