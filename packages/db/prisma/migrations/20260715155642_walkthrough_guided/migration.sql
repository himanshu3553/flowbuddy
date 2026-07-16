-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "copilotWalkthrough" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CopilotWalkthrough" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "segmentIndex" INTEGER NOT NULL,
    "segmentTitle" TEXT,
    "queryId" TEXT,
    "startStep" INTEGER NOT NULL,
    "totalSteps" INTEGER NOT NULL,
    "lastStep" INTEGER NOT NULL,
    "autoAdvances" INTEGER NOT NULL DEFAULT 0,
    "manualAdvances" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL DEFAULT 'active',
    "stalledAtStep" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotWalkthrough_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CopilotWalkthrough_workspaceId_idx" ON "CopilotWalkthrough"("workspaceId");

-- AddForeignKey
ALTER TABLE "CopilotWalkthrough" ADD CONSTRAINT "CopilotWalkthrough_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
