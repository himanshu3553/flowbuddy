'use client';

import { useActionState } from 'react';
import { createTokenAction } from '@/lib/actions';
import { Button } from '@/components/ui/button';

type State = { token?: string; error?: string };

export function CreateToken() {
  const [state, action, pending] = useActionState<State, FormData>(
    async () => createTokenAction(),
    {},
  );

  return (
    <div className="space-y-3">
      <form action={action}>
        <Button type="submit" disabled={pending}>
          {pending ? 'Generating…' : 'Create API token'}
        </Button>
      </form>
      {state.token && (
        <div className="rounded-control border bg-secondary p-3">
          <p className="mb-1 text-xs text-muted-foreground">
            Copy this now — it&apos;s shown only once:
          </p>
          <code className="block break-all rounded bg-background px-2 py-1 text-xs">
            {state.token}
          </code>
        </div>
      )}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </div>
  );
}
