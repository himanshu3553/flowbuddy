// P2-M5 REASON — the image tier's LAZY renderer bundle (docs/phase-2-reason.md §3 #7). Built as a
// SEPARATE file (flowbuddy-copilot-render.js) that the widget injects on the first diagnostic question
// when the founder enabled "Include page image" — html2canvas never rides in the base bundle.
//
// What it produces is a RECONSTRUCTION, not a photograph (§3.1): the visible viewport re-painted
// from the DOM onto a canvas. Plain DOM UI (forms, buttons, text, overlays) reconstructs well —
// exactly what diagnosis needs; canvas/WebGL and cross-origin media come out blank. Masking
// happens on the CLONED document before any pixel is drawn (§5.4): field values become dots,
// passwords are emptied, and hard-floor patterns (card/SSN) are scrubbed from text regardless of
// the founder's unmask setting. Any failure — taint, oversize, timeout — resolves null and the
// question proceeds structure-only.

import html2canvas from 'html2canvas';

const MAX_DOM_ELEMENTS = 8000; // render budget (§6): beyond this, painting could jank the host
const MAX_DATA_URL_CHARS = 1_100_000; // ~800 KB binary — beyond that, ship structure only
const TARGET_WIDTH = 1280;

const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
// The default-masking vocabulary (mirrors sense.ts maskText) — applied to visible text when the
// founder has NOT unmasked values; card/SSN are hard floors and are scrubbed in either mode.
function maskVisibleText(s: string, includeValues: boolean): string {
  let out = s.replace(CARD_RE, '[redacted-card]').replace(SSN_RE, '[redacted-ssn]');
  if (!includeValues) {
    out = out
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[redacted-email]')
      .replace(/\+?\d{1,3}[ .-]?\(?\d{2,4}\)?[ .-]\d{3,4}[ .-]?\d{2,4}/g, '[redacted-phone]');
  }
  return out;
}

function maskClone(doc: Document, includeValues: boolean): void {
  // The widget itself must never appear in the evidence.
  doc.getElementById('flowbuddy-copilot-root')?.remove();

  doc.querySelectorAll('input, textarea').forEach((el) => {
    const input = el as HTMLInputElement | HTMLTextAreaElement;
    if (input instanceof HTMLInputElement && input.type === 'password') {
      input.value = ''; // hard floor: passwords are never captured, not even as dots
      return;
    }
    if (!input.value) return;
    if (!includeValues) input.value = '•'.repeat(Math.min(input.value.length, 8));
    else input.value = maskVisibleText(input.value, includeValues);
  });
  if (!includeValues) {
    doc.querySelectorAll('select').forEach((el) => {
      const select = el as HTMLSelectElement;
      const opt = select.options[select.selectedIndex];
      if (opt?.text) opt.text = '••••';
    });
  }

  // Text nodes — user data rendered on the page (tables, profiles) gets the same masking.
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue;
    if (text && /\d|@/.test(text)) node.nodeValue = maskVisibleText(text, includeValues);
  }
}

(window as unknown as { FlowBuddyRender?: unknown }).FlowBuddyRender = {
  async capture(opts: { includeValues?: boolean } = {}): Promise<string | null> {
    try {
      if (document.querySelectorAll('*').length > MAX_DOM_ELEMENTS) return null;
      const width = Math.max(document.documentElement.clientWidth, 1);
      const canvas = await html2canvas(document.body, {
        // The visible viewport only — "what the user actually sees", and a bounded canvas.
        x: window.scrollX,
        y: window.scrollY,
        width,
        height: Math.max(window.innerHeight, 1),
        scale: Math.min(1, TARGET_WIDTH / width),
        useCORS: true,
        logging: false,
        onclone: (doc) => maskClone(doc, opts.includeValues === true),
      });
      const url = canvas.toDataURL('image/jpeg', 0.7); // throws on a tainted canvas → catch → null
      return url.length > MAX_DATA_URL_CHARS ? null : url;
    } catch {
      return null;
    }
  },
};
