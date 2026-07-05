import { prisma } from '@sync/db';
import { hashPassword } from '@/lib/password';

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
  return base || 'workspace';
}

/** Create a user (credentials) and auto-create their workspace (single-user = single-workspace).
 *  `verified` = stamp `emailVerified` immediately (used when email delivery isn't configured —
 *  the verification requirement only exists where a verification email can actually be sent). */
export async function createUserWithWorkspace(
  email: string,
  password: string,
  opts: { verified?: boolean } = {},
) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('An account with this email already exists.');

  const passwordHash = await hashPassword(password);
  const local = email.split('@')[0] ?? 'workspace';
  const slug = `${slugify(local)}-${Math.random().toString(36).slice(2, 7)}`;

  return prisma.user.create({
    data: {
      email,
      passwordHash,
      emailVerified: opts.verified ? new Date() : null,
      ownedWorkspaces: { create: { name: `${local}'s workspace`, slug } },
    },
    include: { ownedWorkspaces: true },
  });
}
