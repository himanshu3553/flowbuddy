// P2-M5 REASON (diagnostic reasoning) — the widget half (docs/phase-2-reason.md). When a question
// is diagnostic ("why is this button disabled?") or the page state is blocked, capture a
// STRUCTURED reading of the live page — every interactive control as explicit machine state
// (validity API / ARIA / DOM properties) plus visible labels/hints/errors — and, where the founder
// enabled the image tier, a DOM-rendered picture of the page (renderer LAZY-loaded, never in the
// base bundle; masking on the clone). Ask-time-scoped, always: one snapshot when the user asks,
// never a running tape. End-user-silent by design (founder-level toggle + disclosure snippet own
// the posture). Values are MASKED by default everywhere; hard floors regardless of settings:
// passwords are never captured, card/SSN patterns always masked.

import { maskText } from './sense.js';
import type { SenseProbeResult } from './sense.js';
import { log } from './log.js';

// ── Wire shapes (mirror packages/synthesis/src/reason.ts; the server re-validates every field) ──
export interface ReasonElementWire {
  tag: string;
  role?: string;
  name?: string;
  disabled?: boolean;
  checked?: boolean;
  expanded?: boolean;
  required?: boolean;
  filled?: boolean;
  valid?: boolean;
  invalidReason?: string;
  value?: string;
  current?: boolean;
}
export interface ReasonSnapshotWire {
  path: string;
  title: string;
  viewport: { w: number; h: number };
  elements: ReasonElementWire[];
  texts: string[];
}
export type ReasonTrigger = 'intent' | 'blocked' | 'escalation';
export interface ReasonAskPayload {
  trigger: ReasonTrigger;
  snapshot: ReasonSnapshotWire;
  image?: string; // data-URL JPEG — only when the founder enabled the image tier AND render succeeded
}

// ── Budgets (must stay within the server's validation caps) ─────────────────────────────────────
const MAX_ELEMENTS = 60;
const MAX_TEXTS = 40;
const MAX_NAME_CHARS = 80;
const MAX_TEXT_CHARS = 160;
const MAX_VALUE_CHARS = 120;

// ── The selective trigger (§5.2) ────────────────────────────────────────────────────────────────
// Diagnostic intent: "why / can't / stuck / not working"-class wording. Deliberately narrow — a
// plain "how do I X" must stay on the fast path (pennies, ~2s).
const DIAGNOSTIC_RE =
  /\bwhy\b|can'?\s?not\b|\bcan'?t\b|\bwon'?t\b|\bdoesn'?t\b|\bisn'?t work|\bnot work|\bstuck\b|\bdisabled\b|\bgr[ae]y(ed)?([ -]?out)?\b|\bblocked\b|\bunable\b|\bbroken\b|nothing (is )?happen|what('?s| is) wrong|\bfail(s|ed|ing)?\b/i;

/** Hard floors for unmasked values (§5.4): card/SSN patterns are masked REGARDLESS of settings. */
function maskHardFloors(s: string): string {
  return s
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[redacted-card]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[redacted-ssn]');
}

function isElementDisabled(el: Element): boolean {
  return (
    (el as HTMLButtonElement | HTMLInputElement).disabled === true ||
    el.getAttribute('aria-disabled') === 'true'
  );
}

/**
 * Why Reason should fire for this question, or null to stay on the fast path:
 * 'intent' = diagnostic wording; 'blocked' = the Sense-localized current step's target is disabled
 * (the glance itself sees a wall). 'escalation' is set by the caller on a fast-path decline retry.
 */
export function reasonTrigger(question: string, probe: SenseProbeResult | null): ReasonTrigger | null {
  if (DIAGNOSTIC_RE.test(question)) return 'intent';
  const top = probe?.hypotheses[0];
  if (top) {
    const el = probe!.elements.get(`${top.sourceId}:${top.segmentIndex}:${top.step}`);
    if (el && isElementDisabled(el)) return 'blocked';
  }
  return null;
}

// ── The structured page-state snapshot (§3 #4) ──────────────────────────────────────────────────

function visible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function clean(s: string | null | undefined, cap: number): string {
  return (s ?? '').trim().replace(/\s+/g, ' ').slice(0, cap);
}

/** Lightweight accessible name: aria-label → labelledby → <label> → placeholder → text → name/title. */
function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return aria;
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
    if (parts) return parts;
  }
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label?.textContent?.trim()) return label.textContent;
  }
  const closestLabel = el.closest('label');
  if (closestLabel?.textContent?.trim()) return closestLabel.textContent;
  const placeholder = el.getAttribute('placeholder');
  if (placeholder?.trim()) return placeholder;
  const text = (el as HTMLElement).innerText ?? el.textContent ?? '';
  if (text.trim()) return text;
  return el.getAttribute('name') ?? el.getAttribute('title') ?? '';
}

const CONTROL_SELECTOR =
  'button, a[href], input, select, textarea, summary, [contenteditable="true"], ' +
  '[role="button"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], ' +
  '[role="menuitem"], [role="combobox"], [role="link"]';

const VALIDITY_KEYS = [
  'valueMissing',
  'typeMismatch',
  'patternMismatch',
  'tooShort',
  'tooLong',
  'rangeUnderflow',
  'rangeOverflow',
  'stepMismatch',
  'badInput',
  'customError',
] as const;

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
function isFormControl(el: Element): el is FormControl {
  return (
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
  );
}
function isValueCarrying(el: Element): boolean {
  if (el instanceof HTMLInputElement) {
    return !['button', 'submit', 'reset', 'image', 'checkbox', 'radio', 'file'].includes(el.type);
  }
  return el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement ||
    el.getAttribute('contenteditable') === 'true';
}
function isPassword(el: Element): boolean {
  return el instanceof HTMLInputElement && el.type === 'password';
}
/** Fields whose values are hard-floor sensitive even when the founder unmasked values. */
function isSensitiveField(el: Element): boolean {
  if (isPassword(el)) return true;
  const hints = [el.getAttribute('autocomplete'), el.getAttribute('name'), el.id]
    .join(' ')
    .toLowerCase();
  return /cc-|card|cvv|cvc|ssn|social.?security/.test(hints);
}

/**
 * Whether the control carries any machine-checkable HTML5 constraint beyond mere presence. When it
 * doesn't, a passing `checkValidity()` proves nothing — the app may validate in its own JS (React
 * state etc.), so we OMIT `valid` rather than ship a misleading `valid: true` (a password field
 * with only `required` "passes" while failing every on-screen rule).
 */
function hasConstraints(el: FormControl): boolean {
  if (el instanceof HTMLSelectElement) return false; // only `required`, which valueMissing covers
  if (el instanceof HTMLInputElement) {
    if (['email', 'url', 'number', 'tel', 'date', 'time', 'datetime-local', 'month', 'week'].includes(el.type)) {
      return true;
    }
  }
  return ['pattern', 'minlength', 'maxlength', 'min', 'max', 'step'].some((a) => el.hasAttribute(a));
}

function readElement(el: Element, includeValues: boolean, currentStepEl: Element | null): ReasonElementWire {
  const tag = el.tagName.toLowerCase();
  const e: ReasonElementWire = { tag };
  const role = el.getAttribute('role');
  if (role) e.role = clean(role, 32);
  else if (el instanceof HTMLInputElement) e.role = el.type;
  const name = clean(maskText(accessibleName(el)), MAX_NAME_CHARS);
  if (name) e.name = name;
  if (isElementDisabled(el)) e.disabled = true;
  if ((el as HTMLInputElement).required === true || el.getAttribute('aria-required') === 'true') {
    e.required = true;
  }

  // Checked state — native checkbox/radio or ARIA.
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    e.checked = el.checked;
  } else {
    const ariaChecked = el.getAttribute('aria-checked');
    if (ariaChecked === 'true' || ariaChecked === 'false') e.checked = ariaChecked === 'true';
  }
  const expanded = el.getAttribute('aria-expanded');
  if (expanded === 'true' || expanded === 'false') e.expanded = expanded === 'true';

  // Field state — the core diagnostic channel: filled/valid + the FAILED-CONSTRAINT NAME.
  if (isValueCarrying(el)) {
    const value = isFormControl(el) ? el.value : ((el as HTMLElement).innerText ?? '');
    e.filled = value.trim() !== '';
    if (isFormControl(el) && typeof el.checkValidity === 'function') {
      const passes = el.checkValidity();
      if (!passes) {
        e.valid = false;
        const v = el.validity;
        e.invalidReason = VALIDITY_KEYS.find((k) => v[k]) ?? 'unspecified';
      } else if (hasConstraints(el)) {
        e.valid = true; // meaningful — a real constraint was checked and passed
      }
      // No constraints + passes → `valid` stays absent: nothing machine-checkable to report.
    }
    if (e.valid !== false && el.getAttribute('aria-invalid') === 'true') {
      e.valid = false;
      e.invalidReason = e.invalidReason ?? 'ariaInvalid';
    }
    // Values ship ONLY when the founder unmasked them — and never for password/card/SSN fields.
    if (includeValues && e.filled && !isSensitiveField(el)) {
      e.value = clean(maskHardFloors(value), MAX_VALUE_CHARS);
    }
  }

  if (currentStepEl && (el === currentStepEl || el.contains(currentStepEl) || currentStepEl.contains(el))) {
    e.current = true;
  }
  return e;
}

/**
 * Capture the structured page-state snapshot: interactive controls (explicit state) + visible
 * text (labels, hints, requirement/error lines), both in reading order, both budgeted and masked.
 * Read-only, synchronous, ~ms. Never throws — a capture failure returns null and the question
 * simply proceeds without Reason (degrade like everything else in the widget).
 */
export function captureSnapshot(includeValues: boolean, probe: SenseProbeResult | null): ReasonSnapshotWire | null {
  try {
    const top = probe?.hypotheses[0];
    const currentStepEl = top
      ? probe!.elements.get(`${top.sourceId}:${top.segmentIndex}:${top.step}`) ?? null
      : null;

    const elements: ReasonElementWire[] = [];
    const controls = document.querySelectorAll(CONTROL_SELECTOR);
    for (let i = 0; i < controls.length && elements.length < MAX_ELEMENTS; i++) {
      const el = controls[i]!;
      if (!visible(el)) continue;
      if (el.closest('#sync-copilot-root')) continue; // never capture the widget itself
      elements.push(readElement(el, includeValues, currentStepEl));
    }

    // Visible text: prefer the current step's form/dialog scope (the requirement checklist lives
    // there), fall back to the whole page; alerts are collected document-wide regardless.
    // Collected as TEXT NODES in reading order — markup-agnostic on purpose: hint lines and
    // requirement checklists are routinely plain <div>/<span> rows that no tag selector catches.
    const scope = currentStepEl?.closest('form, [role="dialog"], main, section') ?? document.body;
    const texts: string[] = [];
    const seen = new Set<string>();
    const pushText = (raw: string) => {
      if (texts.length >= MAX_TEXTS) return;
      const t = clean(maskText(raw), MAX_TEXT_CHARS);
      if (t.length < 2 || seen.has(t)) return;
      seen.add(t);
      texts.push(t);
    };
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node && texts.length < MAX_TEXTS; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || (node.nodeValue ?? '').trim().length < 2) continue;
      if (parent.closest('script, style, noscript, #sync-copilot-root')) continue;
      // Control captions already ride each control's `name` — skip them here to save budget.
      if (parent.closest(CONTROL_SELECTOR)) continue;
      if (!visible(parent)) continue;
      pushText(node.nodeValue ?? '');
    }
    if (scope !== document.body) {
      document.querySelectorAll('[role="alert"], [aria-live="assertive"]').forEach((el) => {
        if (visible(el) && !el.closest('#sync-copilot-root')) pushText(el.textContent ?? '');
      });
    }

    return {
      path: location.pathname,
      title: clean(maskText(document.title), 120),
      viewport: { w: window.innerWidth, h: window.innerHeight },
      elements,
      texts,
    };
  } catch (e) {
    log.debug('reason snapshot failed (question proceeds without it)', e);
    return null;
  }
}

// ── The image tier (§3 #7) — renderer lazy-loaded on the FIRST diagnostic question ─────────────

interface RendererGlobal {
  capture(opts: { includeValues?: boolean }): Promise<string | null>;
}
let rendererPromise: Promise<RendererGlobal | null> | null = null;

function loadRenderer(scriptSrc: string): Promise<RendererGlobal | null> {
  if (rendererPromise) return rendererPromise;
  rendererPromise = new Promise((resolve) => {
    // The renderer bundle sits next to the widget bundle (same host, sibling file).
    const url = scriptSrc.replace(/sync-copilot(\.min)?\.js(\?.*)?$/, 'sync-copilot-render.js');
    if (!scriptSrc || url === scriptSrc) return resolve(null);
    const existing = (window as unknown as { SyncCopilotRender?: RendererGlobal }).SyncCopilotRender;
    if (existing) return resolve(existing);
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () =>
      resolve((window as unknown as { SyncCopilotRender?: RendererGlobal }).SyncCopilotRender ?? null);
    s.onerror = () => {
      log.debug('reason: renderer bundle failed to load — structure-only');
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return rendererPromise;
}

const RENDER_TIMEOUT_MS = 4000; // the answer must not wait long for pixels — structure-only beats slow

/** Render the masked page image (data-URL JPEG), or null on any failure/timeout/taint. */
export async function renderPageImage(scriptSrc: string, includeValues: boolean): Promise<string | null> {
  try {
    const renderer = await loadRenderer(scriptSrc);
    if (!renderer) return null;
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), RENDER_TIMEOUT_MS));
    return await Promise.race([renderer.capture({ includeValues }), timeout]);
  } catch (e) {
    log.debug('reason: page render failed — structure-only', e);
    return null;
  }
}
