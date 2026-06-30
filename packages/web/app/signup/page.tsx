'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signUpAction } from '@/lib/actions';
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

export default function SignUpPage() {
  const [error, action, pending] = useActionState(signUpAction, undefined);
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
            <CardTitle className="text-lg">Create your account</CardTitle>
            <CardDescription>
              Sign up to create your Sync workspace.
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
                  autoComplete="new-password"
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Creating…' : 'Create account'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link
                  href="/signin"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Sign in
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
