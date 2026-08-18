-- Demo videos: per-workspace feature flag (default off). See schema.prisma `Workspace.demoVideosEnabled`.
ALTER TABLE "Workspace" ADD COLUMN "demoVideosEnabled" BOOLEAN NOT NULL DEFAULT false;
