'use client';

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { generateDemoVideo } from '@/lib/video-actions';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/dashboard/status-badge';

/**
 * The "Demo video" control for one workflow: generate a polished, narrated MP4 derived from the
 * workflow's recorded steps (not a screen recording), watch it inline, download or regenerate.
 *
 * While a render is in flight this polls via router.refresh() — a render takes minutes and the
 * founder just pressed the button on THIS page, so leaving them to hand-reload (the recordings-list
 * convention for background work started elsewhere) would read as broken here.
 */
export function DemoVideoCard({
  workflowId,
  workflowTitle,
  status,
  videoUrl,
  durationMs,
  error,
  stale = false,
}: {
  workflowId: string;
  workflowTitle: string;
  /** null = never generated. Vocabulary: schema.prisma `DemoVideo`. */
  status: string | null;
  /** Presigned URL, present when status is `ready`. */
  videoUrl: string | null;
  durationMs: number | null;
  error: string | null;
  /** The workflow's text was founder-edited AFTER this render — the MP4 still narrates the old
   *  words (regenerating is deliberately manual, video-actions.ts). */
  stale?: boolean;
}) {
  const [busy, start] = useTransition();
  const router = useRouter();
  const pending = status === 'queued' || status === 'processing';

  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [pending, router]);

  function generate(kind: 'first' | 'again') {
    start(async () => {
      try {
        await generateDemoVideo(workflowId);
        toast.success(
          kind === 'first' ? `Rendering a demo video for “${workflowTitle}”` : 'Re-rendering the demo video',
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to start the render');
      }
    });
  }

  const duration =
    durationMs != null
      ? `${Math.floor(durationMs / 60000)}:${String(Math.floor((durationMs % 60000) / 1000)).padStart(2, '0')}`
      : null;

  if (pending) {
    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <StatusBadge tone="pending">{status === 'queued' ? 'Queued' : 'Rendering'}</StatusBadge>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--indigo-50)]">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-[color:var(--indigo-500)]" />
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Writing the script, recording the voiceover and rendering the video — usually a few
          minutes. This page updates by itself.
        </p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <StatusBadge tone="neutral">Failed</StatusBadge>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => generate('again')}>
            Try again
          </Button>
        </div>
        {error ? <p className="text-[11px] leading-relaxed text-[color:var(--danger-text)]">{error}</p> : null}
      </div>
    );
  }

  if (status === 'ready' && videoUrl) {
    return (
      <div className="space-y-2.5">
        {stale && (
          <p className="rounded-control border border-dashed bg-[color:var(--paper-2)] px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
            This workflow’s text changed since the video was rendered — it still narrates the old
            words. Regenerate to match.
          </p>
        )}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the narration IS the content */}
        <video src={videoUrl} controls preload="metadata" className="w-full rounded-lg border bg-black" />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {duration ? `${duration} · ` : ''}MP4, 1080p
            {error ? ' · some narration fell back to silence' : ''}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => generate('again')}>
              Regenerate
            </Button>
            <Button size="sm" variant="soft" asChild>
              <a href={videoUrl} download={`demo-${workflowId}.mp4`}>
                Download
              </a>
            </Button>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <StatusBadge tone="neutral">Not generated</StatusBadge>
        <Button size="sm" variant="soft" disabled={busy} onClick={() => generate('first')}>
          Generate video
        </Button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        A polished, narrated product demo built from this workflow&apos;s recorded steps — AI
        voiceover, zooms and captions, no screen recording needed.
      </p>
    </div>
  );
}
