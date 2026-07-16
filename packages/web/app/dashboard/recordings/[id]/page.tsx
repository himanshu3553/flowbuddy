import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ChevronLeft,
  ArrowUpRight,
  MousePointerClick,
  Keyboard,
  Navigation,
  CornerDownLeft,
  Flag,
  Hand,
  Circle,
} from 'lucide-react';

import { prisma } from '@flowbuddy/db';
import type { SessionManifest } from '@flowbuddy/shared';
import { getCurrentWorkspace } from '@/lib/session';
import { signedUrl, sessionObjectKey } from '@/lib/storage';
import { listCandidates } from '@/lib/candidates';
import {
  asManifest,
  deriveRecordingMeta,
  timelineEvents,
  formatDuration,
  isRecordingStalled,
  recordingStatusBadge,
} from '@/lib/recordings';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RecordingManageMenu } from '@/components/dashboard/recording-manage';
import { ReprocessButton } from '@/components/dashboard/recording-reprocess-button';
import {
  RecordingPlayer,
  type PlayerFrame,
} from '@/components/dashboard/recording-player';

export const dynamic = 'force-dynamic';

const EVENT_ICON: Record<string, typeof MousePointerClick> = {
  click: MousePointerClick,
  input: Keyboard,
  submit: CornerDownLeft,
  nav: Navigation,
  scroll: Hand,
  keydown: Keyboard,
  marker: Flag,
};

export default async function RecordingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getCurrentWorkspace();
  if (!ctx) redirect('/signin');

  const source = await prisma.knowledgeSource.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { createdBy: { select: { name: true, email: true } } },
  });
  if (!source) notFound();

  const manifest = asManifest(source.manifest) as SessionManifest | null;
  const meta = deriveRecordingMeta(manifest);
  const events = timelineEvents(manifest);
  const ws = ctx.workspace.id;

  // Sign every captured screenshot once; reuse for the player frames + the timeline thumbnails.
  const shotRels = [...new Set(events.map((e) => e.shotRel).filter((r): r is string => !!r))];
  const shotUrls = new Map<string, string>(
    await Promise.all(
      shotRels.map(
        async (rel) => [rel, await signedUrl(sessionObjectKey(ws, id, rel))] as const,
      ),
    ),
  );
  const audioUrl = meta.audioRel
    ? await signedUrl(sessionObjectKey(ws, id, meta.audioRel))
    : null;

  const frames: PlayerFrame[] = events
    .filter((e) => e.shotRel)
    .map((e) => ({
      t: e.t,
      url: shotUrls.get(e.shotRel!)!,
      type: e.type,
      label: e.label,
      routePath: e.routePath,
    }))
    .sort((a, b) => a.t - b.t);

  const candidates = await listCandidates(ws, id);
  const transcript =
    (source.transcript as { text?: string; segments?: unknown[] } | null) ?? null;
  const title = source.title || source.appBaseUrl || 'Recording';
  const app = manifest?.app;
  const recordedBy = source.createdBy?.name || source.createdBy?.email || '—';
  const failed = source.status === 'error';
  const stalled = isRecordingStalled(source.status, source.updatedAt);
  const hasReplay = frames.length > 0 || !!audioUrl;
  const st = recordingStatusBadge(source.status, { stalled });

  const summary: [string, string][] = [
    ['App', source.appBaseUrl || '—'],
    ['Duration', meta.durationMs ? formatDuration(meta.durationMs) : '—'],
    ['Actions captured', String(meta.eventCount)],
    ['Screenshots', String(meta.screenshotCount)],
    ['Narration', meta.hasAudio ? 'Yes' : 'No'],
    ['Viewport', app?.viewport ? `${app.viewport.w}×${app.viewport.h}` : '—'],
    ['Recorded', source.createdAt.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })],
    ['Recorded by', recordedBy],
  ];

  return (
    <>
      <PageHeader
        title={title}
        subtitle={`${source.kind} · ${meta.eventCount} actions · ${formatDuration(meta.durationMs)}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
            <RecordingManageMenu
              id={source.id}
              currentTitle={source.title}
              appUrl={source.appBaseUrl}
              status={source.status}
              redirectOnDelete
            />
          </div>
        }
      />
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8">
        <Link
          href="/dashboard/recordings"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Recordings
        </Link>

        {failed && (
          <div className="rounded-card border border-danger-border bg-danger-bg px-4 py-3.5">
            <p className="text-sm font-semibold text-danger-text">
              This recording failed to process.
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-danger-ink">
              {source.error || 'Capture or synthesis was interrupted.'}
            </p>
            <div className="mt-2.5">
              <ReprocessButton id={source.id} />
            </div>
          </div>
        )}

        {/* Degraded-but-successful build (§3.3): the worker lands `ready` but leaves a warning in
            `error` (e.g. narration failed to transcribe) — a notice, not a failure. */}
        {!failed && source.status === 'ready' && source.error && (
          <div className="rounded-card border border-warning-border bg-warning-bg px-4 py-3.5">
            <p className="text-sm font-semibold text-warning-text">
              Processed with a warning.
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-warning-text">
              {source.error}
            </p>
          </div>
        )}

        {stalled && (
          <div className="rounded-card border border-danger-border bg-danger-bg px-4 py-3.5">
            <p className="text-sm font-semibold text-danger-text">
              Processing looks stalled.
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-danger-ink">
              This recording has been “processing” for over 15 minutes — the job was likely lost.
              Re-processing is safe and starts it over.
            </p>
            <div className="mt-2.5">
              <ReprocessButton id={source.id} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">
            {/* Replay */}
            <section className="space-y-2.5">
              <div>
                <h2 className="text-base font-semibold tracking-tight">Replay</h2>
                <p className="text-sm text-muted-foreground">
                  Your narration plays while the captured screenshots advance — a
                  reconstruction of what FlowBuddy recorded, not a video.
                </p>
              </div>
              {hasReplay ? (
                <RecordingPlayer
                  audioUrl={audioUrl}
                  durationMs={meta.durationMs}
                  frames={frames}
                />
              ) : (
                <div className="rounded-card border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
                  Nothing was captured to replay for this recording.
                </div>
              )}
            </section>

            {/* Event timeline */}
            <section className="space-y-2.5">
              <h2 className="text-base font-semibold tracking-tight">
                Captured actions
                <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                  {events.length}
                </span>
              </h2>
              {events.length === 0 ? (
                <div className="rounded-card border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                  No actions were captured.
                </div>
              ) : (
                <ul className="overflow-hidden rounded-card border bg-card">
                  {events.map((e, i) => {
                    const Icon = EVENT_ICON[e.type] || Circle;
                    const url = e.shotRel ? shotUrls.get(e.shotRel) : null;
                    return (
                      <li
                        key={e.id}
                        className="flex items-center gap-3 border-b px-3.5 py-2.5 last:border-b-0"
                      >
                        <span className="w-10 shrink-0 font-mono text-[10.5px] tabular-nums text-faint">
                          {formatDuration(e.t)}
                        </span>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-50 text-primary">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink">
                            <span className="font-mono text-[10.5px] uppercase text-muted-foreground">
                              {e.type}
                            </span>{' '}
                            {e.label}
                          </span>
                          {e.routePath && (
                            <span className="block truncate font-mono text-[10px] text-faint">
                              {e.routePath}
                            </span>
                          )}
                        </span>
                        {url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt=""
                            className="hidden h-9 w-14 shrink-0 rounded border border-[color:var(--media-border)] object-cover object-top sm:block"
                          />
                        )}
                        <span className="w-2 shrink-0 text-right font-mono text-[10px] text-faint">
                          {i + 1}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <aside className="min-w-0 space-y-5 lg:sticky lg:top-20 lg:self-start">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Capture summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {meta.layers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pb-1">
                    {meta.layers.map((l) => (
                      <span
                        key={l}
                        className="rounded-pill border bg-secondary px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-secondary-foreground"
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                )}
                <dl className="space-y-1.5">
                  {summary.map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 text-xs text-muted-foreground">{k}</dt>
                      <dd className="truncate text-right text-[12.5px] font-medium text-ink">
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Distilled workflows</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {candidates.length > 0
                    ? `FlowBuddy extracted ${candidates.length} workflow${candidates.length === 1 ? '' : 's'} from this recording. Review and approve them for the copilot.`
                    : source.status === 'ready' || source.status === 'done'
                      ? 'No workflows were distilled from this recording.'
                      : 'Workflows appear once processing finishes.'}
                </p>
                <Button asChild variant="soft" size="sm" className="w-full">
                  <Link href="/dashboard/kb">
                    Review &amp; approve workflows
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Transcript</CardTitle>
              </CardHeader>
              <CardContent>
                {transcript?.text ? (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      {transcript.segments?.length ?? 0} segments — expand
                    </summary>
                    <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed">
                      {transcript.text}
                    </p>
                  </details>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No transcript (no narration captured).
                  </p>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </>
  );
}
