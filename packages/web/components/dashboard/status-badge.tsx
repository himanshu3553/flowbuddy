import { cn } from '@/lib/utils';

/**
 * Status pill — the design's mono micro-label voice: UPPERCASE JetBrains Mono
 * on a low-saturation tinted surface, always paired with a colored dot (never
 * color-only). Tones map to the 3-color status system plus an indigo
 * "live/approved" tone. See docs/design_system StatusBadge.
 */
export type StatusTone =
  | 'success'
  | 'live'
  | 'pending'
  | 'danger'
  | 'neutral';

const tones: Record<StatusTone, { box: string; dot: string }> = {
  success: { box: 'text-success-text bg-success-bg2 border-success-border', dot: 'bg-success-dot' },
  live: { box: 'text-primary bg-brand-50 border-brand-100', dot: 'bg-primary' },
  pending: { box: 'text-warning-text bg-warning-bg border-warning-border', dot: 'bg-warning-dot' },
  danger: { box: 'text-danger-text bg-danger-bg border-danger-border', dot: 'bg-danger' },
  neutral: { box: 'text-muted-foreground bg-secondary border-border', dot: 'bg-faint' },
};

/** Map a KnowledgeSource / workflow status string → tone + display label. */
const statusMap: Record<string, { tone: StatusTone; label: string }> = {
  ready: { tone: 'success', label: 'Ready' },
  done: { tone: 'success', label: 'Done' },
  published: { tone: 'success', label: 'Published' },
  approved: { tone: 'live', label: 'Approved · Live' },
  live: { tone: 'live', label: 'Live' },
  processing: { tone: 'pending', label: 'Processing' },
  uploaded: { tone: 'pending', label: 'Uploaded' },
  pending: { tone: 'pending', label: 'Pending' },
  draft: { tone: 'neutral', label: 'Draft' },
  error: { tone: 'danger', label: 'Failed' },
  failed: { tone: 'danger', label: 'Failed' },
};

export function StatusBadge({
  status,
  tone,
  dot = true,
  children,
  className,
}: {
  /** Back-compat: a status string is mapped to a tone + label. */
  status?: string;
  /** Or drive the tone directly and pass label via children. */
  tone?: StatusTone;
  dot?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  const mapped = status ? statusMap[status] : undefined;
  const t = tone ?? mapped?.tone ?? 'neutral';
  const label = children ?? mapped?.label ?? status ?? '';
  const cfg = tones[t];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-pill border px-2 py-[3px] font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] leading-none',
        cfg.box,
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />}
      {label}
    </span>
  );
}
