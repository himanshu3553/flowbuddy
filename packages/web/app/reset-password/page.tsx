'use client';

import { use, useActionState } from 'react';
import Link from 'next/link';
import { resetPasswordAction } from '@/lib/actions';
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

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = use(searchParams);
  const [error, action, pending] = useActionState(resetPasswordAction, undefined);
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
            <CardTitle className="text-lg">Choose a new password</CardTitle>
            <CardDescription>
              {token
                ? 'Set the new password for your account.'
                : 'This page needs a reset link.'}
            </CardDescription>
          </CardHeader>
          {token ? (
            <form action={action}>
              <CardContent className="space-y-4">
                <input type="hidden" name="token" value={token} />
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm new password</Label>
                  <Input
                    id="confirm"
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? 'Saving…' : 'Set new password'}
                </Button>
              </CardFooter>
            </form>
          ) : (
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Open the link from your reset email, or{' '}
                <Link
                  href="/forgot-password"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  request a new one
                </Link>
                .
              </p>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
