import { build, context } from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outdir = path.join(__dirname, 'dist');
const watch = process.argv.includes('--watch');

const entryPoints = {
  background: 'src/background.ts',
  content: 'src/content.ts',
  'connect-bridge': 'src/connect-bridge.ts',
  offscreen: 'src/offscreen.ts',
  popup: 'src/popup.ts',
  permission: 'src/permission.ts',
};

// Studio base URL is baked at build time (dev default; override with STUDIO_URL for prod builds).
const STUDIO_URL = process.env.STUDIO_URL || 'http://localhost:3000';

async function copyStatic() {
  // Bake the Studio origin into the connect-bridge content-script `matches`, so the connect token
  // handshake injects on whatever Studio this build targets (localhost in dev, the deployed Studio
  // in prod). Same single source of truth — STUDIO_URL — that bakes __STUDIO_URL__ for the popup.
  const manifest = JSON.parse(await readFile(path.join(__dirname, 'src', 'manifest.json'), 'utf8'));
  const studioMatch = `${STUDIO_URL.replace(/\/$/, '')}/*`;
  for (const cs of manifest.content_scripts ?? []) {
    if ((cs.js ?? []).includes('connect-bridge.js')) cs.matches = [studioMatch];
  }
  await writeFile(path.join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  for (const f of ['popup.html', 'offscreen.html', 'permission.html']) {
    await cp(path.join(__dirname, 'src', f), path.join(outdir, f));
  }
}

const common = {
  entryPoints,
  outdir,
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  logLevel: 'info',
  define: { __STUDIO_URL__: JSON.stringify(STUDIO_URL) },
};

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

if (watch) {
  const ctx = await context(common);
  await ctx.watch();
  await copyStatic();
  console.log('watching… (re-run build to refresh static files)');
} else {
  await build(common);
  await copyStatic();
  console.log('built -> dist/');
}
