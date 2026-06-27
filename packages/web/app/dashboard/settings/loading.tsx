import { HeaderSkeleton, CardSkeleton } from '@/components/dashboard/skeletons';

export default function SettingsLoading() {
  return (
    <>
      <HeaderSkeleton />
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 md:px-8">
        <CardSkeleton className="h-32" />
        <CardSkeleton className="h-44" />
      </div>
    </>
  );
}
