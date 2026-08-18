-- Demo video: one generated MP4 per workflow (see schema.prisma `DemoVideo` for the status vocabulary).
CREATE TABLE "DemoVideo" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "fileKey" TEXT,
    "durationMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoVideo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DemoVideo_workflowId_key" ON "DemoVideo"("workflowId");

CREATE INDEX "DemoVideo_workspaceId_idx" ON "DemoVideo"("workspaceId");

ALTER TABLE "DemoVideo" ADD CONSTRAINT "DemoVideo_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DemoVideo" ADD CONSTRAINT "DemoVideo_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
