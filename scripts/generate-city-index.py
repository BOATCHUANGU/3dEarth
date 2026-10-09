"""Generate a lazy, offline GeoNames search asset; not part of the app build.

Usage: python scripts/generate-city-index.py --snapshot-date YYYY-MM-DD
Downloads official snapshots into memory; never bundles the original dumps.
"""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--snapshot-date', required=True, help='Date retrieved, not a population census date')
parser.add_argument('--base-url', default='https://download.geonames.org/export/dump/')
args = parser.parse_args()
base = args.base_url.rstrip('/') + '/'
sources = []

def download(name):
    with urllib.request.urlopen(base + name, timeout=120) as response:
        data = response.read()
        sources.append({'url': base + name, 'lastModified': response.headers.get('Last-Modified'),
                        'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        return data

countries = {}
for line in download('countryInfo.txt').decode('utf-8').splitlines():
    if not line or line.startswith('#'):
        continue
    fields = line.split('\t')
    countries[fields[0]] = fields[4]
admins = {}
for line in download('admin1CodesASCII.txt').decode('utf-8').splitlines():
    fields = line.split('\t')
    if len(fields) >= 3:
        admins[fields[0]] = fields[1]
archive = zipfile.ZipFile(io.BytesIO(download('cities15000.zip')))
rows = []
for line in archive.read('cities15000.txt').decode('utf-8').splitlines():
    f = line.split('\t')
    if f[6] != 'P' or f[7] in {'PPLX', 'PPLQ', 'PPLH', 'PPLW'}:
        continue
    population = int(f[14] or 0)
    if population < 15000 and f[7] not in {'PPLC', 'PPLA'}:
        continue
    names = list(dict.fromkeys(n for n in [f[1], f[2], *f[3].split(',')] if n))
    rows.append([int(f[0]), f[1], f[2], names, float(f[4]), float(f[5]),
                 f[8], f[8] + '.' + f[10], population])
rows.sort(key=lambda row: (-row[8], row[0]))
used_admins = {row[7] for row in rows}
used_countries = {row[6] for row in rows}
payload = {'version': 1, 'snapshot': args.snapshot_date,
           'countries': {k: v for k, v in countries.items() if k in used_countries},
           'admins': {k: v for k, v in admins.items() if k in used_admins}, 'cities': rows}
raw = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
compressed = gzip.compress(raw, compresslevel=9, mtime=0)
output = Path(__file__).resolve().parents[1] / 'public' / 'search'
output.mkdir(parents=True, exist_ok=True)
(output / 'cities.json').write_bytes(raw)
(output / 'cities.json.gz').write_bytes(compressed)
metadata = {'snapshotRetrieved': args.snapshot_date, 'license': 'CC BY 4.0',
            'attribution': 'GeoNames', 'sources': sources, 'coordinateSystem': 'WGS84',
            'filter': 'cities15000, class P; population >= 15000 or PPLC/PPLA; exclude PPLX/PPLQ/PPLH/PPLW',
            'aliases': 'All nonempty distinct name, asciiname and alternatenames from each selected row; no language inference',
            'cities': len(rows), 'countryCodes': len(used_countries),
            'jsonBytes': len(raw), 'gzipBytes': len(compressed),
            'jsonSha256': hashlib.sha256(raw).hexdigest(),
            'gzipSha256': hashlib.sha256(compressed).hexdigest()}
(output / 'metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(metadata, ensure_ascii=False, indent=2))
