import { createHash } from 'node:crypto';
import { prisma } from '@flowbuddy/db';

export interface AuthedWorkspace {
  workspaceId: string;
  ownerId: string;
}

/** Resolve a workspace from a Bearer API token (we store only the SHA-256 hash). */
export async function authWorkspace(authHeader?: string): Promise<AuthedWorkspace | null> {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return null;
  const hashedToken = createHash('sha256').update(token).digest('hex');
  const row = await prisma.apiToken.findUnique({
    where: { hashedToken },
    include: { workspace: true },
  });
  if (!row) return null;
  return { workspaceId: row.workspaceId, ownerId: row.workspace.ownerId };
}
