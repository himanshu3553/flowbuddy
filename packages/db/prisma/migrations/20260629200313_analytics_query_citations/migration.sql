-- AlterTable
ALTER TABLE "CopilotQuery" ADD COLUMN     "contextPath" TEXT;

-- CreateTable
CREATE TABLE "QueryCitation" (
    "id" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "segmentIndex" INTEGER,
    "segmentTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueryCitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QueryCitation_workspaceId_idx" ON "QueryCitation"("workspaceId");

-- CreateIndex
CREATE INDEX "QueryCitation_queryId_idx" ON "QueryCitation"("queryId");

-- AddForeignKey
ALTER TABLE "QueryCitation" ADD CONSTRAINT "QueryCitation_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "CopilotQuery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
