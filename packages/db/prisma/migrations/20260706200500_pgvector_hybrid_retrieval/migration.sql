-- P1-M3 hybrid retrieval: the pgvector extension + the item embedding column.
-- Render Postgres supports `vector` natively (confirmed 2026-07-06); local dev needs the
-- pgvector/pgvector:pg16 image (docker-compose.yml).
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "KnowledgeItem" ADD COLUMN     "embedding" vector(1536);
