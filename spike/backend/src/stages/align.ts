import type { CapturedEvent, Transcript } from '../types.js';

/**
 * Attach the narration spoken around each event. Heuristic: collect transcript
 * segments whose start falls in [event.t - LEAD, event.t + TRAIL]. Narration that
 * explains an action usually comes slightly before or during it.
 */
const LEAD_MS = 4000;
const TRAIL_MS = 1500;

export function alignNarration(
  events: CapturedEvent[],
  transcript: Transcript,
): Map<string, string> {
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
