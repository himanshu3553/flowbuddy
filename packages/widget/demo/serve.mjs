#!/usr/bin/env node
// A fake product served at ANY path — the harness for testing how the copilot works out WHERE a
// user is standing (docs/ops/e2e-testing.md §11b).
//
// The static demo pages beside this file can only ever live at their own two URLs, which makes the
// two interesting cases untestable: a product whose URLs carry record ids, and a product whose URLs
// say nothing at all. This serves the same app at every path instead, so you can record on one URL
// and ask on another:
//
//   /projects/111/settings  vs  /projects/222/settings   → same screen, different record
//   /                       (root carries no screen information by design)
//   /app?screen=team        vs  /app?screen=billing      → one URL, two genuinely different screens
//
// The two screens deliberately share their chrome (top bar, nav, account menu) and differ in their
// content, because that is the discrimination a real fingerprint has to make.
//
//   FLOWBUDDY_KEY=pk_xxx node demo/serve.mjs            # → http://localhost:8080
//
// Then load any path. `?screen=` picks the screen and survives navigation; nothing else is stateful.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const API = process.env.FLOWBUDDY_API || 'http://localhost:8787';
const KEY = process.env.FLOWBUDDY_KEY || 'REPLACE_WITH_WORKSPACE_TOKEN';
// FLOWBUDDY_DEBUG=1 turns on the widget's console diagnostics AND `window.FlowBuddyLastAsk`, which
// is how you read back what Sense actually decided — the only view into the probe from outside.
const DEBUG = /^(1|true|yes)$/i.test(process.env.FLOWBUDDY_DEBUG || '');

const SCREENS = {
  team: {
    heading: 'Team members',
    lead: 'Invite people to this workspace and choose what they can do.',
    fields: [
      { label: 'Email address', type: 'email', placeholder: 'name@company.com' },
      { label: 'Job title', type: 'text', placeholder: 'e.g. Support lead' },
    ],
    choice: { label: 'Role', options: ['Viewer', 'Editor', 'Admin'] },
    submit: 'Send invitation',
    secondary: 'Cancel invite',
  },
  billing: {
    heading: 'Billing details',
    lead: 'Update the card we charge for this workspace.',
    fields: [
      { label: 'Name on card', type: 'text', placeholder: 'As printed on the card' },
      { label: 'Billing email', type: 'email', placeholder: 'finance@company.com' },
    ],
    choice: { label: 'Plan', options: ['Starter', 'Growth', 'Scale'] },
    submit: 'Save payment method',
    secondary: 'Remove card',
  },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function page(screenName, pathname) {
  const s = SCREENS[screenName] ?? SCREENS.team;
  const link = (name, label) =>
    `<a href="${esc(pathname)}?screen=${name}" class="${name === screenName ? 'on' : ''}">${esc(label)}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Acme Corp — ${esc(s.heading)} | DemoApp</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; color: #222; }
    .topbar { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; background: #14161f; color: #fff; }
    .topbar nav a { color: #cbd0e0; text-decoration: none; margin-left: 18px; font-size: 14px; }
    .topbar nav a.on { color: #fff; font-weight: 600; }
    main { padding: 28px 24px; max-width: 640px; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    .lead { color: #666; margin: 0 0 22px; }
    label { display: block; font-size: 13px; font-weight: 600; margin: 14px 0 4px; }
    input, select { width: 100%; padding: 9px 10px; border: 1px solid #d0d5dd; border-radius: 7px; font-size: 14px; }
    .row { margin-top: 22px; display: flex; gap: 10px; }
    button { padding: 9px 16px; border-radius: 7px; border: 0; font-size: 14px; cursor: pointer; }
    .primary { background: #4f46e5; color: #fff; }
    .secondary { background: #f2f4f7; color: #344054; }
    .path { margin-top: 26px; color: #98a2b3; font-size: 12px; font-family: ui-monospace, monospace; }
  </style>
</head>
<body>
  <div class="topbar">
    <strong>Acme Corp</strong>
    <nav>${link('team', 'Team')}${link('billing', 'Billing')}</nav>
    <span>jane@acme.com</span>
  </div>
  <main>
    <h1>${esc(s.heading)}</h1>
    <p class="lead">${esc(s.lead)}</p>
    <form onsubmit="return false">
      ${s.fields
        .map(
          (f) => `<label for="${esc(f.label)}">${esc(f.label)}</label>
      <input id="${esc(f.label)}" type="${esc(f.type)}" placeholder="${esc(f.placeholder)}" />`,
        )
        .join('\n      ')}
      <label for="${esc(s.choice.label)}">${esc(s.choice.label)}</label>
      <select id="${esc(s.choice.label)}">${s.choice.options.map((o) => `<option>${esc(o)}</option>`).join('')}</select>
      <div class="row">
        <button class="primary" type="submit">${esc(s.submit)}</button>
        <button class="secondary" type="button">${esc(s.secondary)}</button>
      </div>
    </form>
    <p class="path">served at ${esc(pathname)} — every path serves this app</p>
  </main>
  <script src="/dist/flowbuddy-copilot.js" data-flowbuddy-api="${esc(API)}" data-flowbuddy-key="${esc(KEY)}"${DEBUG ? ' data-flowbuddy-debug="1"' : ''}></script>
</body>
</html>`;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/dist/')) {
    try {
      const file = await readFile(path.join(__dirname, '..', url.pathname));
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(file);
    } catch {
      res.writeHead(404);
      return res.end('// build the widget first: pnpm --filter @flowbuddy/widget build');
    }
  }
  if (url.pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(page(url.searchParams.get('screen') || 'team', url.pathname));
}).listen(PORT, () => {
  console.log(`fake product on http://localhost:${PORT} — every path serves it`);
  console.log(`  api ${API}   key ${KEY === 'REPLACE_WITH_WORKSPACE_TOKEN' ? '(NOT SET — export FLOWBUDDY_KEY)' : KEY}`);
  console.log('  try /projects/111/settings · /projects/222/settings · / · /app?screen=billing');
});
