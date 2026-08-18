import { randomBytes } from 'node:crypto';
import { prisma } from '@flowbuddy/db';
// Imported by SUBPATH, not from the package barrel. Next's bundler can't resolve the barrel's
// `./x.js` re-exports back to their .ts sources, so a VALUE import from '@flowbuddy/shared' fails
// the web build (type-only imports are fine — they're erased). `copilot-mode.ts` has no imports of
// its own, so the subpath resolves cleanly and the vocabulary stays defined in exactly one place.
import { parseCopilotMode, type CopilotMode } from '@flowbuddy/shared/copilot-mode';

export interface CopilotSettings {
  publicKey: string;
  allowedOrigins: string[];
  showCitations: boolean;
  /** The operating mode — how much the assistant decides for itself (and the pricing tier). */
  mode: CopilotMode;
  // P2 Sense — the per-workspace master toggle + the "show me" highlight config (P2-M3).
  senseEnabled: boolean;
  showMe: boolean;
  // P4-M0 — the guided-walkthrough offer on positional answers (needs Sense).
  walkthrough: boolean;
  // P2-M5 Reason — diagnostic answers (structure, masked) + the image tier + value unmasking.
  reasonEnabled: boolean;
  reasonImageEnabled: boolean;
  reasonIncludeValues: boolean;
  // Demo videos (roadmap §13) — Studio-side feature flag for the workflow page's video card.
  demoVideosEnabled: boolean;
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
    copilotMode: true,
    senseEnabled: true,
    copilotShowMe: true,
    copilotWalkthrough: true,
    reasonEnabled: true,
    reasonImageEnabled: true,
    reasonIncludeValues: true,
    demoVideosEnabled: true,
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
    mode: parseCopilotMode(ws.copilotMode),
    senseEnabled: ws.senseEnabled,
    showMe: ws.copilotShowMe,
    walkthrough: ws.copilotWalkthrough,
    reasonEnabled: ws.reasonEnabled,
    reasonImageEnabled: ws.reasonImageEnabled,
    reasonIncludeValues: ws.reasonIncludeValues,
    demoVideosEnabled: ws.demoVideosEnabled,
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
