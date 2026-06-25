import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';
import { getOrCreateCopilotKey } from '@/lib/copilot-settings';
import { CopilotSettingsClient } from '../copilot-settings-client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function CopilotSettingsPage() {
  const ctx = await getCurrentWorkspace();
  if (!ctx) redirect('/signin');

  const { publicKey, allowedOrigins } = await getOrCreateCopilotKey(
    ctx.workspace.id,
  );
  const wsId = ctx.workspace.id;
  const [approvedCount, qTotal, qAnswered, qUp, qDown, recent] =
    await Promise.all([
      prisma.copilotApproval.count({ where: { workspaceId: wsId } }),
      prisma.copilotQuery.count({ where: { workspaceId: wsId } }),
      prisma.copilotQuery.count({ where: { workspaceId: wsId, answered: true } }),
      prisma.copilotQuery.count({ where: { workspaceId: wsId, feedback: 'up' } }),
      prisma.copilotQuery.count({
        where: { workspaceId: wsId, feedback: 'down' },
      }),
      prisma.copilotQuery.findMany({
        where: { workspaceId: wsId },
        orderBy: { createdAt: 'desc' },
        take: 12,
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

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 md:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Copilot</h1>
        <p className="text-sm text-muted-foreground">
          Embed the in-app copilot in your product. It answers only from
          workflows you&apos;ve approved.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            1. Approve what it can answer
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {approvedCount} workflow(s) approved for the copilot. Approve more on
          each recording&apos;s{' '}
          <Link
            href="/dashboard/recordings"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Knowledge Base page
          </Link>
          . The copilot answers from these only — nothing else leaks.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            2. Your public embeddable key
          </CardTitle>
          <CardDescription>
            Safe to put in your app&apos;s HTML (it&apos;s not your secret
            recorder token).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <code className="block break-all rounded-md border bg-muted/40 px-3 py-2 text-xs">
            {publicKey}
          </code>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Embed snippet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="overflow-x-auto rounded-md bg-zinc-900 p-4 text-xs leading-relaxed text-zinc-100">
            {snippet}
          </pre>
          <CopilotSettingsClient
            snippet={snippet}
            allowedOrigins={allowedOrigins}
          />
          {widgetSrc.includes('YOUR_WIDGET_HOST') && (
            <p className="text-xs text-muted-foreground">
              ℹ️ The{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                src
              </code>{' '}
              points to a placeholder — it&apos;s set once the widget is deployed
              (P1-M4). For local testing, load{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                packages/widget/demo/index.html
              </code>{' '}
              with this key.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Copilot activity</CardTitle>
        </CardHeader>
        <CardContent>
          {qTotal === 0 ? (
            <p className="text-sm text-muted-foreground">
              No questions yet. Once embedded, end-user questions + feedback show
              here.
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
          <p className="mt-3 text-xs text-muted-foreground">
            Questions the copilot can&apos;t answer become{' '}
            <Link
              href="/dashboard"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              coverage gaps
            </Link>{' '}
            (&ldquo;record this next&rdquo;).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
