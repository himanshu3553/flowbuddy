/**
 * Widget logger — the embeddable copilot runs on our CUSTOMERS' pages, so it must add ZERO noise to
 * their console by default (the panel surfaces failures in its own UI). Logging is therefore OPT-IN:
 * nothing is emitted unless the embedder explicitly asks for it, regardless of build.
 *
 * Enable diagnostics with EITHER:
 *   <script ... data-flowbuddy-debug="true">        (attribute on the widget's own <script> tag)
 *   window.FlowBuddyDebug = true              (before the script loads)
 *
 * Once enabled, all levels print with a `[flowbuddy-copilot]` prefix so they're easy to filter.
 */
let enabled = false;

/** Turn diagnostics on/off — called once at boot from the resolved embed config. */
export function setDebug(on: boolean): void {
  enabled = on;
}

const emit = (fn: (...a: unknown[]) => void) => (...args: unknown[]) => {
  if (enabled) fn('[flowbuddy-copilot]', ...args);
};

export const log = {
  debug: emit(console.debug.bind(console)),
  info: emit(console.info.bind(console)),
  warn: emit(console.warn.bind(console)),
  error: emit(console.error.bind(console)),
};
