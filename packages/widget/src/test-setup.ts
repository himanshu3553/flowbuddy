// jsdom ships no CSS.escape, which `accessibleName` (reason.ts) uses to look up a field's label.
// A minimal escape is enough for tests — fixture ids are plain words.
const g = globalThis as { CSS?: { escape?: (s: string) => string } };
if (typeof g.CSS?.escape !== 'function') {
  const minimalEscape = (s: string): string => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
  g.CSS = { ...g.CSS, escape: minimalEscape };
}

// jsdom has no layout engine: every getBoundingClientRect() is 0×0, which would make the widget's
// `isVisible()` false for EVERY element and silently hollow these tests out (each one would pass
// by testing nothing). Give connected elements a real box; a test hides an element the way a page
// does — `display: none` — which the computed-style half of `isVisible()` still honors under jsdom.
Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
  const size = this.isConnected ? 10 : 0;
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    width: size,
    height: size,
    right: size,
    bottom: size,
    toJSON: () => ({}),
  } as DOMRect;
};
