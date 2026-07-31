-- DropForeignKey
ALTER TABLE "CopilotApproval" DROP CONSTRAINT "CopilotApproval_sourceId_fkey";

-- DropIndex
DROP INDEX "CopilotApproval_sourceId_segmentIndex_key";

-- AlterTable
ALTER TABLE "CopilotApproval" DROP COLUMN "segmentIndex",
DROP COLUMN "sourceId";

