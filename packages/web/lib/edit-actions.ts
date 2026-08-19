'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@flowbuddy/db';
import { distilledStepText } from '@flowbuddy/synthesis/distill';
import { embedTexts, toVectorLiteral } from '@flowbuddy/synthesis/embeddings';
import { getCurrentWorkspace } from '@/lib/session';
import { compileWorkflowPlan } from '@/lib/plan-compile';

/**
 * Founder edits — title, description, step instruction/detail (the workflow-editing arc, item 2).
 *
 * Only the PROSE is the founder's to edit. The anchor fields (`keyEventId`, `sourceEventIds`,
 * `route`, `bbox`, `screenshotFile`, `evidence`) stay exactly as captured — they are what makes a
 * step cite a real recorded event, and no edit surface may touch them.
 *
 * Every edit stamps its field (schema.prisma owns the rule): a stamped field is HUMAN-OWNED and the
 * reprocess worker keeps it instead of refreshing it from model output — step edits ride their
 * anchor (`data.keyEventId`) through the rebuild.
 *
 * A step edit moves `text`, `data` AND the embedding TOGETHER or not at all: the worker matches
 * vectors to rows BY TEXT, so a text write without its re-embed desyncs retrieval invisibly.
 * Embedding failure therefore fails the whole save — the honest outcome.
 */

const TITLE_MAX = 160;
const DESCRIPTION_MAX = 4000;
const INSTRUCTION_MAX = 400;
const DETAIL_MAX = 1000;

/** Result object rather than a thrown error: in production Next masks thrown server-action
 *  messages, and the reason a save was refused ("re-index failed, nothing changed") IS the content. */
export type EditResult = { ok: true; actingParked?: boolean } | { ok: false; error: string };

export async function updateWorkflowTitle(input: { workflowId: string; title: string }): Promise<EditResult> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) return { ok: false, error: 'Not authenticated' };
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'A workflow needs a title.' };
  if (title.length > TITLE_MAX) return { ok: false, error: `Keep the title under ${TITLE_MAX} characters.` };

  const workflow = await prisma.workflow.findFirst({
    where: { id: input.workflowId, workspaceId: ctx.workspace.id },
    select: { id: true, sourceId: true },
  });
  if (!workflow) return { ok: false, error: 'Workflow not found' };

  // The title lives in three places today (the row, the items' per-item copy, the approval
  // snapshot) — one edit moves all of them together so no surface keeps showing the old name.
  // Overwriting the approval snapshot is deliberate: the founder editing IS the approver, and a
  // stale snapshot would make Studio lists disagree with the page they renamed it on.
  await prisma.$transaction([
    prisma.workflow.update({
      where: { id: workflow.id },
      data: { title, titleEditedAt: new Date() },
    }),
    prisma.knowledgeItem.updateMany({ where: { workflowId: workflow.id }, data: { segmentTitle: title } }),
    prisma.copilotApproval.updateMany({ where: { workflowId: workflow.id }, data: { segmentTitle: title } }),
  ]);

  revalidatePath(`/dashboard/kb/${workflow.sourceId}`);
  revalidatePath('/dashboard/kb');
  return { ok: true };
}

export async function updateWorkflowDescription(input: {
  workflowId: string;
  description: string;
}): Promise<EditResult> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) return { ok: false, error: 'Not authenticated' };
  const description = input.description.trim();
  if (description.length > DESCRIPTION_MAX) {
    return { ok: false, error: `Keep the description under ${DESCRIPTION_MAX} characters.` };
  }

  const workflow = await prisma.workflow.findFirst({
    where: { id: input.workflowId, workspaceId: ctx.workspace.id },
    select: { id: true, sourceId: true },
  });
  if (!workflow) return { ok: false, error: 'Workflow not found' };

  // Clearing is a real edit and stamps too: a founder who deleted the description meant absence,
  // and a reprocess must not resurrect the model's version of it.
  await prisma.workflow.update({
    where: { id: workflow.id },
    data: { description: description || null, descriptionEditedAt: new Date() },
  });

  revalidatePath(`/dashboard/kb/${workflow.sourceId}`);
  return { ok: true };
}

export async function updateStepText(input: {
  itemId: string;
  instruction: string;
  detail: string;
}): Promise<EditResult> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) return { ok: false, error: 'Not authenticated' };
  const instruction = input.instruction.trim();
  const detail = input.detail.trim();
  if (!instruction) return { ok: false, error: 'A step needs an instruction.' };
  if (instruction.length > INSTRUCTION_MAX || detail.length > DETAIL_MAX) {
    return { ok: false, error: 'That edit is too long for a step — longer context belongs in the workflow description.' };
  }

  const item = await prisma.knowledgeItem.findFirst({
    where: { id: input.itemId, workspaceId: ctx.workspace.id, kind: 'step' },
    select: { id: true, data: true, workflowId: true, sourceId: true },
  });
  if (!item) return { ok: false, error: 'Step not found' };

  const data = { ...(item.data as Record<string, unknown>) };
  data.instruction = instruction;
  if (detail) data.detail = detail;
  else delete data.detail;

  const narration = typeof data.narration === 'string' ? data.narration : null;
  const text = distilledStepText({
    instruction,
    ...(detail ? { detail } : {}),
    route: typeof data.route === 'string' ? data.route : '',
    narration,
    screenshotFile: null,
  });

  // Re-embed BEFORE writing (see the header): text and vector move together or not at all.
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) {
    return { ok: false, error: 'Studio has no OPENAI_API_KEY, so the edited text cannot be re-indexed — nothing was changed.' };
  }
  let vector: number[];
  try {
    const [v] = await embedTexts([text], {
      apiKey,
      model: process.env.EMBED_MODEL || undefined,
      timeoutMs: 15_000,
      maxRetries: 1,
    });
    if (!v) throw new Error('no vector returned');
    vector = v;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Name WHOSE key failed: Studio's OPENAI_API_KEY is a separate env entry from the api's
    // (packages/web/.env locally, the web service's env on Render), and a drifted copy fails
    // here while recordings keep processing fine — which reads as an account problem otherwise.
    return {
      ok: false,
      error: `Could not re-index the edited text — Studio's own OPENAI_API_KEY failed (${msg}). The api/worker uses a separate key entry, so check the web service's. Nothing was changed.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.knowledgeItem.update({
      where: { id: item.id },
      data: { text, data: data as object, editedAt: new Date(), editedById: ctx.userId },
    });
    await tx.$executeRaw`UPDATE "KnowledgeItem" SET embedding = ${toVectorLiteral(vector)}::vector WHERE id = ${item.id}`;
  });

  // Acting reads the step text too (a run narrates it), so an enabled workflow's plan is
  // recompiled and its consent pin re-hashed — an in-flight run 409s at its next resume, by
  // design: the pinned hash must match what a user was shown. A recompile that turns ineligible
  // parks acting for re-review (the worker's reprocess rule) rather than keeping a stale plan
  // runnable; the founder re-enables from the workflow page, which recompiles for itself.
  const approval = await prisma.copilotApproval.findUnique({
    where: { workflowId: item.workflowId },
    select: { executeState: true },
  });
  let actingParked = false;
  if (approval?.executeState === 'enabled') {
    const compiled = await compileWorkflowPlan(ctx.workspace.id, item.workflowId, item.sourceId);
    if (compiled.ok) {
      await prisma.executionPlan.upsert({
        where: { workflowId: item.workflowId },
        create: {
          workspaceId: ctx.workspace.id,
          workflowId: item.workflowId,
          planHash: compiled.hash,
          stepCount: compiled.steps.length,
          steps: compiled.steps as object,
          contract: compiled.contract as object,
        },
        update: {
          planHash: compiled.hash,
          stepCount: compiled.steps.length,
          steps: compiled.steps as object,
          contract: compiled.contract as object,
        },
      });
    } else {
      await prisma.copilotApproval.update({
        where: { workflowId: item.workflowId },
        data: { executeState: 'needs_review' },
      });
      actingParked = true;
    }
  }

  revalidatePath(`/dashboard/kb/${item.sourceId}`);
  return { ok: true, ...(actingParked ? { actingParked: true } : {}) };
}
