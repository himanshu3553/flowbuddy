import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/** Mimics the sticky PageHeader so loading states don't shift layout. */
export function HeaderSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 py-2.5 md:px-8">
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-48" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: actions }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-md" />
        ))}
      </div>
    </div>
  );
}

export function MetricGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-card border bg-card p-4 shadow-card">
          <Skeleton className="h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-card border bg-card">
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('w-full rounded-xl', className)} />;
}
