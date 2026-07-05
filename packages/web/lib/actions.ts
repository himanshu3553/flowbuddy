'use server';

import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';
import { prisma } from '@sync/db';
import { signIn, signOut } from '@/auth';
import { createUserWithWorkspace } from '@/lib/workspace';
import { hashPassword, verifyPassword } from '@/lib/password';
import { emailEnabled, sendPasswordResetEmail, sendVerificationEmail } from '@/lib/email';
import { mintAuthToken, consumeAuthToken } from '@/lib/auth-tokens';
import {
  signInBlocked,
  recordSignInFailure,
  clearSignInFailures,
  emailRequestAllowed,
} from '@/lib/auth-limits';

const creds = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
});

const emailOnly = z.string().email();

/** Best-effort client IP for the auth limiter (Render/proxies set x-forwarded-for). */
async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown';
}

export async function signUpAction(_prev: string | undefined, formData: FormData): Promise<string | undefined> {
  const parsed = creds.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Invalid input.';
  try {
    // No email delivery configured (keyless local dev) → auto-verify; the verification
    // requirement only exists where a verification email can actually be sent.
    await createUserWithWorkspace(parsed.data.email, parsed.data.password, { verified: !emailEnabled });
  } catch (e) {
    return e instanceof Error ? e.message : 'Sign up failed.';
  }
  if (emailEnabled) {
    const token = await mintAuthToken('verify', parsed.data.email);
    await sendVerificationEmail(parsed.data.email, token);
    redirect('/signin?notice=verify-sent'); // throws
  }
  // Throws a redirect on success (propagates to Next).
  await signIn('credentials', { ...parsed.data, redirectTo: '/dashboard' });
  return undefined;
}

export async function signInAction(_prev: string | undefined, formData: FormData): Promise<string | undefined> {
  const parsed = creds.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) return 'Enter a valid email and password.';
  const ip = await clientIp();

  // §3.6 Cut 2 — brute-force gate, checked before any password work.
  if (signInBlocked(parsed.data.email, ip)) {
    return 'Too many sign-in attempts. Please wait a few minutes and try again.';
  }

  // Friendly message for the correct-password-but-unverified case (the authorize() backstop
  // would otherwise surface it as a generic credentials failure). Only when the password is
  // right — an attacker probing emails still sees the generic error below.
  if (emailEnabled) {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { passwordHash: true, emailVerified: true },
    });
    if (user?.passwordHash && !user.emailVerified && (await verifyPassword(parsed.data.password, user.passwordHash))) {
      return 'Please verify your email first — check your inbox for the verification link (or resend it from the link below).';
    }
  }

  try {
    await signIn('credentials', { ...parsed.data, redirectTo: '/dashboard' });
  } catch (e) {
    if (e instanceof AuthError) {
      recordSignInFailure(parsed.data.email, ip);
      return 'Invalid email or password.';
    }
    clearSignInFailures(parsed.data.email); // the non-AuthError throw is the success redirect
    throw e; // re-throw the redirect
  }
  return undefined;
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/signin' });
}

/**
 * §3.6 Cut 3 — request a password-reset link. Never reveals whether the account exists
 * (identical redirect either way); rate-limited so it can't mail-bomb an inbox.
 */
export async function requestPasswordResetAction(_prev: string | undefined, formData: FormData): Promise<string | undefined> {
  const parsed = emailOnly.safeParse(formData.get('email'));
  if (!parsed.success) return 'Enter a valid email address.';
  const email = parsed.data;

  if (!emailRequestAllowed(email, await clientIp())) {
    return 'Too many requests. Please wait a few minutes and try again.';
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true } });
  if (user?.passwordHash) {
    const token = await mintAuthToken('reset', email);
    await sendPasswordResetEmail(email, token);
  }
  redirect('/forgot-password?sent=1');
}

/** §3.6 Cut 3 — set a new password from an emailed reset token (single-use, 1 h TTL). */
export async function resetPasswordAction(_prev: string | undefined, formData: FormData): Promise<string | undefined> {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (password.length < 6) return 'Password must be at least 6 characters.';
  if (password !== confirm) return 'Passwords don’t match.';

  const email = await consumeAuthToken('reset', token);
  if (!email) return 'This reset link is invalid or has expired — request a new one.';

  await prisma.user.update({ where: { email }, data: { passwordHash: await hashPassword(password) } });
  // Completing a reset proves control of the inbox — count it as verification too.
  await prisma.user.updateMany({ where: { email, emailVerified: null }, data: { emailVerified: new Date() } });
  clearSignInFailures(email);
  redirect('/signin?notice=reset-done');
}

/** §3.6 Cut 3 — re-send the verification email (rate-limited; never reveals account existence). */
export async function resendVerificationAction(_prev: string | undefined, formData: FormData): Promise<string | undefined> {
  const parsed = emailOnly.safeParse(formData.get('email'));
  if (!parsed.success) return 'Enter a valid email address.';
  const email = parsed.data;

  if (!emailRequestAllowed(email, await clientIp())) {
    return 'Too many requests. Please wait a few minutes and try again.';
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true, emailVerified: true } });
  if (user?.passwordHash && !user.emailVerified) {
    const token = await mintAuthToken('verify', email);
    await sendVerificationEmail(email, token);
  }
  redirect('/verify-email?sent=1');
}
