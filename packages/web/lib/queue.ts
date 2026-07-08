import { Queue, type ConnectionOptions } from 'bullmq';
import type { SynthesisJob } from '@sync/shared';
import { createLogger } from '@sync/logger';

const log = createLogger('web:queue');

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
  // Fail fast instead of buffering commands forever when Redis is unreachable — a stalled
  // enqueue must never hang the server action (which would freeze the Studio UI).
  connectTimeout: 4000,
  maxRetriesPerRequest: 2,
  // Back off on a down/slow Redis (cap 10s) instead of hammering it every ~read — keeps the
  // reconnect loop quiet and the connection self-heals when Redis returns.
  retryStrategy: (times: number) => Math.min(times * 200, 10_000),
  ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
};

// Reuse one Queue across hot-reloads / requests (Next.js keeps module state warm).
const g = globalThis as unknown as { __syncSynthesisQueue?: Queue };

// Throttle connection-error logging so a Redis outage can't flood the logs (one line / 30s) — and,
// critically, attach a handler AT ALL so BullMQ's emitted 'error' never becomes an unhandled
// EventEmitter throw that could take down the web process.
let lastErrLog = 0;
function onQueueError(err: unknown): void {
  const now = Date.now();
  if (now - lastErrLog < 30_000) return;
  lastErrLog = now;
  log.error(
    { err: (err as Error)?.message || String(err) },
    'Redis connection error (re-process disabled until it recovers)',
  );
}

/**
 * Lazily create the Queue on FIRST use — never at module load. Studio only needs Redis when a user
 * actually re-processes a recording, so booting the server or browsing unrelated pages must not open
 * (and then endlessly retry) a Redis connection. Reused across requests / hot-reloads via globalThis.
 */
function getQueue(): Queue {
  if (g.__syncSynthesisQueue) return g.__syncSynthesisQueue;
  // defaultJobOptions MUST mirror packages/api/src/queue.ts: bounded retries for transient
  // failures (the worker is idempotent) + bounded retention so finished jobs can't fill Redis.
  const queue = new Queue(SYNTHESIS_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });
  queue.on('error', onQueueError);
  g.__syncSynthesisQueue = queue;
  return queue;
}

/** Re-enqueue a recording for synthesis (re-process / retry). Bounded so a Redis hiccup can't
 *  hang the request — the caller treats failure as best-effort. */
export async function enqueueSynthesis(job: SynthesisJob): Promise<void> {
  await Promise.race([
    getQueue().add('synthesize', job),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('enqueueSynthesis timed out')), 5000),
    ),
  ]);
}
