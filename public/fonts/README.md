# Search surface fonts — Cinzel map lettering

Only geographic Three.js search names use these fonts; HTML UI fonts are unchanged.
Both are local TrueType WOFF assets distributed under SIL OFL 1.1. Full notices are
included as `Cinzel-LICENSE.txt` and `SourceHanSerif-LICENSE.txt`.

- `EarthCinzel-Medium.woff`: actual Cinzel variable font instantiated at weight 500,
  renamed Earth Cinzel. 367 codepoints, 37,532 bytes. The original lowercase glyphs
  are small capitals: `A/a` ink heights are 0.716/0.618em, `P/p` 0.700/0.600em.
  The application preserves input case rather than converting the string to uppercase.
  Source: https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/Cinzel%5Bwght%5D.ttf
  Source SHA-256: `f4d83d34d1f6c741193e4acf4b3dff9531e5a67b6aa65228d00a7db72a4e0f34`.
- `EarthCJKSerif-Medium.woff`: Source Han Serif SC instantiated at weight 500,
  renamed Earth CJK Serif; 44,520 fallback codepoints, 17,505,452 bytes.
  Source: https://github.com/adobe-fonts/source-han-serif/blob/release/Variable/TTF/SourceHanSerifSC-VF.ttf
  Source Git blob: `b3218a6e90446954e7939ace05e4e2bbca43e1fc`.
  Visible Cinzel codepoints are removed from the fallback font, preventing Troika
  from carrying a Latin run into the preceding Chinese font. Only U+0020 overlaps:
  the genuine CJK space retains its 0.255em advance (Cinzel space is 0.250em).

Glyph outlines and advances are not redesigned. The generator retains directly
selected horizontal GPOS lookups understood by Troika and removes unsupported
contextual-helper/vertical positioning. This preserves the previous spacing and
middle-dot fix. Unsupported characters use a local square; no Unicode font CDN
is requested. The combined fonts are not complete worldwide script coverage or
an unrestricted contextual shaping engine.

Tracking is applied once after shaping: Han/CJK 0.08em, Latin letters 0.10em,
adjacent script boundaries 0.09em. Real spaces, punctuation and numbers retain
natural spacing. Long names first compress tracking to zero if necessary, then
fit the em to the safe width. One mesh, common baseline, and geographic center are
preserved. `colorRanges` carries exact shaping character IDs; those metadata colors
are removed before rendering. No per-frame text layout or camera counter-scaling.

Rebuild: put the two source TTF files in `artifacts/font-sources/` as `Cinzel.ttf`
and `SourceHanSerifSC-VF.ttf`, then run `python scripts/prepare-search-fonts.py`.
Application builds use the checked-in WOFF assets and coverage JSON. The former
Source Serif 4 WOFF has been removed; its license file is retained as historical
attribution. TrueType WOFF is required by this Troika 0.52.5 integration; WOFF2 is
not used, and the previous large CFF OTF could not be parsed.

SHA-256:
- EarthCinzel-Medium.woff: `5452978240de9f4e7b51ca0e22074ae83bfb3499331bb4e2a54f4059d66daa51`
- EarthCJKSerif-Medium.woff: `507bf9bb32aee808a298433cdabfe52620c980e4696dd43106c7f8959a6785b2`
