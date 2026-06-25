import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function DashboardNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 px-4 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileQuestion className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold">Not found</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        We couldn&apos;t find that page or recording.
      </p>
      <Button asChild variant="outline">
        <Link href="/dashboard">Back to Home</Link>
      </Button>
    </div>
  );
}
