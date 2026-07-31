-- AlterTable
ALTER TABLE "CopilotApproval" DROP COLUMN "supersededAt",
ADD COLUMN     "inactiveAt" TIMESTAMP(3),
ADD COLUMN     "inactiveReason" TEXT;

-- AlterTable
ALTER TABLE "Workflow" ALTER COLUMN "segmentIndex" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "CopilotApproval_inactiveReason_idx" ON "CopilotApproval"("inactiveReason");

