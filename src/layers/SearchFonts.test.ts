import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  preload: vi.fn((_args, callback) => callback()),
  configure: vi.fn(),
}));
vi.mock('troika-three-text', () => ({
  configureTextBuilder: mocks.configure,
  preloadFont: mocks.preload,
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.resetModules();
});
it('keeps mixed city text and replaces unsupported glyphs before any remote fallback', async () => {
  const { localSearchText } = await import('./SearchFonts');
  expect(localSearchText('上海 Shanghai 東京 Paris 31.23, 121.47')).toBe(
    '上海 Shanghai 東京 Paris 31.23, 121.47',
  );
  expect(localSearchText('A🦄B')).toBe('A□B');
  expect(localSearchText('Sa\u0303o Paulo')).toBe('São Paulo');
});
it('prewarms local fonts once with no CDN configuration', async () => {
  const fetcher = vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new TextEncoder().encode('wOFF').buffer,
  }));
  vi.stubGlobal('fetch', fetcher);
  const { prepareSearchFonts } = await import('./SearchFonts');
  expect(await prepareSearchFonts()).toBe(true);
  expect(await prepareSearchFonts()).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(mocks.preload).toHaveBeenCalledTimes(1);
  expect(mocks.configure.mock.calls[0][0].unicodeFontsURL).toBe('/fonts/unicode-disabled');
});
it('does not ask the worker to shape a failed or invalid font response', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('<html>').buffer,
    })),
  );
  const { prepareSearchFonts } = await import('./SearchFonts');
  expect(await prepareSearchFonts()).toBe(false);
  expect(mocks.preload).not.toHaveBeenCalled();
});
