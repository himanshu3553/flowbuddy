import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@sync/db';

/**
 * Single-use auth action tokens (email verification + password reset), stored in the Auth.js
 * `VerificationToken` table — it was in the schema unused (JWT sessions, credentials-only), and
 * its shape is exactly this job: `identifier` (here `"<purpose>:<email>"`), `token`, `expires`.
 * No migration needed.
 *
 * Only the SHA-256 of the token is persisted (like ApiToken) — a DB leak exposes nothing usable;
 * the raw token exists only inside the emailed link.
 */

export type AuthTokenPurpose = 'verify' | 'reset';

const TTL_MS: Record<AuthTokenPurpose, number> = {
  verify: 24 * 60 * 60_000, // 24 h
  reset: 60 * 60_000, // 1 h
};

const hash = (raw: string) => createHash('sha256').update(raw).digest('hex');

/** Mint a fresh token for (purpose, email) — replaces any previous one (one active per purpose). */
export async function mintAuthToken(purpose: AuthTokenPurpose, email: string): Promise<string> {
  const raw = randomBytes(32).toString('hex');
  const identifier = `${purpose}:${email}`;
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: { identifier, token: hash(raw), expires: new Date(Date.now() + TTL_MS[purpose]) },
  });
  return raw;
}

/**
 * Redeem a token: valid + unexpired + right purpose → returns the email and DELETES the row
 * (single use; an expired/mismatched hit is deleted too — a dead token has no reason to linger).
 */
export async function consumeAuthToken(purpose: AuthTokenPurpose, raw: string): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(raw)) return null;
  const hashed = hash(raw);
  const row = await prisma.verificationToken.findUnique({ where: { token: hashed } });
  if (!row) return null;
  await prisma.verificationToken.deleteMany({ where: { token: hashed } });
  const prefix = `${purpose}:`;
  if (!row.identifier.startsWith(prefix)) return null;
  if (row.expires < new Date()) return null;
  return row.identifier.slice(prefix.length);
}
