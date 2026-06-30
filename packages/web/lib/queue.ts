import { Queue, type ConnectionOptions } from 'bullmq';
import type { SynthesisJob } from '@sync/shared';

// Must match SYNTHESIS_QUEUE in @sync/shared (jobs.ts). Inlined rather than value-imported because
// Next's server-action bundler can't resolve shared's raw-TS `.js`-extension entry for a value.
const SYNTHESIS_QUEUE = 'synthesis';

// Studio is a privileged server (it already talks to Postgres directly), so it can enqueue a
// re-process job straight onto the same Redis/BullMQ queue the worker consumes — no extra API hop.
// Mirrors packages/api/src/queue.ts; pass connection OPTIONS so BullMQ owns the connection.
const url = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
const connection: ConnectionOptions = {
  host: url.hostname,
  port: Number(url.port || '6379'),
  username: url.username || undefined,
  password: url.password || undefined,
  ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
};

// Reuse one Queue across hot-reloads / requests (Next.js keeps module state warm).
const g = globalThis as unknown as { __syncSynthesisQueue?: Queue };
const synthesisQueue = g.__syncSynthesisQueue ?? new Queue(SYNTHESIS_QUEUE, { connection });
if (process.env.NODE_ENV !== 'production') g.__syncSynthesisQueue = synthesisQueue;

/** Re-enqueue a recording for synthesis (re-process / retry). */
export async function enqueueSynthesis(job: SynthesisJob): Promise<void> {
  await synthesisQueue.add('synthesize', job);
}
