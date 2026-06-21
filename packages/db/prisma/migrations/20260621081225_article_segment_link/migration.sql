-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "segmentIndex" INTEGER,
ADD COLUMN     "segmentTitle" TEXT;

-- CreateIndex
CREATE INDEX "Article_sessionId_segmentIndex_idx" ON "Article"("sessionId", "segmentIndex");
