import type { MercatorTile } from './MercatorTiles';
import { networkProfile } from '../network/NetworkProfile';
import { apiUrl } from '../network/ApiEndpoint';

export type MapMode = 'auto' | 'satellite' | 'streets';
export interface TileSource {
  id: string;
  name: string;
  maxZoom: number;
  minZoom?: number;
  tileSize: number;
  kind: 'imagery' | 'map';
  attribution: string;
  attributionUrl: string;
  url(tile: MercatorTile): string;
  annotationUrl?(tile: MercatorTile): string;
}

const tiandituToken = (import.meta.env.VITE_TIANDITU_TOKEN as string | undefined)?.trim();
function tiandituURL(layer: 'vec' | 'cva' | 'img', tile: MercatorTile) {
  if (import.meta.env.VITE_DIRECT_TILES !== 'true')
    return apiUrl(`__tiles/tianditu-${layer}/${tile.z}/${tile.x}/${tile.y}`);
  // Stable assignment preserves connection reuse and HTTP caching; no domain hopping on errors.
  const shard = (tile.x + tile.y) % 4;
  return `https://t${shard}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX=${tile.z}&TILEROW=${tile.y}&TILECOL=${tile.x}&tk=${encodeURIComponent(tiandituToken ?? '')}`;
}

// Official Web Mercator matrix, not GCJ-02: never apply a GCJ offset to these tiles.
export const CHINA_STREETS: TileSource = {
  id: 'tianditu-vec',
  name: '天地图 · 街道',
  minZoom: 1,
  maxZoom: 18,
  tileSize: 256,
  kind: 'map',
  attribution: '© 天地图 · 国家地理信息公共服务平台',
  attributionUrl: 'https://www.tianditu.gov.cn/',
  url: (tile) => tiandituURL('vec', tile),
  annotationUrl: (tile) => tiandituURL('cva', tile),
};
export const CHINA_IMAGERY: TileSource = {
  id: 'tianditu-img',
  name: '天地图 · 卫星影像',
  minZoom: 1,
  maxZoom: 18,
  tileSize: 256,
  kind: 'imagery',
  attribution: CHINA_STREETS.attribution,
  attributionUrl: CHINA_STREETS.attributionUrl,
  url: (tile) => tiandituURL('img', tile),
};

// Default same-origin transport preserves HTTP caching and the actual Referer.
// Static deployments may opt into direct browser requests at build time.
function withTransport(source: TileSource): TileSource {
  const direct = source.url;
  return {
    ...source,
    url: (tile) =>
      import.meta.env.VITE_DIRECT_TILES === 'true'
        ? direct(tile)
        : apiUrl(`__tiles/${source.id}/${tile.z}/${tile.x}/${tile.y}`),
  };
}

export const SENTINEL: TileSource = withTransport({
  id: 'eox-sentinel-2025',
  name: 'Sentinel-2 · 10 m',
  maxZoom: 14,
  tileSize: 256,
  kind: 'imagery',
  attribution: 'Sentinel-2 cloudless 2025 © EOX · CC BY-NC-SA 4.0',
  attributionUrl: 'https://cloudless.eox.at/license-non-commercial',
  url: ({ z, x, y }) =>
    `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/${z}/${y}/${x}.jpg`,
});

export const OPEN_STREET_MAP: TileSource = withTransport({
  id: 'osm-standard',
  name: 'OpenStreetMap · 街道与建筑轮廓',
  maxZoom: 19,
  tileSize: 256,
  kind: 'map',
  attribution: '© OpenStreetMap contributors',
  attributionUrl: 'https://www.openstreetmap.org/copyright',
  url: ({ z, x, y }) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
});

export const JAPAN_AERIAL: TileSource = withTransport({
  id: 'gsi-seamlessphoto',
  name: '国土地理院 · 航空影像',
  minZoom: 14,
  maxZoom: 18,
  tileSize: 256,
  kind: 'imagery',
  attribution: '地理院タイル（国土地理院）',
  attributionUrl: 'https://maps.gsi.go.jp/development/ichiran.html',
  url: ({ z, x, y }) => `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${z}/${x}/${y}.jpg`,
});

export const US_AERIAL: TileSource = withTransport({
  id: 'usgs-naip',
  name: 'USGS NAIP · 航空影像',
  minZoom: 12,
  maxZoom: 19,
  tileSize: 256,
  kind: 'imagery',
  attribution: 'USGS / USDA NAIP · Public domain',
  attributionUrl: 'https://www.usgs.gov/the-national-map-data-delivery/gis-data-download',
  url: ({ z, x, y }) => {
    const half = 20037508.342789244;
    const step = (half * 2) / 2 ** z;
    const bbox = [
      -half + x * step,
      half - (y + 1) * step,
      -half + (x + 1) * step,
      half - y * step,
    ].join(',');
    return `https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage?bbox=${bbox}&bboxSR=3857&imageSR=3857&size=256,256&format=jpg&f=image&interpolation=RSP_Bilinear`;
  },
});

/** Optional licensed imagery, without embedding somebody else's public API token. */
const esriToken = import.meta.env.VITE_ARCGIS_API_KEY as string | undefined;
export const LICENSED_IMAGERY: TileSource | undefined = esriToken
  ? withTransport({
      id: 'arcgis-world-imagery',
      name: 'World Imagery · 高分辨率卫星',
      maxZoom: 19,
      tileSize: 256,
      kind: 'imagery',
      attribution: 'Esri, Vantor, Earthstar Geographics, and the GIS User Community',
      attributionUrl: 'https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9',
      url: ({ z, x, y }) =>
        `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}?token=${encodeURIComponent(esriToken)}`,
    })
  : undefined;

function globalSource(
  mode: MapMode,
  altitude: number,
  latitude: number,
  longitude: number,
): TileSource {
  if (mode === 'streets') return OPEN_STREET_MAP;
  if (LICENSED_IMAGERY) return LICENSED_IMAGERY;
  if (altitude < 25_000 && latitude > 30 && latitude < 45.8 && longitude > 129 && longitude < 146)
    return JAPAN_AERIAL;
  if (
    altitude < 40_000 &&
    latitude > 24.5 &&
    latitude < 49.5 &&
    longitude > -125 &&
    longitude < -66
  )
    return US_AERIAL;
  if (mode === 'auto' && altitude < 25_000) return OPEN_STREET_MAP;
  return SENTINEL;
}

export function chooseTileSource(
  mode: MapMode,
  altitude: number,
  latitude: number,
  longitude: number,
  excluded: ReadonlySet<string> = new Set(),
): TileSource {
  const network = networkProfile.getState();
  const global = globalSource(mode, altitude, latitude, longitude);
  const candidates: TileSource[] = [];
  if (network.region === 'china' && network.chinaAvailable) {
    candidates.push(
      mode === 'streets' || (mode === 'auto' && altitude < 25_000) ? CHINA_STREETS : CHINA_IMAGERY,
    );
  }
  candidates.push(global);
  // Keep photographic modes photographic even when a provider is unavailable.
  candidates.push(mode === 'streets' || global.kind === 'map' ? OPEN_STREET_MAP : SENTINEL);
  return candidates.find((source) => !excluded.has(source.id)) ?? candidates[0];
}
