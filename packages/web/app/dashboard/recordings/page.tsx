import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ExternalLink, Video } from 'lucide-react';

import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';
import { listCandidates } from '@/lib/candidates';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { HowToRecordDialog } from '@/components/dashboard/home-help-dialogs';
import {
  RecordingsList,
  type RecordingRow,
} from '@/components/dashboard/recordings-list';

export const dynamic = 'force-dynamic';

const LAYERS = ['Screen', 'Voice', 'DOM', 'Events', 'Routes'];

function RecordButton() {
  return (
    <HowToRecordDialog>
      <Button size="sm">
        <span className="h-2.5 w-2.5 rounded-full bg-white" />
        Record
      </Button>
    </HowToRecordDialog>
  );
}

export default async function RecordingsPage() {
  const ctx = await getCurrentWorkspace();
  if (!ctx) redirect('/signin');

  const [sessions, candidates] = await Promise.all([
    prisma.knowledgeSource.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: { createdAt: 'desc' },
    }),
    listCandidates(ctx.workspace.id),
  ]);

  const wfBySource = new Map<string, number>();
  for (const c of candidates)
    wfBySource.set(c.sourceId, (wfBySource.get(c.sourceId) ?? 0) + 1);

  const rows: RecordingRow[] = sessions.map((s) => ({
    id: s.id,
    title: s.appBaseUrl || '(unknown app)',
    kind: s.kind,
    date: s.createdAt.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    status: s.status,
    workflowCount: wfBySource.get(s.id) ?? 0,
  }));

  return (
    <>
      <PageHeader
        title="Recordings"
        subtitle="Capture sessions the Sync Recorder turns into your Knowledge Base."
        actions={<RecordButton />}
      />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
        {rows.length === 0 ? (
          <div className="rounded-card border bg-card p-10 text-center shadow-card">
            <div className="mx-auto flex h-[86px] w-[124px] items-center justify-center rounded-tile border border-[color:var(--media-border)] bg-media font-mono text-[10px] text-faint">
              recording
            </div>
            <h2 className="mt-[18px] text-[17px] font-bold tracking-tight text-secondary-foreground">
              No recordings yet
            </h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
              Install the Sync Recorder, click “Connect with Sync,” and narrate
              your way through a real workflow. Sync turns the session into a
              structured Knowledge Base.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2.5">
              <RecordButton />
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/settings">
                  <ExternalLink className="h-4 w-4" />
                  Install the recorder
                </Link>
              </Button>
            </div>
            <div className="mx-auto mt-7 flex max-w-md flex-wrap items-center justify-center gap-1.5">
              {LAYERS.map((l) => (
                <span
                  key={l}
                  className="rounded-pill border bg-secondary px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground"
                >
                  {l}
                </span>
              ))}
            </div>
            <p className="mt-3 font-mono text-[11px] text-faint">
              Captured in sync · PII masked in your browser before upload
            </p>
          </div>
        ) : (
          <RecordingsList rows={rows} />
        )}
      </div>
    </>
  );
}
