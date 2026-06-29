-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "copilotLauncherStyle" TEXT NOT NULL DEFAULT 'icon',
ADD COLUMN     "copilotLauncherText" TEXT;
