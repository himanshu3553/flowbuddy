import { randomBytes } from 'node:crypto';
import { prisma } from '@sync/db';

export interface CopilotSettings {
  publicKey: string;
  allowedOrigins: string[];
}

/** P1-M9 — return the workspace's public embeddable key (minting one on first use) + origin allowlist. */
export async function getOrCreateCopilotKey(workspaceId: string): Promise<CopilotSettings> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { copilotPublicKey: true, copilotAllowedOrigins: true },
  });
  if (ws?.copilotPublicKey) {
    return { publicKey: ws.copilotPublicKey, allowedOrigins: ws.copilotAllowedOrigins };
  }
  const publicKey = 'pk_' + randomBytes(24).toString('hex');
  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { copilotPublicKey: publicKey },
    select: { copilotPublicKey: true, copilotAllowedOrigins: true },
  });
  return { publicKey: updated.copilotPublicKey ?? publicKey, allowedOrigins: updated.copilotAllowedOrigins };
}
