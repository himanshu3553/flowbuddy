'use client';

import * as React from 'react';
import { Pause, Play, Volume2, VolumeX, ImageOff } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/recordings';

export interface PlayerFrame {
  t: number; // ms from session start
  url: string; // signed screenshot URL
  type: string;
  label: string;
  routePath: string | null;
}

/**
 * Timeline-synced "replay" of a recording: the captured narration audio plays while the captured
 * screenshots advance to match the playhead (each frame has a `t`). It is a slideshow
 * reconstruction, not video — there are gaps between captured events. When there's no audio, a
 * manual clock drives the same frame advance. See docs: the recorder captures per-event shots
 * (~2/s) + one continuous audio track, never screen video.
 */
export function RecordingPlayer({
  audioUrl,
  durationMs,
  frames,
}: {
  audioUrl: string | null;
  durationMs: number;
  frames: PlayerFrame[];
}) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const anchorRef = React.useRef<number>(0); // performance.now() - currentMs, for the audio-less clock
  const [playing, setPlaying] = React.useState(false);
  const [currentMs, setCurrentMs] = React.useState(0);
  const [muted, setMuted] = React.useState(false);

  const total = Math.max(
    durationMs,
    frames.length ? frames[frames.length - 1]!.t : 0,
    1,
  );

  // Index of the last frame whose timestamp has been reached.
  const activeIndex = React.useMemo(() => {
    if (frames.length === 0) return -1;
    let idx = 0;
    for (let i = 0; i < frames.length; i++) {
      if (frames[i]!.t <= currentMs) idx = i;
      else break;
    }
    // Before the first frame's timestamp, still show the first frame.
    return currentMs < frames[0]!.t ? 0 : idx;
  }, [frames, currentMs]);

  const active = activeIndex >= 0 ? frames[activeIndex] : null;

  const stop = React.useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  // Audio-less clock loop.
  const tick = React.useCallback(() => {
    const ms = performance.now() - anchorRef.current;
    if (ms >= total) {
      setCurrentMs(total);
      setPlaying(false);
      stop();
      return;
    }
    setCurrentMs(ms);
    rafRef.current = requestAnimationFrame(tick);
  }, [total, stop]);

  function play() {
    if (audioRef.current) {
      void audioRef.current.play();
    } else {
      anchorRef.current = performance.now() - currentMs;
      rafRef.current = requestAnimationFrame(tick);
    }
    setPlaying(true);
  }

  function pause() {
    if (audioRef.current) audioRef.current.pause();
    else stop();
    setPlaying(false);
  }

  function toggle() {
    if (playing) pause();
    else {
      // Restart from 0 if we're parked at the end.
      if (currentMs >= total) seek(0);
      play();
    }
  }

  function seek(ms: number) {
    const clamped = Math.min(Math.max(0, ms), total);
    setCurrentMs(clamped);
    if (audioRef.current) audioRef.current.currentTime = clamped / 1000;
    else if (playing) anchorRef.current = performance.now() - clamped;
  }

  React.useEffect(() => () => stop(), [stop]);

  return (
    <div className="overflow-hidden rounded-card border bg-card shadow-card">
      {/* Stage */}
      <div className="relative aspect-[16/10] w-full bg-media">
        {active ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={active.url}
            alt={active.label || 'Recording frame'}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageOff className="h-6 w-6" />
            <p className="text-xs">No screenshots were captured for this recording.</p>
            {audioUrl && (
              <p className="font-mono text-[10px] text-faint">
                Narration audio is still available below.
              </p>
            )}
          </div>
        )}

        {/* Current step caption */}
        {active && (active.label || active.routePath) && (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/55 to-transparent px-3 pb-2 pt-6">
            <span className="rounded-pill bg-white/15 px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-wide text-white">
              {active.type}
            </span>
            {active.label && (
              <span className="truncate text-xs font-medium text-white">
                {active.label}
              </span>
            )}
            {active.routePath && (
              <span className="ml-auto hidden truncate font-mono text-[10px] text-white/75 sm:block">
                {active.routePath}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 border-t px-3 py-2.5">
        <button
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Play'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-gradient text-primary-foreground shadow-primary transition hover:brightness-[0.97]"
        >
          {playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 translate-x-[1px]" />
          )}
        </button>

        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatDuration(currentMs)} / {formatDuration(total)}
        </span>

        {/* Scrub track with frame ticks */}
        <div className="relative flex-1">
          <input
            type="range"
            min={0}
            max={total}
            step={50}
            value={Math.min(currentMs, total)}
            onChange={(e) => seek(Number(e.target.value))}
            className="relative z-10 w-full cursor-pointer accent-primary"
            aria-label="Seek"
          />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -z-0 hidden h-px -translate-y-1/2 sm:block">
            {frames.map((f, i) => (
              <span
                key={i}
                className={cn(
                  'absolute top-1/2 h-1.5 w-px -translate-y-1/2 bg-faint/60',
                  i === activeIndex && 'bg-primary',
                )}
                style={{ left: `${(f.t / total) * 100}%` }}
              />
            ))}
          </div>
        </div>

        {audioUrl && (
          <button
            onClick={() => {
              const next = !muted;
              setMuted(next);
              if (audioRef.current) audioRef.current.muted = next;
            }}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}
      </div>

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onTimeUpdate={(e) => setCurrentMs(e.currentTarget.currentTime * 1000)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      )}
    </div>
  );
}
