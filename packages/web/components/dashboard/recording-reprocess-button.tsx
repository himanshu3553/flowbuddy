'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

import { reprocessRecording } from '@/lib/recording-actions';
import { Button } from '@/components/ui/button';

/** Inline "retry" for a failed recording — re-enqueues it for synthesis. */
export function ReprocessButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await reprocessRecording(id);
          router.refresh();
        })
      }
    >
      <RefreshCw className={pending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
      {pending ? 'Re-processing…' : 'Re-process recording'}
    </Button>
  );
}
