/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages are TS source — let Next transpile them.
  transpilePackages: ['@sync/db', '@sync/shared', '@sync/synthesis'],
};

export default nextConfig;
