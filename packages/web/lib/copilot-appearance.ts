/**
 * Copilot appearance (host branding) — shared, pure helpers used by both the Studio controls and the
 * live preview. The embedded widget reads its look from the snippet's `data-sync-*` attrs (NOT the
 * DB), so these defaults MUST match the widget runtime defaults (packages/widget/src) — that keeps
 * "preview == snippet == embed". An empty stored value means "use the widget default".
 */

export interface CopilotAppearance {
  accent: string; // hex like #3b50e0; '' = default
  title: string; // '' = default
  greeting: string; // '' = default
  position: 'left' | 'right';
}

export const COPILOT_DEFAULTS = {
  accent: '#3b50e0', // Sync indigo (widget --sc-accent)
  title: 'Ask AI', // widget data-sync-title fallback
  greeting: 'How can I help you today?', // widget data-sync-greeting fallback
  position: 'right' as const,
};

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
  return lines.join('\n') + '></script>';
}
