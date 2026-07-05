import Link from 'next/link';
import { prisma } from '@sync/db';
import { consumeAuthToken } from '@/lib/auth-tokens';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ResendVerificationForm } from './resend-form';

export const dynamic = 'force-dynamic'; // token consumption is a write — never cache/prerender

/**
 * /verify-email — three modes:
 *   ?token=…  → redeem the emailed verification token (single-use) and activate the account
 *   ?sent=1   → post-redirect confirmation after a resend request
 *   (bare)    → the resend form
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; sent?: string }>;
}) {
  const { token, sent } = await searchParams;

  let body: React.ReactNode;
  if (token) {
    const email = await consumeAuthToken('verify', token);
    if (email) {
      await prisma.user.updateMany({
        where: { email, emailVerified: null },
        data: { emailVerified: new Date() },
      });
      body = (
        <>
          <CardHeader>
            <CardTitle className="text-lg">Email verified 🎉</CardTitle>
            <CardDescription>Your account is active — sign in to get started.</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild className="w-full">
              <Link href="/signin">Sign in</Link>
            </Button>
          </CardFooter>
        </>
      );
    } else {
      body = (
        <>
          <CardHeader>
            <CardTitle className="text-lg">This link didn’t work</CardTitle>
            <CardDescription>
              The verification link is invalid, expired, or was already used. Enter your email to
              get a fresh one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResendVerificationForm />
          </CardContent>
        </>
      );
    }
  } else if (sent) {
    body = (
      <>
        <CardHeader>
          <CardTitle className="text-lg">Check your inbox</CardTitle>
          <CardDescription>
            If that account needs verification, a fresh link is on its way (valid for 24 hours).
          </CardDescription>
        </CardHeader>
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
      </>
    );
  } else {
    body = (
      <>
        <CardHeader>
          <CardTitle className="text-lg">Resend verification email</CardTitle>
          <CardDescription>
            Enter your account email and we’ll send a fresh verification link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResendVerificationForm />
        </CardContent>
      </>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-gradient-logo text-sm font-bold text-white">
            S
          </span>
          <h1 className="text-xl font-extrabold tracking-tight text-ink">Sync Studio</h1>
        </div>
        <Card>{body}</Card>
      </div>
    </div>
  );
}
