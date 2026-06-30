/**
 * Embed-detection read model — turns the workspace's widget heartbeat (`widgetLastSeenAt`, written by
 * the /seen ping AND every answered question) into the "copilot detected / live" status the Studio
 * shows on Home and the Copilot page. The single source for this derived state, so both pages agree
 * (mirrors how lib/analytics.ts centralizes the Analytics aggregations). Pure — safe to import
 * anywhere; the `getEmbedStatus` call itself runs server-side off the workspace row.
 */

export interface EmbedStatus {
  /** Has the widget ever phoned home? Drives "live" vs "not detected". */
  detected: boolean;
  lastSeenAt: Date | null;
  /** Humanized "last seen" (e.g. "2m ago"), or null when never seen. */
  lastSeenLabel: string | null;
  /** Host of the page the widget last loaded on (e.g. "app.acme.com"), or null. */
  origin: string | null;
}

function originHost(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin.replace(/^https?:\/\//, '');
  }
}

function relativeTime(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function getEmbedStatus(workspace: {
  widgetLastSeenAt: Date | null;
  widgetLastSeenOrigin: string | null;
}): EmbedStatus {
  const at = workspace.widgetLastSeenAt;
  return {
    detected: at != null,
    lastSeenAt: at,
    lastSeenLabel: at ? relativeTime(at) : null,
    origin: workspace.widgetLastSeenOrigin ? originHost(workspace.widgetLastSeenOrigin) : null,
  };
}
