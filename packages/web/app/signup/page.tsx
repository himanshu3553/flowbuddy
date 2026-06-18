'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signUpAction } from '@/lib/actions';

export default function SignUpPage() {
  const [error, action, pending] = useActionState(signUpAction, undefined);
  return (
    <main>
      <h1>Create your account</h1>
      <p className="sub">Sign up to create your Sync workspace.</p>
      <form action={action}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create account'}</button>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        Already have an account? <Link href="/signin">Sign in</Link>
      </p>
    </main>
  );
}
