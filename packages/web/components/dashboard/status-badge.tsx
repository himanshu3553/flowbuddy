import { cn } from '@/lib/utils';

const styles: Record<string, string> = {
  ready: 'bg-blue-100 text-blue-800',
  done: 'bg-green-100 text-green-800',
  published: 'bg-green-100 text-green-800',
  processing: 'bg-amber-100 text-amber-800',
  uploaded: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
};

/** Status pill for a KnowledgeSource (uploaded | processing | ready | done | error). */
export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
        styles[status] ?? 'bg-secondary text-secondary-foreground',
      )}
    >
      {status}
    </span>
  );
}
