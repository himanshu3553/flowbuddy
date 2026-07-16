import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Local-dev fallback for the P2-M5 Reason image-tier renderer bundle (the widget lazy-loads it as
 * a SIBLING of its own script src, so it must be served next to /widget/flowbuddy-copilot.js). Deployed
 * Studios host it on the same CDN path as the widget bundle and never hit this. Public route — the
 * bundle is public by design.
 */

export const dynamic = 'force-dynamic';

const CANDIDATES = [
  // next dev / next start run with cwd = packages/web
  path.resolve(process.cwd(), '..', 'widget', 'dist', 'flowbuddy-copilot-render.js'),
  path.resolve(process.cwd(), 'node_modules', '@sync', 'widget', 'dist', 'flowbuddy-copilot-render.js'),
];

export async function GET() {
  for (const file of CANDIDATES) {
    try {
      const js = await readFile(file);
      return new Response(js, {
        headers: {
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'no-store', // dev convenience — always the freshest local build
        },
      });
    } catch {
      // try the next candidate
    }
  }
  return new Response(
    '// renderer bundle not found — build it first: pnpm --filter @flowbuddy/widget build',
    { status: 404, headers: { 'content-type': 'text/javascript; charset=utf-8' } },
  );
}
