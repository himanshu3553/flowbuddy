/**
 * User onboarding — constants shared by the Studio UI (client) and the server actions.
 * No server imports here: the Copilot page's client component reads the cap for its input.
 */

/** The ceiling on `Workspace.onboardingMaxShows` — a budget past ten is a tour that never leaves. */
export const ONBOARDING_MAX_SHOWS_CAP = 10;
