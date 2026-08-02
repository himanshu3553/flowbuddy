-- What a question COST, alongside what the answer path did.
--
-- Until now "what does a question cost to serve?" could only be answered from a provider invoice
-- for the whole workspace, which cannot separate a cheap lookup from an expensive diagnosis — so it
-- could not price a tier or set a per-workspace budget. That question got sharper on 2026-08-02:
-- retiring AI Chatbot removed the cheap single-call rung, so every question now rides the agent
-- loop and there is no lower one to retreat to.
--
-- All four nullable and nothing back-filled: a row written before this honestly reads "unknown"
-- rather than being given a zero, which would silently drag every average toward nothing.
--
-- The two "details" columns are SUBSETS of their neighbours (the provider's own shape):
--   cachedInputTokens ⊆ inputTokens   — cached prompt tokens, billed at a fraction of the rest
--   reasoningTokens   ⊆ outputTokens  — thinking, billed as output on a reasoning model
ALTER TABLE "CopilotQuery" ADD COLUMN "inputTokens" INTEGER;
ALTER TABLE "CopilotQuery" ADD COLUMN "cachedInputTokens" INTEGER;
ALTER TABLE "CopilotQuery" ADD COLUMN "outputTokens" INTEGER;
ALTER TABLE "CopilotQuery" ADD COLUMN "reasoningTokens" INTEGER;
