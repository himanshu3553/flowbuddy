// Background job contracts (BullMQ). Shared by the API (producer) and worker (consumer).

export const SYNTHESIS_QUEUE = 'synthesis';

export interface SynthesisJob {
  sessionId: string;
  workspaceId: string;
}

export type RecSessionStatus = 'uploaded' | 'processing' | 'done' | 'error';
