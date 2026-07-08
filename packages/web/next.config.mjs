/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages are TS source — let Next transpile them.
  transpilePackages: ['@sync/db', '@sync/shared', '@sync/synthesis', '@sync/logger'],
  // pino (and its pretty transport) use dynamic requires / worker threads that Next's bundler must
  // NOT try to trace — keep them external so they load as plain node_modules at runtime (server only).
  serverExternalPackages: ['pino', 'pino-pretty', 'thread-stream'],
};

export default nextConfig;
