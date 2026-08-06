-- CreateTable
CREATE TABLE "AgentAcceptance" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentAcceptance_workspaceId_termsVersion_idx" ON "AgentAcceptance"("workspaceId", "termsVersion");

-- AddForeignKey
ALTER TABLE "AgentAcceptance" ADD CONSTRAINT "AgentAcceptance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
