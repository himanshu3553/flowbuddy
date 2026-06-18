import { Queue, type ConnectionOptions } from 'bullmq';
import { SYNTHESIS_QUEUE } from '@sync/shared';
import { config } from './config';

// Pass connection OPTIONS (not an ioredis instance) so BullMQ owns the connection
// and applies the settings it needs (e.g. maxRetriesPerRequest: null for workers).
const url = new URL(config.redisUrl);
export const connection: ConnectionOptions = {
  host: url.hostname,
  port: Number(url.port || '6379'),
  username: url.username || undefined,
  password: url.password || undefined,
  ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
};

export const synthesisQueue = new Queue(SYNTHESIS_QUEUE, { connection });
