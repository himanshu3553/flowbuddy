import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, Video } from 'lucide-react';

import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { EmptyState } from '@/components/dashboard/empty-state';

export const dynamic = 'force-dynamic';

export default async function RecordingsPage() {
  const ctx = await getCurrentWorkspace();
  if (!ctx) redirect('/signin');

  const sessions = await prisma.knowledgeSource.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 md:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Recordings &amp; Knowledge Base
        </h1>
        <p className="text-sm text-muted-foreground">
          Each recording becomes knowledge your copilot can answer from. Open one
          to review the extracted items and approve workflows.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {sessions.length === 0 ? (
            <EmptyState
              icon={Video}
              title="No recordings yet"
              description="Record your product with the Sync Recorder extension to start building your copilot’s knowledge base."
            />
          ) : (
            <ul className="divide-y">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/dashboard/kb/${s.id}`}
                    className="flex items-center gap-3 px-6 py-4 transition-colors hover:bg-muted/50"
                  >
                    <StatusBadge status={s.status} />
                    <span className="flex-1 truncate font-medium">
                      {s.appBaseUrl || '(unknown app)'}
                    </span>
                    <span className="text-xs text-muted-foreground">{s.kind}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
