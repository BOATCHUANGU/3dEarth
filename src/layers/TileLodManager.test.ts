import { describe, expect, it } from 'vitest';
import {
  childTiles,
  desiredZoomForAltitude,
  MAX_VISIBLE_TILE_BUDGET,
  parentTile,
  selectVisibleTiles,
  tileBounds,
  tileId,
} from './TileLodManager';

const globe = { west: -180, east: 180, south: -90, north: 90 };

describe('geographic quadtree', () => {
  it('has one global root and four children with defined orientation', () => {
    const root = { zoom: 0, x: 0, y: 0 };
    expect(tileBounds(root)).toEqual(globe);
    const children = childTiles(root);
    expect(children).toHaveLength(4);
    expect(tileBounds(children[0])).toEqual({ west: -180, east: 0, south: 0, north: 90 });
    expect(tileBounds(children[3])).toEqual({ west: 0, east: 180, south: -90, north: 0 });
    for (const child of children) expect(parentTile(child)).toEqual(root);
    expect(parentTile(root)).toBeNull();
    expect(tileId(children[3])).toBe('1/1/1');
  });

  it('selects exactly one tile for an aligned tile-sized view', () => {
    const tile = { zoom: 3, x: 5, y: 2 };
    expect(selectVisibleTiles(tileBounds(tile), 3).tiles).toEqual([tile]);
  });

  it('rejects invalid tile keys', () => {
    expect(() => tileBounds({ zoom: 2, x: 4, y: 0 })).toThrow(RangeError);
    expect(() => tileBounds({ zoom: 2, x: -1, y: 0 })).toThrow(RangeError);
    expect(() => childTiles({ zoom: 24, x: 0, y: 0 })).toThrow(RangeError);
    expect(() => parentTile({ zoom: 1.5, x: 0, y: 0 })).toThrow(RangeError);
  });
});

describe('bounded geographic coverage', () => {
  it('selects both sides of a dateline crossing without the rest of the world', () => {
    const result = selectVisibleTiles({ west: 170, east: -170, north: 10, south: -10 }, 3);
    expect(result.tiles.map(tileId)).toEqual(['3/0/3', '3/7/3', '3/0/4', '3/7/4']);
    expect(result.budgetLimited).toBe(false);
  });

  it('merges overlapping dateline coverage at the global root', () => {
    const result = selectVisibleTiles({ west: 170, east: -170, north: 10, south: -10 }, 0);
    expect(result.tiles).toEqual([{ zoom: 0, x: 0, y: 0 }]);
  });

  it.each([180, -180])('uses one canonical tile for a point on longitude %s', (longitude) => {
    const result = selectVisibleTiles({ west: longitude, east: longitude, north: 0, south: 0 }, 3);
    expect(result.tiles).toEqual([{ zoom: 3, x: 0, y: 4 }]);
  });

  it('handles a zero-width wrapped dateline meridian', () => {
    const result = selectVisibleTiles({ west: 180, east: -180, north: 0, south: 0 }, 3);
    expect(result.tiles).toEqual([{ zoom: 3, x: 0, y: 4 }]);
  });

  it('retains a tile when a tiny valid range is below index arithmetic precision', () => {
    const result = selectVisibleTiles({ west: 1e-16, east: 2e-16, south: 1e-16, north: 2e-16 }, 24);
    expect(result.tiles).toHaveLength(1);
  });

  it.each([
    [90, 0],
    [-90, 7],
  ])('keeps the exact pole %s in the valid row', (latitude, row) => {
    const result = selectVisibleTiles(
      { west: -180, east: 180, north: latitude, south: latitude },
      3,
    );
    expect(result.tiles).toHaveLength(8);
    expect(result.tiles.every((tile) => tile.y === row)).toBe(true);
  });

  it('reduces a global zoom-24 request before allocating tiles', () => {
    const result = selectVisibleTiles(globe, 24, 64);
    expect(result.requestedZoom).toBe(24);
    expect(result.effectiveZoom).toBe(3);
    expect(result.budgetLimited).toBe(true);
    expect(result.tiles).toHaveLength(64);
    expect(new Set(result.tiles.map(tileId)).size).toBe(64);
  });

  it('preserves full geographic coverage with a non-power-of-four budget', () => {
    const result = selectVisibleTiles(globe, 24, 10);
    expect(result.effectiveZoom).toBe(1);
    expect(result.tiles).toHaveLength(4);
    expect(selectVisibleTiles(globe, 24, 1).tiles).toEqual([{ zoom: 0, x: 0, y: 0 }]);
  });

  it('enforces a hard allocation cap even with an enormous caller budget', () => {
    const result = selectVisibleTiles(globe, 24, Number.MAX_SAFE_INTEGER);
    expect(result.effectiveZoom).toBe(6);
    expect(result.tiles).toHaveLength(MAX_VISIBLE_TILE_BUDGET);
  });

  it('rejects invalid bounds, zooms and budgets', () => {
    expect(() => selectVisibleTiles({ ...globe, north: 91 }, 3)).toThrow(RangeError);
    expect(() => selectVisibleTiles({ ...globe, north: -20, south: 20 }, 3)).toThrow(RangeError);
    expect(() => selectVisibleTiles({ ...globe, west: Number.NaN }, 3)).toThrow(RangeError);
    expect(() => selectVisibleTiles(globe, 25)).toThrow(RangeError);
    expect(() => selectVisibleTiles(globe, 3, 0)).toThrow(RangeError);
    expect(() => selectVisibleTiles(globe, 3, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('camera-height imagery LOD', () => {
  it('requests one extra level when camera height is halved', () => {
    const far = desiredZoomForAltitude(1_000_000);
    expect(desiredZoomForAltitude(500_000)).toBe(far + 1);
    expect(desiredZoomForAltitude(250_000)).toBe(far + 2);
  });

  it('respects provider limits and behaves at ground and orbital distances', () => {
    expect(desiredZoomForAltitude(0, { maximumZoom: 12 })).toBe(12);
    expect(desiredZoomForAltitude(1e12)).toBe(0);
    expect(desiredZoomForAltitude(100, { maximumZoom: 0 })).toBe(0);
  });

  it('responds to screen sampling and rejects nonphysical inputs', () => {
    const base = desiredZoomForAltitude(1_000_000, { viewportHeightPixels: 1080 });
    expect(desiredZoomForAltitude(1_000_000, { viewportHeightPixels: 2160 })).toBe(base + 1);
    expect(() => desiredZoomForAltitude(-1)).toThrow(RangeError);
    expect(() => desiredZoomForAltitude(1, { fieldOfViewDegrees: 180 })).toThrow(RangeError);
    expect(() => desiredZoomForAltitude(1, { tileSizePixels: 0 })).toThrow(RangeError);
  });
});
