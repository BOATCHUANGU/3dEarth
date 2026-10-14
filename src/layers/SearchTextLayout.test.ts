import { expect, it } from 'vitest';
import { characterRanges, trackSearchText } from './SearchTextLayout';

function shape(text: string) {
  const width = text.length;
  const glyphBounds = new Float32Array(width * 4),
    glyphColors = new Uint8Array(width * 3);
  for (let i = 0; i < width; i++) {
    glyphBounds.set([i - width / 2, 0, i + 0.8 - width / 2, 1], i * 4);
    const id = characterRanges(text)[i];
    glyphColors.set([id >> 16, (id >> 8) & 255, id & 255], i * 3);
  }
  return {
    glyphBounds,
    glyphColors,
    blockBounds: [-width / 2, 0, width / 2, 1] as [number, number, number, number],
  };
}
it('tracks Latin and Han separately without changing whitespace, numbers, punctuation or the baseline', () => {
  const info = shape('AB 上海 · 12');
  const result = trackSearchText('AB 上海 · 12', info, 1, 28, 2000);
  const distance = (a: number, b: number) => result.glyphBounds[b * 4] - result.glyphBounds[a * 4];
  expect(distance(0, 1)).toBeCloseTo(1.1);
  expect(distance(3, 4)).toBeCloseTo(1.08);
  expect(distance(1, 2)).toBeCloseTo(1);
  expect(distance(8, 9)).toBeCloseTo(1);
  expect(result.glyphBounds[1]).toBe(info.glyphBounds[1]);
  expect(result.blockBounds[0] + result.blockBounds[2]).toBe(0);
  expect(result.glyphColors).toBeUndefined();
});
it('compresses tracking before shrinking glyphs, and leaves source shaping arrays unchanged', () => {
  const info = shape('ABCD');
  const before = info.glyphBounds.slice();
  const partially = trackSearchText('ABCD', info, 1, 28, 28 * 4.15);
  expect(partially.trackingScale).toBeCloseTo(0.5);
  expect(partially.fitScale).toBe(1);
  const narrow = trackSearchText('ABCD', info, 1, 28, 28 * 3);
  expect(narrow.trackingScale).toBe(0);
  expect(narrow.fitScale).toBeCloseTo(0.75);
  expect(info.glyphBounds).toEqual(before);
});
it('moves a ligature or combining glyph by its shaping character ID, not its glyph-array index', () => {
  const info = shape('ABC');
  info.glyphBounds = info.glyphBounds.slice(0, 8);
  info.glyphColors = new Uint8Array([0, 0, 1, 0, 0, 3]);
  const result = trackSearchText('ABC', info, 1, 28, 2000);
  expect(result.glyphBounds[4] - info.glyphBounds[4]).toBeCloseTo(0.1);
});
