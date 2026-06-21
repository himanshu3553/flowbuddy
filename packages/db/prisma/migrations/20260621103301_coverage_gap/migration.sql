-- CreateTable
CREATE TABLE "CoverageGap" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageGap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoverageGap_workspaceId_idx" ON "CoverageGap"("workspaceId");

-- AddForeignKey
ALTER TABLE "CoverageGap" ADD CONSTRAINT "CoverageGap_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
