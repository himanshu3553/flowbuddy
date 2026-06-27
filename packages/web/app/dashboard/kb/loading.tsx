import { Skeleton } from '@/components/ui/skeleton';
import { HeaderSkeleton, ListSkeleton } from '@/components/dashboard/skeletons';

export default function KbLoading() {
  return (
    <>
      <HeaderSkeleton />
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:px-8">
        <Skeleton className="h-16 w-full rounded-xl" />
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-9 w-56 rounded-lg" />
          <Skeleton className="h-9 w-64 rounded-md" />
        </div>
        <ListSkeleton rows={6} />
      </div>
    </>
  );
}
