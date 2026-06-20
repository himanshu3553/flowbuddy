-- AlterTable
ALTER TABLE "RecSession" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'workflow',
ADD COLUMN     "transcript" JSONB;

-- CreateTable
CREATE TABLE "KnowledgeItem" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeItem_workspaceId_idx" ON "KnowledgeItem"("workspaceId");

-- CreateIndex
CREATE INDEX "KnowledgeItem_sourceId_idx" ON "KnowledgeItem"("sourceId");

-- AddForeignKey
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RecSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
