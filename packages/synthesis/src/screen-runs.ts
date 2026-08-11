import type { CapturedEvent } from '@flowbuddy/shared';
import { routePattern } from '@flowbuddy/shared/route-pattern';
import {
  buildFingerprint,
  isIdentifiable,
  type ScreenFingerprint,
} from '@flowbuddy/shared/screen-fingerprint';
import { redactText } from './redact';

/**
 * Every screen a recording passed through → what it looked like. ONE implementation, two consumers
 * on purpose (extracted from the sense-plan builder when the execution-contract compiler became the
 * second): the probe's idea of a screen and the contract's must never drift apart.
 *
 * A screen is keyed by WHEN, not by where: a maximal run of consecutive events sharing a route
 * pattern. Keying by route instead would have defeated the whole point — on an app that lives at one
 * path (the case the URL can't serve at all) every screen of the recording would land in a single
 * bucket and identify nothing.
 *
 * The labels come from the elements the founder actually touched: an accessible name if the capture
 * has one, else the element's own visible text. Those are the app's chrome — button captions, field
 * labels, tab names — which is exactly what stays put when the record changes.
 *
 * KNOWN LIMIT, and it fails safe. Two screens with no route change between them (a wizard advancing
 * in place) merge into one run, so their anchors mix and neither screen recalls enough of the merged
 * set to clear the threshold. The fingerprint then declines to identify anything and the widget
 * behaves exactly as it did before — a miss, never a wrong screen.
 *
 * Two exclusions are deliberate: **typed values never enter** (a fingerprint is what the screen
 * says, not what the founder typed into it), and every label is scrubbed on the way out, because
 * this text ships to every embed and the account it was read from is the founder's own.
 */
export function buildScreens(events: CapturedEvent[]): {
  screens: Map<string, ScreenFingerprint>;
  byEventId: Map<string, string>;
} {
  const runs: Array<{ key: string; title: string; labels: string[] }> = [];
  const byEventId = new Map<string, string>();
  let lastPattern: string | null = null;

  for (const ev of events) {
    const pattern = routePattern(ev.route?.path ?? '');
    let run = runs[runs.length - 1];
    if (!run || pattern !== lastPattern) {
      run = { key: `s${runs.length}`, title: ev.route?.title ?? '', labels: [] };
      runs.push(run);
      lastPattern = pattern;
    }
    if (!run.title && ev.route?.title) run.title = ev.route.title;
    const label = ev.target?.accessibleName || ev.target?.text || '';
    if (label) run.labels.push(label);
    byEventId.set(ev.id, run.key);
  }

  const screens = new Map<string, ScreenFingerprint>();
  for (const run of runs) {
    const fp = buildFingerprint(redactText(run.title), run.labels.map((l) => redactText(l)));
    if (isIdentifiable(fp)) screens.set(run.key, fp); // an unidentifiable screen is dead payload
  }
  for (const [eventId, key] of byEventId) if (!screens.has(key)) byEventId.delete(eventId);
  return { screens, byEventId };
}
