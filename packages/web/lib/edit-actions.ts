'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@flowbuddy/db';
import type { CapturedEvent, SessionManifest } from '@flowbuddy/shared';
import { alignNarration } from '@flowbuddy/synthesis/align';
import { cleanEvents } from '@flowbuddy/synthesis/clean';
import { distilledStepText, stepFromEvent, type EditedStepField } from '@flowbuddy/synthesis/distill';
import { embedTexts, toVectorLiteral } from '@flowbuddy/synthesis/embeddings';
import { parseStepInclusions, type StepAddition } from '@flowbuddy/synthesis/step-inclusions';
import type { Transcript } from '@flowbuddy/synthesis/transcribe';
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

/** Embed edited step text BEFORE any write — text and vector move together or not at all. The
 *  error names WHOSE key failed: Studio's OPENAI_API_KEY is a separate env entry from the api's
 *  (packages/web/.env locally, the web service's env on Render), and a drifted copy fails here
 *  while recordings keep processing fine — which reads as an account problem otherwise. */
async function embedEditedText(
  text: string,
): Promise<{ ok: true; vector: number[] } | { ok: false; error: string }> {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) {
    return { ok: false, error: 'Studio has no OPENAI_API_KEY, so the edited text cannot be re-indexed — nothing was changed.' };
  }
  try {
    const [v] = await embedTexts([text], {
      apiKey,
      model: process.env.EMBED_MODEL || undefined,
      timeoutMs: 15_000,
      maxRetries: 1,
    });
    if (!v) throw new Error('no vector returned');
    return { ok: true, vector: v };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Could not re-index the edited text — Studio's own OPENAI_API_KEY failed (${msg}). The api/worker uses a separate key entry, so check the web service's. Nothing was changed.`,
    };
  }
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
  const embedded = await embedEditedText(text);
  if (!embedded.ok) return embedded;

  await prisma.$transaction(async (tx) => {
    await tx.knowledgeItem.update({
      where: { id: item.id },
      data: { text, data: data as object, editedAt: new Date(), editedById: ctx.userId },
    });
    await tx.$executeRaw`UPDATE "KnowledgeItem" SET embedding = ${toVectorLiteral(embedded.vector)}::vector WHERE id = ${item.id}`;
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

// ── Step inclusion: delete + restore-from-capture (workflow-editing arc) ────────────────────────
//
// The founder fully controls WHICH captured moments a workflow includes — and cannot introduce
// anything the recording didn't witness. Deleting hard-deletes the row now (no removed-flag for
// every reader to remember — the liveness lesson) and records the anchor on the RECORDING
// (`KnowledgeSource.stepInclusions`) so every rebuild re-drops it; restoring inserts an anchored
// step built from a pruned captured event (`stepFromEvent` — the founder types only the words) and
// records it the same way so every rebuild re-inserts it.

/** Read-modify-write for `stepInclusions` — deleting a step the founder previously RESTORED just
 *  cancels the restoration; only a distiller-produced step needs a standing removal. */
function withRemoval(raw: ReturnType<typeof parseStepInclusions>, keyEventId: string) {
  const base = raw ?? { removed: [], added: [] };
  const added = base.added.filter((a) => a.keyEventId !== keyEventId);
  const wasAddition = added.length !== base.added.length;
  const removed = wasAddition ? base.removed : [...new Set([...base.removed, keyEventId])];
  return { removed, added, updatedAt: new Date().toISOString() };
}

function withAddition(raw: ReturnType<typeof parseStepInclusions>, addition: StepAddition) {
  const base = raw ?? { removed: [], added: [] };
  return {
    removed: base.removed.filter((id) => id !== addition.keyEventId),
    added: [...base.added.filter((a) => a.keyEventId !== addition.keyEventId), addition],
    updatedAt: new Date().toISOString(),
  };
}

type WorkflowSpan = {
  sourceId: string;
  manifest: SessionManifest;
  cleaned: CapturedEvent[];
  span: CapturedEvent[];
  usedIds: Set<string>;
  workflow: { id: string; segmentIndex: number; title: string | null };
};

/** The workflow's SPAN on the cleaned timeline — from its own start anchor to the next workflow's,
 *  the same anchor rule the Reorganize surface uses, so "which events belong here" has exactly one
 *  definition. Restorable candidates are span events that are not currently steps. */
async function workflowSpan(
  workspaceId: string,
  workflowId: string,
): Promise<({ ok: true } & WorkflowSpan) | { ok: false; error: string }> {
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, workspaceId },
    select: { id: true, sourceId: true, segmentIndex: true, title: true },
  });
  if (!workflow || workflow.segmentIndex == null) return { ok: false, error: 'Workflow not found' };
  const source = await prisma.knowledgeSource.findUnique({
    where: { id: workflow.sourceId },
    select: { manifest: true },
  });
  const manifest = source?.manifest as unknown as SessionManifest | null;
  if (!manifest?.events?.length) {
    return { ok: false, error: 'The recording’s raw capture is missing, so its steps cannot be edited.' };
  }
  const items = await prisma.knowledgeItem.findMany({
    where: { sourceId: workflow.sourceId, kind: 'step' },
    orderBy: [{ segmentIndex: 'asc' }, { orderIndex: 'asc' }],
    select: { segmentIndex: true, workflowId: true, data: true },
  });
  const cleaned = cleanEvents(manifest.events);
  const idx = new Map(cleaned.map((e, i) => [e.id, i]));
  const anchorOf = (d: Record<string, unknown>): string | null => {
    const src = Array.isArray(d.sourceEventIds) && typeof d.sourceEventIds[0] === 'string' ? d.sourceEventIds[0] : null;
    return src ?? (typeof d.keyEventId === 'string' ? d.keyEventId : null);
  };
  const segs = [...new Set(items.map((it) => it.segmentIndex).filter((s): s is number => s != null))].sort(
    (a, b) => a - b,
  );
  const startIdxOf = new Map<number, number>();
  for (const seg of segs) {
    const first = items.find((it) => it.segmentIndex === seg);
    const anchor = first ? anchorOf((first.data ?? {}) as Record<string, unknown>) : null;
    const i = anchor ? idx.get(anchor) : undefined;
    if (i == null) return { ok: false, error: 'This recording predates step anchors — re-process it first.' };
    startIdxOf.set(seg, i);
  }
  const pos = segs.indexOf(workflow.segmentIndex);
  if (pos === -1) return { ok: false, error: 'Workflow not found' };
  const start = pos === 0 ? 0 : startIdxOf.get(segs[pos]!)!;
  const end = pos === segs.length - 1 ? cleaned.length : startIdxOf.get(segs[pos + 1]!)!;
  const usedIds = new Set<string>();
  for (const it of items) {
    if (it.workflowId !== workflow.id) continue;
    const d = (it.data ?? {}) as { sourceEventIds?: unknown; keyEventId?: unknown };
    if (Array.isArray(d.sourceEventIds)) for (const s of d.sourceEventIds) if (typeof s === 'string') usedIds.add(s);
    if (typeof d.keyEventId === 'string') usedIds.add(d.keyEventId);
  }
  return {
    ok: true,
    sourceId: workflow.sourceId,
    manifest,
    cleaned,
    span: cleaned.slice(start, end),
    usedIds,
    workflow: { id: workflow.id, segmentIndex: workflow.segmentIndex, title: workflow.title },
  };
}

export async function deleteStep(input: { itemId: string }): Promise<EditResult> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) return { ok: false, error: 'Not authenticated' };
  const item = await prisma.knowledgeItem.findFirst({
    where: { id: input.itemId, workspaceId: ctx.workspace.id, kind: 'step' },
    select: { id: true, data: true, workflowId: true, sourceId: true, orderIndex: true },
  });
  if (!item) return { ok: false, error: 'Step not found' };
  const d = (item.data ?? {}) as { keyEventId?: unknown };
  if (typeof d.keyEventId !== 'string' || !d.keyEventId) {
    return {
      ok: false,
      error: 'This step predates edit anchors, so a deletion could not survive a rebuild — re-process the recording first.',
    };
  }
  const key = d.keyEventId;

  await prisma.$transaction(async (tx) => {
    const source = await tx.knowledgeSource.findUnique({
      where: { id: item.sourceId },
      select: { stepInclusions: true },
    });
    await tx.knowledgeItem.delete({ where: { id: item.id } });
    await tx.knowledgeItem.updateMany({
      where: { workflowId: item.workflowId, orderIndex: { gt: item.orderIndex } },
      data: { orderIndex: { decrement: 1 } },
    });
    await tx.knowledgeSource.update({
      where: { id: item.sourceId },
      data: { stepInclusions: withRemoval(parseStepInclusions(source?.stepInclusions), key) as object },
    });
  });

  const actingParked = await recompileIfActing(ctx.workspace.id, item.workflowId, item.sourceId);
  revalidatePath(`/dashboard/kb/${item.sourceId}`);
  return { ok: true, ...(actingParked ? { actingParked: true } : {}) };
}

/** The captured moments of this workflow's span that are NOT currently steps — the distiller's
 *  prunes plus any founder deletions, i.e. everything restorable. */
export type AddableEvents =
  | {
      ok: true;
      workflowTitle: string;
      candidates: { eventId: string; label: string; route: string; url: string | null }[];
    }
  | { ok: false; error: string };

export async function listAddableEvents(input: { workflowId: string }): Promise<AddableEvents> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) return { ok: false, error: 'Not authenticated' };
  const res = await workflowSpan(ctx.workspace.id, input.workflowId);
  if (!res.ok) return res;
  const labelByEventId = new Map(timelineEvents(res.manifest).map((e) => [e.id, e]));
  const candidates = await Promise.all(
    res.span
      .filter((ev) => !res.usedIds.has(ev.id))
      .map(async (ev) => {
        const meta = labelByEventId.get(ev.id);
        const file = ev.screenshot?.file ?? ev.postAction?.screenshot?.file ?? null;
        return {
          eventId: ev.id,
          label: meta ? `${meta.type}${meta.label ? ` “${meta.label}”` : ''}` : String(ev.type),
          route: ev.route?.path ?? '',
          url: file ? await signedUrl(sessionObjectKey(ctx.workspace.id, res.sourceId, file)) : null,
        };
      }),
  );
  return { ok: true, workflowTitle: res.workflow.title ?? 'this workflow', candidates };
}

export async function addStepFromEvent(input: {
  workflowId: string;
  eventId: string;
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
  const res = await workflowSpan(ctx.workspace.id, input.workflowId);
  if (!res.ok) return res;
  const ev = res.span.find((e) => e.id === input.eventId);
  if (!ev || res.usedIds.has(ev.id)) {
    return { ok: false, error: 'That captured action is not restorable in this workflow — reload the page and try again.' };
  }

  const source = await prisma.knowledgeSource.findUnique({
    where: { id: res.sourceId },
    select: { transcript: true, stepInclusions: true },
  });
  const transcript = (source?.transcript as unknown as Transcript | null) ?? { text: '', segments: [] };
  const step = stepFromEvent(ev, alignNarration(res.manifest.events, transcript), instruction, detail || undefined);
  const text = distilledStepText(step);
  const embedded = await embedEditedText(text);
  if (!embedded.ok) return embedded;

  // Timeline position among the workflow's existing steps (anchorless legacy rows sort first).
  const items = await prisma.knowledgeItem.findMany({
    where: { workspaceId: ctx.workspace.id, workflowId: res.workflow.id, kind: 'step' },
    orderBy: { orderIndex: 'asc' },
    select: { data: true, segmentTitle: true },
  });
  const evIdx = new Map(res.cleaned.map((e, i) => [e.id, i]));
  const target = evIdx.get(ev.id)!;
  let pos = 0;
  for (const it of items) {
    const di = (it.data ?? {}) as { keyEventId?: unknown };
    const i = typeof di.keyEventId === 'string' ? evIdx.get(di.keyEventId) : undefined;
    if (i == null || i < target) pos += 1;
  }

  const now = new Date();
  const inclusions = withAddition(parseStepInclusions(source?.stepInclusions), {
    keyEventId: ev.id,
    instruction,
    ...(detail ? { detail } : {}),
  });
  await prisma.$transaction(async (tx) => {
    await tx.knowledgeItem.updateMany({
      where: { workflowId: res.workflow.id, orderIndex: { gte: pos } },
      data: { orderIndex: { increment: 1 } },
    });
    const row = await tx.knowledgeItem.create({
      data: {
        sourceId: res.sourceId,
        workspaceId: ctx.workspace.id,
        workflowId: res.workflow.id,
        kind: 'step',
        orderIndex: pos,
        text,
        segmentIndex: res.workflow.segmentIndex,
        segmentTitle: items[0]?.segmentTitle ?? res.workflow.title,
        data: step as object,
        editedAt: now,
        editedById: ctx.userId,
      },
      select: { id: true },
    });
    await tx.$executeRaw`UPDATE "KnowledgeItem" SET embedding = ${toVectorLiteral(embedded.vector)}::vector WHERE id = ${row.id}`;
    await tx.knowledgeSource.update({ where: { id: res.sourceId }, data: { stepInclusions: inclusions as object } });
  });

  const actingParked = await recompileIfActing(ctx.workspace.id, res.workflow.id, res.sourceId);
  revalidatePath(`/dashboard/kb/${res.sourceId}`);
  return { ok: true, ...(actingParked ? { actingParked: true } : {}) };
}

/** How similar a description sentence must be to a deleted step's text before the delete dialog
 *  flags it (cosine over the same embeddings retrieval uses; the vectors arrive unit-normalized so
 *  a dot product is the cosine). Loosely calibrated — a HINT, never a gate: too low occasionally
 *  quotes an unrelated sentence, too high misses paraphrase, and paraphrase is the whole point —
 *  the live case this exists for was step "Remember me" vs description "the option that remembers
 *  you", zero string overlap. */
const DESCRIPTION_MENTION_MIN = 0.45;

/** Does the workflow's description still describe this step? Best-effort by design: any failure
 *  (no key, timeout) reports "no mention" rather than blocking the delete dialog — the deletion
 *  itself never depends on this. */
export type DescriptionMention = { ok: true; mention: string | null } | { ok: false; error: string };

const dot = (a: number[], b: number[]): number => {
  let sum = 0;
  for (let k = 0; k < a.length; k++) sum += a[k]! * b[k]!;
  return sum;
};

/** Exact substrings of the sentence spanning 4–10 words each — the refinement candidates. Built
 *  from offsets so every candidate is verbatim (the highlight relies on `includes`). */
function wordWindows(sentence: string): string[] {
  const words = [...sentence.matchAll(/\S+/g)];
  const out = new Set<string>();
  for (const size of [4, 6, 8, 10]) {
    for (let i = 0; i + size <= words.length; i++) {
      const from = words[i]!.index!;
      const last = words[i + size - 1]!;
      out.add(sentence.slice(from, last.index! + last[0].length));
    }
  }
  return [...out];
}

export async function checkDescriptionMention(input: { itemId: string }): Promise<DescriptionMention> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) return { ok: false, error: 'Not authenticated' };
  const item = await prisma.knowledgeItem.findFirst({
    where: { id: input.itemId, workspaceId: ctx.workspace.id, kind: 'step' },
    select: { text: true, data: true, workflowId: true },
  });
  if (!item) return { ok: false, error: 'Step not found' };
  const workflow = await prisma.workflow.findUnique({
    where: { id: item.workflowId },
    select: { description: true },
  });
  const description = workflow?.description?.trim();
  if (!description) return { ok: true, mention: null };

  // Compare against the step's INSTRUCTION (+detail), never the stored `text`: text folds in the
  // narration, and narration spoken around a click is often about the surrounding moment ("…and
  // then your account is created"), which drags the match onto the WRONG sentence — found live.
  const d = (item.data ?? {}) as { instruction?: unknown; detail?: unknown };
  const instruction = typeof d.instruction === 'string' ? d.instruction.trim() : '';
  const stepText = instruction
    ? `${instruction}${typeof d.detail === 'string' && d.detail.trim() ? ` — ${d.detail.trim()}` : ''}`
    : item.text;

  const sentences = description
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);
  if (sentences.length === 0) return { ok: true, mention: null };
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return { ok: true, mention: null };
  try {
    const opts = { apiKey, model: process.env.EMBED_MODEL || undefined, timeoutMs: 10_000, maxRetries: 0 };
    const vectors = await embedTexts([stepText, ...sentences], opts);
    const stepVec = vectors[0];
    if (!stepVec) return { ok: true, mention: null };
    let bestSentence: string | null = null;
    let bestSim = -1;
    for (let i = 0; i < sentences.length; i++) {
      const v = vectors[i + 1];
      if (!v) continue;
      const sim = dot(stepVec, v);
      if (sim > bestSim) {
        bestSim = sim;
        bestSentence = sentences[i]!;
      }
    }
    if (!bestSentence || bestSim < DESCRIPTION_MENTION_MIN) return { ok: true, mention: null };

    // Refine to the tightest span INSIDE the winning sentence: a clause's signal dilutes across a
    // long sentence ("…and agreeing to the applicable legal terms" inside a whole-task opener), so
    // sliding word-windows are scored against the same step vector and the best window wins — but
    // only when it matches at least as well as the full sentence. Best-effort: any failure keeps
    // the sentence.
    let mention = bestSentence;
    if (bestSentence.split(/\s+/).length > 12) {
      try {
        const windows = wordWindows(bestSentence).slice(0, 150);
        if (windows.length > 1) {
          const wVecs = await embedTexts(windows, opts);
          let wBest = -1;
          let wText: string | null = null;
          for (let i = 0; i < windows.length; i++) {
            const v = wVecs[i];
            if (!v) continue;
            const sim = dot(stepVec, v);
            if (sim > wBest) {
              wBest = sim;
              wText = windows[i]!;
            }
          }
          if (wText && wBest >= bestSim) mention = wText;
        }
      } catch {
        /* keep the sentence */
      }
    }
    return { ok: true, mention };
  } catch {
    return { ok: true, mention: null };
  }
}
