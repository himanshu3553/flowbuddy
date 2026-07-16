/**
 * Copilot appearance (host branding) — shared, pure helpers used by both the Studio controls and the
 * live preview. Since 2026-07-07 the embedded widget fetches its look from `GET /v1/copilot/config`
 * (the DB is the source of truth), so Studio Appearance changes reach every embed live — the snippet
 * carries only src/api/key and never needs re-copying. Explicit `data-flowbuddy-*` attrs remain supported
 * as deliberate per-page overrides. These defaults MUST still match the widget runtime defaults
 * (packages/widget/src) so the preview shows exactly what an uncustomized embed renders. An empty
 * stored value means "use the widget default".
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
  accent: '#3b50e0', // FlowBuddy indigo (widget --fb-accent)
  title: 'Ask AI', // widget data-flowbuddy-title fallback
  greeting: 'How can I help you today?', // widget data-flowbuddy-greeting fallback
  position: 'right' as const,
  launcherStyle: 'icon' as LauncherStyle,
  launcherText: 'Ask me anything', // widget data-flowbuddy-launcher-text fallback
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
 * Build the embed `<script>` snippet — src/api/key ONLY. Appearance is deliberately NOT baked in:
 * the widget fetches it from `/v1/copilot/config` at mount, so the snippet stays stable across
 * Appearance changes and customers never re-copy it. (Baking attrs here would freeze the look at
 * copy time — attrs win over server config by design, as per-page overrides.)
 */
export function buildSnippet(opts: { widgetSrc: string; apiBase: string; publicKey: string }): string {
  const { widgetSrc, apiBase, publicKey } = opts;
  return [
    `<script src="${widgetSrc}"`,
    `  data-flowbuddy-api="${apiBase}"`,
    `  data-flowbuddy-key="${publicKey}"`,
  ].join('\n') + '></script>';
}
