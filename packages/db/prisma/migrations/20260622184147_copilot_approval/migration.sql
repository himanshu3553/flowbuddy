-- CreateTable
CREATE TABLE "CopilotApproval" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "segmentIndex" INTEGER NOT NULL,
    "segmentTitle" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CopilotApproval_workspaceId_idx" ON "CopilotApproval"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "CopilotApproval_sourceId_segmentIndex_key" ON "CopilotApproval"("sourceId", "segmentIndex");

-- AddForeignKey
ALTER TABLE "CopilotApproval" ADD CONSTRAINT "CopilotApproval_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotApproval" ADD CONSTRAINT "CopilotApproval_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RecSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
