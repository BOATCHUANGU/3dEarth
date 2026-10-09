import { describe, expect, it } from 'vitest';
import {
  ecefToGeodetic,
  ecefToWorld,
  geodeticToEcef,
  geodeticToWorld,
  surfaceNormal,
  WGS84,
  WORLD_METERS,
  worldToEcef,
  worldToGeodetic,
} from './CoordinateSystem';
import { LocalFrame } from './LocalFrame';

describe('WGS84 reference locations and render axes', () => {
  it('uses the published equatorial and polar radii', () => {
    expect(geodeticToEcef(0, 0).toArray()).toEqual([WGS84.a, 0, 0]);
    expect(geodeticToEcef(90, 0).z).toBeCloseTo(6_356_752.314245179, 6);
    expect(geodeticToWorld(0, 0).x).toBe(1);
    expect(geodeticToWorld(0, 90).z).toBe(-1);
    expect(geodeticToWorld(90, 0).y).toBeCloseTo(WGS84.b / WGS84.a, 14);
  });

  it('maps and unmaps arbitrary Cartesian positions without losing the axis convention', () => {
    const world = ecefToWorld(WORLD_METERS, 2 * WORLD_METERS, 3 * WORLD_METERS);
    expect(world.toArray()).toEqual([1, 3, -2]);
    expect(worldToEcef(world.x, world.y, world.z).toArray()).toEqual([
      WORLD_METERS,
      2 * WORLD_METERS,
      3 * WORLD_METERS,
    ]);
  });

  it('raises a clear error for invalid coordinates and the undefined Earth centre', () => {
    expect(() => geodeticToWorld(91, 0)).toThrow(RangeError);
    expect(() => geodeticToWorld(0, Number.NaN)).toThrow(RangeError);
    expect(() => ecefToGeodetic(0, 0, 0)).toThrow(RangeError);
    expect(() => worldToEcef(Number.POSITIVE_INFINITY, 0, 0)).toThrow(RangeError);
  });
});

describe('geodetic round trips', () => {
  const samples = [
    [35.6762, 139.6503, 40],
    [31.2304, 121.4737, 4],
    [40.7128, -74.006, 10],
    [-33.8688, 151.2093, 120],
    [0, 180, 0],
    [0, -180, -430],
    [89.999999, 179.999999, 1_000],
    [-89.999999, -179.999999, 5],
    [27, -123, 35_786_000],
  ];

  it.each(samples)('round trips latitude %s, longitude %s, altitude %s', (lat, lon, alt) => {
    const ecef = geodeticToEcef(lat, lon, alt);
    const geographic = ecefToGeodetic(ecef.x, ecef.y, ecef.z);
    expect(geographic.latitude).toBeCloseTo(lat, 9);
    expect(geographic.longitude).toBeCloseTo(lon, 9);
    expect(geographic.altitude).toBeCloseTo(alt, 4);

    const world = geodeticToWorld(lat, lon, alt);
    const restored = worldToGeodetic(world.x, world.y, world.z);
    expect(restored.latitude).toBeCloseTo(lat, 9);
    expect(restored.longitude).toBeCloseTo(lon, 9);
    expect(restored.altitude).toBeCloseTo(alt, 4);
  });

  it.each([90, -90])('uses a stable inverse at the exact pole %s', (lat) => {
    const ecef = geodeticToEcef(lat, 139, 1234.5);
    const geographic = ecefToGeodetic(ecef.x, ecef.y, ecef.z);
    expect(geographic.latitude).toBe(lat);
    expect(geographic.longitude).toBe(0);
    expect(geographic.altitude).toBeCloseTo(1234.5, 6);
  });

  it('computes the ellipsoid normal independently of the radial position', () => {
    const normal = surfaceNormal(45, 20);
    const base = geodeticToWorld(45, 20);
    const raised = geodeticToWorld(45, 20, 100).sub(base).normalize();
    expect(normal.length()).toBeCloseTo(1, 14);
    expect(normal.distanceTo(raised)).toBeLessThan(1e-10);
    expect(normal.distanceTo(base.normalize())).toBeGreaterThan(0.003);
  });
});

describe('local East / North / Up frame', () => {
  it('has independently known axes at Greenwich on the equator', () => {
    const frame = new LocalFrame({ latitude: 0, longitude: 0, altitude: 0 });
    expect(frame.localToEcef({ east: 10, north: 20, up: 30 }).toArray()).toEqual([
      WGS84.a + 30,
      10,
      20,
    ]);
    expect(frame.ecefToLocal({ x: WGS84.a + 30, y: 10, z: 20 })).toEqual({
      east: 10,
      north: 20,
      up: 30,
    });
  });

  it.each([
    [31.2304, 121.4737],
    [90, 0],
    [-90, 180],
  ])('round trips metre-scale local offsets at %s, %s', (latitude, longitude) => {
    const frame = new LocalFrame({ latitude, longitude, altitude: 100 });
    const local = { east: 12.345, north: -987.654, up: 0.01 };
    const restored = frame.worldToLocal(frame.localToWorld(local));
    expect(restored.east).toBeCloseTo(local.east, 7);
    expect(restored.north).toBeCloseTo(local.north, 7);
    expect(restored.up).toBeCloseTo(local.up, 7);
  });

  it('keeps its origin independent from later caller mutations', () => {
    const origin = { latitude: 0, longitude: 0, altitude: 0 };
    const frame = new LocalFrame(origin);
    origin.latitude = 90;
    expect(frame.origin.latitude).toBe(0);
    expect(Object.isFrozen(frame.origin)).toBe(true);
  });
});
