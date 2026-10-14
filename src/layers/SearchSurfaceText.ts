import { Text, type TextRenderInfo } from 'troika-three-text';
import { trackSearchText } from './SearchTextLayout';

/** One mesh and one baseline; script-specific spacing is baked into glyph instances. */
export class SearchSurfaceText extends Text {
  layoutFit = 1;
  trackingFit = 1;
  private trackedInfo?: TextRenderInfo;

  constructor(
    private arrivalSize: number,
    private maximumWidth: number,
  ) {
    super();
  }

  override get textRenderInfo() {
    return this.trackedInfo ?? super.textRenderInfo;
  }

  override sync(callback?: () => void) {
    super.sync(() => {
      const source = super.textRenderInfo;
      if (source) {
        const layout = trackSearchText(
          this.text,
          source,
          this.fontSize,
          this.arrivalSize,
          this.maximumWidth,
        );
        this.trackedInfo = { ...source, ...layout };
        this.layoutFit = layout.fitScale;
        this.trackingFit = layout.trackingScale;
        // Character-ID colors are shaping metadata only; no per-glyph color reaches rendering.
        this.geometry.updateGlyphs(
          layout.glyphBounds,
          source.glyphAtlasIndices,
          layout.blockBounds,
          layout.chunkedBounds,
          undefined,
        );
      }
      callback?.();
    });
  }
}
