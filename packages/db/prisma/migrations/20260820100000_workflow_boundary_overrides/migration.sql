-- Founder-drawn workflow boundaries (workflow-editing arc, item 4) — additive, nullable, no data touched.
-- Null = automatic segmentation; non-null = the founder's exhaustive boundary list (see schema.prisma).
ALTER TABLE "RecSession" ADD COLUMN "boundaryOverrides" JSONB;
