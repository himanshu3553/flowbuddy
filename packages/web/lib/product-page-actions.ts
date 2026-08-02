'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@flowbuddy/db';
import { getCurrentWorkspace } from '@/lib/session';

/**
 * AIL slice 2 — the founder's page mutations. Every one is ownership-scoped in the WHERE (id +
 * workspaceId, atomic — a foreign id mutates nothing) and every one revalidates the KB page.
 *
 * The liveness contract mirrors workflows: nothing is ever deleted; "not serving" is a state
 * (`inactiveReason`), so retiring is always reversible.
 */

async function requireWorkspace() {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  return ctx;
}

/** Approve a page (draft or retired → live), or retire a live one. */
export async function setProductPageApproval(input: {
  pageId: string;
  approved: boolean;
}): Promise<void> {
  const ctx = await requireWorkspace();
  const { count } = input.approved
    ? await prisma.productPage.updateMany({
        where: { id: input.pageId, workspaceId: ctx.workspace.id },
        data: {
          approvedAt: new Date(),
          approvedById: ctx.userId,
          inactiveReason: null,
          inactiveAt: null,
        },
      })
    : await prisma.productPage.updateMany({
        where: { id: input.pageId, workspaceId: ctx.workspace.id },
        data: { inactiveReason: 'retired', inactiveAt: new Date() },
      });
  if (count === 0) throw new Error('Page not found');
  revalidatePath('/dashboard/kb');
}

/**
 * Accept a parked re-derivation: the pending text becomes the page, its embedding comes with it
 * (so identity matching stays in step with the content — see the schema comment), and the page is
 * (re-)approved in the same act: the founder has just read exactly what will serve.
 */
export async function acceptProductPageUpdate(input: { pageId: string }): Promise<void> {
  const ctx = await requireWorkspace();
  const count = await prisma.$executeRaw`
    UPDATE "ProductPage" SET
      content = "pendingContent",
      provenance = COALESCE("pendingProvenance", provenance),
      embedding = "pendingEmbedding",
      "pendingContent" = NULL, "pendingProvenance" = NULL, "pendingAt" = NULL, "pendingEmbedding" = NULL,
      "approvedAt" = NOW(), "approvedById" = ${ctx.userId},
      "inactiveReason" = NULL, "inactiveAt" = NULL,
      "updatedAt" = NOW()
    WHERE id = ${input.pageId} AND "workspaceId" = ${ctx.workspace.id} AND "pendingContent" IS NOT NULL`;
  if (count === 0) throw new Error('No pending update on this page');
  revalidatePath('/dashboard/kb');
}

/** Dismiss a parked re-derivation: the approved text stands, the proposal is dropped. */
export async function dismissProductPageUpdate(input: { pageId: string }): Promise<void> {
  const ctx = await requireWorkspace();
  const count = await prisma.$executeRaw`
    UPDATE "ProductPage" SET
      "pendingContent" = NULL, "pendingProvenance" = NULL, "pendingAt" = NULL, "pendingEmbedding" = NULL,
      "updatedAt" = NOW()
    WHERE id = ${input.pageId} AND "workspaceId" = ${ctx.workspace.id} AND "pendingContent" IS NOT NULL`;
  if (count === 0) throw new Error('No pending update on this page');
  revalidatePath('/dashboard/kb');
}
