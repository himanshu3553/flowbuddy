// PARKED — Phase 2 (Help Portal & Articles). Dormant for the Phase-1 copilot release; not
// reachable from the shipped product. Kept in-tree (type-checked) so Phase 2 resumes from it —
// do not delete. Inventory + re-wiring steps: docs/phase-2-portal.md → "Parked Phase 2 code".
'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';

async function assertArticle(articleId: string) {
  const ws = await getCurrentWorkspace();
  if (!ws) throw new Error('Not authenticated');
  const article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article || article.workspaceId !== ws.workspace.id) throw new Error('Article not found');
  return article;
}

async function assertStep(stepId: string) {
  const ws = await getCurrentWorkspace();
  if (!ws) throw new Error('Not authenticated');
  const step = await prisma.step.findUnique({ where: { id: stepId }, include: { article: true } });
  if (!step || step.article.workspaceId !== ws.workspace.id) throw new Error('Step not found');
  return step;
}

export async function updateArticleTitle(articleId: string, title: string): Promise<void> {
  await assertArticle(articleId);
  await prisma.article.update({ where: { id: articleId }, data: { title: title.trim() || 'Untitled' } });
  revalidatePath(`/dashboard/articles/${articleId}`);
}

export async function setArticleStatus(articleId: string, status: 'draft' | 'published'): Promise<void> {
  await assertArticle(articleId);
  await prisma.article.update({ where: { id: articleId }, data: { status } });
  revalidatePath(`/dashboard/articles/${articleId}`);
  revalidatePath('/dashboard');
}

export async function updateStep(
  stepId: string,
  data: { instruction: string; rationale: string },
): Promise<void> {
  const step = await assertStep(stepId);
  await prisma.step.update({
    where: { id: stepId },
    data: { instruction: data.instruction, rationale: data.rationale.trim() || null },
  });
  revalidatePath(`/dashboard/articles/${step.articleId}`);
}

export async function deleteStep(stepId: string): Promise<void> {
  const step = await assertStep(stepId);
  await prisma.step.delete({ where: { id: stepId } });
  revalidatePath(`/dashboard/articles/${step.articleId}`);
}

export async function moveStep(stepId: string, dir: 'up' | 'down'): Promise<void> {
  const step = await assertStep(stepId);
  const siblings = await prisma.step.findMany({
    where: { articleId: step.articleId },
    orderBy: { orderIndex: 'asc' },
  });
  const idx = siblings.findIndex((s) => s.id === stepId);
  const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) return;
  const a = siblings[idx]!;
  const b = siblings[swapIdx]!;
  await prisma.$transaction([
    prisma.step.update({ where: { id: a.id }, data: { orderIndex: b.orderIndex } }),
    prisma.step.update({ where: { id: b.id }, data: { orderIndex: a.orderIndex } }),
  ]);
  revalidatePath(`/dashboard/articles/${step.articleId}`);
}
