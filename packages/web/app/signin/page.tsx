'use client';

import { useActionState } from 'react';
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

export default function SignInPage() {
  const [error, action, pending] = useActionState(signInAction, undefined);
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Sync Studio</h1>
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
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
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
      </div>
    </div>
  );
}
