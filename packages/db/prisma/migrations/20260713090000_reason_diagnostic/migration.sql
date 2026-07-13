-- AlterTable
ALTER TABLE "CopilotQuery" ADD COLUMN     "reasonImage" BOOLEAN,
ADD COLUMN     "reasonTrigger" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "reasonEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reasonImageEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reasonIncludeValues" BOOLEAN NOT NULL DEFAULT false;
