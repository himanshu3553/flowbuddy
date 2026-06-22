import { build, context } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

/** Bundle the widget to a single self-contained <script> (IIFE) the customer drops into their app. */
const opts = {
  entryPoints: [path.join(__dirname, 'src/index.ts')],
  outfile: path.join(__dirname, 'dist/sync-copilot.js'),
  bundle: true,
  format: 'iife',
  target: ['chrome120', 'firefox120', 'safari16'],
  minify: !watch,
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log('watching… -> dist/sync-copilot.js');
} else {
  await build(opts);
  console.log('built -> dist/sync-copilot.js');
}
