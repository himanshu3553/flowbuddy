'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@flowbuddy/db';
import { displayRoute } from '@flowbuddy/shared/route-pattern';
import { planSummary } from '@flowbuddy/synthesis/execution-plan';
import { getCurrentWorkspace } from '@/lib/session';
import { compileWorkflowPlan } from '@/lib/plan-compile';

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

  // The compile itself (stored steps + raw capture → plan, evidence-first with the legacy snapshot
  // fallback) is shared with the step-edit recompile — plan-compile.ts computes, this action writes.
  const compiled = await compileWorkflowPlan(workspaceId, workflow.id, workflow.sourceId);
  if (!compiled.ok) {
    return { ok: false, issues: compiled.issues };
  }
  const { steps: finalSteps, contract, hash: finalHash } = compiled;

  await prisma.$transaction([
    prisma.executionPlan.upsert({
      where: { workflowId: workflow.id },
      create: {
        workspaceId,
        workflowId: workflow.id,
        planHash: finalHash,
        stepCount: finalSteps.length,
        steps: finalSteps as object,
        contract: contract as object,
      },
      update: {
        planHash: finalHash,
        stepCount: finalSteps.length,
        steps: finalSteps as object,
        contract: contract as object,
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
    ...(contract
      ? {
          checks: {
            entry: displayRoute(contract.entry.route),
            mustBeThere: contract.entry.start === 'on-screen',
            markerSteps: finalSteps.filter((s) => s.expect?.appeared?.length).length,
            verifiableFinish: Boolean(
              contract.outcome.route ||
                contract.outcome.screen ||
                contract.outcome.appeared?.length,
            ),
          },
        }
      : {}),
  };
}
