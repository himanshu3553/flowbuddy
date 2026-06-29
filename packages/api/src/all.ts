// Free-tier single-process entrypoint: boot the Fastify API **and** the BullMQ synthesis worker
// in ONE process, so the whole stack fits Render's free web-service plan (Render background workers
// are paid-only). The synthesis worker runs while this web service is awake — a recorder upload
// (an HTTP request) wakes the free service, then the embedded worker drains the queued job.
//
// For production, run them as SEPARATE services instead: `start` (api) + `worker` (background worker).
import './server';
import './worker';
