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
      <Button
        size="sm"
        className="bg-gradient-to-b from-[#4a63e8] to-[#3a50dd] text-white shadow-[0_2px_10px_rgba(58,80,221,0.3)] hover:opacity-95"
      >
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
          <div className="rounded-2xl border bg-card p-10 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Video className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-bold tracking-tight">
              No recordings yet
            </h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
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
                  className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-primary"
                >
                  {l}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
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
