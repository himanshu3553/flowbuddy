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

// Studio base URL(s), baked at build time. Comma-separated: the FIRST is the primary — the popup's
// "Connect with Sync" opens it — and ALL of them get the connect-bridge content script, so ONE
// artifact (e.g. the Web Store build) can complete the connect handshake against the deployed
// Studio AND a local dev Studio. Dev default: localhost only.
//   prod build: STUDIO_URL="https://<deployed-studio>,http://localhost:3000" pnpm build
const STUDIO_URLS = (process.env.STUDIO_URL || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);
const STUDIO_URL = STUDIO_URLS[0];

async function copyStatic() {
  // Bake the Studio origin(s) into the connect-bridge content-script `matches`, so the connect
  // token handshake injects on every Studio this build targets. Same single source of truth —
  // STUDIO_URL(S) — whose first entry bakes __STUDIO_URL__ for the popup.
  const manifest = JSON.parse(await readFile(path.join(__dirname, 'src', 'manifest.json'), 'utf8'));
  for (const cs of manifest.content_scripts ?? []) {
    if ((cs.js ?? []).includes('connect-bridge.js')) {
      cs.matches = STUDIO_URLS.map((u) => `${u}/*`);
    }
  }
  await writeFile(path.join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  for (const f of ['popup.html', 'offscreen.html', 'permission.html']) {
    await cp(path.join(__dirname, 'src', f), path.join(outdir, f));
  }

  // Toolbar + store icons (referenced by manifest.icons / action.default_icon).
  await cp(path.join(__dirname, 'src', 'icons'), path.join(outdir, 'icons'), {
    recursive: true,
  });

  // Bundled brand fonts (Plus Jakarta Sans + JetBrains Mono, latin subset) — @font-face'd locally
  // in popup.html since MV3 CSP blocks the Google Fonts CDN inside the popup.
  await cp(path.join(__dirname, 'src', 'fonts'), path.join(outdir, 'fonts'), {
    recursive: true,
  });
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
