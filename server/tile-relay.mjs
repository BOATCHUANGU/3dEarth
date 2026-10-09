import { createTileTransport } from './tile-transport.mjs';

export function upstreamURL(source, z, x, y, arcgisKey, tiandituToken) {
  const limits = {
    'eox-sentinel-2025': [0, 14],
    'osm-standard': [0, 19],
    'gsi-seamlessphoto': [14, 18],
    'usgs-naip': [12, 19],
    'arcgis-world-imagery': [0, 19],
    'tianditu-vec': [1, 18],
    'tianditu-cva': [1, 18],
    'tianditu-img': [1, 18],
  };
  const range = Object.hasOwn(limits, source) ? limits[source] : undefined;
  if (
    !range ||
    ![z, x, y].every(Number.isSafeInteger) ||
    z < range[0] ||
    z > range[1] ||
    x < 0 ||
    y < 0 ||
    x >= 2 ** z ||
    y >= 2 ** z
  )
    return null;
  if (source.startsWith('tianditu-')) {
    if (!tiandituToken) return null;
    const layer = source.slice('tianditu-'.length);
    return `https://t${(x + y) % 4}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}&tk=${encodeURIComponent(tiandituToken)}`;
  }
  if (source === 'eox-sentinel-2025')
    return `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/${z}/${y}/${x}.jpg`;
  if (source === 'osm-standard') return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  if (source === 'gsi-seamlessphoto')
    return `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${z}/${x}/${y}.jpg`;
  if (source === 'arcgis-world-imagery')
    return arcgisKey
      ? `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}?token=${encodeURIComponent(arcgisKey)}`
      : null;
  const half = 20037508.342789244,
    step = (half * 2) / 2 ** z;
  const bbox = [
    -half + x * step,
    half - (y + 1) * step,
    -half + (x + 1) * step,
    half - y * step,
  ].join(',');
  return `https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage?bbox=${bbox}&bboxSR=3857&imageSR=3857&size=256,256&format=jpg&f=image&interpolation=RSP_Bilinear`;
}

export function createTileRelay(options = {}) {
  return createTileTransport({ ...options, upstreamURL });
}

export function tileRelayPlugin(options) {
  return {
    name: 'earth-tile-transport',
    configureServer(server) {
      server.middlewares.use(createTileRelay(options));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createTileRelay(options));
    },
  };
}
