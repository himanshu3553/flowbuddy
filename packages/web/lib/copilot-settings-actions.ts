'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@sync/db';
import { getCurrentWorkspace } from '@/lib/session';

/** P1-M9 — set the copilot origin allowlist (newline/comma separated). Empty = allow any origin. */
export async function setCopilotOrigins(originsText: string): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const origins = [...new Set(originsText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
  await prisma.workspace.update({ where: { id: ctx.workspace.id }, data: { copilotAllowedOrigins: origins } });
  revalidatePath('/dashboard/copilot');
}

/** Trust setting — show/hide the "Source: <workflow>" citation chip on grounded answers. */
export async function setCopilotShowCitations(showCitations: boolean): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  await prisma.workspace.update({
    where: { id: ctx.workspace.id },
    data: { copilotShowCitations: showCitations },
  });
  revalidatePath('/dashboard/copilot');
}

/** Rotate the public embeddable key (invalidates the old one immediately). */
export async function regenerateCopilotKey(): Promise<void> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  await prisma.workspace.update({
    where: { id: ctx.workspace.id },
    data: { copilotPublicKey: 'pk_' + randomBytes(24).toString('hex') },
  });
  revalidatePath('/dashboard/copilot');
}
