import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { prisma } from '@sync/db';
import { verifyPassword } from '@/lib/password';
import { emailEnabled } from '@/lib/email';

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' }, // required for the Credentials provider
  pages: { signIn: '/signin' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (raw) => {
        const parsed = credsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
        if (!user?.passwordHash) return null;
        const ok = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        // Verified-email gate (§3.6 Cut 3) — enforced ONLY when email delivery is configured
        // (RESEND_API_KEY set); keyless local dev auto-verifies at signup so nothing changes
        // there. signInAction pre-checks this case to show a friendly message; this is the
        // backstop that makes every sign-in path honor it.
        if (emailEnabled && !user.emailVerified) return null;
        return { id: user.id, email: user.email ?? undefined, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    // Auth.js stores the user id in the standard JWT `sub` claim by default.
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
