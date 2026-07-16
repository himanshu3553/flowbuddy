import { build, context } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

/**
 * Two self-contained IIFE bundles:
 *  - flowbuddy-copilot.js        — the widget the customer embeds (one <script>).
 *  - flowbuddy-copilot-render.js — the P2-M5 Reason image-tier renderer (html2canvas + clone masking),
 *    LAZY-loaded by the widget on the first diagnostic question when the founder enabled the page
 *    image — it must never ride in the base bundle. Deploy it NEXT TO the widget bundle (the
 *    widget derives its URL as a sibling file of its own script src).
 */
const shared = {
  bundle: true,
  format: 'iife',
  target: ['chrome120', 'firefox120', 'safari16'],
  minify: !watch,
  logLevel: 'info',
};
const bundles = [
  { ...shared, entryPoints: [path.join(__dirname, 'src/index.ts')], outfile: path.join(__dirname, 'dist/flowbuddy-copilot.js') },
  { ...shared, entryPoints: [path.join(__dirname, 'src/render-image.ts')], outfile: path.join(__dirname, 'dist/flowbuddy-copilot-render.js') },
];

if (watch) {
  for (const opts of bundles) {
    const ctx = await context(opts);
    await ctx.watch();
  }
  console.log('watching… -> dist/flowbuddy-copilot.js + dist/flowbuddy-copilot-render.js');
} else {
  await Promise.all(bundles.map((opts) => build(opts)));
  console.log('built -> dist/flowbuddy-copilot.js + dist/flowbuddy-copilot-render.js');
}
