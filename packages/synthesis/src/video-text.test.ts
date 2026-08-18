import { describe, expect, it } from 'vitest';
import { fitText, textPath, textWidth, wrapText } from './video-text';

describe('video text', () => {
  it('produces glyph paths with sensible metrics from the vendored font', () => {
    const p = textPath('Invite a teammate', 30);
    expect(p.d.length).toBeGreaterThan(100);
    expect(p.width).toBeGreaterThan(100);
    expect(p.ascent).toBeGreaterThan(0);
  });

  it('fitText leaves short text alone and ellipsizes long text under the cap', () => {
    expect(fitText('Click Save', 30, 2000)).toBe('Click Save');
    const long = fitText('Click the button that saves absolutely everything in the workspace forever', 30, 300);
    expect(long.endsWith('…')).toBe(true);
    expect(textWidth(long, 30)).toBeLessThanOrEqual(300);
  });

  it('collapses whitespace before measuring', () => {
    expect(fitText('  Click   Save  ', 30, 2000)).toBe('Click Save');
  });

  it('wrapText respects the line cap and ellipsizes the overflow, including repeated words', () => {
    const lines = wrapText('save save save save save save save save save save save save', 60, 400, 2);
    expect(lines.length).toBe(2);
    expect(lines[1]!.endsWith('…')).toBe(true);
    for (const line of lines) expect(textWidth(line, 60)).toBeLessThanOrEqual(400);
  });

  it('wrapText returns one line when it fits', () => {
    expect(wrapText('Quick tour', 40, 2000, 2)).toEqual(['Quick tour']);
  });
});
