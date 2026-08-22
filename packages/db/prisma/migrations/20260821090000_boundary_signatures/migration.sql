-- Boundary learning (workflow-editing arc, item 5) — additive, nullable, no data touched.
-- Lessons a recording's founder-drawn boundaries teach the workspace; shape and semantics:
-- schema.prisma `KnowledgeSource.boundarySignatures` + synthesis/boundary-learning.ts.
ALTER TABLE "RecSession" ADD COLUMN "boundarySignatures" JSONB;
