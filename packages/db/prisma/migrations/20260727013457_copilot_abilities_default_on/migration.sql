-- New workspaces now get a Copilot that can actually point and guide.
--
-- Companion to 20260727012603_copilot_mode_default_copilot: that migration made Copilot the default
-- mode, but the two on-page abilities it advertises ("points, guides users through steps") were
-- still off by default, and the founder switch is checked BEFORE the assistant's judgment. So a new
-- workspace would run the agent loop, decide a highlight would help, and be unable to.
--
-- These defaulted off because in AI Chatbot mode they fire on a FIXED RULE — every positional answer
-- highlights, every positional answer offers a walkthrough. In Copilot mode the assistant decides
-- per message, so "on" now means "may, when it helps" rather than "always".
--
-- Both remain zero-acting: FlowBuddy highlights and follows; the user does every click.
--
-- DEFAULT ONLY, no back-fill — existing workspaces keep whatever their founder set.
ALTER TABLE "Workspace" ALTER COLUMN "copilotShowMe" SET DEFAULT true;
ALTER TABLE "Workspace" ALTER COLUMN "copilotWalkthrough" SET DEFAULT true;
