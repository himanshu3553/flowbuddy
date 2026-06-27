import { cn } from '@/lib/utils';

/**
 * Small circular progress ring (e.g. "1/4"). Pure CSS conic-gradient — no
 * dependency. `value`/`total` drive both the arc and the centered label.
 */
export function ProgressRing({
  value,
  total,
  size = 54,
  className,
}: {
  value: number;
  total: number;
  size?: number;
  className?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${value} of ${total} complete`}
    >
      <div
        className="h-full w-full rounded-full"
        style={{
          background: `conic-gradient(hsl(var(--primary)) ${pct}%, hsl(var(--muted)) ${pct}% 100%)`,
        }}
      />
      <div className="absolute inset-[5px] flex items-center justify-center rounded-full bg-card text-[13px] font-extrabold tracking-tight text-foreground">
        {value}/{total}
      </div>
    </div>
  );
}
