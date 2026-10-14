"""Build locally served search fonts with fonttools 4.60.2.

Inputs (upstream, unmodified) in artifacts/font-sources:
Cinzel.ttf from google/fonts ofl/cinzel/Cinzel[wght].ttf, SourceHanSerifSC-VF.ttf from
adobe-fonts/source-han-serif release/Variable/TTF.
Licenses remain in public/fonts. No glyph outlines are redesigned.
"""
import json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

root = Path(__file__).resolve().parents[1]
inputs = root / 'artifacts/font-sources'
out = root / 'public/fonts'

def troika_horizontal_gpos(font):
    # Troika walks every GPOS lookup, even helper lookups normally reached only
    # through unsupported contextual positioning. Keep directly selected horizontal
    # lookups that its parser handles, and unwrap extension lookups for portability.
    table = font['GPOS'].table
    selected = {i for record in table.FeatureList.FeatureRecord
                if record.FeatureTag in ('kern', 'mark', 'mkmk')
                for i in record.Feature.LookupListIndex}
    remap, kept = {}, []
    for i, lookup in enumerate(table.LookupList.Lookup):
        if i not in selected:
            continue
        if lookup.LookupType == 9:
            types = {sub.ExtensionLookupType for sub in lookup.SubTable}
            if len(types) != 1:
                continue
            lookup.LookupType = types.pop()
            lookup.SubTable = [sub.ExtSubTable for sub in lookup.SubTable]
        if lookup.LookupType not in (1, 2, 4, 6):
            continue
        remap[i] = len(kept)
        kept.append(lookup)
    table.LookupList.Lookup = kept
    table.LookupList.LookupCount = len(kept)
    for record in table.FeatureList.FeatureRecord:
        indices = [remap[i] for i in record.Feature.LookupListIndex if i in remap]
        record.Feature.LookupListIndex = indices
        record.Feature.LookupCount = len(indices)

latin = instantiateVariableFont(TTFont(inputs / 'Cinzel.ttf'), {'wght': 500})
troika_horizontal_gpos(latin)
for record in latin['name'].names:
    if record.nameID in (1, 3, 4, 6, 16):
        record.string = ('EarthCinzel-Medium' if record.nameID == 6 else 'Earth Cinzel').encode(record.getEncoding())
    if record.nameID in (2, 17):
        record.string = 'Medium'.encode(record.getEncoding())
latin_codes = set(latin.getBestCmap())
latin.flavor = 'woff'
latin.save(out / 'EarthCinzel-Medium.woff')
cjk = instantiateVariableFont(TTFont(inputs / 'SourceHanSerifSC-VF.ttf'), {'wght': 500})
# Troika assigns whitespace to the preceding font without checking its cmap.
# Preserve the genuine CJK space; all visible Latin characters remain in the Latin font.
cjk_codes = (set(cjk.getBestCmap()) - latin_codes) | {0x20}
options = subset.Options()
options.name_IDs = ['*']
options.name_legacy = True
options.name_languages = ['*']
options.layout_features = ['kern', 'mark', 'mkmk', 'liga', 'rlig', 'ccmp', 'locl']
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=cjk_codes)
subsetter.subset(cjk)
troika_horizontal_gpos(cjk)
# OFL reserved name: the derived subset uses a distinct family name.
for record in cjk['name'].names:
    if record.nameID in (1, 3, 4, 6, 16):
        record.string = ('EarthCJKSerif-Medium' if record.nameID == 6 else 'Earth CJK Serif').encode(record.getEncoding())
    if record.nameID in (2, 17):
        record.string = 'Medium'.encode(record.getEncoding())
cjk.flavor = 'woff'
cjk.save(out / 'EarthCJKSerif-Medium.woff')
ranges = []
for code in sorted(latin_codes | cjk_codes):
    if ranges and code == ranges[-1][1] + 1:
        ranges[-1][1] = code
    else:
        ranges.append([code, code])
(root / 'src/layers/search-font-coverage.json').write_text(json.dumps(ranges), encoding='utf-8')
print({'Cinzel': len(latin_codes), 'SourceHanSerifSC': len(cjk_codes)})
