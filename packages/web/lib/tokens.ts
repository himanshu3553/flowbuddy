import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@flowbuddy/db';

/** Workspace API tokens: we store only the SHA-256 hash; the plaintext is shown once. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createApiToken(workspaceId: string, label = 'default'): Promise<string> {
  const token = `sync_${randomBytes(24).toString('hex')}`;
  await prisma.apiToken.create({
    data: { workspaceId, hashedToken: hashToken(token), label },
  });
  return token; // plaintext — caller shows it once
}
