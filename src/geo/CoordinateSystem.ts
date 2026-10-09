import { Vector3 } from 'three';
import type { GeoCoordinate } from './GeoTypes';

const a = 6_378_137;
const f = 1 / 298.257223563;

/** WGS84 reference ellipsoid. Distances are in metres. */
export const WGS84 = Object.freeze({
  a,
  f,
  b: a * (1 - f),
  e2: f * (2 - f),
});

/** One render-world unit is one WGS84 equatorial radius. */
export const WORLD_METERS = WGS84.a;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function assertFinite(...values: number[]): void {
  if (!values.every(Number.isFinite)) {
    throw new RangeError('Coordinates must contain only finite numbers.');
  }
}

function assertGeodetic(latitude: number, longitude: number, altitude = 0): void {
  assertFinite(latitude, longitude, altitude);
  if (latitude < -90 || latitude > 90) {
    throw new RangeError('Latitude must be between -90 and 90 degrees.');
  }
}

/** Convert degrees and ellipsoidal altitude in metres to ECEF metres. */
export function geodeticToEcef(latitude: number, longitude: number, altitude = 0): Vector3 {
  assertGeodetic(latitude, longitude, altitude);
  const lat = latitude * DEG_TO_RAD;
  const lon = longitude * DEG_TO_RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const n = WGS84.a / Math.sqrt(1 - WGS84.e2 * sinLat * sinLat);

  return new Vector3(
    (n + altitude) * cosLat * Math.cos(lon),
    (n + altitude) * cosLat * Math.sin(lon),
    (n * (1 - WGS84.e2) + altitude) * sinLat,
  );
}

/**
 * Convert ECEF metres to degrees and ellipsoidal altitude in metres.
 * Longitude at either exact pole is conventionally zero. The centre is undefined.
 */
export function ecefToGeodetic(x: number, y: number, z: number): GeoCoordinate {
  assertFinite(x, y, z);
  const p = Math.hypot(x, y);
  if (p < 1e-8) {
    if (Math.abs(z) < 1e-8) {
      throw new RangeError('The Earth centre has no unique geodetic coordinate.');
    }
    return {
      latitude: z > 0 ? 90 : -90,
      longitude: 0,
      altitude: Math.abs(z) - WGS84.b,
    };
  }

  let lat = Math.atan2(z, p * (1 - WGS84.e2));
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const sinLat = Math.sin(lat);
    const n = WGS84.a / Math.sqrt(1 - WGS84.e2 * sinLat * sinLat);
    const next = Math.atan2(z + WGS84.e2 * n * sinLat, p);
    if (Math.abs(next - lat) < 1e-14) {
      lat = next;
      break;
    }
    lat = next;
  }

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const n = WGS84.a / Math.sqrt(1 - WGS84.e2 * sinLat * sinLat);
  // Use the component away from its singularity, including immediately near poles.
  const altitude = Math.abs(cosLat) > 0.5 ? p / cosLat - n : z / sinLat - n * (1 - WGS84.e2);

  return {
    latitude: lat * RAD_TO_DEG,
    longitude: Math.atan2(y, x) * RAD_TO_DEG,
    altitude,
  };
}

/**
 * The sole render-axis mapping: ECEF (x,y,z) metres → world (x,z,-y) / a.
 * North is world +Y; Greenwich is +X; 90° east is -Z. This is right-handed.
 */
export function ecefToWorld(x: number, y: number, z: number): Vector3 {
  assertFinite(x, y, z);
  return new Vector3(x / WORLD_METERS, z / WORLD_METERS, -y / WORLD_METERS);
}

/** Inverse render-axis mapping, returning ECEF metres. */
export function worldToEcef(x: number, y: number, z: number): Vector3 {
  assertFinite(x, y, z);
  return new Vector3(x * WORLD_METERS, -z * WORLD_METERS, y * WORLD_METERS);
}

/** Convert geodetic degrees / metres to render-world coordinates. */
export function geodeticToWorld(latitude: number, longitude: number, altitude = 0): Vector3 {
  const ecef = geodeticToEcef(latitude, longitude, altitude);
  return ecefToWorld(ecef.x, ecef.y, ecef.z);
}

/** Convert render-world coordinates to geodetic degrees / metres. */
export function worldToGeodetic(x: number, y: number, z: number): GeoCoordinate {
  const ecef = worldToEcef(x, y, z);
  return ecefToGeodetic(ecef.x, ecef.y, ecef.z);
}

/** WGS84 outward unit normal in render-world axes; distinct from radial direction. */
export function surfaceNormal(latitude: number, longitude: number): Vector3 {
  assertGeodetic(latitude, longitude);
  const lat = latitude * DEG_TO_RAD;
  const lon = longitude * DEG_TO_RAD;
  return new Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
}
