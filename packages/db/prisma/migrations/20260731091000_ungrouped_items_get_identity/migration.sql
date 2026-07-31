-- P3-M1 SAFETY GUARD — runs between the identity backfill and the NOT NULL that follows it.
--
-- THE HOLE IT CLOSES. `KnowledgeItem.segmentIndex` is nullable, and the backfill in
-- 20260731090000 only mints identities `WHERE "segmentIndex" IS NOT NULL`. Any ungrouped step
-- therefore reaches 20260731093000 with a NULL `workflowId` and fails its `SET NOT NULL`.
--
-- That failure is not cosmetic: production runs `prisma migrate deploy && tsx src/all.ts`, so a
-- migration that throws means the API never starts. It passed locally only because this dev
-- database happened to have no ungrouped steps.
--
-- Ungrouped steps are PRESERVED rather than deleted. They were never retrievable (retrieval has
-- always required a segment), never approvable and never cited — but they are still a founder's
-- recording, and a migration is the wrong place to decide their data is worthless.
--
-- They attach to a DETACHED workflow (`segmentIndex` NULL — "in this recording, at no position"),
-- which is the state the schema already defines for a workflow with no place in its recording.
-- Unapproved, so nothing becomes answerable that wasn't.
--
-- Idempotent and a no-op on any database that has no ungrouped steps.
--
-- The DROP NOT NULL below is required HERE and not later: `Workflow.segmentIndex` does not become
-- nullable until 20260731100000, two migrations after the constraint this guard exists to satisfy.
-- Without it the guard fails on the very row it is meant to rescue. (Found by running the chain
-- against a seeded database — reading it was not enough.) Repeating it in 100000 is harmless:
-- dropping a NOT NULL that is already dropped is a no-op in Postgres.
ALTER TABLE "Workflow" ALTER COLUMN "segmentIndex" DROP NOT NULL;

INSERT INTO "Workflow" ("id", "workspaceId", "sourceId", "segmentIndex", "title", "createdAt")
SELECT gen_random_uuid()::text,
       i."workspaceId",
       i."sourceId",
       NULL,
       'Ungrouped steps',
       NOW()
FROM "KnowledgeItem" i
WHERE i."workflowId" IS NULL
GROUP BY i."workspaceId", i."sourceId";

UPDATE "KnowledgeItem" i
SET "workflowId" = w."id"
FROM "Workflow" w
WHERE i."workflowId" IS NULL
  AND w."sourceId" = i."sourceId"
  AND w."segmentIndex" IS NULL;
