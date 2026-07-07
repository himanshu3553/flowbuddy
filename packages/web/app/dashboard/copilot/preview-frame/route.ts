import { getCurrentWorkspace } from '@/lib/session';
import { getOrCreateCopilotKey } from '@/lib/copilot-settings';
import { resolveAppearance, type CopilotAppearance } from '@/lib/copilot-appearance';

/**
 * The real-widget tester's host page (Approach B). The Copilot page renders this route in an
 * iframe: a miniature stand-in for a customer's app page that embeds the ACTUAL widget bundle with
 * the workspace's real public key against the real API — same artifact, same request path an
 * end-user hits. `data-sync-preview="1"` keeps the session honest: no embed-detection stamp, no
 * analytics writes (see packages/widget + the api /answer route).
 *
 * Appearance rides in as query params (cosmetic, session-scoped — the saved values come from the
 * DB via the page); everything is validated/resolved server-side and HTML-escaped before emit.
 */

export const dynamic = 'force-dynamic';

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );
}

export async function GET(req: Request) {
  const ctx = await getCurrentWorkspace();
  if (!ctx) return new Response('Unauthorized', { status: 401 });

  const { publicKey } = await getOrCreateCopilotKey(ctx.workspace.id);
  const apiBase = process.env.SYNC_API_URL || 'http://localhost:8787';
  // Deployed: the hosted bundle customers embed (maximal fidelity). Local: the monorepo fallback.
  const widgetSrc = process.env.SYNC_WIDGET_URL || '/widget/sync-copilot.js';

  const q = new URL(req.url).searchParams;
  const raw: CopilotAppearance = {
    accent: (q.get('accent') ?? '').slice(0, 16),
    title: (q.get('title') ?? '').slice(0, 120),
    greeting: (q.get('greeting') ?? '').slice(0, 200),
    position: q.get('position') === 'left' ? 'left' : 'right',
    launcherStyle:
      q.get('launcher') === 'text' || q.get('launcher') === 'text-outline'
        ? (q.get('launcher') as 'text' | 'text-outline')
        : 'icon',
    launcherText: (q.get('launcherText') ?? '').slice(0, 60),
  };
  const a = resolveAppearance(raw);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Copilot preview</title>
<style>
  /* Flat backdrop in the SAME tint as the Studio preview container, so the iframe disappears into
     it and the only visible chrome is the widget itself (panel + launcher) — one clean surface,
     no page-behind-a-page effect. */
  * { box-sizing: border-box; margin: 0; }
  body { min-height: 100vh; background: #f4f6fd; }
</style>
</head>
<body>
  <script src="${esc(widgetSrc)}"
    data-sync-api="${esc(apiBase)}"
    data-sync-key="${esc(publicKey)}"
    data-sync-title="${esc(a.title)}"
    data-sync-greeting="${esc(a.greeting)}"
    data-sync-accent="${esc(a.accent)}"
    data-sync-position="${esc(a.position)}"
    data-sync-launcher="${esc(a.launcherStyle)}"
    data-sync-launcher-text="${esc(a.launcherText)}"
    data-sync-preview="1"></script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      // Only the Studio itself may frame this page.
      'content-security-policy': "frame-ancestors 'self'",
    },
  });
}
