-- CreateTable
CREATE TABLE "ProductPage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "provenance" JSONB NOT NULL,
    "pendingContent" TEXT,
    "pendingProvenance" JSONB,
    "pendingAt" TIMESTAMP(3),
    "pendingEmbedding" vector(1536),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "inactiveReason" TEXT,
    "inactiveAt" TIMESTAMP(3),
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductPage_workspaceId_idx" ON "ProductPage"("workspaceId");

-- AddForeignKey
ALTER TABLE "ProductPage" ADD CONSTRAINT "ProductPage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
