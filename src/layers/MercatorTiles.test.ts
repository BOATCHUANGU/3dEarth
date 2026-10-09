import { describe, expect, it } from 'vitest';
import {
  childTiles,
  iterateMercatorTiles,
  latitudeToMercatorY,
  lngLatToTile,
  MAX_MERCATOR_SELECTION,
  MERCATOR_MAX_LATITUDE,
  mercatorLatitudeAt,
  mercatorYToLatitude,
  parentTile,
  selectMercatorTiles,
  targetZoom,
  tileBounds,
  tileKey,
  tileUV,
} from './MercatorTiles';

const globe = { west: -180, east: 180, south: -90, north: 90 };

describe('Web Mercator XYZ coordinates', () => {
  it('maps Shanghai to its standard XYZ tile', () => {
    expect(lngLatToTile(121.4737, 31.2304, 10)).toEqual({ z: 10, x: 857, y: 418 });
    const tile = lngLatToTile(121.4737, 31.2304, 19);
    const uv = tileUV(121.4737, 31.2304, tile);
    const bounds = tileBounds(tile);
    expect(uv.u).toBeGreaterThanOrEqual(0);
    expect(uv.u).toBeLessThan(1);
    expect(uv.v).toBeGreaterThanOrEqual(0);
    expect(uv.v).toBeLessThan(1);
    expect(bounds.west + uv.u * (bounds.east - bounds.west)).toBeCloseTo(121.4737, 10);
    expect(mercatorLatitudeAt(tile, uv.v)).toBeCloseTo(31.2304, 10);
  });

  it('has an equatorial east/south grid edge and Mercator polar caps', () => {
    expect(lngLatToTile(0, 0, 1)).toEqual({ z: 1, x: 1, y: 1 });
    expect(MERCATOR_MAX_LATITUDE).toBeCloseTo(85.0511287798066, 12);
    expect(tileBounds({ z: 0, x: 0, y: 0 })).toEqual({
      west: -180,
      east: 180,
      north: MERCATOR_MAX_LATITUDE,
      south: -MERCATOR_MAX_LATITUDE,
    });
    expect(lngLatToTile(0, 90, 8).y).toBe(0);
    expect(lngLatToTile(0, -90, 8).y).toBe(255);
    expect(latitudeToMercatorY(90)).toBe(0);
    expect(latitudeToMercatorY(-90)).toBe(1);
  });

  it.each([-540, -180, 180, 540])(
    'wraps longitude %s to the canonical dateline tile',
    (longitude) => {
      expect(lngLatToTile(longitude, 0, 4)).toEqual({ z: 4, x: 0, y: 8 });
    },
  );

  it('preserves both global and local dateline image edges', () => {
    expect(tileUV(-180, 0, { z: 0, x: 0, y: 0 })).toEqual({ u: 0, v: 0.5 });
    expect(tileUV(180, 0, { z: 0, x: 0, y: 0 })).toEqual({ u: 1, v: 0.5 });
    expect(tileUV(-180, 0, { z: 3, x: 7, y: 4 }).u).toBe(1);
    expect(tileUV(180, 0, { z: 3, x: 0, y: 4 }).u).toBe(0);
  });

  it('round-trips projection and makes geometry rows linear in image space', () => {
    for (const latitude of [-85, -70, -31.2304, 0, 31.2304, 70, 85]) {
      expect(mercatorYToLatitude(latitudeToMercatorY(latitude))).toBeCloseTo(latitude, 11);
    }
    const tile = { z: 3, x: 4, y: 1 };
    const bounds = tileBounds(tile);
    expect(mercatorLatitudeAt(tile, 0)).toBe(bounds.north);
    expect(mercatorLatitudeAt(tile, 1)).toBe(bounds.south);
    expect(mercatorLatitudeAt(tile, 0.5)).not.toBeCloseTo((bounds.north + bounds.south) / 2, 2);
    expect(tileUV(bounds.west, mercatorLatitudeAt(tile, 0.5), tile).v).toBeCloseTo(0.5, 12);
  });

  it('provides stable keys and consistent ancestors and children', () => {
    const tile = { z: 3, x: 5, y: 2 };
    expect(tileKey(tile)).toBe('3/5/2');
    expect(childTiles(tile)).toEqual([
      { z: 4, x: 10, y: 4 },
      { z: 4, x: 11, y: 4 },
      { z: 4, x: 10, y: 5 },
      { z: 4, x: 11, y: 5 },
    ]);
    for (const child of childTiles(tile)) expect(parentTile(child)).toEqual(tile);
    expect(parentTile({ z: 0, x: 0, y: 0 })).toBeNull();
  });

  it('rejects invalid coordinates, keys and image fractions', () => {
    expect(() => lngLatToTile(NaN, 0, 1)).toThrow(RangeError);
    expect(() => lngLatToTile(0, Infinity, 1)).toThrow(RangeError);
    expect(() => tileBounds({ z: 2, x: 4, y: 0 })).toThrow(RangeError);
    expect(() => parentTile({ z: 1.5, x: 0, y: 0 })).toThrow(RangeError);
    expect(() => childTiles({ z: 24, x: 0, y: 0 })).toThrow(RangeError);
    expect(() => mercatorLatitudeAt({ z: 0, x: 0, y: 0 }, 1.1)).toThrow(RangeError);
    expect(() => mercatorYToLatitude(-0.1)).toThrow(RangeError);
  });
});

describe('Mercator view coverage', () => {
  it('streams coverage beyond the array limit without lowering the requested zoom', () => {
    const tiles = [...iterateMercatorTiles(globe, 7)];
    expect(tiles).toHaveLength(16384);
    expect(new Set(tiles.map(tileKey)).size).toBe(16384);
    expect(tiles.every((tile) => tile.z === 7)).toBe(true);
    const lazy = iterateMercatorTiles(globe, 24);
    expect(lazy.next().value).toEqual({ z: 24, x: 0, y: 0 });
    expect(lazy.next().value).toEqual({ z: 24, x: 1, y: 0 });
    lazy.return(undefined);
  });

  it('covers the globe and keeps the requested zoom', () => {
    const tiles = selectMercatorTiles(globe, 6);
    expect(tiles).toHaveLength(MAX_MERCATOR_SELECTION);
    expect(new Set(tiles.map(tileKey)).size).toBe(MAX_MERCATOR_SELECTION);
    expect(tiles.every((tile) => tile.z === 6)).toBe(true);
  });

  it('selects both sides of the dateline without duplicates at coarse zoom', () => {
    const bounds = { west: 170, east: -170, north: 10, south: -10 };
    expect(selectMercatorTiles(bounds, 3).map(tileKey)).toEqual([
      '3/0/3',
      '3/7/3',
      '3/0/4',
      '3/7/4',
    ]);
    expect(selectMercatorTiles(bounds, 0)).toEqual([{ z: 0, x: 0, y: 0 }]);
  });

  it('selects one canonical tile for zero-width dateline bounds', () => {
    for (const [west, east] of [
      [-180, -180],
      [180, 180],
      [180, -180],
    ]) {
      expect(selectMercatorTiles({ west, east, south: 0, north: 0 }, 3)).toEqual([
        { z: 3, x: 0, y: 4 },
      ]);
    }
  });

  it('selects exactly one aligned tile, including high-zoom polar and dateline edges', () => {
    for (const z of [0, 1, 4, 12, 19, 24]) {
      const size = 2 ** z;
      for (const x of new Set([0, Math.floor(size / 2), size - 1])) {
        for (const y of new Set([0, Math.floor(size / 2), size - 1])) {
          const tile = { z, x, y };
          expect(selectMercatorTiles(tileBounds(tile), z)).toEqual([tile]);
        }
      }
    }
  });

  it('clamps polar-only views to the edge rows and retains tiny bounds', () => {
    expect(selectMercatorTiles({ west: 1, east: 2, south: 89, north: 90 }, 3)).toEqual([
      { z: 3, x: 4, y: 0 },
    ]);
    expect(selectMercatorTiles({ west: 1, east: 2, south: -90, north: -89 }, 3)).toEqual([
      { z: 3, x: 4, y: 7 },
    ]);
    expect(
      selectMercatorTiles({ west: 1e-16, east: 2e-16, south: 1e-16, north: 2e-16 }, 24),
    ).toHaveLength(1);
  });

  it('rejects pathological allocations without quietly reducing quality', () => {
    expect(() => selectMercatorTiles(globe, 24)).toThrow(/stream regions/);
    expect(() => selectMercatorTiles(globe, 7, Number.MAX_SAFE_INTEGER)).toThrow(/at most 4096/);
    expect(() => selectMercatorTiles(globe, 1, 3)).toThrow(/zoom 1/);
    expect(() => selectMercatorTiles(globe, 1, 0)).toThrow(RangeError);
    expect(() => selectMercatorTiles({ ...globe, west: -181 }, 1)).toThrow(RangeError);
    expect(() => selectMercatorTiles({ ...globe, north: -30, south: 30 }, 1)).toThrow(RangeError);
  });
});

describe('physical-pixel imagery LOD', () => {
  it('adds one zoom level when height halves or physical pixel density doubles', () => {
    const initial = targetZoom(1_000_000, 31.2304, 45, 1080);
    expect(targetZoom(500_000, 31.2304, 45, 1080)).toBe(initial + 1);
    expect(targetZoom(1_000_000, 31.2304, 45, 2160)).toBe(initial + 1);
  });

  it('accounts for Mercator latitude scale and native image size', () => {
    const equator = targetZoom(1_000_000, 0, 45, 1080);
    expect(targetZoom(1_000_000, 60, 45, 1080)).toBe(equator - 1);
    expect(targetZoom(1_000_000, 0, 45, 1080, 512)).toBe(equator - 1);
  });

  it('fulfills one source texel per physical pixel when provider resolution permits', () => {
    const altitude = 3000;
    const latitude = 31.2304;
    const pixels = 2160;
    const z = targetZoom(altitude, latitude, 45, pixels);
    const targetResolution = (2 * altitude * Math.tan(Math.PI / 8)) / pixels;
    const imageResolution =
      (2 * Math.PI * 6378137 * Math.cos((latitude * Math.PI) / 180)) / (256 * 2 ** z);
    expect(imageResolution).toBeLessThanOrEqual(targetResolution);
    expect(imageResolution * 2).toBeGreaterThan(targetResolution);
  });

  it('reaches city detail and respects source caps at ground/orbital distances', () => {
    expect(targetZoom(400, 31.2304, 45, 2160)).toBe(19);
    expect(targetZoom(0, 31.2304, 45, 2160)).toBe(19);
    expect(targetZoom(0, 31.2304, 45, 2160, 256, 22)).toBe(22);
    expect(targetZoom(1e12, 0, 45, 1080)).toBe(0);
    expect(targetZoom(100, 0, 45, 1080, 256, 0)).toBe(0);
  });

  it('rejects invalid sampling parameters', () => {
    expect(() => targetZoom(-1, 0, 45, 1080)).toThrow(RangeError);
    expect(() => targetZoom(1, NaN, 45, 1080)).toThrow(RangeError);
    expect(() => targetZoom(1, 0, 180, 1080)).toThrow(RangeError);
    expect(() => targetZoom(1, 0, 45, 0)).toThrow(RangeError);
    expect(() => targetZoom(1, 0, 45, 1080, 0)).toThrow(RangeError);
  });
});
