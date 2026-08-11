import type { CapturedEvent } from '@flowbuddy/shared';

/**
 * The GRANULARITY invariant's shared vocabulary (kb-step-distillation.md): one step = one actable
 * control. Two consumers on purpose — the distillation split pass (the enforcement) and the plan
 * compiler's eligibility backstop (the alarm if enforcement ever regresses) — so what counts as
 * "actable" and "the same control" can never drift between them. Pure: no OpenAI, importable by
 * the Studio bundle.
 */

/** The event types the acting layer can execute — the invariant is defined over these;
 *  hover/scroll/keydown are context and never force a split. */
export const ACTABLE_TYPES = new Set(['click', 'input', 'submit', 'nav']);

/** "The same control", by capture identity: the css path is stable within one recording; the top
 *  locator is the fallback; the event id merges nothing (fail-open to splitting). */
export function controlKey(ev: CapturedEvent): string {
  return ev.target?.cssPath || ev.target?.locators?.[0]?.value || ev.id;
}

/** How many distinct actable controls a set of events spans — 0 or 1 satisfies the invariant. */
export function distinctActableControls(events: Array<CapturedEvent | undefined>): number {
  const keys = new Set<string>();
  for (const ev of events) {
    if (ev && ACTABLE_TYPES.has(ev.type)) keys.add(controlKey(ev));
  }
  return keys.size;
}
