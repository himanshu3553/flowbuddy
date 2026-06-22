-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "copilotAllowedOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "copilotPublicKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_copilotPublicKey_key" ON "Workspace"("copilotPublicKey");

