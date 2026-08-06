// P4-M2 THE ACT VERBS — the only code in the product that touches a host page's controls
// (docs/build/agent.md §A2.1, §A2.6). Bound EXCLUSIVELY by the acting driver (`agent-run.ts`);
// nothing on the guided path imports this module, which is what keeps guided mode structurally
// incapable of acting (the step engine's read-only contract stays true).
//
// HONESTY CONTRACT: every verb reports "dispatched", never "worked". The widget is a page script —
// its events carry `isTrusted: false`, some frameworks ignore them, and a control can swallow an
// activation for reasons no dispatcher can see. The DRIVER verifies after every act against
// recorded evidence and hands the step back to the user when the page didn't move (§A2.6:
// act-verify-or-hand-back, never act-and-hope). A verb returning true means only "the browser took
// the events without throwing".
//
// Framework compatibility notes (the reason this file isn't three lines):
//  - React/Vue controlled inputs track the NATIVE value setter; assigning `el.value` directly is
//    invisible to them. Writing through the prototype's own descriptor is the standard workaround.
//  - Many handlers listen on pointer/mouse events rather than `click`, so a click dispatches the
//    full sequence before the native `click()` (which is what triggers default actions — form
//    submits, link follows).
//  - Checkboxes/radios toggle through their native activation (`click()`), which fires the right
//    input/change events by itself — setting `.checked` programmatically would skip them.

function fire(el: Element, ev: Event): void {
  try {
    el.dispatchEvent(ev);
  } catch {
    /* a hostile page's listener throwing must never break the run — verification will judge */
  }
}

function pointerSequence(el: Element): void {
  // No `view` on purpose: frameworks read target/coordinates, never the view, and jsdom (the test
  // environment) rejects a foreign-realm window — the option buys nothing and costs portability.
  const opts = { bubbles: true, cancelable: true, composed: true } as const;
  if (typeof PointerEvent === 'function') {
    fire(el, new PointerEvent('pointerdown', opts));
  }
  fire(el, new MouseEvent('mousedown', opts));
  if (typeof PointerEvent === 'function') {
    fire(el, new PointerEvent('pointerup', opts));
  }
  fire(el, new MouseEvent('mouseup', opts));
}

/** Click a control: full pointer sequence, then the native activation (default actions included). */
export function actClick(el: Element): boolean {
  try {
    (el as HTMLElement).scrollIntoView?.({ block: 'center', behavior: 'instant' as ScrollBehavior });
  } catch {
    /* best-effort */
  }
  try {
    (el as HTMLElement).focus?.();
  } catch {
    /* best-effort */
  }
  pointerSequence(el);
  if (typeof (el as HTMLElement).click === 'function') {
    try {
      (el as HTMLElement).click();
      return true;
    } catch {
      /* fall through to the synthetic event */
    }
  }
  fire(el, new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
  return true;
}

/** Set a text-carrying control's value THROUGH the native setter (controlled-input compatible),
 *  then announce it the way typing would. The value always comes from the user in this
 *  conversation — recorded values are masked at capture and structurally cannot arrive here. */
export function actFill(el: Element, value: string): boolean {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  try {
    (el as HTMLElement).focus?.();
  } catch {
    /* best-effort */
  }
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc?.set) desc.set.call(el, value);
  else el.value = value;
  let input: Event;
  try {
    input = new InputEvent('input', { bubbles: true, composed: true, data: value, inputType: 'insertText' });
  } catch {
    input = new Event('input', { bubbles: true });
  }
  fire(el, input);
  fire(el, new Event('change', { bubbles: true }));
  return true;
}

/** Choose a <select> option by value, falling back to visible option text. */
export function actSelect(el: Element, value: string): boolean {
  if (!(el instanceof HTMLSelectElement)) return false;
  const byValue = [...el.options].find((o) => o.value === value);
  const byText = byValue ?? [...el.options].find((o) => (o.textContent ?? '').trim() === value.trim());
  if (!byText) return false;
  const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  if (desc?.set) desc.set.call(el, byText.value);
  else el.value = byText.value;
  let input: Event;
  try {
    input = new InputEvent('input', { bubbles: true, composed: true });
  } catch {
    input = new Event('input', { bubbles: true });
  }
  fire(el, input);
  fire(el, new Event('change', { bubbles: true }));
  return true;
}

/** Put a checkbox/radio into the desired state via its native activation (right events for free).
 *  Already in the desired state = nothing to do, honestly true. */
export function actCheck(el: Element, checked: boolean): boolean {
  if (!(el instanceof HTMLInputElement) || (el.type !== 'checkbox' && el.type !== 'radio')) return false;
  if (el.checked === checked) return true;
  return actClick(el);
}

/** Navigate the page itself — a RUN-LEVEL move, never an element one (agent.md §A2.5). The driver
 *  only calls this for pattern-safe, id-free destinations; the eligibility analyzer excluded the
 *  rest at enable time. */
export function actNavigate(path: string): boolean {
  try {
    location.assign(path);
    return true;
  } catch {
    return false;
  }
}
