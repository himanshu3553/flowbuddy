import { HeaderSkeleton, CardSkeleton } from '@/components/dashboard/skeletons';

export default function HomeLoading() {
  return (
    <>
      <HeaderSkeleton actions={2} />
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">
        <CardSkeleton className="h-80" />
      </div>
    </>
  );
}
