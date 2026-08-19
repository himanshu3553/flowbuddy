import { prisma } from '@flowbuddy/db';
import type { SessionManifest } from '@flowbuddy/shared';
import {
  attachOutcomeMarkers,
  compileExecutionPlan,
  hashPlan,
  loadMarkerSnapshots,
  markerSnapshotRefs,
  type ExecutionStepSource,
} from '@flowbuddy/synthesis/execution-plan';
import { artifactReader } from '@/lib/storage';

/**
 * Compile ONE workflow's execution plan from its stored steps + the recording's raw capture — the
 * shared half of the enable action (execution-actions.ts) and the step-edit recompile
 * (edit-actions.ts). COMPUTES ONLY, writes nothing: "`executeState: 'enabled'` is only ever written
 * in the same transaction that writes the plan" (execution-actions.ts), so each caller owns its own
 * writes and that invariant stays theirs to keep.
 */
export type CompiledWorkflowPlan =
  | {
      ok: true;
      steps: ReturnType<typeof attachOutcomeMarkers>;
      contract: ReturnType<typeof compileExecutionPlan>['contract'];
      hash: string;
    }
  | { ok: false; issues: string[] };

export async function compileWorkflowPlan(
  workspaceId: string,
  workflowId: string,
  sourceId: string,
): Promise<CompiledWorkflowPlan> {
  const [items, source] = await Promise.all([
    prisma.knowledgeItem.findMany({
      where: { workspaceId, workflowId, kind: 'step' },
      orderBy: { orderIndex: 'asc' },
      select: { data: true },
    }),
    prisma.knowledgeSource.findUnique({
      where: { id: sourceId },
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
  // and verifies as before — compiling never gains a new way to fail.
  const read = artifactReader(workspaceId, sourceId);
  const snapshots = await loadMarkerSnapshots(
    markerSnapshotRefs(compiled.steps, srcSteps, manifest.events),
    read,
  );
  const steps = attachOutcomeMarkers(compiled.steps, snapshots);
  return { ok: true, steps, contract: compiled.contract, hash: hashPlan(steps, compiled.contract) };
}
