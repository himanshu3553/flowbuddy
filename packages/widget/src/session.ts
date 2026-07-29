// Per-tab session storage for the widget — the ONE place that owns versioning, workspace-key
// scoping, lifecycle timestamps, TTL, and the silent discard of anything foreign/expired/corrupt.
//
// WHY THIS IS GENERIC (2026-07-26, P5-M0 cut 1). The guided walkthrough (P4-M0) proved the pattern
// for itself: a full-page navigation unloads the widget, so any process that spans pages has to
// leave its state behind and pick it back up on the next one. That is not a walkthrough problem —
// it is THE transport problem for every mode of the product (docs/build/agent.md §7 Q1):
//
//   'walkthrough'  P4-M0 guided-run state ..................... modes 1 + 2   (built)
//   'chat'         P5-M0 the conversation thread .............. modes 1 + 2   (built — this cut)
//   'agent-run'    the unified agent's resumable run state .... modes 2 + 3   (planned)
//
// So the mechanics live here once and each consumer brings only its own domain shape. A new
// consumer adds a slot and a version; it never re-implements TTL, scoping, or corrupt-discard,
// and it cannot forget to stamp its own timestamps.
//
// POSTURE (inherited from the walkthrough, unchanged): sessionStorage only — tab-scoped and gone
// when the tab closes, never localStorage. Every operation is BEST-EFFORT: privacy mode, a quota
// error, or a host page that blocks storage degrades the feature to single-page-view behavior and
// never throws into the host page. Anything unreadable is discarded silently, never repaired.
//
// TRUST: the host page shares this origin and can write these keys itself. Everything read back is
// untrusted input — each consumer passes a `validate` predicate and caps what it is willing to
// accept. The store guarantees the envelope; the consumer guarantees its own payload.

/** One storage slot per independent piece of cross-page state. */
export type SessionSlot = 'walkthrough' | 'chat';

export interface SessionSpec<T> {
  slot: SessionSlot;
  /** Bump whenever the stored shape changes — the version is part of the storage key, so an older
   *  record is orphaned rather than misread (there is no cross-version parse to get wrong). */
  version: number;
  /** Age (since the last write) past which the record is treated as absent. */
  ttlMs: number;
  /** Consumer-side sanity check on the payload. Returning false discards the record. */
  validate: (data: T) => boolean;
}

export interface StoredSession<T> {
  data: T;
  /** When this session was first written (preserved across rewrites). */
  createdAt: number;
  /** When it was last written. */
  updatedAt: number;
  /** Convenience: how stale the record is right now. Consumers use it for finer-grained decisions
   *  than the TTL allows — e.g. "restore the thread, but only re-open the panel if it's live." */
  ageMs: number;
}

/** The stored record. `v` lives in the key, not the body, so a version bump cannot even read this. */
interface Envelope<T> {
  k: string;
  createdAt: number;
  updatedAt: number;
  data: T;
}

function storageKey(slot: SessionSlot, version: number): string {
  return `flowbuddy.${slot}.v${version}`;
}

/** Read this slot's live session, or null when there is none we can trust. */
export function readSession<T>(spec: SessionSpec<T>, key: string): StoredSession<T> | null {
  try {
    const raw = sessionStorage.getItem(storageKey(spec.slot, spec.version));
    if (!raw) return null;
    const env = JSON.parse(raw) as Partial<Envelope<T>> | null;
    if (!env || typeof env !== 'object') return null;
    if (env.k !== key) return null; // another workspace's embed on the same origin
    if (typeof env.createdAt !== 'number' || typeof env.updatedAt !== 'number') return null;
    const ageMs = Date.now() - env.updatedAt;
    // A negative age means the clock moved backwards (or the record was forged) — discard either way.
    if (ageMs < 0 || ageMs > spec.ttlMs) return null;
    if (env.data == null || !spec.validate(env.data)) return null;
    return { data: env.data, createdAt: env.createdAt, updatedAt: env.updatedAt, ageMs };
  } catch {
    return null; // unparseable, or storage is blocked — the caller behaves as if there were none
  }
}

/** Write (or refresh) this slot's session. `createdAt` survives rewrites; `updatedAt` re-anchors the TTL. */
export function writeSession<T>(spec: SessionSpec<T>, key: string, data: T): void {
  const now = Date.now();
  // Read-modify-write so the original creation stamp is preserved — "how long has this run been
  // going?" is lifecycle metadata only the store can keep honest across a page navigation.
  const existing = readSession(spec, key);
  const env: Envelope<T> = { k: key, createdAt: existing?.createdAt ?? now, updatedAt: now, data };
  try {
    sessionStorage.setItem(storageKey(spec.slot, spec.version), JSON.stringify(env));
  } catch {
    /* privacy mode / quota — the feature still works within this page view, just not across one */
  }
}

/** Drop this slot's session. */
export function clearSession<T>(spec: SessionSpec<T>): void {
  try {
    sessionStorage.removeItem(storageKey(spec.slot, spec.version));
  } catch {
    /* best-effort */
  }
}

/** Cheap "is there a live session in this slot?" — for callers that must decide without resuming. */
export function peekSession<T>(spec: SessionSpec<T>, key: string): boolean {
  return readSession(spec, key) !== null;
}
