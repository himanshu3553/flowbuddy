-- P3-M1 — the citation log records WHICH WORKFLOW answered a question, not which position.
-- Grouping analytics on a position fragments a workflow's history the moment a reprocess moves it.
--
-- Hand-written rather than Prisma's generated DDL: it emits a bare `ADD COLUMN ... NOT NULL`, which
-- cannot succeed on a table that already has rows. Add, backfill, then tighten.

-- 1. Add it nullable so the statement survives existing rows.
ALTER TABLE "QueryCitation" ADD COLUMN "workflowId" TEXT;

-- 2. Backfill from the position each citation was written with.
UPDATE "QueryCitation" c
SET "workflowId" = w."id"
FROM "Workflow" w
WHERE w."sourceId" = c."sourceId"
  AND w."segmentIndex" = c."segmentIndex";

-- 3. A citation that resolves to no workflow cannot serve the analytics this column exists for, and
--    there is no honest placeholder for "some workflow". Drop those rows rather than invent an id —
--    this is a log of what happened, not a source of truth anything depends on.
DELETE FROM "QueryCitation" WHERE "workflowId" IS NULL;

-- 4. Now it can be required.
ALTER TABLE "QueryCitation" ALTER COLUMN "workflowId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "QueryCitation_workflowId_idx" ON "QueryCitation"("workflowId");
