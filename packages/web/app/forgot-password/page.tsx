'use client';

import { use, useActionState } from 'react';
import Link from 'next/link';
import { requestPasswordResetAction } from '@/lib/actions';
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

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = use(searchParams);
  const [error, action, pending] = useActionState(requestPasswordResetAction, undefined);
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-gradient-logo text-sm font-bold text-white">
            S
          </span>
          <h1 className="text-xl font-extrabold tracking-tight text-ink">Sync Studio</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Reset your password</CardTitle>
            <CardDescription>
              {sent
                ? 'Check your inbox.'
                : 'Enter your account email and we’ll send you a reset link.'}
            </CardDescription>
          </CardHeader>
          {sent ? (
            <CardContent>
              <p className="rounded-control border border-success-border bg-success-bg px-3 py-2 text-sm text-success-text2">
                If an account exists for that email, a reset link is on its way. The link is valid
                for 1 hour.
              </p>
            </CardContent>
          ) : (
            <form action={action}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" autoComplete="email" required />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? 'Sending…' : 'Send reset link'}
                </Button>
              </CardFooter>
            </form>
          )}
          <CardFooter>
            <p className="w-full text-center text-sm text-muted-foreground">
              <Link
                href="/signin"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Back to sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
