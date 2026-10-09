import { WGS84 } from '../geo/CoordinateSystem';

/** Standard Web Mercator XYZ addressing: x eastward, y southward. */
export interface MercatorTile {
  z: number;
  x: number;
  y: number;
}

/** Degrees; west > east crosses the dateline, [-180, 180] covers all longitudes. */
export interface GeographicBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface TileUV {
  u: number;
  /** Image coordinates: 0 is the north edge and 1 is the south edge. */
  v: number;
}

export const MERCATOR_MAX_LATITUDE = (Math.atan(Math.sinh(Math.PI)) * 180) / Math.PI;
export const MAX_MERCATOR_ZOOM = 24;
/** Allocation protection only; exceeding this never silently reduces image quality. */
export const MAX_MERCATOR_SELECTION = 4096;
const DEG_TO_RAD = Math.PI / 180;
type Range = [first: number, last: number];

function validateZoom(z: number): void {
  if (!Number.isInteger(z) || z < 0 || z > MAX_MERCATOR_ZOOM) {
    throw new RangeError(`Mercator zoom must be an integer from 0 to ${MAX_MERCATOR_ZOOM}.`);
  }
}

function validateTile(tile: MercatorTile): void {
  validateZoom(tile.z);
  const size = 2 ** tile.z;
  if (
    !Number.isInteger(tile.x) ||
    !Number.isInteger(tile.y) ||
    tile.x < 0 ||
    tile.y < 0 ||
    tile.x >= size ||
    tile.y >= size
  ) {
    throw new RangeError('Mercator tile x and y must be integers inside the zoom grid.');
  }
}

function finiteCoordinates(longitude: number, latitude: number): void {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new RangeError('Longitude and latitude must be finite.');
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Wrap any finite longitude into [-180, 180). */
function wrappedLongitude(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

/** Fraction of the entire Mercator image measured southward from its north edge. */
export function latitudeToMercatorY(latitude: number): number {
  if (!Number.isFinite(latitude)) throw new RangeError('Latitude must be finite.');
  if (latitude >= MERCATOR_MAX_LATITUDE) return 0;
  if (latitude <= -MERCATOR_MAX_LATITUDE) return 1;
  const radians = clamp(latitude, -MERCATOR_MAX_LATITUDE, MERCATOR_MAX_LATITUDE) * DEG_TO_RAD;
  return clamp((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2, 0, 1);
}

/** Inverse Mercator projection. Fractions outside the global image are rejected. */
export function mercatorYToLatitude(y: number): number {
  if (!Number.isFinite(y) || y < 0 || y > 1) {
    throw new RangeError('Mercator y must be a finite fraction between 0 and 1.');
  }
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

/** Remove inverse-projection rounding at an exact grid edge, even at zoom 24. */
function snapGridEdge(value: number, size: number): number {
  const integer = Math.round(value);
  return Math.abs(value - integer) <= Number.EPSILON * size * 32 ? integer : value;
}

function latitudeIndex(latitude: number, size: number): number {
  return snapGridEdge(latitudeToMercatorY(latitude) * size, size);
}

export function tileBounds(tile: MercatorTile): GeographicBounds {
  validateTile(tile);
  const size = 2 ** tile.z;
  return {
    west: (tile.x / size) * 360 - 180,
    east: ((tile.x + 1) / size) * 360 - 180,
    north: mercatorYToLatitude(tile.y / size),
    south: mercatorYToLatitude((tile.y + 1) / size),
  };
}

/** Dateline points use x=0; polar coordinates clamp to the first/last image row. */
export function lngLatToTile(longitude: number, latitude: number, z: number): MercatorTile {
  finiteCoordinates(longitude, latitude);
  validateZoom(z);
  const size = 2 ** z;
  return {
    z,
    x: clamp(Math.floor(((wrappedLongitude(longitude) + 180) / 360) * size), 0, size - 1),
    y: clamp(Math.floor(latitudeIndex(latitude, size)), 0, size - 1),
  };
}

/**
 * Image UV for a coordinate in a tile or ancestor tile. Longitude is unwrapped
 * around this tile, preserving both dateline edges. Values are not clamped:
 * coordinates outside the tile can be detected by their UVs.
 */
export function tileUV(longitude: number, latitude: number, tile: MercatorTile): TileUV {
  finiteCoordinates(longitude, latitude);
  validateTile(tile);
  const size = 2 ** tile.z;
  const wrapped = wrappedLongitude(longitude);
  let imageX = ((wrapped + 180) / 360) * size;
  if (wrapped === -180 && longitude > 0) imageX = size;
  const distance = tile.x + 0.5 - imageX;
  if (distance > size / 2) imageX += size;
  else if (distance < -size / 2) imageX -= size;
  return { u: imageX - tile.x, v: latitudeIndex(latitude, size) - tile.y };
}

export function tileKey(tile: MercatorTile): string {
  validateTile(tile);
  return `${tile.z}/${tile.x}/${tile.y}`;
}

export function parentTile(tile: MercatorTile): MercatorTile | null {
  validateTile(tile);
  return tile.z === 0
    ? null
    : { z: tile.z - 1, x: Math.floor(tile.x / 2), y: Math.floor(tile.y / 2) };
}

/** Children are in northwest, northeast, southwest, southeast order. */
export function childTiles(tile: MercatorTile): MercatorTile[] {
  validateTile(tile);
  if (tile.z === MAX_MERCATOR_ZOOM) throw new RangeError('Maximum Mercator zoom reached.');
  const z = tile.z + 1;
  const x = tile.x * 2;
  const y = tile.y * 2;
  return [
    { z, x, y },
    { z, x: x + 1, y },
    { z, x, y: y + 1 },
    { z, x: x + 1, y: y + 1 },
  ];
}

/** Latitude at image-row fraction v: use this for geometry, not linear latitude. */
export function mercatorLatitudeAt(tile: MercatorTile, v: number): number {
  validateTile(tile);
  if (!Number.isFinite(v) || v < 0 || v > 1) {
    throw new RangeError('Tile row fraction must be between 0 and 1.');
  }
  return mercatorYToLatitude((tile.y + v) / 2 ** tile.z);
}

function longitudeRange(west: number, east: number, size: number): Range {
  if (west === east) {
    const index = west === 180 ? 0 : clamp(Math.floor(((west + 180) / 360) * size), 0, size - 1);
    return [index, index];
  }
  const first = clamp(Math.floor(((west + 180) / 360) * size), 0, size - 1);
  const last = clamp(Math.ceil(((east + 180) / 360) * size) - 1, 0, size - 1);
  return [first, Math.max(first, last)];
}

function selectionRanges(bounds: GeographicBounds, z: number) {
  validateZoom(z);
  if (
    ![bounds.west, bounds.east, bounds.north, bounds.south].every(Number.isFinite) ||
    bounds.west < -180 ||
    bounds.west > 180 ||
    bounds.east < -180 ||
    bounds.east > 180 ||
    bounds.south < -90 ||
    bounds.north > 90 ||
    bounds.south > bounds.north
  ) {
    throw new RangeError('Bounds must be finite WGS84 degrees with south ≤ north.');
  }
  const size = 2 ** z;
  let ranges: Range[];
  if (bounds.west <= bounds.east) {
    ranges = [longitudeRange(bounds.west, bounds.east, size)];
  } else {
    ranges = [];
    if (bounds.east > -180) ranges.push(longitudeRange(-180, bounds.east, size));
    if (bounds.west < 180) ranges.push(longitudeRange(bounds.west, 180, size));
    if (ranges.length === 0) ranges.push([0, 0]);
    if (ranges.length === 2 && ranges[0][1] + 1 >= ranges[1][0]) {
      ranges = [[ranges[0][0], Math.max(ranges[0][1], ranges[1][1])]];
    }
  }
  const north = latitudeIndex(bounds.north, size);
  const south = latitudeIndex(bounds.south, size);
  const firstY = clamp(Math.floor(north), 0, size - 1);
  const lastY =
    north === south ? firstY : Math.max(firstY, clamp(Math.ceil(south) - 1, 0, size - 1));
  const width = ranges.reduce((sum, [first, last]) => sum + last - first + 1, 0);
  const count = width * (lastY - firstY + 1);
  return { ranges, firstY, lastY, count };
}

function* tilesInRanges(
  z: number,
  selection: ReturnType<typeof selectionRanges>,
): Generator<MercatorTile> {
  for (let y = selection.firstY; y <= selection.lastY; y += 1) {
    for (const [first, last] of selection.ranges) {
      for (let x = first; x <= last; x += 1) yield { z, x, y };
    }
  }
}

/**
 * Stream full coverage at the requested zoom without allocating a bounding-box
 * array. The renderer culls each candidate immediately, retaining every visible
 * tile even on 4K/high-DPR displays. No budget silently changes the zoom.
 */
export function* iterateMercatorTiles(
  bounds: GeographicBounds,
  z: number,
): Generator<MercatorTile> {
  yield* tilesInRanges(z, selectionRanges(bounds, z));
}

/** Bounded array convenience API; use iterateMercatorTiles for rendering. */
export function selectMercatorTiles(
  bounds: GeographicBounds,
  z: number,
  maxTiles = MAX_MERCATOR_SELECTION,
): MercatorTile[] {
  const selection = selectionRanges(bounds, z);
  if (!Number.isSafeInteger(maxTiles) || maxTiles < 1) {
    throw new RangeError('Selection limit must be a positive safe integer.');
  }
  const { count } = selection;
  const limit = Math.min(maxTiles, MAX_MERCATOR_SELECTION);
  if (count > limit) {
    throw new RangeError(
      `Mercator view needs ${count} tiles at zoom ${z}; stream regions of at most ${limit} tiles.`,
    );
  }
  return [...tilesInRanges(z, selection)];
}

/**
 * Nadir LOD with at least one source texel per physical display pixel, capped
 * only by the imagery provider. Pass drawing-buffer height (CSS height × DPR).
 * Mercator's latitude scale is included. Oblique/horizon refinement is separate.
 */
export function targetZoom(
  altitudeMeters: number,
  latitude: number,
  verticalFovDegrees: number,
  viewportHeightPixels: number,
  tileSizePixels = 256,
  maximumZoom = 19,
): number {
  validateZoom(maximumZoom);
  if (
    ![altitudeMeters, latitude, verticalFovDegrees, viewportHeightPixels, tileSizePixels].every(
      Number.isFinite,
    ) ||
    altitudeMeters < 0 ||
    verticalFovDegrees <= 0 ||
    verticalFovDegrees >= 179 ||
    viewportHeightPixels <= 0 ||
    tileSizePixels <= 0
  ) {
    throw new RangeError(
      'LOD requires nonnegative altitude and valid positive camera sampling parameters.',
    );
  }
  if (altitudeMeters === 0) return maximumZoom;
  const groundMetersPerPixel =
    (2 * altitudeMeters * Math.tan((verticalFovDegrees * DEG_TO_RAD) / 2)) / viewportHeightPixels;
  const latitudeScale = Math.cos(
    clamp(latitude, -MERCATOR_MAX_LATITUDE, MERCATOR_MAX_LATITUDE) * DEG_TO_RAD,
  );
  const requiredScale =
    (2 * Math.PI * WGS84.a * latitudeScale) / (tileSizePixels * groundMetersPerPixel);
  return clamp(Math.ceil(Math.log2(requiredScale)), 0, maximumZoom);
}
