import { Queue, type ConnectionOptions } from 'bullmq';
import { SYNTHESIS_QUEUE } from '@flowbuddy/shared';
import { createLogger } from '@flowbuddy/logger';
import { config } from './config';

const log = createLogger('synthesis-queue');

// Pass connection OPTIONS (not an ioredis instance) so BullMQ owns the connection
// and applies the settings it needs (e.g. maxRetriesPerRequest: null for workers).
const url = new URL(config.redisUrl);

/**
 * The WORKER's connection. Deliberately left bare: BullMQ needs to own the settings for a blocking
 * consumer (notably `maxRetriesPerRequest: null`), so producer-style fail-fast options must NOT be
 * added here — a worker that gives up on a request instead of blocking stops consuming jobs.
 */
export const connection: ConnectionOptions = {
  host: url.hostname,
  port: Number(url.port || '6379'),
  username: url.username || undefined,
  password: url.password || undefined,
  ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
};

/**
 * The PRODUCER's connection — a separate object precisely because the two have opposite needs.
 * Enqueueing happens at the very END of ingestion, after the recording row already exists, so an
 * unreachable Redis buffering commands forever would look exactly like the upload hanging, for a
 * recording that in fact arrived safely. Studio's producer has had these settings since it was
 * written (`web/lib/queue.ts`); the api's never did.
 */
const producerConnection: ConnectionOptions = {
  ...connection,
  connectTimeout: 4000,
  maxRetriesPerRequest: 2,
  // Back off on a down/slow Redis (cap 10s) instead of hammering it — the connection self-heals.
  retryStrategy: (times: number) => Math.min(times * 200, 10_000),
};

export const synthesisQueue = new Queue(SYNTHESIS_QUEUE, {
  connection: producerConnection,
  defaultJobOptions: {
    // Transient failures (OpenAI 429/timeout, R2 blip) retry instead of permanently landing the
    // recording in `error`; the worker is idempotent (delete+recreate items, approvals survive).
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    // Finished jobs must not accumulate in Redis forever (25 MB free tier) — keep a bounded
    // recent window for debugging and drop the rest.
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

// Attach an error handler AT ALL so BullMQ's emitted 'error' never becomes an unhandled
// EventEmitter throw that could take down the process serving the public copilot; throttle so a
// Redis outage can't flood the logs (one line / 30s). Mirrors web/lib/queue.ts.
let lastQueueErrLog = 0;
synthesisQueue.on('error', (err) => {
  const now = Date.now();
  if (now - lastQueueErrLog < 30_000) return;
  lastQueueErrLog = now;
  log.error(
    { err: err?.message || String(err) },
    'Redis connection error (uploads keep failing-soft until it recovers)',
  );
});
