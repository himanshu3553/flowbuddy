// Background job contracts (BullMQ). Shared by the API (producer) and worker (consumer).

export const SYNTHESIS_QUEUE = 'synthesis';

export interface SynthesisJob {
  sessionId: string;
  workspaceId: string;
}

// Source/recording status. The worker writes: uploaded → processing → ready | error
// (`ready` = KB built + segmented, candidates available, no articles yet — the curated model).
// `done` is a legacy value still tolerated for pre-KB-layer rows.
export type RecSessionStatus = 'uploaded' | 'processing' | 'ready' | 'done' | 'error';
