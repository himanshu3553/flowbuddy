import { redirect } from 'next/navigation';
import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';
import { getOrCreateCopilotKey } from '@/lib/copilot-settings';
import { PageHeader } from '@/components/dashboard/page-header';
import { CopilotConsole } from '@/components/dashboard/copilot-console';
import { StatusBadge } from '@/components/dashboard/status-badge';

export const dynamic = 'force-dynamic';

function originHost(origin: string) {
  try {
    return new URL(origin).host;
  } catch {
    return origin.replace(/^https?:\/\//, '');
  }
}

export default async function CopilotSettingsPage() {
  const ctx = await getCurrentWorkspace();
  if (!ctx) redirect('/signin');

  const {
    publicKey,
    allowedOrigins,
    showCitations,
    accent,
    title,
    greeting,
    position,
    launcherStyle,
    launcherText,
  } = await getOrCreateCopilotKey(ctx.workspace.id);
  const wsId = ctx.workspace.id;
  const [qTotal, qAnswered, qUp, qDown, recent] = await Promise.all([
    prisma.copilotQuery.count({ where: { workspaceId: wsId } }),
    prisma.copilotQuery.count({ where: { workspaceId: wsId, answered: true } }),
    prisma.copilotQuery.count({ where: { workspaceId: wsId, feedback: 'up' } }),
    prisma.copilotQuery.count({ where: { workspaceId: wsId, feedback: 'down' } }),
    prisma.copilotQuery.findMany({
      where: { workspaceId: wsId },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
  ]);
  const answeredPct = qTotal ? Math.round((qAnswered / qTotal) * 100) : 0;

  const apiBase = process.env.SYNC_API_URL || 'http://localhost:8787';
  const widgetSrc =
    process.env.SYNC_WIDGET_URL || 'https://YOUR_WIDGET_HOST/sync-copilot.js';
  const primaryOrigin = allowedOrigins[0]
    ? originHost(allowedOrigins[0])
    : 'your site';
  const widgetIsPlaceholder = widgetSrc.includes('YOUR_WIDGET_HOST');

  return (
    <>
      <PageHeader
        title="Copilot"
        subtitle="Install the copilot in your product — it answers only from approved workflows."
        actions={<StatusBadge tone="pending">Not detected</StatusBadge>}
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
        <CopilotConsole
          apiBase={apiBase}
          widgetSrc={widgetSrc}
          publicKey={publicKey}
          widgetIsPlaceholder={widgetIsPlaceholder}
          allowedOrigins={allowedOrigins}
          primaryOrigin={primaryOrigin}
          showCitations={showCitations}
          activity={{ total: qTotal, answeredPct, up: qUp, down: qDown, recent }}
          appearance={{ accent, title, greeting, position, launcherStyle, launcherText }}
        />
      </div>
    </>
  );
}
