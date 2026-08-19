-- Founder edits (workflow-editing arc, item 2) — all additive, all nullable, no data touched.
-- Workflow: a set timestamp marks the field HUMAN-OWNED (the reprocess worker keeps it).
ALTER TABLE "Workflow" ADD COLUMN "titleEditedAt" TIMESTAMP(3);
ALTER TABLE "Workflow" ADD COLUMN "descriptionEditedAt" TIMESTAMP(3);

-- KnowledgeItem: the per-step edit stamp the worker re-attaches by data.keyEventId on reprocess.
ALTER TABLE "KnowledgeItem" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "KnowledgeItem" ADD COLUMN "editedById" TEXT;
