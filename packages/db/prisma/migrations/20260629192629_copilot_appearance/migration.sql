-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "copilotAccent" TEXT,
ADD COLUMN     "copilotGreeting" TEXT,
ADD COLUMN     "copilotPosition" TEXT NOT NULL DEFAULT 'right',
ADD COLUMN     "copilotTitle" TEXT;
