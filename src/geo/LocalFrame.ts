import { Vector3 } from 'three';
import { ecefToWorld, geodeticToEcef, worldToEcef } from './CoordinateSystem';
import type { Cartesian3, EnuCoordinate, GeoCoordinate } from './GeoTypes';

/**
 * An East / North / Up tangent frame anchored to a WGS84 coordinate.
 * All local displacements stay in metres. This is the boundary for future
 * regional data and origin rebasing; it does not move the global renderer.
 */
export class LocalFrame {
  readonly origin: Readonly<GeoCoordinate>;
  private readonly originEcef: Vector3;
  private readonly east: Vector3;
  private readonly north: Vector3;
  private readonly up: Vector3;

  constructor(origin: GeoCoordinate) {
    this.origin = Object.freeze({ ...origin });
    this.originEcef = geodeticToEcef(origin.latitude, origin.longitude, origin.altitude);
    const lat = (origin.latitude * Math.PI) / 180;
    const lon = (origin.longitude * Math.PI) / 180;
    this.east = new Vector3(-Math.sin(lon), Math.cos(lon), 0);
    this.north = new Vector3(
      -Math.sin(lat) * Math.cos(lon),
      -Math.sin(lat) * Math.sin(lon),
      Math.cos(lat),
    );
    this.up = new Vector3(
      Math.cos(lat) * Math.cos(lon),
      Math.cos(lat) * Math.sin(lon),
      Math.sin(lat),
    );
  }

  /** Project an ECEF position in metres into the local tangent plane. */
  ecefToLocal(position: Cartesian3): EnuCoordinate {
    const delta = new Vector3(position.x, position.y, position.z).sub(this.originEcef);
    return {
      east: delta.dot(this.east),
      north: delta.dot(this.north),
      up: delta.dot(this.up),
    };
  }

  /** Return the ECEF position in metres for a local ENU displacement. */
  localToEcef(position: EnuCoordinate): Vector3 {
    return this.originEcef
      .clone()
      .addScaledVector(this.east, position.east)
      .addScaledVector(this.north, position.north)
      .addScaledVector(this.up, position.up);
  }

  worldToLocal(position: Cartesian3): EnuCoordinate {
    return this.ecefToLocal(worldToEcef(position.x, position.y, position.z));
  }

  localToWorld(position: EnuCoordinate): Vector3 {
    const ecef = this.localToEcef(position);
    return ecefToWorld(ecef.x, ecef.y, ecef.z);
  }
}
