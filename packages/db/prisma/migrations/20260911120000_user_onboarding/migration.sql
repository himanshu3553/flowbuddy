-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "onboardingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onboardingMaxShows" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "CopilotApproval" ADD COLUMN     "onboardingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onboardingEnabledAt" TIMESTAMP(3),
ADD COLUMN     "onboardingEnabledById" TEXT;
