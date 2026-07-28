-- AlterTable
ALTER TABLE "CopilotQuery" ADD COLUMN     "engine" TEXT,
ADD COLUMN     "mode" TEXT,
ADD COLUMN     "rounds" INTEGER,
ADD COLUMN     "toolCalls" INTEGER;
