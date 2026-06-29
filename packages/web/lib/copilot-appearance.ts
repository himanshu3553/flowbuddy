/**
 * Copilot appearance (host branding) — shared, pure helpers used by both the Studio controls and the
 * live preview. The embedded widget reads its look from the snippet's `data-sync-*` attrs (NOT the
 * DB), so these defaults MUST match the widget runtime defaults (packages/widget/src) — that keeps
 * "preview == snippet == embed". An empty stored value means "use the widget default".
 */

/** Launcher button look on the host page: chat bubble icon, a filled text pill, or a bordered pill. */
export type LauncherStyle = 'icon' | 'text' | 'text-outline';

export interface CopilotAppearance {
  accent: string; // hex like #3b50e0; '' = default
  title: string; // '' = default
  greeting: string; // '' = default
  position: 'left' | 'right';
  launcherStyle: LauncherStyle;
  launcherText: string; // '' = default ("Ask me anything"); used for text/text-outline
}

export const COPILOT_DEFAULTS = {
  accent: '#3b50e0', // Sync indigo (widget --sc-accent)
  title: 'Ask AI', // widget data-sync-title fallback
  greeting: 'How can I help you today?', // widget data-sync-greeting fallback
  position: 'right' as const,
  launcherStyle: 'icon' as LauncherStyle,
  launcherText: 'Ask me anything', // widget data-sync-launcher-text fallback
};

export const LAUNCHER_STYLES: { value: LauncherStyle; label: string }[] = [
  { value: 'icon', label: 'Icon' },
  { value: 'text', label: 'Text' },
  { value: 'text-outline', label: 'Outline' },
];

export const ACCENT_PRESETS = [
  '#3b50e0', // indigo (default)
  '#2563eb', // blue
  '#0d9488', // teal
  '#16a34a', // green
  '#7c3aed', // violet
  '#db2777', // pink
  '#ea580c', // orange
  '#475569', // slate
];

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Resolve raw (possibly-empty / mid-typing) appearance to concrete, always-valid display values. */
export function resolveAppearance(a: CopilotAppearance) {
  return {
    accent: HEX.test(a.accent.trim()) ? a.accent.trim() : COPILOT_DEFAULTS.accent,
    title: a.title.trim() || COPILOT_DEFAULTS.title,
    greeting: a.greeting.trim() || COPILOT_DEFAULTS.greeting,
    position: a.position === 'left' ? ('left' as const) : ('right' as const),
    launcherStyle:
      a.launcherStyle === 'text' || a.launcherStyle === 'text-outline'
        ? a.launcherStyle
        : COPILOT_DEFAULTS.launcherStyle,
    launcherText: a.launcherText.trim() || COPILOT_DEFAULTS.launcherText,
  };
}

/**
 * Build the embed `<script>` snippet. Only NON-default attrs are emitted — defaults match the widget
 * runtime, so an unbranded copilot still looks identical with the minimal snippet.
 */
export function buildSnippet(opts: {
  widgetSrc: string;
  apiBase: string;
  publicKey: string;
  appearance: CopilotAppearance;
}): string {
  const { widgetSrc, apiBase, publicKey, appearance } = opts;
  const lines = [
    `<script src="${widgetSrc}"`,
    `  data-sync-api="${apiBase}"`,
    `  data-sync-key="${publicKey}"`,
  ];
  const title = appearance.title.trim();
  const greeting = appearance.greeting.trim();
  const accent = appearance.accent.trim();
  if (title) lines.push(`  data-sync-title="${title}"`);
  if (greeting) lines.push(`  data-sync-greeting="${greeting}"`);
  if (HEX.test(accent)) lines.push(`  data-sync-accent="${accent}"`);
  if (appearance.position === 'left') lines.push(`  data-sync-position="left"`);
  if (appearance.launcherStyle === 'text' || appearance.launcherStyle === 'text-outline') {
    lines.push(`  data-sync-launcher="${appearance.launcherStyle}"`);
    const launcherText = appearance.launcherText.trim();
    if (launcherText) lines.push(`  data-sync-launcher-text="${launcherText}"`);
  }
  return lines.join('\n') + '></script>';
}
