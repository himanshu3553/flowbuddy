import { Skeleton } from '@/components/ui/skeleton';
import { HeaderSkeleton, CardSkeleton } from '@/components/dashboard/skeletons';

export default function CopilotLoading() {
  return (
    <>
      <HeaderSkeleton actions={1} />
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-5">
            <Skeleton className="h-10 w-64 rounded-lg" />
            <CardSkeleton className="h-40" />
            <CardSkeleton className="h-32" />
          </div>
          <CardSkeleton className="h-96" />
        </div>
      </div>
    </>
  );
}
