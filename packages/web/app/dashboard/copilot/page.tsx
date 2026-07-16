import { redirect } from 'next/navigation';
import { prisma } from '@flowbuddy/db';
import { getCurrentWorkspace } from '@/lib/session';
import { getOrCreateCopilotKey } from '@/lib/copilot-settings';
import { getCopilotMetrics } from '@/lib/copilot-metrics';
import { getEmbedStatus } from '@/lib/embed-status';
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
    senseEnabled,
    showMe,
    walkthrough,
    reasonEnabled,
    reasonImageEnabled,
    reasonIncludeValues,
    accent,
    title,
    greeting,
    position,
    launcherStyle,
    launcherText,
  } = await getOrCreateCopilotKey(ctx.workspace.id);
  const wsId = ctx.workspace.id;
  // Use the SAME shared metrics source as Home + Analytics so the answer-quality numbers match
  // across all three surfaces (7-day window); `total` is the all-time count for the lifetime stat
  // and the first-question gate. (`recent` is this tab's own latest-activity list.)
  const [metrics, recent] = await Promise.all([
    getCopilotMetrics(wsId),
    prisma.copilotQuery.findMany({
      where: { workspaceId: wsId },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
  ]);

  const apiBase = process.env.FLOWBUDDY_API_URL || 'http://localhost:8787';
  const widgetSrc =
    process.env.FLOWBUDDY_WIDGET_URL || 'https://YOUR_WIDGET_HOST/flowbuddy-copilot.js';
  const primaryOrigin = allowedOrigins[0]
    ? originHost(allowedOrigins[0])
    : 'your site';
  const widgetIsPlaceholder = widgetSrc.includes('YOUR_WIDGET_HOST');

  const detection = getEmbedStatus(ctx.workspace);

  return (
    <>
      <PageHeader
        title="Copilot"
        subtitle="Install the copilot in your product — it answers only from approved workflows."
        actions={
          detection.detected ? (
            <StatusBadge tone="success">Detected</StatusBadge>
          ) : (
            <StatusBadge tone="pending">Not detected</StatusBadge>
          )
        }
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
          senseEnabled={senseEnabled}
          showMe={showMe}
          walkthrough={walkthrough}
          reasonEnabled={reasonEnabled}
          reasonImageEnabled={reasonImageEnabled}
          reasonIncludeValues={reasonIncludeValues}
          activity={{
            total: metrics.total,
            window: metrics.window,
            answeredPct: metrics.answeredPct,
            up: metrics.up,
            down: metrics.down,
            recent,
          }}
          detection={detection}
          appearance={{ accent, title, greeting, position, launcherStyle, launcherText }}
        />
      </div>
    </>
  );
}
