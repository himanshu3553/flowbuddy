import { randomBytes } from 'node:crypto';
import { prisma } from '@sync/db';

export interface CopilotSettings {
  publicKey: string;
  allowedOrigins: string[];
  showCitations: boolean;
  // P2 Sense — the per-workspace master toggle + the "show me" highlight config (P2-M3).
  senseEnabled: boolean;
  showMe: boolean;
  // Appearance — '' means "use the widget default" (see lib/copilot-appearance.ts).
  accent: string;
  title: string;
  greeting: string;
  position: 'left' | 'right';
  launcherStyle: 'icon' | 'text' | 'text-outline';
  launcherText: string;
}

/** P1-M9 — return the workspace's public embeddable key (minting one on first use) + trust/appearance settings. */
export async function getOrCreateCopilotKey(workspaceId: string): Promise<CopilotSettings> {
  const select = {
    copilotPublicKey: true,
    copilotAllowedOrigins: true,
    copilotShowCitations: true,
    senseEnabled: true,
    copilotShowMe: true,
    copilotAccent: true,
    copilotTitle: true,
    copilotGreeting: true,
    copilotPosition: true,
    copilotLauncherStyle: true,
    copilotLauncherText: true,
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
    senseEnabled: ws.senseEnabled,
    showMe: ws.copilotShowMe,
    accent: ws.copilotAccent ?? '',
    title: ws.copilotTitle ?? '',
    greeting: ws.copilotGreeting ?? '',
    position: ws.copilotPosition === 'left' ? 'left' : 'right',
    launcherStyle:
      ws.copilotLauncherStyle === 'text' || ws.copilotLauncherStyle === 'text-outline'
        ? ws.copilotLauncherStyle
        : 'icon',
    launcherText: ws.copilotLauncherText ?? '',
  };
}
