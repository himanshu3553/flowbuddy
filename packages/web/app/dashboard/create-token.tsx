'use client';

import { useActionState } from 'react';
import { createTokenAction } from '@/lib/actions';

type State = { token?: string; error?: string };

export function CreateToken() {
  const [state, action, pending] = useActionState<State, FormData>(
    async () => createTokenAction(),
    {},
  );

  return (
    <div>
      <form action={action}>
        <button type="submit" disabled={pending}>
          {pending ? 'Generating…' : 'Create API token'}
        </button>
      </form>
      {state.token && (
        <p style={{ marginTop: 12 }}>
          <span className="muted">Copy this now — it&apos;s shown only once:</span>
          <br />
          <code>{state.token}</code>
        </p>
      )}
      {state.error && <p className="error">{state.error}</p>}
    </div>
  );
}
