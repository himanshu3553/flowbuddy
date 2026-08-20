-- Founder step inclusion — delete + restore-from-capture (workflow-editing arc). Additive, nullable.
-- Shape and semantics: schema.prisma `KnowledgeSource.stepInclusions`.
ALTER TABLE "RecSession" ADD COLUMN "stepInclusions" JSONB;
