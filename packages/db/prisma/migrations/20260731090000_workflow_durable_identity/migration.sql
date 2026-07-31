-- AlterTable
ALTER TABLE "CopilotApproval" ADD COLUMN     "workflowId" TEXT;

-- AlterTable
ALTER TABLE "KnowledgeItem" ADD COLUMN     "workflowId" TEXT;

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "segmentIndex" INTEGER NOT NULL,
    "title" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workflow_workspaceId_idx" ON "Workflow"("workspaceId");

-- CreateIndex
CREATE INDEX "Workflow_taskId_idx" ON "Workflow"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_sourceId_segmentIndex_key" ON "Workflow"("sourceId", "segmentIndex");

-- CreateIndex
CREATE UNIQUE INDEX "CopilotApproval_workflowId_key" ON "CopilotApproval"("workflowId");

-- CreateIndex
CREATE INDEX "KnowledgeItem_workflowId_idx" ON "KnowledgeItem"("workflowId");

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RecSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotApproval" ADD CONSTRAINT "CopilotApproval_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL (hand-written — Prisma generates DDL only)
--
-- Every workflow that exists today is identified by a POSITION, `(sourceId,
-- segmentIndex)`. Mint one durable identity per existing position and point the
-- steps and the approval at it. Purely additive: no row is deleted, no existing
-- column is changed, and every reader still keys on the position until stage 3.
--
-- ids are uuids here rather than cuids (cuid is a client-side generator). ids
-- are opaque, so a mixed-format id space is harmless.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. One Workflow per distinct position that has steps.
INSERT INTO "Workflow" ("id", "workspaceId", "sourceId", "segmentIndex", "title", "createdAt")
SELECT gen_random_uuid()::text,
       "workspaceId",
       "sourceId",
       "segmentIndex",
       MIN("segmentTitle"),
       NOW()
FROM "KnowledgeItem"
WHERE "segmentIndex" IS NOT NULL
GROUP BY "workspaceId", "sourceId", "segmentIndex";

-- 2. An approval can outlive its steps (items are delete-and-recreated, and an
--    embed/build failure can leave a position with none). Those approvals still
--    need an identity or stage 3 would silently drop them.
INSERT INTO "Workflow" ("id", "workspaceId", "sourceId", "segmentIndex", "title", "createdAt")
SELECT gen_random_uuid()::text,
       a."workspaceId",
       a."sourceId",
       a."segmentIndex",
       a."segmentTitle",
       NOW()
FROM "CopilotApproval" a
WHERE NOT EXISTS (
  SELECT 1 FROM "Workflow" w
  WHERE w."sourceId" = a."sourceId" AND w."segmentIndex" = a."segmentIndex"
);

-- 3. Point every step at its workflow.
UPDATE "KnowledgeItem" i
SET "workflowId" = w."id"
FROM "Workflow" w
WHERE i."sourceId" = w."sourceId"
  AND i."segmentIndex" = w."segmentIndex";

-- 4. Point every approval at its workflow.
UPDATE "CopilotApproval" a
SET "workflowId" = w."id"
FROM "Workflow" w
WHERE a."sourceId" = w."sourceId"
  AND a."segmentIndex" = w."segmentIndex";
