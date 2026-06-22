import { prisma } from '@sync/db';

/**
 * P1-M9 — embed auth & tenant scoping for the public copilot endpoint.
 * The widget authenticates with a PUBLIC embeddable key (safe in client HTML), NOT the secret
 * recorder token. We resolve key → workspace, enforce an origin allowlist, and rate-limit per key.
 */

export type CopilotAuthResult =
  | { ok: true; workspaceId: string }
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
    select: { id: true, copilotAllowedOrigins: true },
  });
  if (!ws) return { ok: false, status: 401, error: 'invalid copilot key' };

  const allow = ws.copilotAllowedOrigins ?? [];
  // Enforce only when an allowlist is configured AND the browser sent an Origin (server-to-server
  // calls have none — they can't be spoofed by a page, so we don't block them here).
  if (allow.length > 0 && origin && !allow.includes(origin)) {
    return { ok: false, status: 403, error: 'origin not allowed' };
  }
  return { ok: true, workspaceId: ws.id };
}

/** In-memory fixed-window rate limiter, per key. MVP — production would back this with Redis. */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, now: number = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= MAX_PER_WINDOW) return false;
  b.count++;
  return true;
}

/** Test-only: reset the limiter state. */
export function __resetRateLimit(): void {
  buckets.clear();
}
