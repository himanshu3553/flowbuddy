/**
 * In-memory fixed-window limits for the auth surface (review §3.6 Cut 2) — the same MVP pattern
 * as the api's copilot limiter: per-process Maps, production would back this with Redis. Stashed
 * on globalThis so dev hot-reloads don't reset the counters.
 *
 * Two protections:
 *  - sign-in brute force: FAILED attempts are counted per-email AND per-IP; over the cap → block
 *    before the password is even checked (successful sign-in clears the email's counter).
 *  - email-request abuse (password-reset / resend-verification): requests are counted the same
 *    way so a bot can't mail-bomb an inbox or burn the Resend quota.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 15 * 60_000;
const MAX_FAILED_PER_EMAIL = 5;
const MAX_FAILED_PER_IP = 20;
const MAX_EMAIL_REQ_PER_EMAIL = 3;
const MAX_EMAIL_REQ_PER_IP = 10;

const g = globalThis as unknown as {
  __flowbuddyAuthFails?: Map<string, Bucket>;
  __flowbuddyAuthEmailReqs?: Map<string, Bucket>;
};
const fails = (g.__flowbuddyAuthFails ??= new Map());
const emailReqs = (g.__flowbuddyAuthEmailReqs ??= new Map());

function bump(map: Map<string, Bucket>, key: string, now: number): number {
  const b = map.get(key);
  if (!b || now >= b.resetAt) {
    map.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return 1;
  }
  b.count++;
  return b.count;
}

function current(map: Map<string, Bucket>, key: string, now: number): number {
  const b = map.get(key);
  return !b || now >= b.resetAt ? 0 : b.count;
}

const norm = (email: string) => email.trim().toLowerCase();

/** True = block this sign-in attempt outright (too many recent failures). */
export function signInBlocked(email: string, ip: string, now: number = Date.now()): boolean {
  return (
    current(fails, `e:${norm(email)}`, now) >= MAX_FAILED_PER_EMAIL ||
    current(fails, `ip:${ip}`, now) >= MAX_FAILED_PER_IP
  );
}

export function recordSignInFailure(email: string, ip: string, now: number = Date.now()): void {
  bump(fails, `e:${norm(email)}`, now);
  bump(fails, `ip:${ip}`, now);
}

/** A successful sign-in (or completed password reset) forgives the email's failure count. */
export function clearSignInFailures(email: string): void {
  fails.delete(`e:${norm(email)}`);
}

/** Gate for actions that SEND an email (reset / resend-verification). Counts the request. */
export function emailRequestAllowed(email: string, ip: string, now: number = Date.now()): boolean {
  return (
    bump(emailReqs, `e:${norm(email)}`, now) <= MAX_EMAIL_REQ_PER_EMAIL &&
    bump(emailReqs, `ip:${ip}`, now) <= MAX_EMAIL_REQ_PER_IP
  );
}
