import { prisma } from '@flowbuddy/db';
import { config } from './config';

/**
 * P1-M9 — embed auth & tenant scoping for the public copilot endpoint.
 * The widget authenticates with a PUBLIC embeddable key (safe in client HTML), NOT the secret
 * recorder token. We resolve key → workspace, enforce an origin allowlist, and rate-limit per key.
 */

/** P2-M5 Reason — the workspace's diagnostic-path policy, resolved with the key so the answer
 *  route can gate the reasoning path without a second workspace read. */
export interface ReasonFlags {
  enabled: boolean;
  image: boolean;
  values: boolean;
}

export type CopilotAuthResult =
  | { ok: true; workspaceId: string; showCitations: boolean; reason: ReasonFlags }
  | { ok: false; status: number; error: string };

/** Resolve a public embeddable key → workspace, enforcing the origin allowlist (empty = allow any). */
export async function resolveCopilotKey(
  key: string | undefined,
  origin: string | undefined,
): Promise<CopilotAuthResult> {
  const k = (key ?? '').trim();
  if (!k) return { ok: false, status: 401, error: 'missing copilot key' };

  const ws = await prisma.workspace.findUnique({
    where: { copilotPublicKey: k },
    select: {
      id: true,
      copilotAllowedOrigins: true,
      copilotShowCitations: true,
      reasonEnabled: true,
      reasonImageEnabled: true,
      reasonIncludeValues: true,
    },
  });
  if (!ws) return { ok: false, status: 401, error: 'invalid copilot key' };

  const allow = ws.copilotAllowedOrigins ?? [];
  // Enforce only when an allowlist is configured AND the browser sent an Origin (server-to-server
  // calls have none — they can't be spoofed by a page, so we don't block them here). The Studio's
  // own origin is always allowed: the in-Studio real-widget tester runs on it, and a third-party
  // page can't forge Origin (browser-set), so this only admits pages we serve ourselves.
  if (allow.length > 0 && origin && origin !== config.studioOrigin && !allow.includes(origin)) {
    return { ok: false, status: 403, error: 'origin not allowed' };
  }
  return {
    ok: true,
    workspaceId: ws.id,
    showCitations: ws.copilotShowCitations,
    reason: { enabled: ws.reasonEnabled, image: ws.reasonImageEnabled, values: ws.reasonIncludeValues },
  };
}

/** In-memory fixed-window rate limiter, per key. MVP — production would back this with Redis.
 *  `max` lets a caller run a TIGHTER bucket (the P2-M5 reasoning path — the most expensive thing
 *  the product does per interaction — gets its own low ceiling on top of the normal one). */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, now: number = Date.now(), max: number = MAX_PER_WINDOW): boolean {
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}

/** Test-only: reset the limiter state. */
export function __resetRateLimit(): void {
  buckets.clear();
}

/**
 * Throttle the embed-detection heartbeat: the widget pings on every page load (and every answered
 * question stamps too), but we only need to touch the DB occasionally to keep "last seen" fresh.
 * Returns true at most once per window per key. In-memory (resets on restart — at worst one extra
 * write); good enough for a freshness signal.
 */
const SEEN_WINDOW_MS = 5 * 60_000;
const seenAt = new Map<string, number>();

function shouldRecordSeen(key: string, now: number = Date.now()): boolean {
  const last = seenAt.get(key);
  if (last !== undefined && now - last < SEEN_WINDOW_MS) return false;
  seenAt.set(key, now);
  return true;
}

/**
 * Stamp the workspace's embed-detection heartbeat. Called from BOTH the widget's mount ping (/seen)
 * and any answered question (/answer), so "copilot live" is confirmed by real usage too — not only
 * by a ping a privacy blocker might drop. Throttled per key so busy hosts don't hammer the row.
 */
export async function recordWidgetSeen(
  key: string,
  workspaceId: string,
  origin: string | undefined,
): Promise<void> {
  if (!shouldRecordSeen(key)) return;
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { widgetLastSeenAt: new Date(), widgetLastSeenOrigin: origin ?? null },
  });
}
