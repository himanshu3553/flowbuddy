-- P3-M1 — the "don't raise this pair again" memo moves off positions onto workflow identities, and
-- is renamed to say what it actually means: the detector was WRONG about this pair.
--
-- Prisma's generated DDL dropped the old table outright. Existing decisions are migrated instead:
-- create → copy → drop.
--
-- HOW THE OLD ROWS ARE INTERPRETED. The old button said "Both are real", which conflated two very
-- different decisions: "two routes to one goal" (which now GROUPS the workflows and makes the
-- copilot answer from only one) and "these aren't duplicates" (which changes nothing). Old rows are
-- migrated as DISMISSALS — the interpretation that cannot lose knowledge. A founder who meant the
-- grouping can say so explicitly; a founder who meant dismissal and got grouping would silently lose
-- half of what one of those workflows knows.

-- CreateTable
CREATE TABLE "WorkflowOverlapDismissal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "aWorkflowId" TEXT NOT NULL,
    "bWorkflowId" TEXT NOT NULL,
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowOverlapDismissal_pkey" PRIMARY KEY ("id")
);

-- Copy each old decision across, resolving both positions to their workflow identities and keeping
-- the canonical ordering (smaller id first). A pair whose workflow no longer exists is dropped: it
-- cannot be raised again either, so the memo has nothing left to suppress.
INSERT INTO "WorkflowOverlapDismissal" ("id", "workspaceId", "aWorkflowId", "bWorkflowId", "decidedById", "createdAt")
SELECT d."id",
       d."workspaceId",
       LEAST(wa."id", wb."id"),
       GREATEST(wa."id", wb."id"),
       d."decidedById",
       d."createdAt"
FROM "WorkflowOverlapDecision" d
JOIN "Workflow" wa ON wa."sourceId" = d."aSourceId" AND wa."segmentIndex" = d."aSegmentIndex"
JOIN "Workflow" wb ON wb."sourceId" = d."bSourceId" AND wb."segmentIndex" = d."bSegmentIndex";

-- DropForeignKey
ALTER TABLE "WorkflowOverlapDecision" DROP CONSTRAINT "WorkflowOverlapDecision_workspaceId_fkey";

-- DropTable
DROP TABLE "WorkflowOverlapDecision";

-- CreateIndex
CREATE INDEX "WorkflowOverlapDismissal_workspaceId_idx" ON "WorkflowOverlapDismissal"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowOverlapDismissal_aWorkflowId_bWorkflowId_key" ON "WorkflowOverlapDismissal"("aWorkflowId", "bWorkflowId");

-- AddForeignKey
ALTER TABLE "WorkflowOverlapDismissal" ADD CONSTRAINT "WorkflowOverlapDismissal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
