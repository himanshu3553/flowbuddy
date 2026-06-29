import { randomBytes } from 'node:crypto';
import { prisma } from '@sync/db';

export interface CopilotSettings {
  publicKey: string;
  allowedOrigins: string[];
  showCitations: boolean;
}

/** P1-M9 — return the workspace's public embeddable key (minting one on first use) + trust settings. */
export async function getOrCreateCopilotKey(workspaceId: string): Promise<CopilotSettings> {
  const select = { copilotPublicKey: true, copilotAllowedOrigins: true, copilotShowCitations: true } as const;
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select });
  if (ws?.copilotPublicKey) {
    return { publicKey: ws.copilotPublicKey, allowedOrigins: ws.copilotAllowedOrigins, showCitations: ws.copilotShowCitations };
  }
  const publicKey = 'pk_' + randomBytes(24).toString('hex');
  const updated = await prisma.workspace.update({ where: { id: workspaceId }, data: { copilotPublicKey: publicKey }, select });
  return {
    publicKey: updated.copilotPublicKey ?? publicKey,
    allowedOrigins: updated.copilotAllowedOrigins,
    showCitations: updated.copilotShowCitations,
  };
}
