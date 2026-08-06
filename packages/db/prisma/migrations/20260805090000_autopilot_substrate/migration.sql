-- AlterTable
ALTER TABLE "CopilotApproval" ADD COLUMN     "executeState" TEXT,
ADD COLUMN     "executeEnabledAt" TIMESTAMP(3),
ADD COLUMN     "executeEnabledById" TEXT;

-- CreateTable
CREATE TABLE "ExecutionPlan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "planHash" TEXT NOT NULL,
    "stepCount" INTEGER NOT NULL,
    "steps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "compiledAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionPlan_workflowId_key" ON "ExecutionPlan"("workflowId");

-- CreateIndex
CREATE INDEX "ExecutionPlan_workspaceId_idx" ON "ExecutionPlan"("workspaceId");

-- AddForeignKey
ALTER TABLE "ExecutionPlan" ADD CONSTRAINT "ExecutionPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionPlan" ADD CONSTRAINT "ExecutionPlan_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
