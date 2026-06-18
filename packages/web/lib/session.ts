import { auth } from '@/auth';
import { prisma } from '@sync/db';

/** The signed-in user's workspace (single-user = single-workspace), or null. */
export async function getCurrentWorkspace() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const workspace = await prisma.workspace.findFirst({ where: { ownerId: userId } });
  return workspace ? { userId, workspace } : null;
}
