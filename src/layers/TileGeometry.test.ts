import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { geodeticToWorld, WGS84 } from '../geo/CoordinateSystem';
import { lngLatToTile, mercatorLatitudeAt, tileBounds } from './MercatorTiles';
import { createTileGeometry } from './TileGeometry';

describe('ellipsoid imagery tile geometry', () => {
  it.each([
    [121.4737, 31.2304],
    [-73.9857, 40.7484],
    [179.9999, 80],
  ])(
    'retains sub-millimetre city vertex precision at longitude %s latitude %s',
    (longitude, latitude) => {
      const tile = lngLatToTile(longitude, latitude, 19);
      const { geometry, center } = createTileGeometry(tile);
      const position = geometry.getAttribute('position');
      const uv = geometry.getAttribute('uv');
      const bounds = tileBounds(tile);
      let maximumError = 0;
      for (let i = 0; i < position.count; i++) {
        const expected = geodeticToWorld(
          mercatorLatitudeAt(tile, 1 - uv.getY(i)),
          bounds.west + (bounds.east - bounds.west) * uv.getX(i),
          0.15,
        );
        const actual = new Vector3().fromBufferAttribute(position, i).add(center);
        maximumError = Math.max(maximumError, actual.distanceTo(expected) * WGS84.a);
      }
      expect(maximumError).toBeLessThan(0.001);
      expect(geometry.boundingSphere?.radius).toBeLessThan(0.00002);
      geometry.dispose();
    },
  );

  it.each([0, 1, 6, 19])('winds every triangle outward at zoom %s', (z) => {
    const { geometry } = createTileGeometry(lngLatToTile(121.4737, 31.2304, z));
    const indices = geometry.index!;
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const a = new Vector3(),
      b = new Vector3(),
      c = new Vector3(),
      normal = new Vector3();
    let minimumFacing = 1;
    for (let i = 0; i < indices.count; i += 3) {
      a.fromBufferAttribute(positions, indices.getX(i));
      b.fromBufferAttribute(positions, indices.getX(i + 1));
      c.fromBufferAttribute(positions, indices.getX(i + 2));
      normal.fromBufferAttribute(normals, indices.getX(i));
      minimumFacing = Math.min(minimumFacing, b.sub(a).cross(c.sub(a)).normalize().dot(normal));
    }
    expect(minimumFacing).toBeGreaterThan(0.99);
    geometry.dispose();
  });

  it('shares city tile edges without floating point cracks, including the dateline', () => {
    for (const x of [500_000, 2 ** 19 - 1]) {
      const first = createTileGeometry({ z: 19, x, y: 150_000 });
      const second = createTileGeometry({ z: 19, x: (x + 1) % 2 ** 19, y: 150_000 });
      const a = first.geometry.getAttribute('position');
      const b = second.geometry.getAttribute('position');
      const edge = Math.sqrt(a.count);
      for (let row = 0; row < edge; row++) {
        const east = new Vector3().fromBufferAttribute(a, row * edge + edge - 1).add(first.center);
        const west = new Vector3().fromBufferAttribute(b, row * edge).add(second.center);
        expect(east.distanceTo(west) * WGS84.a).toBeLessThan(0.001);
      }
      first.geometry.dispose();
      second.geometry.dispose();
    }
  });

  it('maps image north to v=1 and equirectangular night imagery to global longitude/latitude', () => {
    const tile = lngLatToTile(0, 50, 6);
    const { geometry } = createTileGeometry(tile);
    const uv = geometry.getAttribute('uv');
    const globalUv = geometry.getAttribute('globalUv');
    const bounds = tileBounds(tile);
    const edge = Math.sqrt(uv.count);
    expect(uv.getX(0)).toBe(0);
    expect(uv.getY(0)).toBe(1);
    expect(uv.getX(uv.count - 1)).toBe(1);
    expect(uv.getY(uv.count - 1)).toBe(0);
    expect(globalUv.getX(0)).toBeCloseTo((bounds.west + 180) / 360, 7);
    expect(globalUv.getY(0)).toBeCloseTo((bounds.north + 90) / 180, 7);
    expect(globalUv.getY((edge - 1) * edge)).toBeCloseTo((bounds.south + 90) / 180, 7);
    geometry.dispose();
  });
});
