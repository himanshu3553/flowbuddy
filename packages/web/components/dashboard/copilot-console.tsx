'use client';

import { useState } from 'react';

import { CopilotWorkspace } from '@/components/dashboard/copilot-workspace';
import { WidgetPreview } from '@/components/dashboard/widget-preview';
import {
  buildSnippet,
  resolveAppearance,
  type CopilotAppearance,
} from '@/lib/copilot-appearance';
import type { EmbedStatus } from '@/lib/embed-status';

/**
 * Client shell for the Copilot page. Owns the live appearance state so the controls (Appearance tab,
 * left) and the Copilot Preview (right) stay in sync: editing a control re-renders the preview
 * immediately, and the embed snippet is rebuilt from the same state. "Save appearance" persists it.
 */
export function CopilotConsole({
  apiBase,
  widgetSrc,
  publicKey,
  widgetIsPlaceholder,
  allowedOrigins,
  primaryOrigin,
  showCitations,
  activity,
  detection,
  appearance: initialAppearance,
}: {
  apiBase: string;
  widgetSrc: string;
  publicKey: string;
  widgetIsPlaceholder: boolean;
  allowedOrigins: string[];
  primaryOrigin: string;
  showCitations: boolean;
  activity: {
    total: number;
    window: number;
    answeredPct: number;
    up: number;
    down: number;
    recent: { id: string; question: string; answered: boolean; feedback: string | null }[];
  };
  detection: EmbedStatus;
  appearance: CopilotAppearance;
}) {
  const [appearance, setAppearance] = useState<CopilotAppearance>(initialAppearance);
  const snippet = buildSnippet({ widgetSrc, apiBase, publicKey, appearance });
  const resolved = resolveAppearance(appearance);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <CopilotWorkspace
        snippet={snippet}
        publicKey={publicKey}
        allowedOrigins={allowedOrigins}
        primaryOrigin={primaryOrigin}
        widgetIsPlaceholder={widgetIsPlaceholder}
        showCitations={showCitations}
        activity={activity}
        detection={detection}
        appearance={appearance}
        onAppearanceChange={setAppearance}
      />
      <div className="lg:sticky lg:top-20 lg:self-start">
        <WidgetPreview
          accent={resolved.accent}
          title={resolved.title}
          greeting={resolved.greeting}
          position={resolved.position}
          launcherStyle={resolved.launcherStyle}
          launcherText={resolved.launcherText}
        />
      </div>
    </div>
  );
}
