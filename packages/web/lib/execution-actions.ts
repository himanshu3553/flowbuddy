'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@flowbuddy/db';
import type { SessionManifest } from '@flowbuddy/shared';
import { displayRoute } from '@flowbuddy/shared/route-pattern';
import {
  attachOutcomeMarkers,
  compileExecutionPlan,
  hashPlan,
  loadMarkerSnapshots,
  markerSnapshotRefs,
  planSummary,
  type ExecutionStepSource,
} from '@flowbuddy/synthesis/execution-plan';
import { getCurrentWorkspace } from '@/lib/session';
import { artifactReader } from '@/lib/storage';

/**
 * P4-M1 — enable/disable ACTING for one workflow (the AI Agent's per-workflow gate).
 *
 * Enabling is the moment the ExecutionPlan is compiled and eligibility is judged
 * (docs/build/agent.md §A2.2, §A2.9): a workflow the executor could not drive is refused HERE,
 * with the reasons returned for the founder to read — never discovered mid-run in front of their
 * customer. The refusal is a RESULT, not a thrown error, because the issues are the content.
 *
 * Imported by SUBPATH from synthesis (the `overlap.ts` pattern) so the OpenAI pipeline stays out
 * of Studio's bundle — the compiler is pure.
 *
 * Invariants:
 *  - acting rides the approval row: no live approval, no acting (`executeState` lives there).
 *  - `executeState: "enabled"` is only ever written in the same transaction that writes the plan,
 *    so "enabled ⇒ a compiled plan exists" holds by construction.
 *  - disable deletes the plan row; readers key on the approval state either way.
 */

export type ExecutionToggleResult =
  | {
      ok: true;
      enabled: boolean;
      summary?: { steps: number; inputs: number; destructive: number; manual: number };
      /** P3-M2 — what the agent will CHECK, shown at the moment of enabling (EC-10): where runs
       *  must start, how many steps carry recorded success phrases, and whether the finish itself
       *  is verifiable. */
      checks?: { entry: string; mustBeThere: boolean; markerSteps: number; verifiableFinish: boolean };
    }
  | { ok: false; issues: string[] };

export async function setWorkflowExecution(input: {
  workflowId: string;
  enabled: boolean;
}): Promise<ExecutionToggleResult> {
  const ctx = await getCurrentWorkspace();
  if (!ctx) throw new Error('Not authenticated');
  const workspaceId = ctx.workspace.id;

  const workflow = await prisma.workflow.findFirst({
    where: { id: input.workflowId, workspaceId },
    select: { id: true, sourceId: true },
  });
  if (!workflow) throw new Error('Workflow not found');

  const approval = await prisma.copilotApproval.findUnique({
    where: { workflowId: workflow.id },
    select: { inactiveReason: true },
  });

  if (!input.enabled) {
    // Absence = never runnable. The plan row goes too — it is re-compiled fresh on re-enable, so
    // a stale artifact can never be what a founder just consented their users onto.
    await prisma.$transaction([
      prisma.copilotApproval.updateMany({
        where: { workspaceId, workflowId: workflow.id },
        data: { executeState: null, executeEnabledAt: null, executeEnabledById: null },
      }),
      prisma.executionPlan.deleteMany({ where: { workspaceId, workflowId: workflow.id } }),
    ]);
    revalidatePath(`/dashboard/kb/${workflow.sourceId}`);
    revalidatePath('/dashboard');
    return { ok: true, enabled: false };
  }

  // Acting presupposes approval: the agent may only RUN what the copilot may ANSWER from.
  if (!approval || approval.inactiveReason !== null) {
    throw new Error('Approve this workflow for the copilot first — the agent only runs approved workflows.');
  }

  const [items, source] = await Promise.all([
    prisma.knowledgeItem.findMany({
      where: { workspaceId, workflowId: workflow.id, kind: 'step' },
      orderBy: { orderIndex: 'asc' },
      select: { data: true },
    }),
    prisma.knowledgeSource.findUnique({
      where: { id: workflow.sourceId },
      select: { manifest: true },
    }),
  ]);
  const manifest = source?.manifest as unknown as SessionManifest | null;
  if (!manifest?.events?.length) {
    return { ok: false, issues: ['The recording’s raw capture is missing, so there is nothing to compile a run from.'] };
  }

  const srcSteps = items.map((i) => (i.data ?? {}) as ExecutionStepSource);
  const compiled = compileExecutionPlan({ steps: srcSteps, events: manifest.events });
  if (!compiled.eligible) {
    return { ok: false, issues: compiled.issues.map((i) => i.message) };
  }

  // Steps whose KB rows carry stored evidence (P3-M2) compiled their `expect` already; the
  // snapshot pass below is the LEGACY fallback for rows processed before the evidence layer —
  // it diffs the last + destructive steps and `attachOutcomeMarkers` leaves evidence-built steps
  // alone. Best-effort by design: an unreadable snapshot means the step compiles WITHOUT markers
  // and verifies as before — enabling never gains a new way to fail.
  const read = artifactReader(workspaceId, workflow.sourceId);
  const snapshots = await loadMarkerSnapshots(
    markerSnapshotRefs(compiled.steps, srcSteps, manifest.events),
    read,
  );
  const finalSteps = attachOutcomeMarkers(compiled.steps, snapshots);
  const finalHash = hashPlan(finalSteps, compiled.contract);

  await prisma.$transaction([
    prisma.executionPlan.upsert({
      where: { workflowId: workflow.id },
      create: {
        workspaceId,
        workflowId: workflow.id,
        planHash: finalHash,
        stepCount: finalSteps.length,
        steps: finalSteps as object,
        contract: compiled.contract as object,
      },
      update: {
        planHash: finalHash,
        stepCount: finalSteps.length,
        steps: finalSteps as object,
        contract: compiled.contract as object,
      },
    }),
    prisma.copilotApproval.update({
      where: { workflowId: workflow.id },
      data: {
        executeState: 'enabled',
        executeEnabledAt: new Date(),
        executeEnabledById: ctx.userId,
      },
    }),
  ]);

  revalidatePath(`/dashboard/kb/${workflow.sourceId}`);
  revalidatePath('/dashboard');
  return {
    ok: true,
    enabled: true,
    summary: planSummary(finalSteps),
    ...(compiled.contract
      ? {
          checks: {
            entry: displayRoute(compiled.contract.entry.route),
            mustBeThere: compiled.contract.entry.start === 'on-screen',
            markerSteps: finalSteps.filter((s) => s.expect?.appeared?.length).length,
            verifiableFinish: Boolean(
              compiled.contract.outcome.route ||
                compiled.contract.outcome.screen ||
                compiled.contract.outcome.appeared?.length,
            ),
          },
        }
      : {}),
  };
}
