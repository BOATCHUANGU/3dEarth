import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { geodeticToWorld, surfaceNormal } from '../geo/CoordinateSystem';
import { tileBounds, mercatorLatitudeAt, type MercatorTile } from './MercatorTiles';

/** Tile-local float vertices + double-precision object translation avoid city jitter. */
export function createTileGeometry(tile: MercatorTile): {
  geometry: BufferGeometry;
  center: Vector3;
} {
  const bounds = tileBounds(tile);
  const center = geodeticToWorld(mercatorLatitudeAt(tile, 0.5), (bounds.west + bounds.east) / 2, 0);
  const segments = tile.z < 4 ? 64 : tile.z < 8 ? 32 : 12;
  const vertices: number[] = [],
    normals: number[] = [],
    uv: number[] = [],
    globalUv: number[] = [],
    indices: number[] = [];
  for (let row = 0; row <= segments; row++) {
    const latitude = mercatorLatitudeAt(tile, row / segments);
    for (let column = 0; column <= segments; column++) {
      const longitude = bounds.west + ((bounds.east - bounds.west) * column) / segments;
      const point = geodeticToWorld(latitude, longitude, 0.15).sub(center);
      vertices.push(point.x, point.y, point.z);
      normals.push(...surfaceNormal(latitude, longitude).toArray());
      uv.push(column / segments, 1 - row / segments);
      globalUv.push((longitude + 180) / 360, (latitude + 90) / 180);
    }
  }
  for (let row = 0; row < segments; row++)
    for (let column = 0; column < segments; column++) {
      const a = row * (segments + 1) + column;
      const b = a + 1,
        c = a + segments + 1,
        d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setAttribute('globalUv', new Float32BufferAttribute(globalUv, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return { geometry, center };
}
