'use server';

import { AuthError } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@sync/db';
import { auth, signIn, signOut } from '@/auth';
import { createUserWithWorkspace } from '@/lib/workspace';
import { createApiToken } from '@/lib/tokens';

const creds = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
});

export async function signUpAction(_prev: string | undefined, formData: FormData): Promise<string | undefined> {
  const parsed = creds.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Invalid input.';
  try {
    await createUserWithWorkspace(parsed.data.email, parsed.data.password);
  } catch (e) {
    return e instanceof Error ? e.message : 'Sign up failed.';
  }
  // Throws a redirect on success (propagates to Next).
  await signIn('credentials', { ...parsed.data, redirectTo: '/dashboard' });
  return undefined;
}

export async function signInAction(_prev: string | undefined, formData: FormData): Promise<string | undefined> {
  const parsed = creds.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) return 'Enter a valid email and password.';
  try {
    await signIn('credentials', { ...parsed.data, redirectTo: '/dashboard' });
  } catch (e) {
    if (e instanceof AuthError) return 'Invalid email or password.';
    throw e; // re-throw the redirect
  }
  return undefined;
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/signin' });
}

export async function createTokenAction(): Promise<{ token?: string; error?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: 'Not authenticated.' };
  const ws = await prisma.workspace.findFirst({ where: { ownerId: userId } });
  if (!ws) return { error: 'No workspace found.' };
  const token = await createApiToken(ws.id);
  return { token };
}
