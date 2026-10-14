declare module 'troika-three-text' {
  import { Mesh, MeshBasicMaterial, BufferGeometry } from 'three';
  export interface TextRenderInfo {
    blockBounds: [number, number, number, number];
    glyphBounds: Float32Array;
    glyphAtlasIndices: Uint16Array;
    glyphColors?: Uint8Array | null;
    caretPositions?: Float32Array;
    visibleBounds?: [number, number, number, number];
    sdfGlyphSize?: number;
  }
  interface GlyphsGeometry extends BufferGeometry {
    updateGlyphs(
      bounds: Float32Array,
      indices: Uint16Array,
      block: number[],
      chunks: Array<{ start: number; end: number; rect: number[] }>,
      colors?: Uint8Array,
    ): void;
  }
  export class Text extends Mesh<GlyphsGeometry, MeshBasicMaterial | MeshBasicMaterial[]> {
    text: string;
    font: string;
    fontSize: number;
    anchorX: string;
    anchorY: string;
    letterSpacing: number;
    colorRanges: Record<number, number>;
    whiteSpace: string;
    color: number;
    fillOpacity: number;
    outlineWidth: number;
    outlineColor: number;
    outlineBlur: number;
    outlineOpacity: number;
    depthOffset: number;
    sdfGlyphSize: number;
    glyphGeometryDetail: number;
    get textRenderInfo(): TextRenderInfo | undefined;
    sync(callback?: () => void): void;
    dispose(): void;
  }
  export function configureTextBuilder(options: {
    defaultFontURL: string;
    unicodeFontsURL: string;
  }): void;
  export function preloadFont(
    options: { font: string; characters: string; sdfGlyphSize?: number },
    callback: () => void,
  ): void;
}
