/**
 * Browser-side logger for Studio CLIENT components. The Node logger (@flowbuddy/logger → pino) must never
 * be imported into a client bundle, so client code logs through this tiny console wrapper instead.
 *
 * Level follows the build: `debug` in development, `warn`+ in production (so a customer's browser
 * console stays clean). Override at build time with NEXT_PUBLIC_LOG_LEVEL (it's inlined into the
 * client bundle, so it must be a build-time env, not a runtime one).
 */
type Level = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

const configured =
  (process.env.NEXT_PUBLIC_LOG_LEVEL as Level | undefined) ||
  (process.env.NODE_ENV === 'production' ? 'warn' : 'debug');

const threshold = ORDER[configured] ?? ORDER.debug;
const on = (level: Exclude<Level, 'silent'>) => ORDER[level] >= threshold;

export const clientLog = {
  debug: (...args: unknown[]) => { if (on('debug')) console.debug('[flowbuddy]', ...args); },
  info: (...args: unknown[]) => { if (on('info')) console.info('[flowbuddy]', ...args); },
  warn: (...args: unknown[]) => { if (on('warn')) console.warn('[flowbuddy]', ...args); },
  error: (...args: unknown[]) => { if (on('error')) console.error('[flowbuddy]', ...args); },
};
