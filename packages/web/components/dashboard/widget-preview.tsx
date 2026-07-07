'use client';

import { useEffect, useState } from 'react';

/**
 * The REAL-widget tester (Approach B). Renders the actual embeddable bundle — same artifact, same
 * public key, same API path an end-user hits — inside an iframe host page that stands in for a
 * customer's app page (`/dashboard/copilot/preview-frame`). The widget runs in preview mode
 * (`data-sync-preview`), so trying it never stamps embed detection or writes analytics.
 *
 * Appearance edits ride to the frame as query params, debounced — a reload per keystroke would
 * flicker; ~half a second after typing settles, the frame refreshes with the new look.
 */
export function WidgetPreview({
  accent,
  title,
  greeting,
  position,
  launcherStyle,
  launcherText,
}: {
  accent: string;
  title: string;
  greeting: string;
  position: 'left' | 'right';
  launcherStyle: 'icon' | 'text' | 'text-outline';
  launcherText: string;
}) {
  const params = new URLSearchParams({
    accent,
    title,
    greeting,
    position,
    launcher: launcherStyle,
    launcherText,
  });
  const url = `/dashboard/copilot/preview-frame?${params.toString()}`;
  const [src, setSrc] = useState(url);

  useEffect(() => {
    if (url === src) return;
    const t = setTimeout(() => setSrc(url), 450);
    return () => clearTimeout(t);
  }, [url, src]);

  return (
    <div>
      <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-faint">
        Copilot Preview
      </div>

      <div className="rounded-[14px] border border-[#e7eafb] bg-[#f4f6fd] p-4">
        <iframe
          src={src}
          title="Live copilot preview — the real widget"
          // Chromeless on purpose: the frame's body matches this container's tint (#f4f6fd), so the
          // widget panel + launcher float on ONE clean surface — no card-inside-a-card.
          className="h-[540px] w-full"
        />
        <p className="mt-3 text-[11px] leading-relaxed text-faint">
          This is the <span className="font-semibold text-secondary-foreground">real widget</span>,
          live against your approved knowledge base. Preview questions aren&apos;t logged and never
          count as an install.
        </p>
      </div>
    </div>
  );
}
