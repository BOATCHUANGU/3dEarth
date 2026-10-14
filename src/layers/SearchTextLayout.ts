export interface TrackingInfo {
  glyphBounds: Float32Array;
  glyphColors?: Uint8Array | null;
  caretPositions?: Float32Array;
  blockBounds: [number, number, number, number];
  sdfGlyphSize?: number;
}

/** Character IDs travel through Troika's public colorRanges shaping metadata. */
export function characterRanges(text: string): Record<number, number> {
  const ranges: Record<number, number> = {};
  for (let i = 0; i < text.length; i++) ranges[i] = i + 1;
  return ranges;
}

function script(char: string): 'latin' | 'cjk' | undefined {
  if (/\p{Script=Latin}/u.test(char)) return 'latin';
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char))
    return 'cjk';
}

/** Shape once at zero tracking, then adjust instance bounds; whitespace keeps its advance. */
export function trackSearchText(
  text: string,
  info: TrackingInfo,
  fontSize: number,
  arrivalSize: number,
  maximumWidth: number,
) {
  const offsets = new Float64Array(text.length);
  let total = 0,
    index = 0,
    previous: ReturnType<typeof script>;
  for (const char of text) {
    const current = script(char);
    if (current && previous)
      total += fontSize * (current === previous ? (current === 'latin' ? 0.1 : 0.08) : 0.09);
    for (let j = 0; j < char.length; j++) offsets[index + j] = total;
    index += char.length;
    // Marks belong to their base; real spaces, punctuation and digits break tracking runs.
    if (!/\p{Mark}/u.test(char)) previous = current;
  }
  const naturalWidth = info.blockBounds[2] - info.blockBounds[0];
  const limit = (Math.max(40, maximumWidth) / arrivalSize) * fontSize;
  const trackingScale = total ? Math.max(0, Math.min(1, (limit - naturalWidth) / total)) : 1;
  const added = total * trackingScale;
  const shift = (i: number) =>
    (offsets[Math.max(0, Math.min(text.length - 1, i))] || 0) * trackingScale - added / 2;
  const glyphBounds = info.glyphBounds.slice();
  for (let g = 0; g < glyphBounds.length / 4; g++) {
    const colors = info.glyphColors;
    if (!colors) throw new Error('Search glyph character metadata missing');
    const charIndex = ((colors[g * 3] << 16) | (colors[g * 3 + 1] << 8) | colors[g * 3 + 2]) - 1;
    glyphBounds[g * 4] += shift(charIndex);
    glyphBounds[g * 4 + 2] += shift(charIndex);
  }
  const blockBounds: [number, number, number, number] = [
    info.blockBounds[0] - added / 2,
    info.blockBounds[1],
    info.blockBounds[2] + added / 2,
    info.blockBounds[3],
  ];
  const caretPositions = info.caretPositions?.slice();
  if (caretPositions)
    for (let i = 0; i < text.length; i++) {
      caretPositions[i * 4] += shift(i);
      caretPositions[i * 4 + 1] += shift(i);
    }
  const renderBounds = blockBounds.slice() as [number, number, number, number];
  const visibleBounds: [number, number, number, number] = [
    Infinity,
    Infinity,
    -Infinity,
    -Infinity,
  ];
  // Troika 0.52.5 expands each path by its default 1/16 SDF margin plus half a texel.
  // Remove that padding for screen safety; retain complete quads for render bounds.
  const margin = 1 / 16 + 0.5 / (info.sdfGlyphSize ?? 64);
  for (let g = 0; g < glyphBounds.length; g += 4) {
    const pad =
      (Math.max(glyphBounds[g + 2] - glyphBounds[g], glyphBounds[g + 3] - glyphBounds[g + 1]) *
        margin) /
      (1 + 2 * margin);
    visibleBounds[0] = Math.min(visibleBounds[0], glyphBounds[g] + pad);
    visibleBounds[1] = Math.min(visibleBounds[1], glyphBounds[g + 1] + pad);
    visibleBounds[2] = Math.max(visibleBounds[2], glyphBounds[g + 2] - pad);
    visibleBounds[3] = Math.max(visibleBounds[3], glyphBounds[g + 3] - pad);
    for (let axis = 0; axis < 2; axis++) {
      renderBounds[axis] = Math.min(renderBounds[axis], glyphBounds[g + axis]);
      renderBounds[axis + 2] = Math.max(renderBounds[axis + 2], glyphBounds[g + axis + 2]);
    }
  }
  if (!glyphBounds.length) visibleBounds.splice(0, 4, ...blockBounds);
  return {
    glyphBounds,
    blockBounds,
    caretPositions,
    visibleBounds,
    glyphColors: undefined,
    chunkedBounds: [{ start: 0, end: glyphBounds.length / 4, rect: renderBounds }],
    trackingScale,
    fitScale: Math.min(1, limit / Math.max(naturalWidth + added, fontSize * 0.01)),
  };
}
