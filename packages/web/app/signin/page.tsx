'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signInAction } from '@/lib/actions';

export default function SignInPage() {
  const [error, action, pending] = useActionState(signInAction, undefined);
  return (
    <main>
      <h1>Sign in</h1>
      <p className="sub">Welcome back to Sync Studio.</p>
      <form action={action}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        No account? <Link href="/signup">Create one</Link>
      </p>
    </main>
  );
}
