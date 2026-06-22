-- AlterTable
ALTER TABLE "CoverageGap" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'prompt';

-- CreateTable
CREATE TABLE "CopilotQuery" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answered" BOOLEAN NOT NULL,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CopilotQuery_workspaceId_idx" ON "CopilotQuery"("workspaceId");

-- AddForeignKey
ALTER TABLE "CopilotQuery" ADD CONSTRAINT "CopilotQuery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

