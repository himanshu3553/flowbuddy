/**
 * Text for the demo-video renderer, as SVG *paths* rather than SVG `<text>`.
 *
 * WHY PATHS. sharp rasterizes SVG through librsvg, and `<text>` there depends on
 * fontconfig finding a font on the host — which differs between a dev Mac and the
 * `node:22-slim` worker image (whose only fonts are whatever the base image happens to
 * ship). Converting glyphs to outlines with opentype.js makes the render byte-identical
 * everywhere and pins the brand font (Plus Jakarta Sans, vendored under assets/fonts/,
 * OFL-licensed) with no system font lookup at all.
 *
 * opentype.js is pinned to 1.x: 2.0 unconditionally applies the font's `ccmp` GSUB
 * lookups and throws "substFormat: 2 is not yet supported" on this font.
 */
import { readFileSync } from 'node:fs';
import opentype from 'opentype.js';

let cachedFont: opentype.Font | null = null;

export function brandFont(): opentype.Font {
  if (!cachedFont) {
    const buf = readFileSync(new URL('../assets/fonts/PlusJakartaSans-SemiBold.ttf', import.meta.url));
    cachedFont = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return cachedFont;
}

export function textWidth(text: string, sizePx: number): number {
  return brandFont().getAdvanceWidth(text, sizePx, { kerning: true });
}

/** Truncate with an ellipsis so the rendered line never exceeds maxWidth px. */
export function fitText(text: string, sizePx: number, maxWidth: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (textWidth(clean, sizePx) <= maxWidth) return clean;
  let lo = 0;
  let hi = clean.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(`${clean.slice(0, mid).trimEnd()}…`, sizePx, ) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${clean.slice(0, lo).trimEnd()}…`;
}

export interface TextPath {
  /** SVG path `d` attribute for the line, with (0,0) at the text's left baseline. */
  d: string;
  width: number;
  ascent: number;
  descent: number;
}

export function textPath(text: string, sizePx: number): TextPath {
  const font = brandFont();
  const scale = sizePx / font.unitsPerEm;
  return {
    d: font.getPath(text, 0, 0, sizePx, { kerning: true }).toPathData(2),
    width: font.getAdvanceWidth(text, sizePx, { kerning: true }),
    ascent: font.ascender * scale,
    descent: Math.abs(font.descender * scale),
  };
}

/** Wrap text into at most maxLines lines of maxWidth px, ellipsizing the last line. */
export function wrapText(text: string, sizePx: number, maxWidth: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let current = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, sizePx) <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) {
      const rest = words.slice(i).join(' ');
      lines.push(fitText(rest, sizePx, maxWidth));
      return lines;
    }
  }
  if (current) lines.push(current);
  return lines;
}
