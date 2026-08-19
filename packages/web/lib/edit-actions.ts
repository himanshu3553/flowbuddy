'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@flowbuddy/db';
import type { SessionManifest } from '@flowbuddy/shared';
import { distilledStepText, type EditedStepField } from '@flowbuddy/synthesis/distill';
import { embedTexts, toVectorLiteral } from '@flowbuddy/synthesis/embeddings';
import { getCurrentWorkspace } from '@/lib/session';
import { compileWorkflowPlan } from '@/lib/plan-compile';
import { timelineEvents } from '@/lib/recordings';
import { sessionObjectKey, signedUrl } from '@/lib/storage';

/**
 * Founder edits — title, description, step instruction/detail, step frame (the workflow-editing
 * arc, items 2+3).
 *
 * Only the founder's LAYER of a step is editable: the prose (instruction/detail) and which of the
 * recording's own captured frames illustrates it — a frame choice is validated against the
 * manifest, so everything shown remains real capture, and `bbox` follows the picture: an action
 * frame carries its own target rect, an "after" frame has none and clears the highlight. The event
 * citation itself (`keyEventId`, `sourceEventIds`, `route`, `evidence`) stays exactly as captured —
 * it is what makes a step evidence rather than prose, and no edit surface may touch it.
 *
 * Every edit stamps its field (schema.prisma owns the rule): a stamped field is HUMAN-OWNED and the
 * reprocess worker keeps it instead of refreshing it from model output — step edits ride their
 * anchor (`data.keyEventId`) through the rebuild, with `data.editedFields` saying which parts.
 *
 * A step TEXT edit moves `text`, `data` AND the embedding TOGETHER or not at all: the worker
 * matches vectors to rows BY TEXT, so a text write without its re-embed desyncs retrieval
 * invisibly. Embedding failure therefore fails the whole save — the honest outcome. (An image
 * swap leaves `text` untouched, so it needs no embedding call.)
 */

const TITLE_MAX = 160;
const DESCRIPTION_MAX = 4000;
const INSTRUCTION_MAX = 400;
const DETAIL_MAX = 1000;
/** Frame-picker window: how many frames each side of the anchor a request may sign. The picker
 *  starts at ±5 and extends in chunks — never the whole recording in one response. */
const FRAME_WINDOW_MAX = 50;

/** The stored `data.editedFields`, normalized. Legacy rows (edited before images were editable)
 *  have a stamp but no list — they are text edits. */
function editedFieldsOf(data: Record<string, unknown>, editedAt: Date | null): EditedStepField[] {
  const raw = data.editedFields;
  if (Array.isArray(raw)) return raw.filter((f): f is EditedStepField => f === 'text' || f === 'image');
  return editedAt ? ['text'] : [];
}

/** Recompile + re-pin an acting-enabled workflow's plan after a step edit; park acting for
 *  re-review when the new content no longer compiles clean (the worker's reprocess rule). Returns
 *  whether acting was parked. In-flight runs 409 at their next resume — by design: the pinned
 *  consent hash must match what a user was shown. */
async function recompileIfActing(workspaceId: string, workflowId: string, sourceId: string): Promise<boolean> {
  const approval = await prisma.copilotApproval.findUnique({
    where: { workflowId },
    select: { executeState: true },
  });
  if (approval?.executeState !== 'enabled') return false;
  const compiled = await compileWorkflowPlan(workspaceId, workflowId, sourceId);
  if (compiled.ok) {
    await prisma.executionPlan.upsert({
      where: { workflowId },
      create: {
        workspaceId,
        workflowId,
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
    return false;
  }
  await prisma.copilotApproval.update({
    where: { workflowId },
    data: { executeState: 'needs_review' },
  });
  return true;
}

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
    select: { id: true, data: true, workflowId: true, sourceId: true, editedAt: true },
  });
  if (!item) return { ok: false, error: 'Step not found' };

  const data = { ...(item.data as Record<string, unknown>) };
  data.instruction = instruction;
  if (detail) data.detail = detail;
  else delete data.detail;
  data.editedFields = [...new Set([...editedFieldsOf(data, item.editedAt), 'text'])];

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

  // Acting reads the step text too (a run narrates it) — recompile + re-pin, or park (see helper).
  const actingParked = await recompileIfActing(ctx.workspace.id, item.workflowId, item.sourceId);

  revalidatePath(`/dashboard/kb/${item.sourceId}`);
  return { ok: true, ...(actingParked ? { actingParked: true } : {}) };
}

/** A WINDOW of the recording's frames, in timeline order — the choices `updateStepImage` accepts.
 *  Each carries the ACTION it belongs to (`click "Save"` / `after click "Save"`), because a wall of
 *  look-alike screenshots is unchoosable without knowing which moment each one is. Action frames
 *  also carry the target's `bbox` so the picker can draw the same "click here" highlight the step
 *  card shows ("after" frames deliberately don't — the page has changed and the rect is stale);
 *  `viewport` is what scales those rects, absent on very old recordings. Only the window is
 *  presigned — the carousel starts around the current frame and asks again to extend. */
export type RecordingFrames =
  | {
      ok: true;
      current: string | null;
      viewport: { w: number; h: number } | null;
      /** How many frames the whole recording has (the carousel's global axis). */
      total: number;
      /** Global index of `frames[0]` on that axis. */
      start: number;
      frames: {
        file: string;
        url: string;
        label: string;
        route: string;
        bbox: { x: number; y: number; w: number; h: number } | null;
      }[];
    }
  | { ok: false; error: string };

export async function listRecordingFrames(input: {
  itemId: string;
  /** Center/extend the window on this frame; omitted = the step's current frame. */
  anchorFile?: string;
  /** Frames to include before/after the anchor (defaults ±5, capped). */
  before?: number;
  after?: number;
}): Promise<RecordingFrames> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) return { ok: false, error: 'Not authenticated' };

  const item = await prisma.knowledgeItem.findFirst({
    where: { id: input.itemId, workspaceId: ctx.workspace.id, kind: 'step' },
    select: { data: true, sourceId: true },
  });
  if (!item) return { ok: false, error: 'Step not found' };
  const source = await prisma.knowledgeSource.findUnique({
    where: { id: item.sourceId },
    select: { manifest: true },
  });
  const manifest = source?.manifest as unknown as SessionManifest | null;
  if (!manifest?.events?.length) {
    return { ok: false, error: 'The recording’s raw capture is missing, so there are no frames to choose from.' };
  }

  // The same per-event human labels the recording player shows ("click · Save Changes").
  const labelByEventId = new Map(timelineEvents(manifest).map((e) => [e.id, e]));

  // Enumerate every frame (metadata only — cheap); sign only the requested window below.
  const seen = new Set<string>();
  const picked: { file: string; label: string; route: string; bbox: { x: number; y: number; w: number; h: number } | null }[] = [];
  for (const ev of manifest.events) {
    const meta = labelByEventId.get(ev.id);
    const action = meta ? `${meta.type}${meta.label ? ` “${meta.label}”` : ''}` : '';
    const shots: Array<[string | undefined, string, typeof ev.target.bbox | undefined]> = [
      [ev.screenshot?.file, action, ev.target?.bbox],
      [ev.postAction?.screenshot?.file, action ? `after ${action}` : 'after', undefined],
    ];
    for (const [file, label, bbox] of shots) {
      if (!file || seen.has(file)) continue;
      seen.add(file);
      picked.push({ file, label, route: ev.route?.path ?? '', bbox: bbox ?? null });
    }
  }

  const d = item.data as Record<string, unknown>;
  const currentFile = typeof d.screenshotFile === 'string' ? d.screenshotFile : null;
  const anchor = input.anchorFile ?? currentFile;
  const anchorIdx = Math.max(0, anchor ? picked.findIndex((f) => f.file === anchor) : 0);
  const before = Math.min(Math.max(input.before ?? 5, 0), FRAME_WINDOW_MAX);
  const after = Math.min(Math.max(input.after ?? 5, 0), FRAME_WINDOW_MAX);
  const start = Math.max(0, anchorIdx - before);
  const windowed = picked.slice(start, Math.min(picked.length, anchorIdx + after + 1));

  const frames = await Promise.all(
    windowed.map(async (f) => ({
      ...f,
      url: await signedUrl(sessionObjectKey(ctx.workspace.id, item.sourceId, f.file)),
    })),
  );
  return {
    ok: true,
    current: currentFile,
    viewport: manifest.app?.viewport ?? null,
    total: picked.length,
    start,
    frames,
  };
}

export async function updateStepImage(input: { itemId: string; screenshotFile: string }): Promise<EditResult> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) return { ok: false, error: 'Not authenticated' };

  const item = await prisma.knowledgeItem.findFirst({
    where: { id: input.itemId, workspaceId: ctx.workspace.id, kind: 'step' },
    select: { id: true, data: true, workflowId: true, sourceId: true, editedAt: true },
  });
  if (!item) return { ok: false, error: 'Step not found' };

  // The choice is validated against the recording's own manifest — everything a step shows must
  // remain real capture, never an arbitrary upload. Never trust the client's file string. The same
  // lookup decides the highlight: an ACTION frame brings its own target rect along (the box follows
  // the picture — same viewport coordinate space); an "after" frame has no meaningful rect, so the
  // highlight clears.
  const source = await prisma.knowledgeSource.findUnique({
    where: { id: item.sourceId },
    select: { manifest: true },
  });
  const manifest = source?.manifest as unknown as SessionManifest | null;
  let found = false;
  let bbox: unknown = null;
  for (const ev of manifest?.events ?? []) {
    if (ev.screenshot?.file === input.screenshotFile) {
      found = true;
      bbox = ev.target?.bbox ?? null;
      break;
    }
    if (ev.postAction?.screenshot?.file === input.screenshotFile) {
      found = true;
      break;
    }
  }
  if (!found) {
    return { ok: false, error: 'That image is not a frame captured by this recording — nothing was changed.' };
  }

  const data = { ...(item.data as Record<string, unknown>) };
  data.screenshotFile = input.screenshotFile;
  if (bbox) data.bbox = bbox;
  else delete data.bbox;
  data.editedFields = [...new Set([...editedFieldsOf(data, item.editedAt), 'image'])];

  // `text` is untouched, so the vector stays in sync — no embedding call here.
  await prisma.knowledgeItem.update({
    where: { id: item.id },
    data: { data: data as object, editedAt: new Date(), editedById: ctx.userId },
  });

  const actingParked = await recompileIfActing(ctx.workspace.id, item.workflowId, item.sourceId);

  revalidatePath(`/dashboard/kb/${item.sourceId}`);
  return { ok: true, ...(actingParked ? { actingParked: true } : {}) };
}
