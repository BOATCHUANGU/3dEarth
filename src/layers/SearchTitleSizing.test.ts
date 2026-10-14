import { expect, it } from 'vitest';
import { searchTitleSizing, TOKYO_INK_EM } from './SearchTitleSizing';

it('uses the two-glyph ink metric to scale the desktop title across matching aspect ratios', () => {
  const small = searchTitleSizing(1000, 500, 800, '东京');
  const large = searchTitleSizing(1600, 800, 1400, '东京');
  expect(small.arrivalSize * TOKYO_INK_EM).toBeCloseTo(220);
  expect(large.arrivalSize / small.arrivalSize).toBeCloseTo(1.6);
  expect(large.arrivalSize).toBeGreaterThan(28 * 5);
});
it('caps short phone names by width and short landscape windows by height', () => {
  const portrait = searchTitleSizing(393, 740, 249, '大阪市');
  const landscape = searchTitleSizing(852, 293, 828, '东京');
  expect(portrait.maximumWidth).toBeLessThanOrEqual(393 * 0.6);
  expect(landscape.arrivalSize).toBeLessThan(portrait.arrivalSize * 1.5);
  expect(landscape.arrivalSize).toBeCloseTo(293 * 0.42);
});
it('limits long desktop names without widening short English names to Tokyo width', () => {
  const english = searchTitleSizing(1230, 506, 1080, 'Paris');
  const chinese = searchTitleSizing(1230, 506, 1080, '东京');
  const blocked = searchTitleSizing(1230, 506, 480, 'San Francisco');
  expect(english.arrivalSize).toBe(chinese.arrivalSize);
  expect(english.maximumWidth).toBeCloseTo(1230 * 0.55);
  expect(blocked.maximumWidth).toBe(480);
});
