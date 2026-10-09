import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { geodeticToWorld, surfaceNormal, WGS84, worldToGeodetic } from '../geo/CoordinateSystem';
import { MERCATOR_MAX_LATITUDE, type GeographicBounds } from './MercatorTiles';
import { intersectEarth, viewBounds } from './ViewFootprint';

function cameraAt(
  latitude: number,
  longitude: number,
  altitude: number,
  aspect = 1.6,
  fov = aspect < 1 ? (2 * Math.atan(Math.tan((43 * Math.PI) / 360) / aspect) * 180) / Math.PI : 43,
) {
  const camera = new PerspectiveCamera(fov, aspect, (altitude / WGS84.a) * 0.08, 64);
  camera.position.copy(geodeticToWorld(latitude, longitude, altitude));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

function inBounds(bounds: GeographicBounds, longitude: number, latitude: number): boolean {
  const epsilon = 1e-8;
  const inLongitude =
    bounds.west <= bounds.east
      ? longitude >= bounds.west - epsilon && longitude <= bounds.east + epsilon
      : longitude >= bounds.west - epsilon || longitude <= bounds.east + epsilon;
  return inLongitude && latitude >= bounds.south - epsilon && latitude <= bounds.north + epsilon;
}

describe('precise WGS84 ground intersection', () => {
  it.each([
    [0, 0],
    [31.2304, 121.4737],
    [80, 179.9999],
    [-89.999, -80],
  ])(
    'hits the ellipsoid within a micrometre from 150 m above latitude %s longitude %s',
    (latitude, longitude) => {
      const origin = geodeticToWorld(latitude, longitude, 150);
      const hit = intersectEarth(origin, surfaceNormal(latitude, longitude).negate());
      expect(hit).not.toBeNull();
      expect(hit!.distanceTo(geodeticToWorld(latitude, longitude)) * WGS84.a).toBeLessThan(
        0.000001,
      );
      expect(Math.abs(worldToGeodetic(hit!.x, hit!.y, hit!.z).altitude)).toBeLessThan(0.000001);
    },
  );

  it('uses the nearest positive root and accepts a direction that is not normalized', () => {
    expect(intersectEarth(new Vector3(2, 0, 0), new Vector3(-5, 0, 0))?.x).toBeCloseTo(1, 12);
    expect(intersectEarth(new Vector3(0, 0, 0), new Vector3(0, 0, -1))?.z).toBeCloseTo(-1, 12);
  });

  it('returns null for a ray into space, a ray that misses Earth, or a zero direction', () => {
    const origin = geodeticToWorld(31.2304, 121.4737, 150);
    expect(intersectEarth(origin, surfaceNormal(31.2304, 121.4737))).toBeNull();
    expect(intersectEarth(new Vector3(2, 0, 0), new Vector3(0, 1, 0))).toBeNull();
    expect(intersectEarth(origin, new Vector3())).toBeNull();
  });
});

describe('camera ground footprint coverage', () => {
  it.each([
    [31.2304, 121.4737, 150, 1.6],
    [0, 179.9999, 150, 2.4],
    [85.04, 0, 4_000, 1.6],
    [70, 0, 500_000, 1.5],
    [80, 0, 900_000, 2.2],
    [0, 0, 3_400_000, 2.5],
    [85, 0, 2_000_000, 1.6],
    [90, 0, 2_000_000, 1],
    [60, 0, 990_000, 4],
    [85, 0, 990_000, 0.35],
    [85, 179, 3_400_000, 0.35],
    [0, 0, 3_400_000, 0.35],
  ])(
    'covers densely sampled visible ground at lat=%s lng=%s altitude=%s aspect=%s',
    (latitude, longitude, altitude, aspect) => {
      const camera = cameraAt(latitude, longitude, altitude, aspect);
      const bounds = viewBounds(camera);
      expect(bounds).not.toBeNull();
      let hits = 0;
      const missed: Array<{ longitude: number; latitude: number }> = [];
      for (let y = 0; y <= 80; y++)
        for (let x = 0; x <= 80; x++) {
          const ray = new Vector3(x / 40 - 1, y / 40 - 1, 0.5)
            .unproject(camera)
            .sub(camera.position)
            .normalize();
          const hit = intersectEarth(camera.position, ray);
          if (!hit) continue;
          const coordinate = worldToGeodetic(hit.x, hit.y, hit.z);
          if (Math.abs(coordinate.latitude) > MERCATOR_MAX_LATITUDE) continue;
          hits++;
          if (!inBounds(bounds!, coordinate.longitude, coordinate.latitude))
            missed.push(coordinate);
        }
      expect(hits).toBeGreaterThan(0);
      expect(missed.slice(0, 3), `Computed view bounds: ${JSON.stringify(bounds)}`).toEqual([]);
    },
  );

  it('keeps a close dateline view narrow and a clipped Mercator cap view local', () => {
    const dateline = viewBounds(cameraAt(0, 179.9999, 150))!;
    expect(dateline.west).toBeGreaterThan(179.99);
    expect(dateline.east).toBeLessThan(-179.99);
    const clipped = viewBounds(cameraAt(85.04, 0, 4000))!;
    expect(clipped.east - clipped.west).toBeLessThan(2);
    expect(clipped.north).toBe(MERCATOR_MAX_LATITUDE);
  });

  it('returns no Mercator view when looking away or viewing only the uncovered polar cap', () => {
    const away = cameraAt(0, 0, 150);
    away.lookAt(2, 0, 0);
    away.updateMatrixWorld();
    expect(viewBounds(away)).toBeNull();
    expect(viewBounds(cameraAt(89, 0, 150))).toBeNull();
  });
});
