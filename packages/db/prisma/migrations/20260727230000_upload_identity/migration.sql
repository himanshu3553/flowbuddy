-- AlterTable
ALTER TABLE "RecSession" ADD COLUMN     "uploadId" TEXT,
ALTER COLUMN "manifest" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RecSession_workspaceId_uploadId_key" ON "RecSession"("workspaceId", "uploadId");

