-- AlterTable
ALTER TABLE "CopilotQuery" ADD COLUMN     "evidence" JSONB,
ADD COLUMN     "searches" JSONB,
ADD COLUMN     "senseCandidates" JSONB;
