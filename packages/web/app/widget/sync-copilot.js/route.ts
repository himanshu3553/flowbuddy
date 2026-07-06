import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Local-dev fallback for the widget bundle: serves the monorepo's built
 * `packages/widget/dist/sync-copilot.js` so the Copilot page's real-widget preview works without a
 * hosted widget URL. Deployed Studios set SYNC_WIDGET_URL (the real CDN artifact) and never hit
 * this. Public route — the bundle is public by design (it's what customers embed).
 */

export const dynamic = 'force-dynamic';

const CANDIDATES = [
  // next dev / next start run with cwd = packages/web
  path.resolve(process.cwd(), '..', 'widget', 'dist', 'sync-copilot.js'),
  path.resolve(process.cwd(), 'node_modules', '@sync', 'widget', 'dist', 'sync-copilot.js'),
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
    '// widget bundle not found — build it first: pnpm --filter @sync/widget build',
    { status: 404, headers: { 'content-type': 'text/javascript; charset=utf-8' } },
  );
}
