import { configureTextBuilder, preloadFont } from 'troika-three-text';
import coverage from './search-font-coverage.json';
export const SEARCH_LATIN_FONT = '/fonts/EarthCinzel-Medium.woff';
export const SEARCH_CJK_FONT = '/fonts/EarthCJKSerif-Medium.woff';
let preparation: Promise<boolean> | undefined;
/** Explicit local missing-glyph box for unsupported scripts; never a remote font. */
export function localSearchText(text: string): string {
  return Array.from(text.normalize('NFC').replace(/\s+/gu, ' ').trim())
    .map((char) => {
      const code = char.codePointAt(0)!;
      return coverage.some(([lo, hi]) => code >= lo && code <= hi) ? char : '□';
    })
    .join('');
}
export function prepareSearchFonts(): Promise<boolean> {
  if (!preparation) {
    configureTextBuilder({
      defaultFontURL: SEARCH_CJK_FONT,
      unicodeFontsURL: '/fonts/unicode-disabled',
    });
    preparation = (async () => {
      try {
        await Promise.all(
          [SEARCH_LATIN_FONT, SEARCH_CJK_FONT].map(async (url) => {
            const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error(`Font HTTP ${response.status}`);
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (String.fromCharCode(...bytes.slice(0, 4)) !== 'wOFF')
              throw new Error('Invalid local font');
          }),
        );
        return await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), 15000);
          preloadFont(
            {
              font: SEARCH_LATIN_FONT,
              characters: localSearchText(
                '上海东京纽约巴黎悉尼北京香港台北ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,−- °□',
              ),
              sdfGlyphSize: 64,
            },
            () => {
              clearTimeout(timer);
              resolve(true);
            },
          );
        });
      } catch {
        return false;
      }
    })();
  }
  return preparation;
}
