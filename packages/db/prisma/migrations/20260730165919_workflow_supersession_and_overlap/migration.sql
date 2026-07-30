-- AlterTable
ALTER TABLE "CopilotApproval" ADD COLUMN     "supersededAt" TIMESTAMP(3),
ADD COLUMN     "supersededById" TEXT;

-- CreateTable
CREATE TABLE "WorkflowOverlapDecision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "aSourceId" TEXT NOT NULL,
    "aSegmentIndex" INTEGER NOT NULL,
    "bSourceId" TEXT NOT NULL,
    "bSegmentIndex" INTEGER NOT NULL,
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowOverlapDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowOverlapDecision_workspaceId_idx" ON "WorkflowOverlapDecision"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowOverlapDecision_aSourceId_aSegmentIndex_bSourceId_b_key" ON "WorkflowOverlapDecision"("aSourceId", "aSegmentIndex", "bSourceId", "bSegmentIndex");

-- CreateIndex
CREATE INDEX "CopilotApproval_supersededById_idx" ON "CopilotApproval"("supersededById");

-- AddForeignKey
ALTER TABLE "CopilotApproval" ADD CONSTRAINT "CopilotApproval_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "CopilotApproval"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowOverlapDecision" ADD CONSTRAINT "WorkflowOverlapDecision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
