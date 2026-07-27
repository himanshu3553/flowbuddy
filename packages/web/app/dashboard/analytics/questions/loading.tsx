import { HeaderSkeleton, CardSkeleton } from '@/components/dashboard/skeletons';

export default function QuestionLogLoading() {
  return (
    <>
      <HeaderSkeleton actions={1} />
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:px-8">
        <CardSkeleton className="h-[34px]" />
        <CardSkeleton className="h-[520px]" />
      </div>
    </>
  );
}
