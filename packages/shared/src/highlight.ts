// The element-highlight rectangle drawn over a step screenshot (Studio + portal).
// Stored as fractions (0..1) of the screenshot so it's resolution-independent and
// rendered as a CSS %-positioned box — no image processing. See docs/phase-1a-plan.md.
//
// This file holds only the TYPE (so every package can import it cheaply, type-only).
// The bbox→Highlight conversion lives in the web app (`packages/web/lib/highlight.ts`),
// its only runtime caller, to keep this package free of runtime imports from non-type
// consumers (Next's webpack can't follow this package's NodeNext `.js` specifiers).

/** A highlight rectangle as fractions (0..1) of the screenshot/viewport.
 *  Declared as a `type` (not `interface`) so it stays assignable to Prisma's `Json` input. */
export type Highlight = {
  x: number;
  y: number;
  w: number;
  h: number;
};
