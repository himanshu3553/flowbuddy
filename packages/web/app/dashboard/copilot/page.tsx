import { redirect } from 'next/navigation';
import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';
import { getOrCreateCopilotKey } from '@/lib/copilot-settings';
import { PageHeader } from '@/components/dashboard/page-header';
import { CopilotWorkspace } from '@/components/dashboard/copilot-workspace';
import { WidgetPreview } from '@/components/dashboard/widget-preview';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

  const { publicKey, allowedOrigins } = await getOrCreateCopilotKey(
    ctx.workspace.id,
  );
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
  const snippet = `<script src="${widgetSrc}"
  data-sync-api="${apiBase}"
  data-sync-key="${publicKey}"
  data-sync-title="Help"></script>`;
  const primaryOrigin = allowedOrigins[0]
    ? originHost(allowedOrigins[0])
    : 'your site';
  const widgetIsPlaceholder = widgetSrc.includes('YOUR_WIDGET_HOST');

  return (
    <>
      <PageHeader
        title="Copilot"
        subtitle="Install the copilot in your product — it answers only from approved workflows."
        actions={
          <span className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Not detected
          </span>
        }
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <CopilotWorkspace
            snippet={snippet}
            publicKey={publicKey}
            allowedOrigins={allowedOrigins}
            primaryOrigin={primaryOrigin}
            widgetIsPlaceholder={widgetIsPlaceholder}
          />
          <div className="lg:sticky lg:top-20 lg:self-start">
            <WidgetPreview />
          </div>
        </div>

        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Copilot activity</CardTitle>
          </CardHeader>
          <CardContent>
            {qTotal === 0 ? (
              <p className="text-sm text-muted-foreground">
                No questions yet. Once embedded, end-user questions + feedback
                show here — and uncovered questions become “record this next”
                coverage gaps.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {qTotal} question(s) · {answeredPct}% answered · 👍 {qUp} · 👎{' '}
                  {qDown}
                </p>
                <ul className="mt-3 divide-y">
                  {recent.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 py-2">
                      <Badge variant={r.answered ? 'secondary' : 'outline'}>
                        {r.answered ? 'answered' : 'declined'}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {r.question}
                      </span>
                      {r.feedback && (
                        <span className="text-sm">
                          {r.feedback === 'up' ? '👍' : '👎'}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
