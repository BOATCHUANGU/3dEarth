import { WGS84 } from '../geo/CoordinateSystem';

/**
 * Geographic quadtree: one global tile at z=0, then 2×2 children per tile.
 * x increases eastward from -180°; y increases southward from +90°.
 * This is a latitude/longitude scheme, not Web Mercator / standard XYZ.
 */
export interface TileKey {
  zoom: number;
  x: number;
  y: number;
}

/** Degrees. west > east crosses the dateline; [-180,180] is full longitude. */
export interface GeographicBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface TileAttribution {
  label: string;
  url?: string;
}

/**
 * Provider adapter contract. A load must reject when its signal is aborted.
 * Implementations adapt this geographic scheme to their source projection.
 * No provider, network access, cache or licence assumptions are supplied here.
 */
export interface TileProvider<TileData = ImageBitmap> {
  readonly id: string;
  readonly attribution: readonly TileAttribution[];
  readonly minimumZoom: number;
  readonly maximumZoom: number;
  loadTile(key: TileKey, signal: AbortSignal): Promise<TileData>;
}

export interface TileSelection {
  tiles: TileKey[];
  requestedZoom: number;
  effectiveZoom: number;
  /** True when a coarser zoom was required to retain coverage within budget. */
  budgetLimited: boolean;
}

export interface AltitudeLodOptions {
  maximumZoom?: number;
  /** Camera vertical field of view in degrees. */
  fieldOfViewDegrees?: number;
  viewportHeightPixels?: number;
  tileSizePixels?: number;
}

export const MAX_TILE_ZOOM = 24;
export const MAX_VISIBLE_TILE_BUDGET = 4096;
type Range = [start: number, end: number];

function validateZoom(zoom: number): void {
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > MAX_TILE_ZOOM) {
    throw new RangeError(`Tile zoom must be an integer from 0 to ${MAX_TILE_ZOOM}.`);
  }
}

function validateKey(key: TileKey): void {
  validateZoom(key.zoom);
  const size = 2 ** key.zoom;
  if (
    !Number.isInteger(key.x) ||
    !Number.isInteger(key.y) ||
    key.x < 0 ||
    key.y < 0 ||
    key.x >= size ||
    key.y >= size
  ) {
    throw new RangeError('Tile x and y must be integers within their zoom grid.');
  }
}

function validateBounds(bounds: GeographicBounds): void {
  const { west, south, east, north } = bounds;
  if (
    ![west, south, east, north].every(Number.isFinite) ||
    west < -180 ||
    west > 180 ||
    east < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    south > north
  ) {
    throw new RangeError('Bounds must be finite WGS84 degrees with south ≤ north.');
  }
}

/** Geographic extents of one tile, with shared edges exactly representable. */
export function tileBounds(key: TileKey): GeographicBounds {
  validateKey(key);
  const size = 2 ** key.zoom;
  return {
    west: (key.x / size) * 360 - 180,
    south: 90 - ((key.y + 1) / size) * 180,
    east: ((key.x + 1) / size) * 360 - 180,
    north: 90 - (key.y / size) * 180,
  };
}

/** Stable cache suffix; prefix with provider id and dataset version. */
export function tileId(key: TileKey): string {
  validateKey(key);
  return `${key.zoom}/${key.x}/${key.y}`;
}

export function parentTile(key: TileKey): TileKey | null {
  validateKey(key);
  return key.zoom === 0
    ? null
    : {
        zoom: key.zoom - 1,
        x: Math.floor(key.x / 2),
        y: Math.floor(key.y / 2),
      };
}

/** Children in northwest, northeast, southwest, southeast order. */
export function childTiles(key: TileKey): TileKey[] {
  validateKey(key);
  if (key.zoom === MAX_TILE_ZOOM) throw new RangeError('Maximum tile zoom reached.');
  return [
    { zoom: key.zoom + 1, x: key.x * 2, y: key.y * 2 },
    { zoom: key.zoom + 1, x: key.x * 2 + 1, y: key.y * 2 },
    { zoom: key.zoom + 1, x: key.x * 2, y: key.y * 2 + 1 },
    { zoom: key.zoom + 1, x: key.x * 2 + 1, y: key.y * 2 + 1 },
  ];
}

function clampIndex(index: number, size: number): number {
  return Math.max(0, Math.min(size - 1, index));
}

/** Nonzero intervals exclude their far edge to avoid adjacent redundant tiles. */
function longitudeRange(west: number, east: number, size: number): Range {
  if (west === east) {
    // +180° and -180° refer to the same meridian.
    const index = west === 180 ? 0 : clampIndex(Math.floor(((west + 180) / 360) * size), size);
    return [index, index];
  }
  const first = clampIndex(Math.floor(((west + 180) / 360) * size), size);
  const last = clampIndex(Math.ceil(((east + 180) / 360) * size) - 1, size);
  // Extremely small valid intervals can collapse when shifted by 180°.
  return [first, Math.max(first, last)];
}

function coverage(bounds: GeographicBounds, zoom: number): { x: Range[]; y: Range; count: number } {
  const size = 2 ** zoom;
  let x: Range[];
  if (bounds.west <= bounds.east) {
    x = [longitudeRange(bounds.west, bounds.east, size)];
  } else {
    x = [];
    if (bounds.east > -180) x.push(longitudeRange(-180, bounds.east, size));
    if (bounds.west < 180) x.push(longitudeRange(bounds.west, 180, size));
    if (x.length === 0) x.push([0, 0]);
    // At coarse zoom the two dateline portions can overlap. Merge before counting.
    if (x.length === 2 && x[0][1] + 1 >= x[1][0]) {
      x = [[x[0][0], Math.max(x[0][1], x[1][1])]];
    }
  }
  const firstY = clampIndex(Math.floor(((90 - bounds.north) / 180) * size), size);
  const lastY =
    bounds.north === bounds.south
      ? firstY
      : Math.max(firstY, clampIndex(Math.ceil(((90 - bounds.south) / 180) * size) - 1, size));
  const width = x.reduce((total, [first, last]) => total + last - first + 1, 0);
  return { x, y: [firstY, lastY], count: width * (lastY - firstY + 1) };
}

/**
 * Select full coverage of a geographic view, including dateline crossings and poles.
 * Count ranges before allocating tiles, reducing zoom until the budget fits.
 * A maximum of 4096 keys is allocated, even if callers supply a larger budget.
 * The bounds are supplied by the caller: frustum / horizon culling is separate.
 */
export function selectVisibleTiles(
  bounds: GeographicBounds,
  requestedZoom: number,
  maxTiles = 64,
): TileSelection {
  validateBounds(bounds);
  validateZoom(requestedZoom);
  if (!Number.isFinite(maxTiles) || maxTiles < 1 || !Number.isInteger(maxTiles)) {
    throw new RangeError('Tile budget must be a positive finite integer.');
  }
  const budget = Math.min(maxTiles, MAX_VISIBLE_TILE_BUDGET);
  let effectiveZoom = requestedZoom;
  let ranges = coverage(bounds, effectiveZoom);
  while (ranges.count > budget && effectiveZoom > 0) {
    effectiveZoom -= 1;
    ranges = coverage(bounds, effectiveZoom);
  }

  const tiles: TileKey[] = [];
  for (let y = ranges.y[0]; y <= ranges.y[1]; y += 1) {
    for (const [firstX, lastX] of ranges.x) {
      for (let x = firstX; x <= lastX; x += 1) tiles.push({ zoom: effectiveZoom, x, y });
    }
  }
  return { tiles, requestedZoom, effectiveZoom, budgetLimited: effectiveZoom < requestedZoom };
}

/**
 * Initial imagery LOD from nadir camera height in metres and vertical sampling.
 * Uses the local flat-ground footprint; final selection must still obey the budget.
 * Terrain, horizon, latitude distortion and oblique views require screen-space error
 * refinement when regional rendering is added.
 */
export function desiredZoomForAltitude(
  altitudeMeters: number,
  options: AltitudeLodOptions = {},
): number {
  const {
    maximumZoom = MAX_TILE_ZOOM,
    fieldOfViewDegrees = 45,
    viewportHeightPixels = 1080,
    tileSizePixels = 512,
  } = options;
  validateZoom(maximumZoom);
  if (
    ![altitudeMeters, fieldOfViewDegrees, viewportHeightPixels, tileSizePixels].every(
      Number.isFinite,
    ) ||
    altitudeMeters < 0 ||
    fieldOfViewDegrees <= 0 ||
    fieldOfViewDegrees >= 179 ||
    viewportHeightPixels <= 0 ||
    tileSizePixels <= 0
  ) {
    throw new RangeError(
      'LOD needs a nonnegative altitude and valid positive camera sampling parameters.',
    );
  }
  const footprintMeters =
    2 * Math.max(1, altitudeMeters) * Math.tan((fieldOfViewDegrees * Math.PI) / 360);
  const requiredTiles =
    (Math.PI * WGS84.a * viewportHeightPixels) / (footprintMeters * tileSizePixels);
  return Math.max(0, Math.min(maximumZoom, Math.ceil(Math.log2(requiredTiles))));
}
