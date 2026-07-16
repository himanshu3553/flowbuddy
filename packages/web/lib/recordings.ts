import type { SessionManifest, CapturedEvent } from '@flowbuddy/shared';

// Server-only helpers that derive HONEST per-recording facts from the raw capture manifest
// (events, screenshots, audio) — replacing the hardcoded "screen·voice·DOM·events·routes" string
// that every recording used to show regardless of what it actually captured.

/** Narrow the persisted JSON manifest into the capture shape (defensively). */
export function asManifest(raw: unknown): SessionManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Partial<SessionManifest>;
  if (!Array.isArray(m.events)) return null;
  return m as SessionManifest;
}

/** The screenshot relative path for an event, if any (post-action shot preferred). */
function eventShot(ev: CapturedEvent): string | null {
  return ev.postAction?.screenshot?.file || ev.screenshot?.file || null;
}

export interface RecordingMeta {
  durationMs: number;
  eventCount: number;
  screenshotCount: number;
  hasAudio: boolean;
  /** Which capture layers are *actually* present, e.g. ['Screen','Voice','Events','Routes']. */
  layers: string[];
  /** First captured screenshot (relative key) — used as the list thumbnail. */
  firstShotRel: string | null;
  /** Narration audio (relative key) — fed to the replay player. */
  audioRel: string | null;
}

export function deriveRecordingMeta(manifest: SessionManifest | null): RecordingMeta {
  if (!manifest) {
    return {
      durationMs: 0,
      eventCount: 0,
      screenshotCount: 0,
      hasAudio: false,
      layers: [],
      firstShotRel: null,
      audioRel: null,
    };
  }
  const events = manifest.events ?? [];
  let screenshotCount = 0;
  let firstShotRel: string | null = null;
  let hasDom = false;
  let hasRoute = false;
  for (const ev of events) {
    const shot = eventShot(ev);
    if (shot) {
      screenshotCount++;
      if (!firstShotRel) firstShotRel = shot;
    }
    if (ev.domSnapshot?.file || ev.postAction?.domSnapshot?.file) hasDom = true;
    if (ev.route?.path || ev.postAction?.route?.path) hasRoute = true;
  }

  const audioRel = manifest.audio?.file ?? null;
  const lastEventT = events.length ? events[events.length - 1]?.t ?? 0 : 0;
  const durationMs = manifest.audio?.durationMs ?? lastEventT;

  const layers: string[] = [];
  if (screenshotCount > 0) layers.push('Screen');
  if (audioRel) layers.push('Voice');
  if (hasDom) layers.push('DOM');
  if (events.length > 0) layers.push('Events');
  if (hasRoute) layers.push('Routes');

  return {
    durationMs,
    eventCount: events.length,
    screenshotCount,
    hasAudio: !!audioRel,
    layers,
    firstShotRel,
    audioRel,
  };
}

export interface TimelineEvent {
  id: string;
  t: number;
  type: string;
  /** Human label for the acted-on element (accessible name / text / role). */
  label: string;
  routePath: string | null;
  shotRel: string | null;
}

/** Flatten the manifest into an ordered, display-ready event timeline for the detail view. */
export function timelineEvents(manifest: SessionManifest | null): TimelineEvent[] {
  if (!manifest) return [];
  return (manifest.events ?? []).map((ev, i) => {
    const tgt = ev.target ?? {};
    const label =
      tgt.accessibleName?.trim() ||
      tgt.text?.trim() ||
      (tgt.role ? tgt.role : '') ||
      (ev.value ? `"${ev.value}"` : '') ||
      tgt.tag ||
      '';
    return {
      id: ev.id || `ev-${i}`,
      t: ev.t ?? 0,
      type: String(ev.type),
      label,
      routePath: ev.route?.path || ev.postAction?.route?.path || null,
      shotRel: eventShot(ev),
    };
  });
}

/** A recording sitting in uploaded/processing longer than this has lost its job (Redis wipe,
 *  worker crash between retries) — surface it as "Stalled" so the owner reaches for Re-process
 *  instead of watching a progress bar forever. Normal synthesis completes in a few minutes. */
export const STALLED_AFTER_MS = 15 * 60_000;

/** Stalled = still "in flight" but untouched for STALLED_AFTER_MS. `updatedAt` (not createdAt)
 *  so a just-re-processed old recording counts from the status flip, not from upload day. */
export function isRecordingStalled(status: string, updatedAt: Date, now: number = Date.now()): boolean {
  return (
    (status === 'uploaded' || status === 'processing') &&
    now - updatedAt.getTime() > STALLED_AFTER_MS
  );
}

/** Bucket a raw KnowledgeSource status into the labels the UI shows everywhere. */
export function recordingStatusBadge(
  status: string,
  opts: { stalled?: boolean } = {},
): { label: 'Ready' | 'Processing' | 'Failed' | 'Stalled'; tone: 'success' | 'pending' | 'danger' } {
  if (status === 'ready' || status === 'done') return { label: 'Ready', tone: 'success' };
  if (status === 'uploaded' || status === 'processing')
    return opts.stalled ? { label: 'Stalled', tone: 'danger' } : { label: 'Processing', tone: 'pending' };
  return { label: 'Failed', tone: 'danger' };
}

/** Format a ms duration as "1:23" (or "0:05"). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Compact relative time, e.g. "just now", "3h ago", "2d ago". */
export function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
