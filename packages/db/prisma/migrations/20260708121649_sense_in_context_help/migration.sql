-- AlterTable
ALTER TABLE "CopilotQuery" ADD COLUMN     "senseConfidence" DOUBLE PRECISION,
ADD COLUMN     "senseSegmentIndex" INTEGER,
ADD COLUMN     "senseSourceId" TEXT,
ADD COLUMN     "senseStep" INTEGER,
ADD COLUMN     "senseUsed" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "copilotShowMe" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "senseEnabled" BOOLEAN NOT NULL DEFAULT true;
