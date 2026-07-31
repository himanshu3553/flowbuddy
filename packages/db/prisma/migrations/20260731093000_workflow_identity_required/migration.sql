-- DropForeignKey
ALTER TABLE "CopilotApproval" DROP CONSTRAINT "CopilotApproval_workflowId_fkey";

-- DropForeignKey
ALTER TABLE "KnowledgeItem" DROP CONSTRAINT "KnowledgeItem_workflowId_fkey";

-- AlterTable
ALTER TABLE "CopilotApproval" ALTER COLUMN "workflowId" SET NOT NULL;

-- AlterTable
ALTER TABLE "KnowledgeItem" ALTER COLUMN "workflowId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotApproval" ADD CONSTRAINT "CopilotApproval_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

