import { Skeleton } from '@/components/ui/skeleton';
import { HeaderSkeleton, CardSkeleton } from '@/components/dashboard/skeletons';

export default function RecordingDetailLoading() {
  return (
    <>
      <HeaderSkeleton actions={2} />
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8">
        <Skeleton className="h-4 w-28 rounded" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-6">
            <Skeleton className="aspect-[16/10] w-full rounded-card" />
            <div className="space-y-2.5">
              <Skeleton className="h-5 w-40 rounded" />
              <CardSkeleton />
            </div>
          </div>
          <div className="space-y-5">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </div>
      </div>
    </>
  );
}
