import { randomBytes } from 'node:crypto';
import { prisma } from '@sync/db';

export interface CopilotSettings {
  publicKey: string;
  allowedOrigins: string[];
  showCitations: boolean;
  // Appearance — '' means "use the widget default" (see lib/copilot-appearance.ts).
  accent: string;
  title: string;
  greeting: string;
  position: 'left' | 'right';
}

/** P1-M9 — return the workspace's public embeddable key (minting one on first use) + trust/appearance settings. */
export async function getOrCreateCopilotKey(workspaceId: string): Promise<CopilotSettings> {
  const select = {
    copilotPublicKey: true,
    copilotAllowedOrigins: true,
    copilotShowCitations: true,
    copilotAccent: true,
    copilotTitle: true,
    copilotGreeting: true,
    copilotPosition: true,
  } as const;
  const found = await prisma.workspace.findUnique({ where: { id: workspaceId }, select });
  const ws = found?.copilotPublicKey
    ? found
    : await prisma.workspace.update({
        where: { id: workspaceId },
        data: { copilotPublicKey: 'pk_' + randomBytes(24).toString('hex') },
        select,
      });
  return {
    publicKey: ws.copilotPublicKey ?? '',
    allowedOrigins: ws.copilotAllowedOrigins,
    showCitations: ws.copilotShowCitations,
    accent: ws.copilotAccent ?? '',
    title: ws.copilotTitle ?? '',
    greeting: ws.copilotGreeting ?? '',
    position: ws.copilotPosition === 'left' ? 'left' : 'right',
  };
}
