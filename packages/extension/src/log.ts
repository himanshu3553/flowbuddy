/**
 * Recorder-extension logger. Verbose levels (debug/info) are compiled out of PRODUCTION builds —
 * esbuild replaces `__DEV__` with a constant, so the minifier drops the dead branch — while warn/error
 * always surface (real recorder problems must be visible even in a store build, e.g. for bug reports).
 *
 * Dev vs prod is decided by the build (see build.mjs): `pnpm watch` and a plain `pnpm build` are dev;
 * `NODE_ENV=production pnpm build` (the Web Store artifact) is prod. Existing bracket tags in call
 * sites ("[capture]", "[recover]") are kept as-is — they act as sub-namespaces.
 */
declare const __DEV__: boolean;

// Fallback keeps the module usable if a bundle somehow ships without the define.
const dev = typeof __DEV__ === 'undefined' ? true : __DEV__;

export const log = {
  debug: (...args: unknown[]) => { if (dev) console.debug(...args); },
  info: (...args: unknown[]) => { if (dev) console.info(...args); },
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};
