-- CreateTable
CREATE TABLE "ExecutionRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "segmentTitle" TEXT,
    "planHash" TEXT NOT NULL,
    "queryId" TEXT,
    "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "totalSteps" INTEGER NOT NULL,
    "lastStep" INTEGER NOT NULL DEFAULT 0,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "outcome" TEXT NOT NULL DEFAULT 'active',
    "safeStopReason" TEXT,

    CONSTRAINT "ExecutionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExecutionRun_workspaceId_idx" ON "ExecutionRun"("workspaceId");

-- CreateIndex
CREATE INDEX "ExecutionRun_workflowId_idx" ON "ExecutionRun"("workflowId");

-- AddForeignKey
ALTER TABLE "ExecutionRun" ADD CONSTRAINT "ExecutionRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
