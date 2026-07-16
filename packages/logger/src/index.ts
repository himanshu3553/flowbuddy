/**
 * @flowbuddy/logger — the ONE structured logger for every Node service (api, worker, synthesis, and the
 * Studio's server side). Browser surfaces (widget, extension, web client components) use their own
 * tiny console loggers — pino is Node-only and must never reach a client bundle.
 *
 * Production-ready by construction:
 *   • Level is env-driven — `LOG_LEVEL` wins; otherwise `debug` in development, `info` in production.
 *     (Set `LOG_LEVEL=silent` to mute, or `warn`/`error` to quieten a noisy prod service.)
 *   • Output shape follows the environment — pretty, human-readable lines in dev; one-line JSON in
 *     prod (what Render/Datadog/CloudWatch ingest). Force either way with `LOG_PRETTY=1|0`.
 *   • Secrets are redacted (auth headers, tokens, keys, passwords) so they can't leak into logs.
 *
 * Usage:
 *   import { createLogger } from '@flowbuddy/logger';
 *   const log = createLogger('worker');
 *   log.info({ sessionId }, 'processing session');
 *   log.warn('embedding failed — items stay keyword-only: %s', msg);
 *   log.error({ err }, 'synthesis failed');   // `err` is expanded by pino's serializer
 */
import pino, { type Logger, type LoggerOptions } from 'pino';

export type { Logger };

/** Standard syslog-ish levels, plus `silent` to disable all output. */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

const VALID_LEVELS: readonly LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];

const isProduction = process.env.NODE_ENV === 'production';
// Next.js sets NEXT_RUNTIME ('nodejs' | 'edge') for server code. There we must NOT spin up pino's
// worker-thread transport (Next's bundler chokes on it) — emit plain JSON instead.
const underNext = Boolean(process.env.NEXT_RUNTIME);

/** Resolve the active level: explicit `LOG_LEVEL` (validated) → env default (`debug` dev / `info` prod). */
function resolveLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || '').trim().toLowerCase();
  if ((VALID_LEVELS as readonly string[]).includes(raw)) return raw as LogLevel;
  return isProduction ? 'info' : 'debug';
}

/** Pretty (human) output in dev at an interactive TTY; JSON everywhere else. `LOG_PRETTY` overrides. */
function usePretty(): boolean {
  const raw = (process.env.LOG_PRETTY || '').trim().toLowerCase();
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return !isProduction && !underNext && Boolean(process.stdout.isTTY);
}

// Fields scrubbed from any logged object, at the top level or one nesting deep. Interpolated string
// messages are the caller's responsibility — never log a raw secret into the message itself.
const REDACT_PATHS = [
  'authorization',
  'cookie',
  'password',
  'passwordHash',
  'token',
  'apiKey',
  'openaiApiKey',
  'secret',
  'accessKeyId',
  'secretAccessKey',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-flowbuddy-key"]',
  '*.authorization',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.apiKey',
  '*.secret',
];

/** Shared pino options — also handed to Fastify so HTTP logs match everything else (level, redaction). */
export const loggerOptions: LoggerOptions = {
  level: resolveLevel(),
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  // Emit `level` as its name ("info") rather than the numeric code — friendlier in JSON aggregators.
  formatters: { level: (label) => ({ level: label }) },
  ...(usePretty()
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
        },
      }
    : {}),
};

/** The process-wide base logger. Prefer `createLogger(service)` so lines are tagged with their source. */
export const rootLogger: Logger = pino(loggerOptions);

/**
 * A child logger tagged with `{ service }` (e.g. "api", "worker", "synthesis", "web") so every line
 * says where it came from — the structured replacement for the old `[worker]`/`[retrieval]` prefixes.
 */
export function createLogger(service: string): Logger {
  return rootLogger.child({ service });
}

export default rootLogger;
