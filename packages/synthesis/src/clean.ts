import type { CapturedEvent, EventTarget } from '@sync/shared';

// KB step distillation — Phase 1 (deterministic cleanup "B").
// See docs/kb-step-distillation.md §5.2. Mechanical-only: collapse the duplicate /
// redundant low-level DOM events the recorder emits, WITHOUT making semantic judgments.
// Deciding whether a surviving click is a real step vs. stray page-chrome noise (e.g. a
// landing-page CTA clicked while narrating) is the LLM distiller's job (Phase 2 "A"), because
// that needs the narration context this pass deliberately does not reason about.

/** Consecutive identical (type+target) events closer than this collapse to one (e.g. a double-click). */
const DEDUP_MS = 5000;
/** A form `submit` within this gap after the button `click` that triggered it is the same action. */
const SUBMIT_MERGE_MS = 4000;

const INTERACTIVE_TAGS = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'label', 'option', 'summary',
]);
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'menuitem', 'menuitemcheckbox', 'tab', 'checkbox', 'radio',
  'switch', 'option', 'combobox', 'textbox', 'searchbox',
]);

/** Stable identity for "the same element" across events — prefer a unique selector, fall back to
 *  semantics, and finally the event id (which never collides, so unrelated events never merge). */
function targetKey(ev: CapturedEvent): string {
  const t = ev.target || {};
  return (
    t.cssPath ||
    t.xpath ||
    [t.tag, t.role, t.accessibleName, t.text].filter(Boolean).join('|') ||
    ev.id
  );
}

/** Best-effort "could a user meaningfully click this?" — true for real controls, false for page
 *  chrome (a plain `div`/`p`/`section`). Exported for the Phase-2 distiller to weigh stray clicks;
 *  `cleanEvents` does NOT drop on this (too aggressive without narration context). */
export function isLikelyInteractiveTarget(t: EventTarget | undefined | null): boolean {
  if (!t) return false;
  const tag = (t.tag || '').toLowerCase();
  const role = (t.role || '').toLowerCase();
  if (INTERACTIVE_TAGS.has(tag)) return true;
  if (role && INTERACTIVE_ROLES.has(role)) return true;
  const attrs = t.attributes || {};
  if ('onclick' in attrs || attrs.href || attrs.tabindex) return true;
  return false;
}

/**
 * Collapse mechanical duplicate/redundant events into the meaningful interactions, preserving order.
 * Pure — returns a filtered view of the same event references. Three rules:
 *   1. Redundant focus-click — a `click` on a field we also typed into (it has an `input` event)
 *      is just focusing the field; keep the value-bearing `input`, drop the click.
 *   2. Button-click + form-submit — a `submit` right after the `click` that triggered it is the same
 *      action; keep the labeled button click, drop the form-level `submit` blob.
 *   3. Consecutive identical — repeated same-(type,target) events in a short window (double-clicks,
 *      jittered re-clicks) collapse to the first.
 */
export function cleanEvents(events: CapturedEvent[]): CapturedEvent[] {
  if (events.length <= 1) return events.slice();

  // Fields that received a value-bearing input — their focus-clicks are redundant (rule 1).
  const typedFieldKeys = new Set<string>();
  for (const ev of events) if (ev.type === 'input') typedFieldKeys.add(targetKey(ev));

  const kept: CapturedEvent[] = [];
  for (const ev of events) {
    const key = targetKey(ev);
    const last = kept[kept.length - 1];

    // Rule 1 — drop a focus-click on a field we typed into.
    if (ev.type === 'click' && typedFieldKeys.has(key)) continue;

    // Rule 2 — drop a form `submit` that the preceding button click already represents.
    if (ev.type === 'submit' && last && last.type === 'click' && ev.t - last.t <= SUBMIT_MERGE_MS) continue;

    // Rule 3 — collapse consecutive identical events.
    if (last && last.type === ev.type && targetKey(last) === key && ev.t - last.t <= DEDUP_MS) continue;

    kept.push(ev);
  }
  return kept;
}
