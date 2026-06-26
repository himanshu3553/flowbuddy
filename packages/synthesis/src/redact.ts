// P1-M12 (Cut 1) — server-side PII backstop for the COPILOT-FACING text.
//
// The client masks recognized form-field *values* before upload; this is the second line that
// scrubs high-confidence STRUCTURED PII (email / phone / card / SSN) out of the text the copilot
// actually reads — KnowledgeItem.text, aligned narration, and the persisted transcript — so it can
// never surface in an answer. Screenshot OCR + DOM-pixel redaction (PII *displayed* on the page) is
// Cut 2, deferred to Phase 2 (docs/phase-2-portal.md §7).
//
// QUALITY FIRST (no answer-quality regression):
//  - High-PRECISION patterns only (favor false-negatives over false-positives): email needs a real
//    TLD, SSN needs the 3-2-4 dash form, cards are Luhn-validated, phones require a separator. So
//    prices ($1,234.56), dates (2026-06-26), order ids (#100482), versions (1.2.3), step counts,
//    and bare numbers are NOT touched.
//  - TYPED placeholders ([redacted-email] …) keep the sentence coherent for the LLM (it still knows
//    "an email was here"), unlike an opaque mask.
//  - Idempotent: re-running on already-redacted text is a no-op (safe across reprocess).

import type { Transcript } from './transcribe';

// Email — requires a dotted TLD of 2+ letters (so "@handle" alone never matches).
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// US SSN — the 3-2-4 dashed form only (bare 9-digit runs are too false-positive-prone).
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;

// Phone — optional +CC, then an area group that MUST be followed by a separator ("(555) " or
// "555-"/"555."/"555 "), then 3 + 4 digits. Requiring a separator avoids matching bare 10-digit ids.
const PHONE =
  /(?<!\d)(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]?\d{4}(?!\d)/g;

// Card candidate — 13–19 digits with separators only BETWEEN digits (so the match never eats a
// trailing space); confirmed via Luhn before redacting.
const CARD_CANDIDATE = /\b\d(?:[ -]?\d){12,18}\b/g;

function luhnValid(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** Scrub high-confidence structured PII, replacing it with typed placeholders. Idempotent. */
export function redactText(input: string | null | undefined): string {
  if (!input) return input ?? '';
  let s = input;
  s = s.replace(EMAIL, '[redacted-email]');
  s = s.replace(SSN, '[redacted-ssn]');
  // Cards before phones so a 16-digit card isn't partially eaten by the phone matcher.
  s = s.replace(CARD_CANDIDATE, (m) =>
    luhnValid(m.replace(/\D/g, '')) ? '[redacted-card]' : m,
  );
  s = s.replace(PHONE, '[redacted-phone]');
  return s;
}

/** Redact the persisted transcript (full text + every segment) before it feeds the KB. */
export function redactTranscript(t: Transcript): Transcript {
  return {
    text: redactText(t.text),
    segments: t.segments.map((seg) => ({ ...seg, text: redactText(seg.text) })),
  };
}
