import type { CapturedEvent, Locator } from './capture.js';

/**
 * R13 locator recovery — the ONE way a consumer turns a captured event into the ranked locator
 * list it will try against a live page.
 *
 * Extracted from the sense-plan compiler the day the execution-plan compiler became its second
 * consumer: the rule ("ranked best-first, capped; pre-R13 captures fall back to the positional
 * css/xpath so old recordings stay usable") must not exist twice, because a drift between what the
 * probe can find and what the executor can act on would surface as "it can see the step but not do
 * it" — a bug shaped like a product limitation.
 */
export function eventLocators(ev: CapturedEvent | undefined, max: number): Locator[] {
  if (!ev?.target) return [];
  const ranked = ev.target.locators ?? [];
  if (ranked.length > 0) return ranked.slice(0, max);
  const fallback: Locator[] = [];
  if (ev.target.cssPath) fallback.push({ strategy: 'css', value: ev.target.cssPath });
  if (ev.target.xpath) fallback.push({ strategy: 'xpath', value: ev.target.xpath });
  return fallback;
}
