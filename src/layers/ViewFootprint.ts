import { PerspectiveCamera, Vector3 } from 'three';
import { WGS84, worldToGeodetic } from '../geo/CoordinateSystem';
import { MERCATOR_MAX_LATITUDE, type GeographicBounds } from './MercatorTiles';

const axisRatio = WGS84.b / WGS84.a;

/** Double-precision ray / WGS84 intersection; no coarse globe-mesh picking. */
export function intersectEarth(origin: Vector3, direction: Vector3): Vector3 | null {
  const o = origin.clone();
  const d = direction.clone();
  o.y /= axisRatio;
  d.y /= axisRatio;
  const a = d.dot(d);
  const b = 2 * o.dot(d);
  const c = o.dot(o) - 1;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  // Avoid cancellation in the root closest to a camera only metres above ground.
  const q = -0.5 * (b + Math.sign(b || 1) * Math.sqrt(discriminant));
  const roots = [q / a, c / q].filter((t) => Number.isFinite(t) && t >= 0);
  if (!roots.length) return null;
  return origin.clone().addScaledVector(direction, Math.min(...roots));
}

/** Screen sampling includes all four corners; polar caps retain the global base map. */
export function viewBounds(camera: PerspectiveCamera): GeographicBounds | null {
  camera.updateMatrixWorld();
  const center = worldToGeodetic(camera.position.x, camera.position.y, camera.position.z);
  const coordinates: Array<{ latitude: number; longitude: number }> = [];
  let seesHorizon = false;
  for (let y = 0; y <= 12; y++)
    for (let x = 0; x <= 12; x++) {
      const ray = new Vector3(x / 6 - 1, y / 6 - 1, 0.5)
        .unproject(camera)
        .sub(camera.position)
        .normalize();
      const point = intersectEarth(camera.position, ray);
      if (point) coordinates.push(worldToGeodetic(point.x, point.y, point.z));
      else seesHorizon = true;
    }
  if (!coordinates.length) return null;
  if (seesHorizon) {
    // Exact limb in scaled ellipsoid coordinates. A sampled silhouette can miss
    // latitude extrema on wide/portrait viewports; this cap cannot omit them.
    const scaled = camera.position.clone();
    scaled.y /= axisRatio;
    const radius = Math.acos(1 / scaled.length());
    const beta = Math.asin(scaled.y / scaled.length());
    const toLatitude = (angle: number) =>
      (Math.atan2(Math.sin(angle), axisRatio * Math.cos(angle)) * 180) / Math.PI;
    const south = Math.max(
      -MERCATOR_MAX_LATITUDE,
      toLatitude(Math.max(-Math.PI / 2, beta - radius)),
    );
    const north = Math.min(MERCATOR_MAX_LATITUDE, toLatitude(Math.min(Math.PI / 2, beta + radius)));
    if (Math.abs(beta) + radius >= Math.PI / 2) return { west: -180, east: 180, south, north };
    const span = (Math.asin(Math.min(1, Math.sin(radius) / Math.cos(beta))) * 180) / Math.PI;
    const normalize = (longitude: number) => ((longitude + 540) % 360) - 180;
    return {
      west: normalize(center.longitude - span),
      east: normalize(center.longitude + span),
      south,
      north,
    };
  }
  const longitudeOffsets = coordinates.map(
    (coordinate) => ((coordinate.longitude - center.longitude + 540) % 360) - 180,
  );
  let west = center.longitude + Math.min(...longitudeOffsets);
  let east = center.longitude + Math.max(...longitudeOffsets);
  let south = Math.min(...coordinates.map((coordinate) => coordinate.latitude));
  let north = Math.max(...coordinates.map((coordinate) => coordinate.latitude));
  // At orbital distances parts of the horizon lie between sample rays. A small
  // angular pad closes those slivers, then frustum/horizon culling removes extras.
  if (center.altitude > 1_000_000) {
    west -= 8;
    east += 8;
    south -= 6;
    north += 6;
  }
  south = Math.max(-MERCATOR_MAX_LATITUDE, south);
  north = Math.min(MERCATOR_MAX_LATITUDE, north);
  if (south > north) return null;
  const normalize = (longitude: number) => ((longitude + 540) % 360) - 180;
  if (east - west >= 350) {
    return { west: -180, east: 180, south, north };
  }
  return { west: normalize(west), east: normalize(east), south, north };
}
