/** WGS84 geodetic coordinates: degrees, degrees, metres above the ellipsoid. */
export interface GeoCoordinate {
  latitude: number;
  longitude: number;
  altitude: number;
}

/** Cartesian components; units are documented by the function accepting them. */
export interface Cartesian3 {
  x: number;
  y: number;
  z: number;
}

/** Local tangent-plane displacement in metres. */
export interface EnuCoordinate {
  east: number;
  north: number;
  up: number;
}
