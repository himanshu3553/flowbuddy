'use client';

import { use, useActionState } from 'react';
import Link from 'next/link';
import { signInAction } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Post-redirect notices from the auth flows (signup-with-verification, completed reset).
const NOTICES: Record<string, string> = {
  'verify-sent': 'Almost there — we’ve emailed you a verification link. Click it, then sign in.',
  'reset-done': 'Password updated. Sign in with your new password.',
};

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = use(searchParams);
  const [error, action, pending] = useActionState(signInAction, undefined);
  const showResend = Boolean(error?.startsWith('Please verify your email'));
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-gradient-logo text-sm font-bold text-white">
            S
          </span>
          <h1 className="text-xl font-extrabold tracking-tight text-ink">Sync Studio</h1>
          <p className="text-sm text-muted-foreground">
            The in-app help copilot for your SaaS.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sign in</CardTitle>
            <CardDescription>
              Welcome back. Enter your details to continue.
            </CardDescription>
          </CardHeader>
          <form action={action}>
            <CardContent className="space-y-4">
              {notice && NOTICES[notice] && (
                <p className="rounded-control border border-success-border bg-success-bg px-3 py-2 text-sm text-success-text2">
                  {NOTICES[notice]}
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {showResend && (
                <p className="text-sm text-muted-foreground">
                  Didn’t get it?{' '}
                  <Link
                    href="/verify-email"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Resend the verification email
                  </Link>
                </p>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Signing in…' : 'Sign in'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                No account?{' '}
                <Link
                  href="/signup"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Create one
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link
            href="/privacy"
            className="underline-offset-4 hover:text-ink hover:underline"
          >
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
