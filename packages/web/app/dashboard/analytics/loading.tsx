import {
  HeaderSkeleton,
  MetricGridSkeleton,
  CardSkeleton,
} from '@/components/dashboard/skeletons';

export default function AnalyticsLoading() {
  return (
    <>
      <HeaderSkeleton actions={1} />
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-8">
        <MetricGridSkeleton count={5} />
        <CardSkeleton className="h-48" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <CardSkeleton className="h-64" />
          <div className="min-w-0 space-y-6">
            <CardSkeleton className="h-28" />
            <CardSkeleton className="h-24" />
            <CardSkeleton className="h-28" />
          </div>
        </div>
      </div>
    </>
  );
}
