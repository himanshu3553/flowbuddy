import { HeaderSkeleton, CardSkeleton } from '@/components/dashboard/skeletons';

export default function KbDetailLoading() {
  return (
    <>
      <HeaderSkeleton actions={1} />
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8">
        <CardSkeleton className="h-40" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-5">
            <CardSkeleton className="h-64" />
            <CardSkeleton className="h-64" />
          </div>
          <div className="min-w-0 space-y-5">
            <CardSkeleton className="h-40" />
            <CardSkeleton className="h-32" />
          </div>
        </div>
      </div>
    </>
  );
}
